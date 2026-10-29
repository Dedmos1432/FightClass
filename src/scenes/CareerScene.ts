import Phaser from 'phaser';
import { SCENES } from '../config/game';
import { COMBAT } from '../config/combat';
import { CAREER_MATCH } from '../config/career';
import { WORLD } from '../config/lobby';
import type { GameServices } from '../core/GameServices';
import { preloadCombat } from '../assets/combatAssets';
import { preloadCareerArena } from '../assets/careerAssets';
import { CareerBackdrop } from './CareerBackdrop';
import { careerOpponent, type CareerOpponent } from '../career/Roster';
import { careerScore, careerRoundNumber, careerMatchOutcome, type CareerScore, type CareerRun, type CareerResult } from '../career/Progress';
import { CombatWorld, enemyFighter, fighter } from '../combat/CombatWorld';
import { roundOutcome, roundRemaining } from '../combat/RoundRules';
import { loadoutFor } from '../combat/moves';
import { BotBrain } from '../combat/BotBrain';
import { CombatFighterView } from '../characters/CombatFighterView';
import { CombatInput } from '../input/CombatInput';
import { CombatView } from '../ui/CombatView';

/** One ranked match shares the combat rules and renderer with endless training. */
export class CareerScene extends Phaser.Scene {
  private world: CombatWorld | null = null;
  private brain: BotBrain | null = null;
  private view: CombatView | null = null;
  private controls: CombatInput | null = null;
  private playerView: CombatFighterView | null = null;
  private enemyView: CombatFighterView | null = null;
  private profile: CareerOpponent | null = null;
  private phase: 'countdown' | 'fighting' | 'intermission' | 'finished' | 'result' = 'countdown';
  private timer = COMBAT.countdownMs as number;
  private elapsedMs = 0;
  private checkpointMs = 0;
  private runId = '';
  private result: CareerResult | null = null;
  private score: CareerScore = careerScore({});
  private roundNumber = 1;

