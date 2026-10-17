import { GAME } from '../config/game';
import { WORLD } from '../config/lobby';
import { isStyleId, type StyleId } from '../config/styles';
import { StorageService } from './StorageService';

export interface LobbyState {
  x: number;
  facing: 'left' | 'right';
  style: StyleId;
}

const defaultLobbyState = (): LobbyState => ({ x: WORLD.spawnX, facing: 'right', style: 'boxing' });

/** Additive v1 fields preserve saves created by the main-menu stage. */
export interface SessionSave {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  location: 'lobby';
  currentClass: 1;
  player?: LobbyState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSessionSave(value: unknown): value is SessionSave {
  if (!isRecord(value)) return false;
  return value.version === 1 && value.location === 'lobby' && value.currentClass === 1
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
    && (value.player === undefined || (isRecord(value.player)
      && typeof value.player.x === 'number' && Number.isFinite(value.player.x)
      && value.player.x >= WORLD.minX && value.player.x <= WORLD.maxX
      && (value.player.facing === 'left' || value.player.facing === 'right')
      && isStyleId(value.player.style)));
}

export class SaveService {
  private session: SessionSave | null = null;
  readonly loadIssue: 'invalid' | 'unsupported' | null;

  constructor(private readonly storage: StorageService) {
    const result = storage.read(GAME.storage.session);
    if (result.status === 'ok' && isSessionSave(result.value)) {
      this.session = result.value;
      this.loadIssue = null;
    } else if (result.status === 'ok' || result.status === 'invalid') {
      this.loadIssue = result.status === 'ok' && isRecord(result.value)
        && typeof result.value.version === 'number' && result.value.version !== 1
        ? 'unsupported' : 'invalid';
    } else {
      this.loadIssue = null;
    }
  }

  get current(): Readonly<SessionSave> | null {
    return this.session ? { ...this.session, ...(this.session.player ? { player: { ...this.session.player } } : {}) } : null;
  }

  get lobbyState(): Readonly<LobbyState> {
    return this.session?.player ? { ...this.session.player } : defaultLobbyState();
  }

  updateLobby(patch: Partial<LobbyState>): boolean {
    if (!this.session) return false;
    const previous = this.lobbyState;
    this.session.player = {
      x: typeof patch.x === 'number' && Number.isFinite(patch.x)
        ? Math.max(WORLD.minX, Math.min(WORLD.maxX, patch.x)) : previous.x,
      facing: patch.facing === 'left' || patch.facing === 'right' ? patch.facing : previous.facing,
      style: isStyleId(patch.style) ? patch.style : previous.style,
    };
    return this.touch();
  }

  startNew(): Readonly<SessionSave> {
    const timestamp = new Date().toISOString();
    this.session = {
      version: 1,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      location: 'lobby',
      currentClass: 1,
      player: defaultLobbyState(),
    };
    this.storage.write(GAME.storage.session, this.session);
    return this.current!;
  }

  touch(): boolean {
    if (!this.session) return false;
    this.session.updatedAt = new Date().toISOString();
    return this.storage.write(GAME.storage.session, this.session);
  }
}
