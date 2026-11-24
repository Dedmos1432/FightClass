import { ATTACK_SLOTS, COMBAT, guardStaminaCost, type AttackSlot, type DodgeDirection } from '../config/combat';
import type { FighterSkin, Opponent } from './Opponents';

export type FighterAction = 'idle' | 'walk' | 'retreat' | 'block' | 'dodge' | 'attack' | 'hit' | 'ko';
export interface Fighter {
  skin: FighterSkin; autoFace: boolean; x: number; facing: -1 | 1; hp: number; maxHP: number;
  stamina: number; maxStamina: number; damage: number; speed: number; canDodge: boolean;
  action: FighterAction; elapsed: number; slot: AttackSlot; hitLanded: boolean; combo: number;
  buffered: AttackSlot | null; bufferedDodge: DodgeDirection | null; bufferMs: number;
  dodgeDirection: DodgeDirection; dodgeForward: boolean;
  direction: number; blocking: boolean; autoGuard: boolean; guardMs: number; stun: number;
}
export interface CombatEvent { type: 'hit' | 'block' | 'guard-break' | 'dodge'; target: Fighter; source: Fighter; damage: number }
export function fighter(values: Pick<Fighter, 'skin' | 'maxHP' | 'damage' | 'speed' | 'canDodge'> & { stamina: number; x: number; hp?: number; facing?: -1 | 1; autoFace?: boolean }): Fighter {
  return { ...values, autoFace: values.autoFace ?? true, hp: values.hp ?? values.maxHP, maxStamina: values.stamina, facing: values.facing ?? 1,
    action: 'idle', elapsed: 0, slot: 0, hitLanded: false, combo: 0, buffered: null, bufferedDodge: null, bufferMs: 0,
    dodgeDirection: values.facing === -1 ? 1 : -1, dodgeForward: false,
    direction: 0, blocking: false, autoGuard: false, guardMs: 0, stun: COMBAT.hitStun };
}
export function enemyFighter(profile: Opponent): Fighter {
  return fighter({ ...profile, x: COMBAT.enemyStart, facing: -1, autoFace: false });
}
export function attackDuration(slot: AttackSlot): number {
  const spec = ATTACK_SLOTS[slot]; return spec.startup + spec.active + spec.recovery;
}
export interface Box { x: number; y: number; width: number; height: number }
export function hurtbox(f: Fighter): Box { return { x: f.x - COMBAT.bodyHalfWidth, y: COMBAT.floorY - 310, width: COMBAT.bodyHalfWidth * 2, height: 310 }; }
export function hitbox(f: Fighter): Box | null {
  const spec = ATTACK_SLOTS[f.slot];
  if (f.action !== 'attack' || f.elapsed < spec.startup || f.elapsed >= spec.startup + spec.active || f.hitLanded) return null;
  return { x: f.facing > 0 ? f.x + 45 : f.x - spec.range, y: COMBAT.floorY - 290, width: spec.range - 45, height: 240 };
}
export const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));
const free = (f: Fighter): boolean => ['idle', 'walk', 'retreat', 'block'].includes(f.action);

