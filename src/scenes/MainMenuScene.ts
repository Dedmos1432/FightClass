import Phaser from 'phaser';
import { GAME, SCENES } from '../config/game';
import type { GameServices } from '../core/GameServices';
import { ScreenView } from '../ui/ScreenView';
import { icons } from '../ui/icons';
import { clubGuideRoom } from '../tutorial/ClubGuide';
import titleArt from '../../assets/menu/before-the-bell.webp?url';

export class MainMenuScene extends Phaser.Scene {
  constructor(private readonly services: GameServices) {
    super(SCENES.menu);
  }

  create(): void {
    const saved = this.services.saves.current;
    const savedDate = saved ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(saved.updatedAt)) : '';
    const continueText = saved ? `Последняя игра · ${savedDate}` : 'Нет сохранения';
    const view = new ScreenView(this.services, 'menu', `
      <section class="menu-layout" aria-labelledby="game-title">
        <div class="menu-art" aria-hidden="true">
          <img src="${titleArt}" alt="" width="1536" height="1024" fetchpriority="high" decoding="async" draggable="false" />
        </div>
        <div class="menu-main">
          <h1 id="game-title" aria-label="${GAME.title}"><span>FIGHT</span> <span>CLASS</span></h1>
          <nav class="menu-buttons" aria-label="Главное меню">
            <button class="menu-button" id="start-game" type="button" ${saved ? '' : 'data-primary'}>
              <span class="button-text">Новая игра</span><span class="button-arrow" aria-hidden="true">${icons.arrow}</span>
            </button>
            <button class="menu-button" id="continue-game" type="button" ${saved ? 'data-primary' : 'disabled'}>
              <span class="button-text">Продолжить<small>${continueText}</small></span><span class="button-arrow" aria-hidden="true">${icons.arrow}</span>
            </button>
            <button class="menu-button" id="settings" type="button">
              <span class="button-text">Настройки</span><span class="button-arrow" aria-hidden="true">${icons.arrow}</span>
            </button>
          </nav>
        </div>
      </section>`);
    const artwork = view.root.querySelector<HTMLImageElement>('.menu-art img')!;
    view.listen(artwork, 'error', () => { artwork.hidden = true; });
    const enter = (fresh: boolean): void => {
      if (fresh) this.services.saves.startNew();
      else this.services.saves.touch();
      this.services.audio.play('open');
      const saves=this.services.saves;
      this.scene.start(saves.needsTutorial ? SCENES.tutorial : saves.needsClubGuide ? SCENES[clubGuideRoom(saves.clubGuide.step)] : SCENES.lobby);
    };
    view.on('#start-game', 'click', () => {
      if (this.services.saves.current) view.confirmNewGame(() => enter(true));
      else enter(true);
    });
    view.on('#continue-game', 'click', () => { if (this.services.saves.current) enter(false); });
    view.on('#settings', 'click', () => view.showSettings());
    view.focus(saved ? '#continue-game' : '#start-game');
    if (this.services.saves.loadIssue && !saved) {
      view.toast(this.services.saves.loadIssue === 'unsupported'
        ? 'Сохранение создано другой версией игры. Можно начать новую игру.'
        : 'Сохранение повреждено. Можно начать новую игру.');
    } else view.warnIfTemporary();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.destroy());
  }
}
