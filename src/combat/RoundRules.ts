import { COMBAT } from '../config/combat';
import type { ActiveRun } from './EndlessProgress';

export type RoundOutcome = 'player' | 'enemy' | 'draw';
export type SeriesEndReason = 'knockout' | 'timeout' | 'draw';
interface Health { hp: number; maxHP: number }

/** Only active fighting time is saved; a new opponent starts a new round. */
export function roundElapsed(run: Pick<ActiveRun, 'elapsedMs' | 'roundStartedMs'>): number {
  return Math.max(0, (run.elapsedMs ?? 0) - (run.roundStartedMs ?? 0));
}

export function roundRemaining(elapsedMs: number): number {
  return Math.max(0, COMBAT.roundDurationMs - elapsedMs);
}

export const enemyBoosted = (elapsedMs: number): boolean => elapsedMs >= COMBAT.enemyBoostAfterMs;

/** Derive from base damage, so reloads and subsequent frames cannot stack the bonus. */
export function roundEnemyDamage(baseDamage: number, elapsedMs: number): number {
  return enemyBoosted(elapsedMs) ? Math.round(baseDamage * (1 + COMBAT.enemyDamageBoost) * 100) / 100 : baseDamage;
}

export function roundOutcome(elapsedMs: number, player: Health, enemy: Health): RoundOutcome | null {
  if (player.hp <= 0) return 'enemy';
  if (enemy.hp <= 0) return 'player';
  if (elapsedMs < COMBAT.roundDurationMs) return null;
  const difference = player.hp / player.maxHP - enemy.hp / enemy.maxHP;
  if (Math.abs(difference) < 1e-9) return 'draw';
  return difference > 0 ? 'player' : 'enemy';
}
