import { GAME } from '../config/game';
import { StorageService } from './StorageService';

export interface Settings {
  volume: number;
  muted: boolean;
  animatedBackground: boolean;
}

type Listener = (settings: Readonly<Settings>) => void;

export class SettingsService {
  private value: Settings;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: StorageService, prefersReducedMotion = false) {
    const defaults: Settings = { volume: 0.4, muted: false, animatedBackground: !prefersReducedMotion };
    const loaded = storage.read(GAME.storage.settings);
    const data = loaded.status === 'ok' && typeof loaded.value === 'object' && loaded.value !== null
      ? loaded.value as Partial<Settings> : {};
    this.value = {
      volume: typeof data.volume === 'number' && Number.isFinite(data.volume)
        ? Math.max(0, Math.min(1, data.volume)) : defaults.volume,
      muted: typeof data.muted === 'boolean' ? data.muted : defaults.muted,
      animatedBackground: typeof data.animatedBackground === 'boolean'
        ? data.animatedBackground : defaults.animatedBackground,
    };
  }

  get current(): Readonly<Settings> {
    return { ...this.value };
  }

  update(patch: Partial<Settings>): void {
    this.value = {
      volume: typeof patch.volume === 'number' && Number.isFinite(patch.volume)
        ? Math.max(0, Math.min(1, patch.volume)) : this.value.volume,
      muted: typeof patch.muted === 'boolean' ? patch.muted : this.value.muted,
      animatedBackground: typeof patch.animatedBackground === 'boolean'
        ? patch.animatedBackground : this.value.animatedBackground,
    };
    this.storage.write(GAME.storage.settings, this.value);
    this.listeners.forEach((listener) => listener(this.current));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
