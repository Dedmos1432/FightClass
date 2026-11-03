import Phaser from 'phaser';
import { GAME } from './config/game';
import { GameServices } from './core/GameServices';
import { CombatScene } from './scenes/CombatScene';
import { CareerScene } from './scenes/CareerScene';
import { TutorialScene } from './scenes/TutorialScene';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { TrainingRoomScene } from './scenes/TrainingRoomScene';
import './styles.css';
import './ui/exploration.css';
import './ui/combat-training.css';
import './ui/career.css';
import './ui/tutorial.css';
import './ui/touch.css';
import { browserStorage, StorageService } from './services/StorageService';
import { deadline, initializeYandex } from './platform/YandexPlatform';
import { CloudSaves } from './platform/CloudSaves';
import { bindPlatform } from './platform/PlatformRuntime';

let game:Phaser.Game|null=null;
let dispose:(()=>void)|null=null;
let cancelled=false;
async function start():Promise<void> {
  document.querySelector('#ui')!.innerHTML='<div class="loading-screen"><span class="brand-mark">FC</span><p>FIGHT CLASS</p><small>ПОДГОТОВКА ИГРЫ</small></div>';
  const storage=new StorageService(browserStorage());
  const platform=await initializeYandex(import.meta.env.MODE==='yandex');
  let cloud:CloudSaves|null=null;
  if(platform.sdk)try{cloud=await CloudSaves.connect(storage,await deadline(platform.sdk.getPlayer(),6000));}catch{/* Local saves remain available. */}
  if(cancelled){cloud?.destroy();platform.destroy();return;}
  const services=new GameServices(storage);
  game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: GAME.background,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: false, powerPreference: 'low-power' },
  fps: { target: 60, limit: 60 },
  audio: { noAudio: true },
  scene: [new BootScene(services), new MainMenuScene(services), new LobbyScene(services), new TrainingRoomScene(services, 'gym'), new TrainingRoomScene(services, 'dojo'), new CombatScene(services), new CareerScene(services), new TutorialScene(services)],
  });
  const unsubscribe = services.settings.subscribe((settings) => {
  document.body.dataset.motion = String(settings.animatedBackground);
  });
  const release=bindPlatform(game,services,platform,cloud);
  dispose=()=>{unsubscribe();release();};
}
void start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelled=true;dispose?.();game?.destroy(true);
    document.querySelector('#ui')?.replaceChildren();
  });
}
