import Phaser from 'phaser';
import { SCENES } from '../config/game';
import { WORLD } from '../config/lobby';
import { COMBAT } from '../config/combat';
import type { GameServices } from '../core/GameServices';
import { preloadCombat } from '../assets/combatAssets';
import { RoomBackdrop } from './RoomBackdrop';
import { CombatWorld, fighter, enemyFighter } from '../combat/CombatWorld';
import { BotBrain } from '../combat/BotBrain';
import { opponentAt, type Opponent } from '../combat/Opponents';
import { loadoutFor } from '../combat/moves';
import { CombatFighterView } from '../characters/CombatFighterView';
import { CombatInput } from '../input/CombatInput';
import { CombatView } from '../ui/CombatView';
import { enemyBoosted, roundElapsed, roundEnemyDamage, roundOutcome, roundRemaining, type SeriesEndReason } from '../combat/RoundRules';

export class CombatScene extends Phaser.Scene {
  private world: CombatWorld | null = null;
  private brain: BotBrain | null = null;
  private view: CombatView | null = null;
  private playerView: CombatFighterView | null = null;
  private enemyView: CombatFighterView | null = null;
  private controls: CombatInput | null = null;
  private profile: Opponent = opponentAt(0);
  private phase: 'countdown' | 'fighting' | 'intermission' | 'defeat' | 'result' = 'countdown';
  private timer = 0;
  private savedElapsed = 0;
  private survivalMs = 0;
  private roundMs = 0;
  private boostNoticeMs = 0;
  private endReason: SeriesEndReason = 'knockout';
  private runId = '';
  private wins = 0;
  private result: { wins: number; gain: number; damage: number } | null = null;
  constructor(private readonly services: GameServices) { super(SCENES.fight); }
  init(): void {
    this.world=null; this.view=null; this.controls=null; this.playerView=null; this.enemyView=null; this.brain=null;
    this.phase='countdown'; this.timer=COMBAT.countdownMs; this.savedElapsed=0; this.survivalMs=0; this.result=null;
    this.roundMs=0; this.boostNoticeMs=0; this.endReason='knockout';
  }
  preload(): void { if (this.services.saves.activeRun) preloadCombat(this); }
  create(): void {
    const run = this.services.saves.activeRun;
    if (!run) { this.scene.start(SCENES.dojo); return; }
    if (document.querySelector<HTMLElement>('#ui')?.dataset.screen === 'load-error') return;
    this.runId = run.id; this.wins = run.wins;
    new RoomBackdrop(this,'dojo');
    this.cameras.main.setBackgroundColor('#0a0f0b');
    const loadout = loadoutFor(this.services.saves.lobbyState.style, this.services.saves.freestyle);
    this.view = new CombatView(this.services, loadout);
    this.buildRound();
    this.controls = new CombatInput(() => this.phase !== 'fighting' || Boolean(this.view?.hasDialog),
      slot => { if (this.world) this.world.attack(this.world.player,slot); },
      () => { if (this.world) this.world.dodge(this.world.player); }, () => this.pause());
    this.view.on('#fight-pause','click',() => this.pause());
    this.view.on('.brand','click',event => { event.preventDefault(); this.pause(); });
    window.addEventListener('pagehide',() => this.checkpoint(),{signal:this.view.events.signal});
    this.resize(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE,this.resize,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,() => {
      this.checkpoint(); this.controls?.destroy(); this.playerView?.destroy(); this.enemyView?.destroy(); this.view?.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE,this.resize,this);
      this.world=null; this.view=null; this.controls=null;
    });
  }
  private buildRound(): void {
    const run=this.services.saves.activeRun;
    if (!run || !this.view) return;
    const stats=this.services.saves.stats;
    this.wins=run.wins; this.survivalMs=run.elapsedMs ?? 0;
    this.roundMs=roundElapsed(run); this.boostNoticeMs=0;
    this.profile=opponentAt(run.wins,run.id,run.roundStartedMs);
    const p=fighter({ skin:'player',x:run.playerX,maxHP:stats.maxHP,hp:run.hp,stamina:stats.stamina,
      damage:stats.damage,speed:COMBAT.playerSpeed,canDodge:true });
    p.stamina=run.stamina;
    const e=enemyFighter(this.profile); e.hp=run.enemyHP; e.stamina=run.enemyStamina; e.x=run.enemyX;
    e.damage=roundEnemyDamage(this.profile.damage,this.roundMs);
    p.facing=e.x>=p.x?1:-1; e.facing=p.facing===1?-1:1;
    this.world=new CombatWorld(p,e); this.brain=new BotBrain(this.profile,Math.random,this.survivalMs-(run.roundStartedMs ?? 0));
    this.playerView?.destroy(); this.enemyView?.destroy();
    this.playerView=new CombatFighterView(this,p,this.view.loadout);
    this.enemyView=new CombatFighterView(this,e,this.view.loadout);
    this.view.focusArena();
  }
  update(_time:number,delta:number): void {
    const w=this.world,v=this.view;
    if (!w || !v) return;
    const dt=Math.min(50,delta);
    const stopped=v.hasDialog || document.hidden;
    if (!stopped) {
      if (this.phase==='countdown') {
        this.timer-=dt; v.announce(this.timer>1100 ? 'ГОТОВ?' : this.timer>450 ? 'ДЕРЖИ ДИСТАНЦИЮ' : 'БОЙ');
        if(this.timer<=0) { this.phase='fighting'; v.announce(''); }
      } else if (this.phase==='fighting') {
        const combatDt=Math.min(dt,roundRemaining(this.roundMs));
        const wasBoosted=enemyBoosted(this.roundMs);
        if(this.boostNoticeMs>0) {
          this.boostNoticeMs=Math.max(0,this.boostNoticeMs-combatDt);
          if(this.boostNoticeMs===0) v.announce('');
        }
        w.player.direction=this.controls?.direction ?? 0; w.player.blocking=this.controls?.block ?? false;
        this.brain?.update(w,combatDt); w.update(combatDt);
        this.survivalMs+=combatDt; this.roundMs+=combatDt;
        for(const event of w.events) this.effect(event.target.x,event.damage,event.type);
        this.savedElapsed+=combatDt;
        const outcome=roundOutcome(this.roundMs,w.player,w.enemy);
        const boostedNow=!outcome && !wasBoosted && enemyBoosted(this.roundMs);
        if(boostedNow) {
          w.enemy.damage=roundEnemyDamage(this.profile.damage,this.roundMs);
          this.boostNoticeMs=COMBAT.boostNoticeMs;
          v.announce('ПРОТИВНИК СТАЛ СИЛЬНЕЕ');
        }
        if(this.savedElapsed>=800 || w.events.length>0 || outcome || boostedNow) this.checkpoint();
        if(outcome) {
          const timedOut=!w.over;
          this.controls?.clear();
          for(const f of [w.player,w.enemy]) {
            f.direction=0; f.blocking=false; f.buffered=null;
            if(timedOut) { f.action='idle'; f.elapsed=0; f.combo=0; }
          }
          if(outcome==='player') {
            const next=this.services.saves.advanceEndless(this.runId);
            if(next) this.wins=next.wins;
            this.phase='intermission'; this.timer=COMBAT.intermissionMs;
            v.announce(timedOut ? 'ВРЕМЯ · ПОБЕДА ПО HP' : 'ПОБЕДА · СЛЕДУЮЩИЙ СОПЕРНИК');
          } else {
            this.endReason=outcome==='draw' ? 'draw' : timedOut ? 'timeout' : 'knockout';
            this.result=this.services.saves.finishEndless(this.runId);
            this.phase='defeat'; this.timer=1400;
            v.announce(outcome==='draw' ? 'ВРЕМЯ · НИЧЬЯ' : timedOut ? 'ВРЕМЯ · ПОРАЖЕНИЕ ПО HP' : 'НОКАУТ');
          }
        }
      } else if(this.phase==='intermission' || this.phase==='defeat') {
        this.timer-=dt;
        // The defeated fighter still completes the knockout animation.
        if(w.player.hp<=0) w.player.elapsed+=dt;
        if(w.enemy.hp<=0) w.enemy.elapsed+=dt;
        if(this.timer<=0) {
          if(this.phase==='intermission') { this.buildRound(); this.phase='countdown'; this.timer=1000; }
          else {
            this.phase='result';
            if(this.result) v.showResult(this.result,() => this.returnToLobby(),this.endReason);
            else this.returnToLobby();
          }
        }
      }
    }
    this.playerView?.update(stopped?0:dt); this.enemyView?.update(stopped?0:dt);
    if(this.world) v.update(this.world,this.profile,this.wins,this.phase,this.brain?.state ?? 'approach',this.roundMs);
    if(this.phase==='result' && !v.hasDialog) this.returnToLobby();
  }
  private checkpoint(): void {
    if(!this.world || (this.phase!=='fighting' && this.phase!=='countdown')) return;
    const p=this.world.player,e=this.world.enemy;
    this.services.saves.checkpointEndless(this.runId,{hp:p.hp,stamina:p.stamina,enemyHP:e.hp,enemyStamina:e.stamina,playerX:p.x,enemyX:e.x,elapsedMs:this.survivalMs});
    this.savedElapsed=0;
  }
  private pause(): void {
    if(!this.view || this.view.hasDialog || this.phase==='defeat' || this.phase==='result') return;
    this.controls?.clear(); this.checkpoint();
    this.view.showPause(() => this.returnToLobby());
  }
  private returnToLobby(): void { this.checkpoint(); this.scene.start(SCENES.lobby); }
  private resize(size:Phaser.Structs.Size): void {
    this.cameras.main.setViewport(0,0,size.width,size.height).setZoom(Math.min(size.width/WORLD.width,size.height/WORLD.height)).centerOn(WORLD.width/2,WORLD.height/2);
  }
  private effect(x:number,damage:number,type:string): void {
    const text=this.add.text(x,COMBAT.floorY-290,damage>0 ? `−${damage}` : type==='block' ? 'БЛОК' : 'УКЛОНЕНИЕ',{
      fontFamily:'Consolas, monospace',fontSize:damage>0?'34px':'22px',fontStyle:'bold',
      color:damage>0?'#f0ae90':'#e3edaf',stroke:'#101910',strokeThickness:4,
    }).setOrigin(.5).setDepth(10);
    this.tweens.add({ targets:text,y:text.y-70,alpha:0,duration:650,onComplete:() => text.destroy() });
  }
}
