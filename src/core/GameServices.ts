import { AudioService } from '../services/AudioService';
import { SaveService } from '../services/SaveService';
import { SettingsService } from '../services/SettingsService';
import { browserStorage, StorageService } from '../services/StorageService';

export class GameServices {
  readonly saves:SaveService;
  readonly settings:SettingsService;
  readonly audio:AudioService;
  constructor(readonly storage=new StorageService(browserStorage())){
    this.saves=new SaveService(storage);
    this.settings=new SettingsService(storage,window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.audio=new AudioService(this.settings);
  }
}
