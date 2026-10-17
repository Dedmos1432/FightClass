import Phaser from 'phaser';
import { GAME } from './config/game';
import { GameServices } from './core/GameServices';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LobbyEntryScene } from './scenes/LobbyEntryScene';
import './styles.css';

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
  scene: [new BootScene(services), new MainMenuScene(services), new LobbyEntryScene(services)],
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
