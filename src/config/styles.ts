export const STYLES = [
  { id: 'boxing', name: 'Бокс', number: '01', moves: ['Jab', 'Hook', 'Uppercut'] },
  { id: 'mma', name: 'ММА', number: '02', moves: ['Jab · MMA', 'Cross', 'Low Kick'] },
  { id: 'taekwondo', name: 'Тхэквондо', number: '03', moves: ['Axe Kick', 'Front Kick', 'Spinning Back Kick'] },
  { id: 'muay-thai', name: 'Муай-тай', number: '04', moves: ['Teep', 'Roundhouse Kick', 'Jumping Roundhouse Kick'] },
  { id: 'freestyle', name: 'Свободный стиль', number: '05', moves: ['Jab', 'Cross', 'Teep'] },
] as const;

export type StyleId = typeof STYLES[number]['id'];

export function isStyleId(value: unknown): value is StyleId {
  return STYLES.some((style) => style.id === value);
}

export function getStyle(id: StyleId): typeof STYLES[number] {
  return STYLES.find((style) => style.id === id)!;
}

// Base values are common to all styles; permanent training growth is separate.
export const BASE_STATS = { maxHP: 100, currentHP: 100, stamina: 100, damage: 10 } as const;
