/** Combat properties belong to slots. Animation/style never enters damage calculations. */
export const ATTACK_SLOTS = [
  { startup: 150, active: 100, recovery: 250, range: 225, stamina: 14 },
  { startup: 230, active: 120, recovery: 310, range: 255, stamina: 19 },
  { startup: 310, active: 140, recovery: 370, range: 285, stamina: 24 },
] as const;
export type AttackSlot = 0 | 1 | 2;
export const COMBAT = {
  centerX: 960, startRadius: 145, playerStart: 710, enemyStart: 1210,
  minX: 160, maxX: 1760, floorY: 910, playerSpeed: 340, bodyHalfWidth: 57,
  staminaRegen: 18, blockRegen: 4, hitStun: 260, guardBreakStun: 620,
  dodgeCost: 25, dodgeDuration: 450, dodgeSpeed: 640, dodgeInvulnerableFrom: 65, dodgeInvulnerableTo: 290,
  comboBufferMs: 170, maxCombo: 3, intermissionMs: 1800, countdownMs: 1800,
  damageGrowth: 3, rosterSize: 15,
} as const;
