import { ATTACK_SLOTS, COMBAT, guardStaminaCost, type AttackSlot } from '../config/combat';
import { attackDuration, type CombatWorld, type Fighter, type FighterAction } from './CombatWorld';
import type { Opponent } from './Opponents';

interface Observation {
  at: number; x: number; action: FighterAction; elapsed: number; slot: AttackSlot;
  facing: -1 | 1; stamina: number; maxStamina: number; hp: number; maxHP: number;
}
type BotProfile = Opponent & { career?: boolean; boss?: boolean };
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
  private dodgeSamples = 0;
  private retreatSamples = 0;
  private crossingSamples = 0;
  private sampleCount = 0;
  private recovering = false;
  private baitUntil = 0;
  private nextDodgeBait = 0;
  private guardFlankGoal: number | null = null;
  private nextGuardFlank = 0;
  private lastAttackAt = 0;
  private attackRhythm = 0;
  state: 'approach' | 'recover' | 'defend' | 'attack' | 'space' | 'counter' | 'pressure' | 'flank' | 'bait' | 'cutoff' = 'approach';

  constructor(private readonly profile: BotProfile, private readonly random: () => number = Math.random, private readonly priorRoundMs = 0) {}
  get habits(): Readonly<{ favorite: AttackSlot; repetition: number; blockRate: number; dodgeRate: number; retreatRate: number; crossingRate: number }> {
    const counts = [0,0,0];
    for (const slot of this.attacks) counts[slot]++;
    const favorite = counts.indexOf(Math.max(...counts)) as AttackSlot;
    return { favorite, repetition: this.attacks.length >= 3 ? counts[favorite] / this.attacks.length : 0,
      blockRate: this.sampleCount ? this.blockSamples / this.sampleCount : 0,
      dodgeRate: this.sampleCount ? this.dodgeSamples / this.sampleCount : 0,
      retreatRate: this.sampleCount ? this.retreatSamples / this.sampleCount : 0,
      crossingRate: this.sampleCount ? this.crossingSamples / this.sampleCount : 0 };
  }
  update(world: CombatWorld, delta: number): void {
    if (world.over) return;
    this.clock += delta;
    const f = world.enemy, p = world.player;
    const skill = Math.min(.98, this.profile.skill + (this.clock + this.priorRoundMs) / 90000 * .045);
    const reaction = Math.max(this.profile.career ? 85 : 95, this.profile.reactionMs - (this.clock + this.priorRoundMs) / 90000 * 17);
    if (this.clock >= this.nextSample) {
      this.nextSample = this.clock + (this.profile.career ? 24 : 35);
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
    this.nextDecision = this.clock + (this.profile.career ? 40 + (1 - skill) * 70 + this.random() * 25 : 65 + (1 - skill) * 95 + this.random() * 45);
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

    if (this.profile.career) {
      this.careerDecision(world, seen, skill, age, velocity, targetX, canRetreat);
      return;
    }

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
        if (f.stamina >= guardStaminaCost(p.damage)) { this.guardUntil=this.clock + Math.max(150,spec.startup+spec.active-elapsed+65); f.blocking=true; return; }
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
      this.attacks.push(seen.slot); if (this.attacks.length>(this.profile.career ? this.profile.boss ? 24 : 16 : 8)) this.attacks.shift();
      if (this.lastAttackAt > 0) {
        const interval = seen.at - this.lastAttackAt;
        this.attackRhythm = this.attackRhythm ? this.attackRhythm * .65 + interval * .35 : interval;
      }
      this.lastAttackAt = seen.at;
    }
    this.sampleCount = this.sampleCount * .975 + 1;
    this.blockSamples = this.blockSamples * .975 + Number(seen.action==='block');
    this.dodgeSamples = this.dodgeSamples * .975 + Number(seen.action==='dodge');
    this.retreatSamples = this.retreatSamples * .975 + Number(seen.action==='retreat');
    this.crossingSamples = this.crossingSamples * .975 + Number(Boolean(old && seen.facing !== old.facing));
  }
  /** Career opponents plan from delayed public poses; no keyboard state or future action is available. */
  private careerDecision(world: CombatWorld, seen: Observation, skill: number, age: number, velocity: number, targetX: number, canRetreat: boolean): void {
    const f = world.enemy, boss = Boolean(this.profile.boss), habits = this.habits;
    const toward = targetX >= f.x ? 1 : -1, distance = Math.abs(targetX - f.x);
    const elapsed = seen.elapsed + age, spec = ATTACK_SLOTS[seen.slot];
    const committed = seen.action === 'attack' && elapsed < attackDuration(seen.slot);
    const incoming = committed && elapsed < spec.startup + spec.active && seen.facing === -toward
      && distance <= spec.range + COMBAT.bodyHalfWidth + 12;
    const guardCost = guardStaminaCost(world.player.damage);
    const reserve = Math.max(guardCost + 6, this.profile.reserve * (boss ? .8 : .9));
    const playerSpent = seen.stamina < ATTACK_SLOTS[0].stamina;
    const playerBack = seen.facing === toward;
    const playerRecovering = committed && elapsed >= spec.startup + spec.active;
    const dodgeRecovering = seen.action === 'dodge' && elapsed >= COMBAT.dodgeInvulnerableTo;
    const critical = f.hp / f.maxHP < .24;

    if (f.action === 'attack') {
      // Commit to a chain only at the buffer window, with enough stamina left to defend.
      if (f.elapsed >= attackDuration(f.slot) - COMBAT.comboBufferMs && f.combo < COMBAT.maxCombo) {
        const slot = this.careerSlot(f, seen, targetX, velocity, reserve, false);
        if (slot !== null && (!incoming || playerSpent || playerBack)
          && this.random() < Math.min(.97, this.profile.comboChance + (playerSpent ? .15 : 0))) world.attack(f, slot);
      }
      return;
    }

    if(this.guardFlankGoal!==null) {
      if(!incoming && seen.action==='block' && Math.abs(f.x-this.guardFlankGoal)>12) {
        this.state='flank'; f.direction=Math.sign(this.guardFlankGoal-f.x); return;
      }
      this.guardFlankGoal=null;
    }
    if (this.clock < this.flankUntil) { this.state = 'flank'; f.direction = this.flankDirection; return; }
    // At point-blank range a long windup can be crossed before its forward hitbox activates.
    // Use the observed windup, movement speed and required clearance, rather than a teleport.
    const crossingTime = (distance + 18) / (f.speed / 1000) + 25;
    if (committed && distance < 75 && spec.startup - elapsed > crossingTime
      && this.random() < (boss ? .55 : .22)) {
      this.flankUntil = this.clock + crossingTime + 270; this.flankDirection = toward;
      this.state = 'flank'; this.guardUntil = 0; f.blocking = false; f.direction = toward; return;
    }

    if (incoming) {
      const defense = Math.min(.98, this.profile.defense * (.9 + skill * .1) + habits.repetition * .08 + (critical ? .04 : 0));
      if (this.random() < defense) {
        this.state = 'defend';
        const windupLeft = spec.startup - elapsed;
        // Evade slower commitments; a late block is safer than an invulnerability window that starts too late.
        if (f.canDodge && canRetreat && windupLeft >= COMBAT.dodgeInvulnerableFrom + 15
          && f.stamina >= COMBAT.dodgeCost + guardCost
          && this.random() < this.profile.dodgePreference * (boss ? 1 : .85) && world.dodge(f)) {
          this.guardUntil = 0; return;
        }
        if (f.stamina >= guardCost) {
          this.guardUntil = this.clock + Math.max(75, spec.startup + spec.active - elapsed + 30);
          f.blocking = true; return;
        }
        // An exhausted guard breaks. Leave the range or cross a very close, committed strike instead.
        if (distance < 75 && windupLeft > distance / (f.speed / 1000) + 30) {
          this.state = 'flank'; f.direction = toward; return;
        }
        f.direction = canRetreat ? -toward : toward; return;
      }
    }
    if (this.clock < this.guardUntil && committed && !playerBack) { this.state = 'defend'; return; }
    this.guardUntil = 0; f.blocking = false;

    // Recovery has hysteresis: do not bounce between one attack and retreat at the threshold.
    if (f.stamina < reserve || critical && f.stamina < reserve + 10) this.recovering = true;
    if (this.recovering && f.stamina >= Math.min(f.maxStamina * .76, reserve + (boss ? 24 : 17))) this.recovering = false;
    if (this.recovering && !(playerBack && f.stamina >= ATTACK_SLOTS[0].stamina + guardCost)) {
      this.state = 'recover';
      f.direction = distance < 370 ? canRetreat ? -toward : toward : 0;
      return;
    }

    // A long held guard protects one side. Walk through it to attack the back;
    // the player can answer by turning the guard with A/D or releasing it.
    if(seen.action==='block' && habits.blockRate>.35 && !playerBack && distance<350
      && this.clock>=this.nextGuardFlank && f.stamina>=reserve+24) {
      const goal=clamp(targetX+toward*175,COMBAT.minX,COMBAT.maxX);
      if(Math.abs(goal-targetX)>=130) {
        this.guardFlankGoal=goal; this.nextGuardFlank=this.clock+2600;
        this.guardUntil=0; f.blocking=false; this.state='flank'; f.direction=toward; return;
      }
    }

    // At overlapping roots, make space instead of swinging repeatedly through empty front hitboxes.
    if (distance < 95) {
      this.state = playerBack && committed ? 'flank' : 'space';
      f.direction = canRetreat ? -toward : toward;
      return;
    }
    const punish = playerRecovering || dodgeRecovering || playerBack || playerSpent || seen.action === 'hit';
    if (punish && this.random() < Math.min(.99, this.profile.counterPreference + (boss ? .08 : 0))) {
      const slot = this.careerSlot(f, seen, targetX, velocity, playerSpent ? guardCost : reserve, true);
      this.state = 'counter';
      if (slot !== null) { world.attack(f, slot); return; }
      f.direction = toward; return;
    }

    // Repeated retreat is chased into the corner; frequent dodges are allowed to finish before punishment.
    const fleeing = velocity * toward > .12 && (habits.retreatRate > .14 || seen.stamina < 25);
    if (fleeing) {
      this.state = 'cutoff'; f.direction = toward;
      const slot = this.careerSlot(f, seen, targetX, velocity, reserve, false);
      if (slot !== null && this.random() < this.profile.aggression) { f.direction = 0; world.attack(f, slot); }
      return;
    }
    if (seen.action === 'dodge' && elapsed < COMBAT.dodgeInvulnerableTo) {
      this.state = 'space'; f.direction = distance > this.profile.preferredRange + 30 ? toward : 0; return;
    }
    const pressure = seen.action === 'block' && (habits.blockRate > .25 || seen.stamina < guardCost * 2.5)
      || seen.hp / seen.maxHP < .3 || playerSpent;
    // A habitual early dodger can be baited with a brief pause. The cooldown prevents waiting forever.
    if (!pressure && !committed && habits.dodgeRate > .13 && distance < 320
      && this.clock >= this.nextDodgeBait && this.random() < (boss ? .75 : .4)) {
      this.baitUntil = this.clock + 140; this.nextDodgeBait = this.clock + 1900;
    }
    // Bait known heavy spam at the edge of its range; do not grant a block on an unseen new attack.
    const rhythmDue = this.attackRhythm > 0 && this.clock - this.lastAttackAt >= this.attackRhythm - 130
      && this.clock - this.lastAttackAt < this.attackRhythm + 100;
    if (!pressure && !committed && habits.repetition > .7 && habits.favorite === 2 && rhythmDue
      && distance > 255 && distance < 350 && canRetreat && this.random() < (boss ? .65 : .35)) {
      this.baitUntil = this.clock + 130;
    }
    if (this.clock < this.baitUntil && !pressure) { this.state = 'bait'; f.direction = -toward; return; }

    const timePressure = this.clock + this.priorRoundMs > 72_000 && f.hp / f.maxHP <= seen.hp / seen.maxHP;
    const aggression = Math.min(.97, this.profile.aggression + (pressure ? .16 : 0) + (timePressure ? .12 : 0));
    const slot = this.careerSlot(f, seen, targetX, velocity, pressure ? guardCost : reserve, false);
    if (slot !== null && this.random() < aggression) {
      this.state = pressure ? 'pressure' : 'attack'; world.attack(f, slot); return;
    }
    const desired = clamp(this.profile.preferredRange - (pressure || timePressure ? 40 : 0), 150, 285);
    this.state = distance > desired + 14 ? 'approach' : 'space';
    f.direction = distance > desired + 14 ? toward : distance < desired - 26 ? canRetreat ? -toward : toward : 0;
  }
  private careerSlot(f: Fighter, seen: Observation, targetX: number, velocity: number, reserve: number, punish: boolean): AttackSlot | null {
    const toward = targetX >= f.x ? 1 : -1;
    const elapsed = seen.elapsed + this.clock - seen.at;
    const recoveryLeft = seen.action === 'attack' ? attackDuration(seen.slot) - elapsed : Infinity;
    const valid: AttackSlot[] = [];
    for (const slot of [0, 1, 2] as const) {
      const spec = ATTACK_SLOTS[slot];
      if (f.stamina < spec.stamina + reserve) continue;
      // Predict only measured motion, with uncertainty margin for late changes of direction.
      const travel = velocity * spec.startup * (this.profile.boss ? .8 : .65);
      const futureX = clamp(targetX + travel, COMBAT.minX, COMBAT.maxX);
      const forwardDistance = (futureX - f.x) * toward;
      if (forwardDistance < 90 || forwardDistance >= spec.range + COMBAT.bodyHalfWidth - 24) continue;
      if (punish && seen.action === 'attack' && recoveryLeft < spec.startup - 35 && seen.stamina >= 14) continue;
      // When a habitual dodger is already airborne, save the attack until the vulnerable frames.
      if (seen.action === 'dodge' && elapsed + spec.startup < COMBAT.dodgeInvulnerableTo + 25) continue;
      valid.push(slot);
    }
    if (!valid.length) return null;
    if (punish || seen.action === 'block' || seen.action === 'attack' || this.habits.crossingRate > .06) return valid[0];
    // Within a safe opening, change the animation/tempo of a chain rather than always selecting jab.
    // Expensive windups are used only with a healthy reserve; they still receive no damage bonus.
    const varied = valid.filter(slot => slot !== f.slot && f.stamina >= ATTACK_SLOTS[slot].stamina + reserve + 14);
    if (f.action === 'attack' && varied.length) return varied[Math.min(varied.length - 1, Math.floor(this.random() * varied.length))];
    if (valid.length > 1 && f.stamina > reserve + 45 && this.random() > .55) {
      return valid[1 + Math.min(valid.length - 2, Math.floor(this.random() * (valid.length - 1)))];
    }
    return valid[0];
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
