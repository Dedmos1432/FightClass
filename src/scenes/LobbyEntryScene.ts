import Phaser from 'phaser';
import { SCENES } from '../config/game';
import type { GameServices } from '../core/GameServices';
import { ScreenView } from '../ui/ScreenView';
import { icons } from '../ui/icons';
import { ArenaBackdrop } from './ArenaBackdrop';

/** Stage 1 transition target. The playable lobby belongs to stage 2. */
export class LobbyEntryScene extends Phaser.Scene {
  constructor(private readonly services: GameServices) {
    super(SCENES.lobby);
  }

  create(): void {
    if (!this.services.saves.current) {
      this.scene.start(SCENES.menu);
      return;
    }
    new ArenaBackdrop(this, this.services);
    const view = new ScreenView(this.services, 'lobby', `
      <section class="lobby-entry" aria-labelledby="lobby-title">
        <div class="eyebrow intro-tag"><span></span> ТВОЙ ПУТЬ НАЧАЛСЯ</div>
        <div class="entry-number" aria-hidden="true">01</div>
        <h1 id="lobby-title">ДОБРО ПОЖАЛОВАТЬ<br /><span class="accent">В КЛУБ.</span></h1>
        <p class="entry-subtitle">КЛАСС 01 <span>·</span> НАЧАЛО КАРЬЕРЫ</p>
        <div class="entry-note"><span class="note-line"></span><p>Это вход в лобби.<br /><span>Перемещение, две двери и доска соперников<br class="desktop-break" /> появятся на этапе 2 после его согласования.</span></p></div>
        <div class="entry-save">${icons.check}<span id="save-status">Игра сохранена на этом устройстве</span></div>
        <div class="entry-actions"><button class="button primary" id="back-menu">${icons.back} В главное меню</button><button class="button secondary" id="lobby-settings">${icons.settings} Настройки</button></div>
        <p class="entry-keyboard"><kbd>Esc</kbd> вернуться в меню</p>
      </section>`);
    const back = (): void => {
      this.services.saves.touch();
      this.services.audio.play();
      this.scene.start(SCENES.menu);
    };
    view.on('#back-menu', 'click', back);
    view.on('.brand', 'click', (event) => { event.preventDefault(); back(); });
    view.on('#lobby-settings', 'click', () => view.showSettings());
    view.listen(document, 'keydown', (event) => {
      if (event.code === 'Escape' && !document.querySelector('dialog[open]') && !event.repeat) back();
    });
    if (!this.services.storage.isPersistent) {
      view.root.querySelector('#save-status')!.textContent = 'Игра сохранена только до перезагрузки страницы';
      view.warnIfTemporary();
    }
    view.focus('#back-menu');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.destroy());
  }
}
