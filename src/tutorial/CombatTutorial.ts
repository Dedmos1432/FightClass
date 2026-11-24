import { CombatWorld, fighter } from '../combat/CombatWorld';
import { ATTACK_SLOTS, COMBAT } from '../config/combat';
import type { PracticeStep } from './Progress';

// Stay close enough for the slow kick to reach an early backward dodge.
const DODGE_DRILL_DISTANCE = 105;

/** A safe scripted partner uses the same attacks, hitboxes and resource rules as real bouts. */
export class CombatTutorial {
  readonly world = new CombatWorld(
    fighter({skin:'player',x:780,maxHP:100,stamina:100,damage:10,speed:COMBAT.playerSpeed,canDodge:true}),
    fighter({skin:'kim',x:980,maxHP:100,stamina:100,damage:4,speed:250,canDodge:false,facing:-1}),
  );
  step: PracticeStep;
  readonly strikes = new Set<number>();
  left = 0;
  right = 0;
  combo = false;
  blocked = false;
  dodged = false;
  dashedForward = false;
  spent = false;
  recovered = false;
  private coachWait = 1100;
  constructor(step: PracticeStep) { this.step=step; this.enter(step); }
  get checks(): boolean[] {
    switch(this.step) {
      case 'movement': return [this.left>=70,this.right>=70];
      case 'attacks': return [0,1,2].map(slot=>this.strikes.has(slot));
      case 'combo': return [this.combo];
      case 'block': return [this.blocked];
      case 'dodge': return [this.dodged,this.dashedForward];
      case 'stamina': return [this.spent,this.recovered];
      case 'club': return [];
    }
  }
  get ready(): boolean { const checks=this.checks; return checks.length>0 && checks.every(Boolean); }
  get dodgeCue(): boolean {
    const e=this.world.enemy;
    return this.step==='dodge' && !this.dodged && e.action==='attack' &&
      e.elapsed < ATTACK_SLOTS[e.slot].startup - COMBAT.dodgeInvulnerableFrom;
  }
  get dodgePracticeDirection(): -1 | 1 {
    const { player, enemy } = this.world;
    const toward = enemy.x === player.x ? player.facing : enemy.x > player.x ? 1 : -1;
    return this.dodged ? toward : toward === 1 ? -1 : 1;
  }
  enter(step: PracticeStep): void {
    this.step=step; this.left=0; this.right=0; this.strikes.clear(); this.combo=false;
    this.blocked=false; this.dodged=false; this.dashedForward=false; this.spent=false; this.recovered=false; this.coachWait=1100;
    const playerX = 780;
    const enemyX = step === 'dodge' ? playerX + DODGE_DRILL_DISTANCE : step === 'block' ? 930 : 980;
    Object.assign(this.world.player,fighter({skin:'player',x:playerX,maxHP:100,stamina:100,damage:10,speed:COMBAT.playerSpeed,canDodge:true}));
    Object.assign(this.world.enemy,fighter({skin:'kim',x:enemyX,maxHP:100,stamina:100,damage:4,speed:250,canDodge:false,facing:-1}));
    this.world.events.length=0;
  }
  update(delta: number): void {
    const dt=Math.min(50,Math.max(0,delta)),w=this.world,p=w.player,e=w.enemy;
    if(this.ready || this.step==='club') { p.direction=0; p.blocking=false; e.direction=0; w.update(dt); return; }
    const before=p.x;
    const dodgeDrill = this.step === 'dodge' && !this.dodged;
    if(this.step==='block' || dodgeDrill) {
      const distance=Math.abs(p.x-e.x);
      const approachDistance = dodgeDrill ? DODGE_DRILL_DISTANCE : 165;
      const attackDistance = dodgeDrill ? DODGE_DRILL_DISTANCE : 190;
      e.direction=distance>approachDistance ? Math.sign(p.x-e.x) : 0;
      this.coachWait-=dt;
      if(distance<=attackDistance && this.coachWait<=0 && w.attack(e,2)) this.coachWait=2300;
    } else e.direction=0;
    w.update(dt);
    this.left+=Math.max(0,before-p.x); this.right+=Math.max(0,p.x-before);
    for(const event of w.events) {
      if(event.source===p && event.type==='hit') {
        this.strikes.add(p.slot); if(p.combo>=2) this.combo=true;
      }
      if(event.target===p && event.type==='block') this.blocked=true;
      if(event.target===p && event.type==='dodge' && !p.dodgeForward) this.dodged=true;
    }
    if(this.step==='dodge' && this.dodged && p.action==='dodge' && p.dodgeForward &&
      Math.sign(p.x-before)===p.dodgeDirection) this.dashedForward=true;
    if(p.stamina<=40) this.spent=true;
    if(this.spent && p.stamina>=80 && p.action!=='attack' && p.action!=='dodge') this.recovered=true;
    // Practice never ends in a loss, and none of these HP/stamina values enter the save.
    for(const f of [p,e]) if(f.hp<=0) { f.hp=f.maxHP; f.action='idle'; f.elapsed=0; w.clearInputBuffer(f); }
  }
}
