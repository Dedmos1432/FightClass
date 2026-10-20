import Phaser from 'phaser';
import arenaUrl from '../../resourse/задники/Подпольная арена боёв.png?url';
import { GAME, SCENES } from '../config/game';
import type { GameServices } from '../core/GameServices';

export class BootScene extends Phaser.Scene {
  private failed = false;

  constructor(private readonly services: GameServices) {
    super(SCENES.boot);
  }

  preload(): void {
    const ui = document.querySelector<HTMLElement>('#ui')!;
    ui.dataset.screen = 'loading';
    ui.innerHTML = `<div class="loading-screen"><span class="brand-mark"><i></i><i></i><i></i></span><p>${GAME.title.toUpperCase()}</p><progress aria-label="Загрузка игры" max="1" value="0"></progress><small>ПОДГОТОВКА ЗАЛА</small></div>`;
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      ui.querySelector('progress')?.setAttribute('value', String(value));
    });
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      this.failed = true;
      ui.innerHTML = '<div class="loading-screen"><h1>Не удалось загрузить фон</h1><p>Проверь соединение с локальным сервером.</p><button class="button primary" id="retry-load">Повторить загрузку</button></div>';
      ui.querySelector('#retry-load')?.addEventListener('click', () => window.location.reload());
    });
    this.load.image('arena', arenaUrl);
  }

  create(): void {
    if (this.failed) return;
    document.body.dataset.motion = String(this.services.settings.current.animatedBackground);
    this.scene.start(SCENES.menu);
  }
}
