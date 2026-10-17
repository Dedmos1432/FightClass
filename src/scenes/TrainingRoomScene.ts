import type { GameServices } from '../core/GameServices';
import { ExplorationScene } from './ExplorationScene';

export class TrainingRoomScene extends ExplorationScene {
  constructor(services: GameServices, room: 'gym' | 'dojo') { super(services, room); }
}
