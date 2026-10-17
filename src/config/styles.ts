export const STYLES = [
  { id: 'boxing', name: 'Бокс', number: '01', moves: ['Jab', 'Cross', 'Hook'] },
  { id: 'mma', name: 'ММА', number: '02', moves: ['Superman Punch', 'Low Kick', 'Flying Knee'] },
  { id: 'taekwondo', name: 'Тхэквондо', number: '03', moves: ['Side Kick', 'Roundhouse Kick', 'Spinning Back Kick'] },
  { id: 'muay-thai', name: 'Муай-тай', number: '04', moves: ['Teep', 'Elbow Strike', 'Knee Strike'] },
  { id: 'freestyle', name: 'Свободный стиль', number: '05', moves: ['Jab', 'Cross', 'Hook'] },
] as const;

export type StyleId = typeof STYLES[number]['id'];

export function isStyleId(value: unknown): value is StyleId {
  return STYLES.some((style) => style.id === value);
}

export function getStyle(id: StyleId): typeof STYLES[number] {
  return STYLES.find((style) => style.id === id)!;
}

// No style-specific modifiers. Progression will be introduced in later stages.
export const BASE_STATS = { maxHP: 100, currentHP: 100, stamina: 100, damage: 10 } as const;
