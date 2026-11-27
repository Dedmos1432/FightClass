import { CombatWorld, fighter, hitbox, hurtbox, intersects, type Box } from '../combat/CombatWorld';
import { ATTACK_SLOTS, COMBAT } from '../config/combat';
import type { PracticeStep } from './Progress';

const DODGE_DRILL_DISTANCE = 105;
const PLAYER_START = 780;
const PARTNER_START = 980;

/** A safe scripted partner uses the same attacks, hitboxes and resource rules as real bouts. */
export class CombatTutorial {
  readonly world = new CombatWorld(
    fighter({skin:'player',x:PLAYER_START,maxHP:100,stamina:100,damage:10,speed:COMBAT.playerSpeed,canDodge:true}),
    fighter({skin:'kim',x:PARTNER_START,maxHP:100,stamina:100,damage:4,speed:250,canDodge:false,facing:-1}),
  );
  step: PracticeStep;
  readonly strikes = new Set<number>();
  left = 0;
  right = 0;
  combo = false;
  repeatBlocked = false;
  blocked = false;
  dodged = false;
  dashedForward = false;
  spent = false;
  recovered = false;
  private coachWait = 1100;
  private retreatStart: Box | null = null;
  private resetComboSpacing = false;
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
    this.step=step; this.left=0; this.right=0; this.strikes.clear(); this.combo=false; this.repeatBlocked=false;
    this.blocked=false; this.dodged=false; this.dashedForward=false; this.spent=false; this.recovered=false; this.coachWait=1100;
    this.retreatStart = null;
    this.resetComboSpacing = false;
    const enemyX = step === 'dodge' ? PLAYER_START + DODGE_DRILL_DISTANCE : step === 'block' ? 930 : PARTNER_START;
    Object.assign(this.world.player,fighter({skin:'player',x:PLAYER_START,maxHP:100,stamina:100,damage:10,speed:COMBAT.playerSpeed,canDodge:true}));
    Object.assign(this.world.enemy,fighter({skin:'kim',x:enemyX,maxHP:100,stamina:100,damage:4,speed:250,canDodge:false,facing:-1}));
    this.world.events.length=0;
  }
  update(delta: number): void {
    const dt=Math.min(50,Math.max(0,delta)),w=this.world,p=w.player,e=w.enemy;
    if(this.ready || this.step==='club') { p.direction=0; p.blocking=false; e.direction=0; w.update(dt); return; }
    const before=p.x;
    const dodgeDrill = this.step === 'dodge' && !this.dodged;
    const cued = this.dodgeCue;
    const startingDodge = p.action === 'dodge' && p.elapsed === 0;
    if(this.step==='block' || dodgeDrill) {
      const distance=Math.abs(p.x-e.x);
      const approachDistance = dodgeDrill ? DODGE_DRILL_DISTANCE : 165;
      const attackDistance = dodgeDrill ? DODGE_DRILL_DISTANCE : 190;
      e.direction=distance>approachDistance ? Math.sign(p.x-e.x) : 0;
      this.coachWait-=dt;
      if(distance<=attackDistance && this.coachWait<=0 && w.attack(e,2)) this.coachWait=2300;
    } else e.direction=0;
    e.blocking = this.step === 'combo' && !this.repeatBlocked && this.strikes.has(0) && p.action === 'attack' && p.slot === 0 && !p.hitLanded;
    w.update(dt);
    this.left+=Math.max(0,before-p.x); this.right+=Math.max(0,p.x-before);
    for(const event of w.events) {
      if(event.source===p && event.type==='hit') {
        this.strikes.add(event.slot); if(event.combo===COMBAT.comboBonuses.length) this.combo=true;
      }
      if(this.step==='combo' && event.source===p && event.type==='block') {
        this.repeatBlocked = true;
        this.resetComboSpacing = true;
      }
      if(event.target===p && event.type==='block') this.blocked=true;
      if(event.target===p && event.type==='dodge' && !p.dodgeForward) this.dodged=true;
    }
    if(this.resetComboSpacing && p.action==='idle') {
      p.x=PLAYER_START; e.x=PARTNER_START; this.resetComboSpacing=false;
    }
    if (dodgeDrill && !this.dodged) {
      // A buffered dodge can begin inside the update and have less than one frame of elapsed time.
      this.checkRetreat(cued && (startingDodge || p.elapsed < dt) ? before : null);
    }
    if(this.step==='dodge' && this.dodged && p.action==='dodge' && p.dodgeForward &&
      Math.sign(p.x-before)===p.dodgeDirection) this.dashedForward=true;
    if(p.stamina<=40) this.spent=true;
    if(this.spent && p.stamina>=80 && p.action!=='attack' && p.action!=='dodge') this.recovered=true;
    // Practice never ends in a loss, and none of these HP/stamina values enter the save.
    for(const f of [p,e]) if(f.hp<=0) { f.hp=f.maxHP; f.action='idle'; f.elapsed=0; w.clearInputBuffer(f); }
  }

  private checkRetreat(startX: number | null): void {
    const { player, enemy } = this.world;
    if (player.action !== 'dodge' || player.dodgeForward || enemy.action !== 'attack') {
      this.retreatStart = null;
      return;
    }
    if (startX !== null) this.retreatStart = hurtbox({ ...player, x: startX });
    if (!this.retreatStart || player.elapsed < COMBAT.dodgeInvulnerableFrom) return;

    // A long retreat can avoid a real strike without ever triggering a collision.
    const strike = hitbox(enemy);
    if (strike && intersects(strike, this.retreatStart) && !intersects(strike, hurtbox(player))) {
      this.dodged = true;
    }
  }
}
