import { getStyle, type StyleId } from '../config/styles';

export const MOVES = [
  { id: 'jab', name: 'Jab', style: 'boxing', path: 'Boxing/jab' },
  { id: 'hook', name: 'Hook', style: 'boxing', path: 'Boxing/hook' },
  { id: 'uppercut', name: 'Uppercut', style: 'boxing', path: 'Boxing/uppercut' },
  { id: 'mma-jab', name: 'Jab · MMA', style: 'mma', path: 'MMA/jab' },
  { id: 'cross', name: 'Cross', style: 'mma', path: 'MMA/cross' },
  { id: 'low-kick', name: 'Low Kick', style: 'mma', path: 'MMA/low_kick' },
  { id: 'axe-kick', name: 'Axe Kick', style: 'taekwondo', path: 'Taekwondo/axe_kick' },
  { id: 'front-kick', name: 'Front Kick', style: 'taekwondo', path: 'Taekwondo/front_kick' },
  { id: 'spinning-back-kick', name: 'Spinning Back Kick', style: 'taekwondo', path: 'Taekwondo/spinning_back_kick' },
  { id: 'teep', name: 'Teep', style: 'muay-thai', path: 'Muay Thai/teep' },
  { id: 'roundhouse', name: 'Roundhouse Kick', style: 'muay-thai', path: 'Muay Thai/roudhouse_kick' },
  { id: 'jumping-roundhouse', name: 'Jumping Roundhouse Kick', style: 'muay-thai', path: 'Muay Thai/jumping_roundhouse_kick' },
] as const;
export type MoveId = typeof MOVES[number]['id'];
export type Loadout = [MoveId, MoveId, MoveId];
export const defaultLoadout = (): Loadout => ['jab', 'cross', 'teep'];
export function isMoveId(value: unknown): value is MoveId { return MOVES.some(move => move.id === value); }
export function isLoadout(value: unknown): value is Loadout {
  return Array.isArray(value) && value.length === 3 && value.every(isMoveId) && new Set(value).size === 3;
}
export function moveById(id: MoveId): typeof MOVES[number] { return MOVES.find(move => move.id === id)!; }
export function loadoutFor(style: StyleId, custom: Loadout): Loadout {
  return style === 'freestyle' ? [...custom] : MOVES.filter(move => move.style === getStyle(style).id).map(move => move.id) as Loadout;
}
