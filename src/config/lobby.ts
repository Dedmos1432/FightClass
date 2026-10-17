export const WORLD = {
  width: 1920,
  height: 1080,
  floorY: 910,
  minX: 120,
  maxX: 1800,
  speed: 360,
  spawnX: 880,
  interactionRadius: 135,
} as const;

export const LOBBY_OBJECTS = [
  { id: 'gym', kind: 'door', x: 457, labelY: 248, label: 'КАЧАЛКА', action: 'Войти в тренажёрный зал', detail: 'ЗДОРОВЬЕ / ВЫНОСЛИВОСТЬ' },
  { id: 'board', kind: 'board', x: 965, labelY: 296, label: 'РЕЙТИНГ', action: 'Открыть доску соперников', detail: 'ТВОЙ ПУТЬ К ВЕРШИНЕ' },
  { id: 'dojo', kind: 'door', x: 1468, labelY: 248, label: 'ЕДИНОБОРСТВА', action: 'Войти в зал единоборств', detail: 'ПОЕДИНКИ / УРОН' },
] as const;

export type LobbyObject = typeof LOBBY_OBJECTS[number];

export function nearestLobbyObject(x: number): LobbyObject | null {
  let nearest: LobbyObject | null = null;
  let distance: number = WORLD.interactionRadius;
  for (const object of LOBBY_OBJECTS) {
    const current = Math.abs(x - object.x);
    if (current <= distance) { nearest = object; distance = current; }
  }
  return nearest;
}
