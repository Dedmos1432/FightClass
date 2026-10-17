export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ReadResult =
  | { status: 'ok'; value: unknown }
  | { status: 'empty' | 'invalid' | 'unavailable' };

/** Storage failures must never prevent an offline game from starting. */
export class StorageService {
  private readonly memory = new Map<string, string>();
  private persistent = true;

  constructor(private readonly storage: StorageLike | null) {
    this.persistent = storage !== null;
  }

  get isPersistent(): boolean {
    return this.persistent;
  }

  read(key: string): ReadResult {
    let raw = this.memory.get(key) ?? null;
    if (raw === null && this.storage && this.persistent) {
      try {
        raw = this.storage.getItem(key);
      } catch {
        this.persistent = false;
        return { status: 'unavailable' };
      }
    }
    if (raw === null) return { status: 'empty' };
    try {
      return { status: 'ok', value: JSON.parse(raw) as unknown };
    } catch {
      return { status: 'invalid' };
    }
  }

  write(key: string, value: unknown): boolean {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    if (!this.storage || !this.persistent) return false;
    try {
      this.storage.setItem(key, raw);
      return true;
    } catch {
      this.persistent = false;
      return false;
    }
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
