import Phaser from 'phaser';
import { GAME } from './config/game';
import { GameServices } from './core/GameServices';
import { CombatScene } from './scenes/CombatScene';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { TrainingRoomScene } from './scenes/TrainingRoomScene';
import './styles.css';
import './ui/exploration.css';
import './ui/combat-training.css';

const services = new GameServices();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: GAME.background,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: false, powerPreference: 'low-power' },
  fps: { target: 60, limit: 60 },
  audio: { noAudio: true },
  scene: [new BootScene(services), new MainMenuScene(services), new LobbyScene(services), new TrainingRoomScene(services, 'gym'), new TrainingRoomScene(services, 'dojo'), new CombatScene(services)],
});

const unsubscribe = services.settings.subscribe((settings) => {
  document.body.dataset.motion = String(settings.animatedBackground);
});
const onVisibility = (): void => { if (document.hidden) services.audio.suspend(); };
document.addEventListener('visibilitychange', onVisibility);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibility);
    game.destroy(true);
    document.querySelector('#ui')?.replaceChildren();
  });
}