export class CombatWorld {
  readonly events: CombatEvent[] = [];
  constructor(readonly player: Fighter, public enemy: Fighter) {}
  clearInputBuffer(f: Fighter): void { f.buffered=null; f.bufferedDodge=null; f.bufferMs=0; }
  private queue(f: Fighter, command: AttackSlot | { dodge: DodgeDirection }, remaining: number): boolean {
    const cost=typeof command==='number' ? ATTACK_SLOTS[command].stamina : COMBAT.dodgeCost;
    if(f.stamina<cost) return false;
    f.buffered=typeof command==='number' ? command : null;
    f.bufferedDodge=typeof command==='number' ? null : command.dodge;
    f.bufferMs=remaining+COMBAT.bufferGraceMs; return true;
  }
  attack(f: Fighter, slot: AttackSlot): boolean {
    if (f.hp <= 0 || this.over) return false;
    if (f.action === 'attack') {
      if (f.elapsed >= attackDuration(f.slot) - COMBAT.comboBufferMs && f.combo < COMBAT.maxCombo) {
        return this.queue(f,slot,attackDuration(f.slot)-f.elapsed);
      }
      return false;
    }
    if (!free(f)) {
      const remaining=f.action==='hit' ? f.stun-f.elapsed : f.action==='dodge' ? COMBAT.dodgeDuration-f.elapsed : Infinity;
      return remaining>=0 && remaining<=COMBAT.inputBufferMs && this.queue(f,slot,remaining);
    }
    if (f.stamina < ATTACK_SLOTS[slot].stamina) return false;
    f.action = 'attack'; f.elapsed = 0; f.slot = slot; f.stamina -= ATTACK_SLOTS[slot].stamina;
    f.hitLanded = false; this.clearInputBuffer(f); f.combo = Math.max(1, f.combo);
    f.blocking = false; f.guardMs = 0;
    return true;
  }
  dodge(f: Fighter, direction: DodgeDirection = f.facing === 1 ? -1 : 1): boolean {
    if (!f.canDodge || f.hp<=0 || f.stamina < COMBAT.dodgeCost || this.over) return false;
    if(!free(f)) {
      const remaining=f.action==='attack' ? attackDuration(f.slot)-f.elapsed : f.action==='hit' ? f.stun-f.elapsed
        : f.action==='dodge' ? COMBAT.dodgeDuration-f.elapsed : Infinity;
      return remaining>=0 && remaining<=COMBAT.inputBufferMs && this.queue(f,{ dodge: direction },remaining);
    }
    if (f.skin === 'player') {
      const other = f === this.player ? this.enemy : this.player;
      if (Math.abs(other.x - f.x) > 1) f.facing = other.x > f.x ? 1 : -1;
    }
    f.dodgeDirection = direction;
    f.dodgeForward = f.skin === 'player' && direction === f.facing;
    f.stamina -= COMBAT.dodgeCost; f.action = 'dodge'; f.elapsed = 0; this.clearInputBuffer(f); f.combo = 0; f.blocking = false; f.guardMs = 0;
    return true;
  }
  get over(): boolean { return this.player.hp <= 0 || this.enemy.hp <= 0; }
  update(delta: number): void {
    this.events.length = 0;
    // Small steps guarantee that short active frames cannot be skipped at low FPS.
    let remaining = Math.max(0, Math.min(100, delta));
    while (remaining > 0 && !this.over) {
      const step = Math.min(8, remaining); remaining -= step;
      for (const [f, other] of [[this.player, this.enemy], [this.enemy, this.player]]) this.advance(f, other, step);
      // Collect hits before applying them so simultaneous attacks can trade.
      const hits = [[this.player, this.enemy], [this.enemy, this.player]].filter(([a,b]) => {
        const box = hitbox(a); return box !== null && intersects(box, hurtbox(b));
      });
      for (const [source,target] of hits) this.resolve(source, target);
    }
  }
  private advance(f: Fighter, other: Fighter, delta: number): void {
    if(f.bufferMs>0) {
      f.bufferMs=Math.max(0,f.bufferMs-delta);
      if(f.bufferMs===0) this.clearInputBuffer(f);
    }
    f.elapsed += delta;
    f.guardMs = f.autoGuard && f.direction===0 ? Math.max(0,f.guardMs-delta) : 0;
    if (free(f)) {
      const automaticHold=f.autoGuard && f.direction===0 && f.guardMs>0;
      if ((f.blocking || automaticHold) && f.stamina > 0) {
        // A held guard has a side: A/D turns it explicitly instead of automatically
        // covering a cross-up. Bots turn only when their delayed brain decides to.
        if(f.autoFace && f.direction!==0) f.facing=f.direction>0 ? 1 : -1;
        f.action='block';
      } else {
        if (f.autoFace && Math.abs(other.x - f.x) > 1) f.facing = other.x > f.x ? 1 : -1;
        if (f.direction !== 0) {
          f.action = Math.sign(f.direction) === f.facing ? 'walk' : 'retreat';
          f.x += Math.sign(f.direction) * f.speed * delta / 1000;
        } else f.action = 'idle';
      }
    } else if (f.action === 'dodge') {
      const travelMs = clamp(COMBAT.dodgeTravelMs - (f.elapsed - delta), 0, delta);
      f.x += f.dodgeDirection * COMBAT.dodgeDistance * travelMs / COMBAT.dodgeTravelMs;
      if (f.elapsed >= COMBAT.dodgeDuration) this.finishAction(f,other);
    } else if (f.action === 'hit') {
      if (f.elapsed >= f.stun) this.finishAction(f,other);
    } else if (f.action === 'attack' && f.elapsed >= attackDuration(f.slot)) {
      this.finishAction(f,other,f.combo);
    }
    if (free(f)) f.stamina = Math.min(f.maxStamina, f.stamina + (f.action === 'block' ? COMBAT.blockRegen : COMBAT.staminaRegen) * delta / 1000);
    f.x = clamp(f.x, COMBAT.minX, COMBAT.maxX);
  }
  private finishAction(f: Fighter, other: Fighter, chain=0): void {
    const slot=f.buffered,dodge=f.bufferedDodge,live=f.bufferMs>0;
    f.action='idle'; f.elapsed=0; f.combo=0; f.guardMs=0; this.clearInputBuffer(f);
    // A new commitment may face the enemy; an active strike remains locked.
    if(f.autoFace && (!f.blocking || live) && Math.abs(other.x-f.x)>1) f.facing=other.x>f.x ? 1 : -1;
    if(!live) return;
    if(dodge!==null) this.dodge(f,dodge);
    else if(slot!==null && chain<COMBAT.maxCombo && this.attack(f,slot)) f.combo=chain+1;
  }
  private resolve(source: Fighter, target: Fighter): void {
    source.hitLanded = true;
    if (target.action === 'dodge' && target.elapsed >= COMBAT.dodgeInvulnerableFrom && target.elapsed < COMBAT.dodgeInvulnerableTo) {
      this.events.push({ type: 'dodge', source, target, damage: 0 }); return;
    }
    const facingAttack=target.facing === (source.x > target.x ? 1 : -1);
    // Mobile guard is a reaction to contact, never a way to cancel a committed action.
    const automatic=target.autoGuard && target.direction===0 && free(target) && facingAttack;
    if(automatic) { target.action='block'; target.elapsed=0; target.guardMs=COMBAT.autoGuardMs; }
    const defending = target.action === 'block' && facingAttack;
    const guardCost = guardStaminaCost(source.damage);
    if (defending && target.stamina >= guardCost) {
      target.stamina -= guardCost; this.events.push({ type: 'block', source, target, damage: 0 }); return;
    }
    target.hp = Math.max(0, target.hp - source.damage);
    target.action = target.hp <= 0 ? 'ko' : 'hit'; target.elapsed = 0;
    target.stun = defending ? COMBAT.guardBreakStun : COMBAT.hitStun;
    if (defending) target.stamina = 0;
    this.clearInputBuffer(target); target.combo = 0; target.blocking = false; target.guardMs = 0;
    this.events.push({ type: defending ? 'guard-break' : 'hit', source, target, damage: source.damage });
  }
}
