import { COMBAT } from '../config/combat';
import { BASE_STATS } from '../config/styles';

export interface EndlessProgress {
  totalWins: number; bestStreak: number; runs: number; lastWins: number; legacyDamageBonus: number;
}
export interface ActiveRun {
  id: string; wins: number; hp: number; stamina: number; enemyHP: number; enemyStamina: number;
  playerX: number; enemyX: number; elapsedMs?: number; roundStartedMs?: number;
}
export const freshEndless = (legacyDamageBonus = 0): EndlessProgress => ({
  totalWins: 0, bestStreak: 0, runs: 0, lastWins: 0, legacyDamageBonus,
});
export function damageFor(progress: EndlessProgress): number {
  return BASE_STATS.damage + progress.legacyDamageBonus + Math.floor(COMBAT.damageGrowth * Math.sqrt(progress.totalWins));
}
export function rewardFor(progress: EndlessProgress, wins: number): number {
  return damageFor({ ...progress, totalWins: progress.totalWins + wins }) - damageFor(progress);
}
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function isEndless(v: unknown): v is EndlessProgress {
  return record(v) && count(v.totalWins) && count(v.bestStreak) && count(v.runs) && count(v.lastWins)
    && count(v.legacyDamageBonus) && v.bestStreak <= v.totalWins && v.lastWins <= v.bestStreak;
}
export function isActiveRun(v: unknown): v is ActiveRun {
  return record(v) && typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 128 && count(v.wins)
    && finite(v.hp) && finite(v.stamina) && finite(v.enemyHP) && finite(v.enemyStamina)
    && (v.elapsedMs === undefined || finite(v.elapsedMs))
    && (v.roundStartedMs === undefined || finite(v.roundStartedMs) && v.roundStartedMs <= (typeof v.elapsedMs === 'number' ? v.elapsedMs : 0))
    && finite(v.playerX) && v.playerX >= COMBAT.minX && v.playerX <= COMBAT.maxX
    && finite(v.enemyX) && v.enemyX >= COMBAT.minX && v.enemyX <= COMBAT.maxX;
}
