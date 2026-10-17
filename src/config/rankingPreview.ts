import type { StyleId } from './styles';

export interface OpponentPreview {
  id: string;
  name: string;
  alias: string;
  class: 1 | 2 | 3;
  rank: number;
  style: StyleId;
  hp: number;
  stamina: number;
  damage: number;
  tactic: string;
}

/** Read-only board preview. No career combat or unlocking is implemented here. */
export const OPPONENT_PREVIEW: readonly OpponentPreview[] = [
  { id: 'ilya', name: 'Илья', alias: 'Рывок', class: 1, rank: 3, style: 'boxing', hp: 90, stamina: 85, damage: 9, tactic: 'Сокращает дистанцию и атакует короткими сериями.' },
  { id: 'mark', name: 'Марк', alias: 'Стена', class: 1, rank: 2, style: 'muay-thai', hp: 110, stamina: 90, damage: 10, tactic: 'Предпочитает защиту и ответные атаки.' },
  { id: 'dan', name: 'Дан', alias: 'Ритм', class: 1, rank: 1, style: 'mma', hp: 120, stamina: 105, damage: 11, tactic: 'Меняет дистанцию и чередует серии с уклонениями.' },
  { id: 'arsen', name: 'Арсен', alias: 'Шаг', class: 2, rank: 3, style: 'taekwondo', hp: 135, stamina: 115, damage: 12, tactic: 'Держится на расстоянии, ждёт ошибки соперника.' },
  { id: 'lev', name: 'Лев', alias: 'Тиск', class: 2, rank: 2, style: 'mma', hp: 150, stamina: 120, damage: 13, tactic: 'Постоянно давит и бережёт выносливость для серий.' },
  { id: 'timur', name: 'Тимур', alias: 'Пульс', class: 2, rank: 1, style: 'boxing', hp: 165, stamina: 130, damage: 14, tactic: 'Выбирает момент для быстрой контратаки.' },
  { id: 'roman', name: 'Роман', alias: 'Холод', class: 3, rank: 3, style: 'muay-thai', hp: 180, stamina: 145, damage: 15, tactic: 'Контролирует темп и редко атакует без подготовки.' },
  { id: 'kai', name: 'Кай', alias: 'Грань', class: 3, rank: 2, style: 'taekwondo', hp: 200, stamina: 155, damage: 16, tactic: 'Провоцирует атаку и отвечает после уклонения.' },
  { id: 'nik', name: 'Ник', alias: 'Вершина', class: 3, rank: 1, style: 'freestyle', hp: 225, stamina: 170, damage: 18, tactic: 'Адаптирует давление к здоровью и выносливости соперника.' },
];
