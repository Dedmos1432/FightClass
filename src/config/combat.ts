/** Combat properties belong to slots. Animation/style never enters damage calculations. */
export const ATTACK_SLOTS = [
  { startup: 135, active: 100, recovery: 215, range: 225, stamina: 12 },
  { startup: 205, active: 120, recovery: 265, range: 255, stamina: 16 },
  { startup: 280, active: 140, recovery: 315, range: 285, stamina: 20 },
] as const;
export type AttackSlot = 0 | 1 | 2;
export const COMBAT = {
  centerX: 960, startRadius: 145, playerStart: 710, enemyStart: 1210,
  minX: 160, maxX: 1760, floorY: 910, playerSpeed: 340, bodyHalfWidth: 57,
  staminaRegen: 18, blockRegen: 5, guardCostBase: 3, guardCostPerDamage: .08,
  hitStun: 240, guardBreakStun: 580,
  dodgeCost: 25, dodgeDuration: 450, dodgeSpeed: 640, dodgeInvulnerableFrom: 65, dodgeInvulnerableTo: 290,
  comboBufferMs: 220, inputBufferMs: 140, bufferGraceMs: 24, maxCombo: 3, intermissionMs: 1800, countdownMs: 1800,
  damageGrowth: 3, rosterSize: 15,
  roundDurationMs: 90_000, enemyBoostAfterMs: 15_000,
  enemyDamageBoost: .10, boostNoticeMs: 3000,
} as const;

/** The same light guard tax is used by combat resolution and AI resource planning. */
export const guardStaminaCost = (damage: number): number => COMBAT.guardCostBase + Math.max(0,damage) * COMBAT.guardCostPerDamage;
