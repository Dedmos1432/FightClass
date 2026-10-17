import { AudioService } from '../services/AudioService';
import { SaveService } from '../services/SaveService';
import { SettingsService } from '../services/SettingsService';
import { browserStorage, StorageService } from '../services/StorageService';

export class GameServices {
  readonly storage = new StorageService(browserStorage());
  readonly saves = new SaveService(this.storage);
  readonly settings = new SettingsService(this.storage, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  readonly audio = new AudioService(this.settings);
}
