import Phaser from 'phaser';
import { GAME } from './config/game';
import { GameServices } from './core/GameServices';
import { CombatScene } from './scenes/CombatScene';
import { CareerScene } from './scenes/CareerScene';
import { TutorialScene } from './scenes/TutorialScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { TrainingRoomScene } from './scenes/TrainingRoomScene';
import './styles.css';
import './ui/exploration.css';
import './ui/combat-training.css';
import './ui/career.css';
import './ui/career-mobile.css';
import './ui/tutorial.css';
import './ui/touch.css';
import './ui/mobile.css';
import './ui/mobile-training.css';
import './ui/orientation.css';
import './ui/main-menu.css';
import './ui/lettering.css';
import { OrientationPrompt } from './ui/OrientationPrompt';
import { browserStorage, StorageService } from './services/StorageService';
import { deadline, initializeYandex } from './platform/YandexPlatform';
import { CloudSaves } from './platform/CloudSaves';
import { bindPlatform } from './platform/PlatformRuntime';

let game:Phaser.Game|null=null;
let dispose:(()=>void)|null=null;
let cancelled=false;
const orientation=new OrientationPrompt();

function framebufferSize(host: HTMLElement) {
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  // Phones benefit from a denser canvas. Cap supersampling at roughly a 1080p framebuffer.
  const density = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1920 * 1080 / (width * height))));
  return { width: Math.round(width * density), height: Math.round(height * density) };
}

function watchFramebuffer(game: Phaser.Game, host: HTMLElement): void {
  const resize = () => {
    const size = framebufferSize(host);
    if (size.width !== game.scale.width || size.height !== game.scale.height) game.scale.resize(size.width, size.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener('resize', resize);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    observer.disconnect();
    window.removeEventListener('resize', resize);
  });
}

async function start():Promise<void> {
  document.querySelector('#ui')!.innerHTML='<div class="loading-screen"><span class="brand-mark">FC</span><p>FIGHT CLASS</p><small>ПОДГОТОВКА ИГРЫ</small></div>';
  const storage=new StorageService(browserStorage());
  const platform=await initializeYandex(import.meta.env.MODE==='yandex');
  let cloud:CloudSaves|null=null;
  if(platform.sdk)try{cloud=await CloudSaves.connect(storage,await deadline(platform.sdk.getPlayer(),6000));}catch{/* Local saves remain available. */}
  if(cancelled){cloud?.destroy();platform.destroy();return;}
  const services=new GameServices(storage);
  document.body.dataset.motion = String(services.settings.current.animatedBackground);
  const host = document.querySelector<HTMLElement>('#game')!;
  game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: host,
  backgroundColor: GAME.background,
  scale: { mode: Phaser.Scale.NONE, ...framebufferSize(host) },
  render: { antialias: true, antialiasGL: false, powerPreference: 'low-power' },
  callbacks: { postBoot: instance => watchFramebuffer(instance, host) },
  fps: { target: 60, limit: 60 },
  audio: { noAudio: true },
  scene: [new MainMenuScene(services), new LobbyScene(services), new TrainingRoomScene(services, 'gym'), new TrainingRoomScene(services, 'dojo'), new CombatScene(services), new CareerScene(services), new TutorialScene(services)],
  });
  const unsubscribe = services.settings.subscribe((settings) => {
  document.body.dataset.motion = String(settings.animatedBackground);
  });
  const release=bindPlatform(game,services,platform,cloud,orientation);
  dispose=()=>{unsubscribe();release();};
}
void start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelled=true;dispose?.();orientation.destroy();game?.destroy(true);
    document.querySelector('#ui')?.replaceChildren();
  });
}
