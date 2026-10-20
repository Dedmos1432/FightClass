import Phaser from 'phaser';
import { GAME, SCENES } from '../config/game';
import type { GameServices } from '../core/GameServices';
import { ScreenView } from '../ui/ScreenView';
import { icons } from '../ui/icons';
import { ArenaBackdrop } from './ArenaBackdrop';

export class MainMenuScene extends Phaser.Scene {
  constructor(private readonly services: GameServices) {
    super(SCENES.menu);
  }

  create(): void {
    new ArenaBackdrop(this, this.services);
    const saved = this.services.saves.current;
    const savedDate = saved ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(saved.updatedAt)) : '';
    const continueText = saved ? `Класс 01 · Лобби · ${savedDate}` : 'Сохранений пока нет';
    const view = new ScreenView(this.services, 'menu', `
      <section class="menu-layout" aria-labelledby="game-title">
        <div class="menu-main">
          <div class="eyebrow intro-tag"><span></span> ДОКАЖИ, ЧЕГО ТЫ СТОИШЬ</div>
          <h1 id="game-title" aria-label="${GAME.title}">FIGHT<br /><span>CLASS</span><b class="title-dot">.</b></h1>
          <p class="hero-description">Каждый начинает с первого класса.<br />Вершины достигают те, кто не сдаётся.</p>
          <nav class="menu-buttons" aria-label="Главное меню">
            <button class="menu-button primary" id="start-game"><span class="button-number">01</span>${icons.play}<span class="button-text">Начать игру<small>Твоя история начинается здесь</small></span><span class="button-arrow">${icons.arrow}</span></button>
            <button class="menu-button secondary" id="continue-game" ${saved ? '' : 'disabled'}><span class="button-number">02</span>${icons.continue}<span class="button-text">Продолжить<small>${continueText}</small></span><span class="button-arrow">${icons.arrow}</span></button>
            <button class="menu-button secondary" id="settings"><span class="button-number">03</span>${icons.settings}<span class="button-text">Настройки<small>Звук и атмосфера</small></span><span class="button-arrow">${icons.arrow}</span></button>
          </nav>
          <div class="save-note"><span class="save-icon" aria-hidden="true">▣</span> АВТОМАТИЧЕСКОЕ ЛОКАЛЬНОЕ СОХРАНЕНИЕ</div>
        </div>
        <aside class="chapter" aria-label="Путь бойца: от первого до третьего класса">
          <div class="chapter-top"><span class="eyebrow">ТВОЙ ПЕРВЫЙ ШАГ</span><span class="tiny-cross" aria-hidden="true">+</span></div>
          <div class="chapter-number">01<span>/ 03</span></div>
          <h2>ПЕРВЫЙ КЛАСС</h2>
          <p>У каждого бойца есть начало.<br />У тебя — целый путь впереди.</p>
          <div class="class-path" aria-hidden="true"><b>I</b><span></span><i>II</i><span></span><i>III</i></div>
          <div class="chapter-bottom"><span>ХАРАКТЕР РЕШАЕТ</span><span>01 — 03</span></div>
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
