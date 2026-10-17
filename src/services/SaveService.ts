import { GAME } from '../config/game';
import { StorageService } from './StorageService';

/** Only the entry point exists in stage 1. Gameplay data arrives in later stages. */
export interface SessionSave {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  location: 'lobby';
  currentClass: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSessionSave(value: unknown): value is SessionSave {
  if (!isRecord(value)) return false;
  return value.version === 1 && value.location === 'lobby' && value.currentClass === 1
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt));
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
    return this.session ? { ...this.session } : null;
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
    };
    this.storage.write(GAME.storage.session, this.session);
    return { ...this.session };
  }

  touch(): boolean {
    if (!this.session) return false;
    this.session.updatedAt = new Date().toISOString();
    return this.storage.write(GAME.storage.session, this.session);
  }
}
