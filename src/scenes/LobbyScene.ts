import type { GameServices } from '../core/GameServices';
import { ExplorationScene } from './ExplorationScene';

export class LobbyScene extends ExplorationScene {
  constructor(services: GameServices) { super(services, 'lobby'); }
}
