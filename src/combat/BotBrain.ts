import { ATTACK_SLOTS, COMBAT, type AttackSlot } from '../config/combat';
import { attackDuration, type CombatWorld, type Fighter, type FighterAction } from './CombatWorld';
import type { Opponent } from './Opponents';

interface Observation {
  at: number; x: number; action: FighterAction; elapsed: number; slot: AttackSlot;
  facing: -1 | 1; stamina: number; maxStamina: number; hp: number; maxHP: number;
}
const ready = (f: Fighter): boolean => ['idle','walk','retreat','block'].includes(f.action);
const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(high,v));

/** Delayed visual observations, short-term habit memory and decisions with human reaction time. */
export class BotBrain {
  private clock = 0;
  private nextSample = 0;
  private nextDecision = 0;
  private guardUntil = 0;
  private flankUntil = 0;
  private flankDirection = 0;
  private readonly observations: Observation[] = [];
  private perceived: Observation | null = null;
  private previous: Observation | null = null;
  private readonly attacks: AttackSlot[] = [];
  private blockSamples = 0;
  private sampleCount = 0;
  state: 'approach' | 'recover' | 'defend' | 'attack' | 'space' | 'counter' | 'pressure' | 'flank' = 'approach';

  constructor(private readonly profile: Opponent, private readonly random: () => number = Math.random, private readonly priorRoundMs = 0) {}
  get habits(): Readonly<{ favorite: AttackSlot; repetition: number; blockRate: number }> {
    const counts = [0,0,0];
    for (const slot of this.attacks) counts[slot]++;
    const favorite = counts.indexOf(Math.max(...counts)) as AttackSlot;
    return { favorite, repetition: this.attacks.length >= 3 ? counts[favorite] / this.attacks.length : 0,
      blockRate: this.sampleCount ? this.blockSamples / this.sampleCount : 0 };
  }
  update(world: CombatWorld, delta: number): void {
    if (world.over) return;
    this.clock += delta;
    const f = world.enemy, p = world.player;
    const skill = Math.min(.98, this.profile.skill + (this.clock + this.priorRoundMs) / 90000 * .045);
    const reaction = Math.max(95, this.profile.reactionMs - (this.clock + this.priorRoundMs) / 90000 * 17);
    if (this.clock >= this.nextSample) {
      this.nextSample = this.clock + 35;
      this.observations.push({ at:this.clock,x:p.x,action:p.action,elapsed:p.elapsed,slot:p.slot,
        facing:p.facing,stamina:p.stamina,maxStamina:p.maxStamina,hp:p.hp,maxHP:p.maxHP });
    }
    while (this.observations.length && this.observations[0].at <= this.clock - reaction) {
      const seen = this.observations.shift()!;
      this.remember(seen); this.previous = this.perceived; this.perceived = seen;
    }
    f.blocking = this.clock < this.guardUntil;
    const seen = this.perceived;
    if (!seen || this.clock < this.nextDecision) return;
    this.nextDecision = this.clock + 65 + (1 - skill) * 95 + this.random() * 45;
    if (f.action === 'hit' || f.action === 'dodge' || f.action === 'ko') { f.direction = 0; return; }

    // Extrapolate only already observed motion. Never read the player's current input.
    const age = Math.min(reaction + 80, this.clock - seen.at);
    const velocity = this.previous && seen.at > this.previous.at
      ? clamp((seen.x-this.previous.x)/(seen.at-this.previous.at),-.34,.34) : 0;
    const targetX = clamp(seen.x + velocity * age * skill,COMBAT.minX,COMBAT.maxX);
    const distance = Math.abs(targetX-f.x), toward = targetX >= f.x ? 1 : -1;
    if (ready(f)) f.facing = toward;
    const elapsed = seen.elapsed + age;
    const spec = ATTACK_SLOTS[seen.slot];
    const attackVisible = seen.action === 'attack' && elapsed < attackDuration(seen.slot);
    const incoming = attackVisible && elapsed < spec.startup + spec.active
      && seen.facing === -toward && distance < spec.range + COMBAT.bodyHalfWidth + 15;
    const canRetreat = f.facing > 0 ? f.x-COMBAT.minX>115 : COMBAT.maxX-f.x>115;
    const habits = this.habits;
    f.direction = 0;

    if (f.action === 'attack') {
      const reserve = this.profile.reserve * (1 - skill * .35);
      if (distance < ATTACK_SLOTS[2].range + COMBAT.bodyHalfWidth && f.stamina > reserve
        && this.random() < this.profile.comboChance + skill * .12) {
        world.attack(f,this.chooseSlot(distance,f.stamina,seen.action==='block',false));
      }
      return;
    }
    if (incoming) {
      const defense = Math.min(.98,this.profile.defense * (.5 + skill * .55) + habits.repetition * skill * .18);
      if (this.random() < defense) {
        this.state = 'defend';
        // A quick jab seen too late is blocked; a slower windup leaves time to evade.
        const enoughTime = spec.startup - elapsed >= COMBAT.dodgeInvulnerableFrom + 12;
        if (f.canDodge && canRetreat && enoughTime && f.stamina >= COMBAT.dodgeCost + 8
          && this.random() < this.profile.dodgePreference * (.5 + skill * .5) && world.dodge(f)) {
          this.guardUntil=0; return;
        }
        if (f.stamina >= 12 + p.damage * .4) { this.guardUntil=this.clock + Math.max(150,spec.startup+spec.active-elapsed+65); f.blocking=true; return; }
        if (canRetreat) { f.direction=-toward; return; }
      }
    }
    if (this.clock < this.guardUntil) { this.state='defend'; return; }
    if (this.clock < this.flankUntil) { this.state='flank'; f.direction=this.flankDirection; return; }

    const tired = f.stamina < this.profile.reserve || (f.hp < f.maxHP*.3 && f.stamina < this.profile.reserve+14);
    if (tired) {
      this.state='recover';
      f.direction=canRetreat ? -toward : distance < 150 ? toward : 0;
      return;
    }
    const recovery = attackVisible && elapsed >= spec.startup + spec.active;
    const vulnerable = seen.action === 'hit' || seen.action === 'dodge' && elapsed > COMBAT.dodgeInvulnerableTo
      || seen.stamina < 18 || recovery;
    if (vulnerable && this.random() < this.profile.counterPreference * (.45+skill*.55)) {
      this.state='counter';
      if (!this.strike(world,distance,seen,true)) f.direction=toward;
      return;
    }
    // Cross behind a committed attack. The opponent cannot rotate an active strike.
    if (skill>.5 && attackVisible && distance<175 && this.random()<skill*(this.profile.id==='flanker'?.85:.2)) {
      this.state='flank'; this.flankUntil=this.clock+450; this.flankDirection=toward; f.direction=toward; return;
    }
    // Repeated strikes cause anticipation, based on history rather than unrevealed input.
    if (habits.repetition>=.66 && seen.stamina>20 && distance<275 && this.random()<habits.repetition*skill*.32) {
      this.state='defend';
      if (f.canDodge && canRetreat && this.random()<this.profile.dodgePreference && world.dodge(f)) return;
      this.guardUntil=this.clock+180; f.blocking=true; return;
    }
    const pressure = seen.action==='block' && habits.blockRate>.4 || seen.hp<seen.maxHP*.3 || seen.stamina<25;
    const attackChance = Math.min(.98,this.profile.aggression*(.65+skill*.4)+(pressure?.15:0));
    if (this.random()<attackChance && this.strike(world,distance,seen,false)) {
      this.state=pressure?'pressure':'attack'; return;
    }
    this.space(f,toward,distance,canRetreat,pressure);
  }
  private remember(seen: Observation): void {
    const old = this.perceived;
    if (seen.action==='attack' && (!old || old.action!=='attack' || seen.elapsed<old.elapsed || seen.slot!==old.slot)) {
      this.attacks.push(seen.slot); if (this.attacks.length>8) this.attacks.shift();
    }
    this.sampleCount = this.sampleCount * .975 + 1;
    this.blockSamples = this.blockSamples * .975 + Number(seen.action==='block');
  }
  private chooseSlot(distance: number, stamina: number, guarding: boolean, punish: boolean): AttackSlot {
    const valid = ([0,1,2] as AttackSlot[]).filter(slot => distance < ATTACK_SLOTS[slot].range + COMBAT.bodyHalfWidth - 16 && stamina>=ATTACK_SLOTS[slot].stamina);
    if (!valid.length) return 2;
    if (punish || guarding) return valid[0];
    return valid[Math.min(valid.length-1,Math.floor(this.random()*valid.length))];
  }
  private strike(world: CombatWorld, distance: number, seen: Observation, punish: boolean): boolean {
    const f=world.enemy, slot=this.chooseSlot(distance,f.stamina,seen.action==='block',punish);
    if (distance<105 || distance>=ATTACK_SLOTS[slot].range+COMBAT.bodyHalfWidth-16) return false;
    this.guardUntil=0; f.blocking=false; return world.attack(f,slot);
  }
  private space(f: Fighter, toward: number, distance: number, canRetreat: boolean, pressure: boolean): void {
    const desired=this.profile.preferredRange-(pressure?45:0);
    this.state=distance>desired+20?'approach':'space';
    f.direction=distance>desired+20?toward:distance<desired-30?(canRetreat?-toward:toward):0;
  }
}
