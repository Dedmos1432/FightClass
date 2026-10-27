import Phaser from 'phaser';
import { GAME, SCENES } from '../config/game';
import type { GameServices } from '../core/GameServices';
import { ScreenView } from '../ui/ScreenView';
import { icons } from '../ui/icons';
import { ArenaBackdrop } from './ArenaBackdrop';
import fighterUrl from '../../resourse/player/ilde_fight/combat_idle_left/idle_01.png?url';

export class MainMenuScene extends Phaser.Scene {
  constructor(private readonly services: GameServices) {
    super(SCENES.menu);
  }

  create(): void {
    new ArenaBackdrop(this, this.services);
    const saved = this.services.saves.current;
    const savedDate = saved ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(saved.updatedAt)) : '';
    const continueText = saved ? `Последний вход: ${savedDate}` : 'Сохранений пока нет';
    const stats = this.services.saves.stats;
    const endless = this.services.saves.endless;
    const run = this.services.saves.activeRun;
    const view = new ScreenView(this.services, 'menu', `
      <section class="menu-layout" aria-labelledby="game-title">
        <div class="menu-main">
          <div class="eyebrow intro-tag"><span></span> ПОДПОЛЬНЫЙ БОЙЦОВСКИЙ КЛУБ</div>
          <h1 id="game-title" aria-label="${GAME.title}">FIGHT<br /><span>CLASS</span></h1>
          <p class="hero-description">Бокс / ММА / Тхэквондо / Муай-тай</p>
          <nav class="menu-buttons" aria-label="Главное меню">
            <button class="menu-button ${saved ? '' : 'menu-current'}" id="start-game"><span class="button-number">01</span><span class="button-text">Начать игру</span><span class="button-arrow">${icons.arrow}</span></button>
            <button class="menu-button ${saved ? 'menu-current' : ''}" id="continue-game" ${saved ? '' : 'disabled'}><span class="button-number">02</span><span class="button-text">Продолжить<small>${continueText}</small></span><span class="button-arrow">${icons.arrow}</span></button>
            <button class="menu-button" id="settings"><span class="button-number">03</span><span class="button-text">Настройки</span><span class="button-arrow">${icons.arrow}</span></button>
          </nav>
          <div class="save-note">ПРОГРЕСС СОХРАНЯЕТСЯ В ЭТОМ БРАУЗЕРЕ</div>
        </div>
        <aside class="menu-art" aria-label="Личное дело бойца">
          <div class="poster-plane" aria-hidden="true"><span class="poster-heading">FIGHT CLASS<br />БОЙЦОВСКИЙ КЛУБ</span><span class="poster-numeral">I</span><span class="poster-serial">ТРЕНИРОВКА / ПОЕДИНОК / ПОВТОРИТЬ</span></div>
          <img class="menu-fighter" src="${fighterUrl}" alt="" width="448" height="640" draggable="false" />
          <div class="menu-record">
            <div class="record-heading"><span>ЛИЧНОЕ ДЕЛО</span><b>КЛАСС I</b></div>
            <div class="record-stats"><span>ЗДОРОВЬЕ<strong>${stats.maxHP}</strong></span><span>ВЫНОСЛИВОСТЬ<strong>${stats.stamina}</strong></span><span>УРОН<strong>${stats.damage}</strong></span></div>
            <p>${run ? `Серия продолжается · побед: ${run.wins}` : saved ? `Личный рекорд · ${endless.bestStreak} побед в серии` : 'Новый боец. Запись на первый поединок.'}</p>
          </div>
        </aside>
      </section>`);
    const enter = (fresh: boolean): void => {
      if (fresh) this.services.saves.startNew();
      else this.services.saves.touch();
      this.services.audio.play('open');
      this.scene.start(SCENES.lobby);
    };
    view.on('#start-game', 'click', () => {
      if (this.services.saves.current) view.confirmNewGame(() => enter(true));
      else enter(true);
    });
    view.on('#continue-game', 'click', () => { if (this.services.saves.current) enter(false); });
    view.on('#settings', 'click', () => view.showSettings());
    view.on('.brand', 'click', (event) => { event.preventDefault(); view.focus('#start-game'); });
    view.focus(saved ? '#continue-game' : '#start-game');
    if (this.services.saves.loadIssue && !saved) {
      view.toast(this.services.saves.loadIssue === 'unsupported'
        ? 'Сохранение создано другой версией игры. Можно начать новую игру.'
        : 'Сохранение повреждено. Можно начать новую игру.');
    } else view.warnIfTemporary();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.destroy());
  }
}