  constructor(private readonly services: GameServices) { super(SCENES.career); }
  init(): void {
    this.world=null; this.brain=null; this.view=null; this.controls=null;
    this.playerView=null; this.enemyView=null; this.profile=null; this.result=null;
    this.phase='countdown'; this.timer=COMBAT.countdownMs; this.elapsedMs=0; this.checkpointMs=0;
    this.score=careerScore({}); this.roundNumber=1;
  }
  preload(): void {
    const run=this.services.saves.activeCareer;
    const profile=run ? careerOpponent(run.opponentId) : undefined;
    if (!profile) return;
    preloadCareerArena(this);
    preloadCombat(this,['player',profile.skin]);
  }
  create(): void {
    const run=this.services.saves.activeCareer;
    const profile=run ? careerOpponent(run.opponentId) : undefined;
    if (!run || !profile) { this.scene.start(SCENES.lobby); return; }
    if (document.querySelector<HTMLElement>('#ui')?.dataset.screen==='load-error') return;
    this.runId=run.id; this.profile=profile;
    new CareerBackdrop(this);
    const loadout=loadoutFor(this.services.saves.lobbyState.style,this.services.saves.freestyle);
    this.view=new CombatView(this.services,loadout,profile);
    this.buildRound(run);
    const restoredOutcome=careerMatchOutcome(run);
    if(restoredOutcome) {
      this.result=this.services.saves.finishCareer(this.runId);
      this.phase='finished'; this.timer=1400;
      this.view.announce(restoredOutcome==='player' ? 'ПОБЕДА В МАТЧЕ' : 'ПОРАЖЕНИЕ В МАТЧЕ');
    }
    this.controls=new CombatInput(() => this.phase!=='fighting' || Boolean(this.view?.hasDialog),
      slot => { if(this.world) this.world.attack(this.world.player,slot); },
      () => { if(this.world) this.world.dodge(this.world.player); }, () => this.pause());
    this.view.on('#fight-pause','click',() => this.pause());
    this.view.on('.brand','click',event => { event.preventDefault(); this.pause(); });
    window.addEventListener('pagehide',() => this.checkpoint(),{signal:this.view.events.signal});
    this.resize(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE,this.resize,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,() => {
      this.checkpoint(); this.controls?.destroy(); this.playerView?.destroy(); this.enemyView?.destroy(); this.view?.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE,this.resize,this);
      this.world=null; this.controls=null; this.view=null;
    });
  }
  private buildRound(run: Readonly<CareerRun>): void {
    if(!this.profile || !this.view) return;
    this.elapsedMs=run.elapsedMs; this.checkpointMs=0; this.score=careerScore(run);
    this.roundNumber=careerRoundNumber(run)-(careerMatchOutcome(run) ? 1 : 0);
    const player=fighter({skin:'player',x:run.playerX,maxHP:run.playerMaxHP,hp:run.hp,
      stamina:run.playerMaxStamina,damage:run.playerDamage,speed:COMBAT.playerSpeed,canDodge:true});
    player.stamina=run.stamina;
    const enemy=enemyFighter(this.profile);
    enemy.x=run.enemyX; enemy.hp=run.enemyHP; enemy.stamina=run.enemyStamina;
    player.facing=enemy.x>=player.x ? 1 : -1; enemy.facing=player.facing===1 ? -1 : 1;
    this.world=new CombatWorld(player,enemy); this.brain=new BotBrain(this.profile,Math.random,run.elapsedMs);
    this.playerView?.destroy(); this.enemyView?.destroy();
    this.playerView=new CombatFighterView(this,player,this.view.loadout);
    this.enemyView=new CombatFighterView(this,enemy,this.view.loadout);
    this.view.focusArena();
  }
  update(_time:number,delta:number): void {
    const world=this.world,view=this.view,profile=this.profile;
    if(!world || !view || !profile) return;
    const dt=Math.min(50,delta), stopped=view.hasDialog || document.hidden;
    if(!stopped) {
      if(this.phase==='countdown') {
        this.timer-=dt;
        view.announce(this.timer>900 ? `РАУНД ${this.roundNumber}` : this.timer>350 ? 'ГОТОВ?' : 'БОЙ');
        if(this.timer<=0) { this.phase='fighting'; view.announce(''); }
      } else if(this.phase==='fighting') {
        const step=Math.min(dt,roundRemaining(this.elapsedMs));
        world.player.direction=this.controls?.direction ?? 0;
        world.player.blocking=this.controls?.block ?? false;
        this.brain?.update(world,step); world.update(step);
        this.elapsedMs+=step; this.checkpointMs+=step;
        for(const event of world.events) this.effect(event.target.x,event.damage,event.type);
        const outcome=roundOutcome(this.elapsedMs,world.player,world.enemy);
        if(outcome || this.checkpointMs>=800 || world.events.length) this.checkpoint();
        if(outcome) {
          const round=this.services.saves.resolveCareerRound(this.runId,this.roundNumber);
          if(!round) { this.returnToLobby(true); return; }
          this.score=careerScore(round);
          this.result=round.matchOver ? this.services.saves.finishCareer(this.runId) : null;
          this.controls?.clear();
          for(const f of [world.player,world.enemy]) {
            f.direction=0; f.blocking=false; f.buffered=null;
            if(!world.over) { f.action='idle'; f.elapsed=0; }
          }
          this.phase=round.matchOver ? 'finished' : 'intermission';
          this.timer=round.matchOver ? 1400 : CAREER_MATCH.intermissionMs;
          view.announce(round.matchOver ? outcome==='player' ? 'ПОБЕДА В МАТЧЕ' : 'ПОРАЖЕНИЕ В МАТЧЕ'
            : outcome==='draw' ? 'НИЧЬЯ · ПОВТОР РАУНДА' : outcome==='player' ? 'РАУНД ВЫИГРАН' : 'РАУНД ПРОИГРАН');
        }
      } else if(this.phase==='finished' || this.phase==='intermission') {
        this.timer-=dt;
        for(const f of [world.player,world.enemy]) if(f.hp<=0) f.elapsed+=dt;
        if(this.timer<=0) {
          if(this.phase==='intermission') {
            const run=this.services.saves.activeCareer;
            if(!run) { this.returnToLobby(true); return; }
            this.buildRound(run); this.phase='countdown'; this.timer=COMBAT.countdownMs;
            this.view?.setCareerScore(this.score,this.roundNumber);
            return;
          }
          this.phase='result';
          if(this.result) view.showCareerResult(this.result,() => this.returnToLobby(true),() => this.retry());
          else this.returnToLobby(true);
        }
      }
    }
    this.playerView?.update(stopped?0:dt); this.enemyView?.update(stopped?0:dt);
    view.setCareerScore(this.score,this.roundNumber);
    view.update(world,profile,this.services.saves.career.victories.length,this.phase,this.brain?.state ?? 'approach',this.elapsedMs);
    if(this.phase==='result' && !view.hasDialog) this.returnToLobby(true);
  }
  private checkpoint(): void {
    if(!this.world || !['countdown','fighting'].includes(this.phase)) return;
    const p=this.world.player,e=this.world.enemy;
    this.services.saves.checkpointCareer(this.runId,{hp:p.hp,stamina:p.stamina,enemyHP:e.hp,enemyStamina:e.stamina,
      playerX:p.x,enemyX:e.x,elapsedMs:this.elapsedMs},this.roundNumber);
    this.checkpointMs=0;
  }
  private pause(): void {
    if(!this.view || this.view.hasDialog || this.phase==='finished' || this.phase==='result') return;
    this.controls?.clear(); this.checkpoint();
    this.view.showPause(() => this.returnToLobby());
  }
  private retry(): void {
    if(!this.profile || !this.services.saves.beginCareer(this.profile.id)) return;
    this.scene.restart();
  }
  private returnToLobby(ranking=false): void {
    this.checkpoint(); this.scene.start(SCENES.lobby,{ranking});
  }
  private resize(size:Phaser.Structs.Size): void {
    this.cameras.main.setViewport(0,0,size.width,size.height)
      .setZoom(Math.min(size.width/WORLD.width,size.height/WORLD.height)).centerOn(WORLD.width/2,WORLD.height/2);
  }
  private effect(x:number,damage:number,type:string): void {
    const text=this.add.text(x,COMBAT.floorY-290,damage>0 ? `−${damage}` : type==='block' ? 'БЛОК' : 'УКЛОНЕНИЕ',{
      fontFamily:'Golos Text, sans-serif',fontSize:damage>0?'34px':'22px',fontStyle:'bold',
      color:damage>0?'#f4d1bf':'#eee8d8',stroke:'#17191a',strokeThickness:4,
    }).setOrigin(.5).setDepth(10);
    this.tweens.add({targets:text,y:text.y-70,alpha:0,duration:650,onComplete:() => text.destroy()});
  }
}
