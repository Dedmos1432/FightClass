import type { StyleId } from '../config/styles';

export const ENEMY_SKINS = ['kim', 'kwon', 'yeo'] as const;
export type EnemySkin = typeof ENEMY_SKINS[number];
export type FighterSkin = 'player' | EnemySkin;
const SKINS = {
  kim: { name: 'Kim Dong Won', style: 'mma' as StyleId, canDodge: false },
  kwon: { name: 'Kwon Tae-young', style: 'taekwondo' as StyleId, canDodge: true },
  yeo: { name: 'Yeo Eun-sol', style: 'mma' as StyleId, canDodge: true },
} as const;
interface Variant {
  id: string; skin: EnemySkin; variantName: string; tactic: string;
  aggression: number; defense: number; preferredRange: number; dodgePreference: number;
  counterPreference: number; comboPreference: number; reserve: number; hpBonus: number;
}
/** Fifteen tactical variants share three temporary art sets, independently of survival difficulty. */
export const ROSTER: readonly Variant[] = [
  { id:'steady', skin:'kim', variantName:'Основы', tactic:'Держит центр и отвечает прямыми ударами.', aggression:.62, defense:.50, preferredRange:200, dodgePreference:0, counterPreference:.50, comboPreference:.32, reserve:28, hpBonus:0 },
  { id:'outfighter', skin:'kwon', variantName:'Дальняя дистанция', tactic:'Держит дистанцию и встречает на подходе.', aggression:.52, defense:.62, preferredRange:255, dodgePreference:.65, counterPreference:.65, comboPreference:.30, reserve:34, hpBonus:2 },
  { id:'raider', skin:'yeo', variantName:'Натиск', tactic:'Сокращает дистанцию и связывает атаки.', aggression:.88, defense:.37, preferredRange:165, dodgePreference:.35, counterPreference:.32, comboPreference:.85, reserve:23, hpBonus:4 },
  { id:'counter', skin:'kim', variantName:'Контрудар', tactic:'Ждёт промаха и наказывает восстановление.', aggression:.48, defense:.80, preferredRange:225, dodgePreference:0, counterPreference:.95, comboPreference:.42, reserve:35, hpBonus:3 },
  { id:'dancer', skin:'kwon', variantName:'Подвижность', tactic:'Уходит от медленных ударов и меняет дистанцию.', aggression:.59, defense:.65, preferredRange:240, dodgePreference:.95, counterPreference:.70, comboPreference:.44, reserve:40, hpBonus:1 },
  { id:'guard-breaker', skin:'yeo', variantName:'Давление на блок', tactic:'Расходует выносливость защиты короткими сериями.', aggression:.86, defense:.44, preferredRange:175, dodgePreference:.40, counterPreference:.48, comboPreference:.92, reserve:22, hpBonus:6 },
  { id:'fortress', skin:'kim', variantName:'Плотная защита', tactic:'Бережёт выносливость, блокирует и отвечает.', aggression:.45, defense:.94, preferredRange:210, dodgePreference:0, counterPreference:.74, comboPreference:.27, reserve:45, hpBonus:12 },
  { id:'trapper', skin:'kwon', variantName:'Ловушка', tactic:'Отступает на край дальности и ловит промах.', aggression:.55, defense:.78, preferredRange:275, dodgePreference:.72, counterPreference:.98, comboPreference:.35, reserve:36, hpBonus:3 },
  { id:'finisher', skin:'yeo', variantName:'Добивание', tactic:'Усиливает натиск, когда игрок ранен или устал.', aggression:.93, defense:.43, preferredRange:185, dodgePreference:.50, counterPreference:.76, comboPreference:.78, reserve:26, hpBonus:5 },
  { id:'pursuer', skin:'kim', variantName:'Преследование', tactic:'Не даёт спокойно восстановиться на дистанции.', aggression:.94, defense:.46, preferredRange:170, dodgePreference:0, counterPreference:.42, comboPreference:.72, reserve:21, hpBonus:8 },
  { id:'reader', skin:'kwon', variantName:'Чтение привычек', tactic:'Чаще защищается от повторяемого приёма.', aggression:.58, defense:.86, preferredRange:230, dodgePreference:.80, counterPreference:.90, comboPreference:.55, reserve:38, hpBonus:4 },
  { id:'flanker', skin:'yeo', variantName:'Обход', tactic:'Пытается пройти за спину во время длинной атаки.', aggression:.76, defense:.57, preferredRange:180, dodgePreference:.75, counterPreference:.78, comboPreference:.64, reserve:30, hpBonus:2 },
  { id:'pressure', skin:'kim', variantName:'Ближний бой', tactic:'Навязывает короткую дистанцию и серии.', aggression:.90, defense:.60, preferredRange:150, dodgePreference:0, counterPreference:.62, comboPreference:.90, reserve:25, hpBonus:10 },
  { id:'patient', skin:'kwon', variantName:'Терпение', tactic:'Не тратит силы на удары вне дальности.', aggression:.48, defense:.88, preferredRange:250, dodgePreference:.86, counterPreference:.94, comboPreference:.40, reserve:44, hpBonus:7 },
  { id:'veteran', skin:'yeo', variantName:'Универсал', tactic:'Чередует защиту, контрудары и давление.', aggression:.76, defense:.78, preferredRange:215, dodgePreference:.82, counterPreference:.88, comboPreference:.82, reserve:33, hpBonus:9 },
];
function hash(text: string): number {
  let value = 2166136261;
  for (let i=0;i<text.length;i++) value = Math.imul(value ^ text.charCodeAt(i),16777619);
  return value >>> 0;
}
export function variantFor(index: number, runKey = ''): Variant {
  return ROSTER[runKey ? hash(`${runKey}:${index}`) % ROSTER.length : index % ROSTER.length];
}
export function opponentAt(index: number, runKey = '', roundStartedMs = 0) {
  const variant = variantFor(index, runKey);
  const difficulty = index + Math.max(0, roundStartedMs) / 90000;
  const skill = Math.min(.96, .24 + difficulty * .045);
  return {
    ...variant, ...SKINS[variant.skin], index, difficulty, skill,
    maxHP: 55 + variant.hpBonus + Math.floor(difficulty * 6),
    stamina: 85 + Math.floor(difficulty * 2), damage: 6 + Math.floor(difficulty * .6),
    speed: Math.min(335, 245 + difficulty * 4),
    reactionMs: Math.max(105, 410 - difficulty * 17),
    comboChance: Math.min(.94, variant.comboPreference * (.35 + skill * .8)),
  };
}
export type Opponent = ReturnType<typeof opponentAt>;
