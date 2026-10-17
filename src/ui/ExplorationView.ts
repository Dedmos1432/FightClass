import type { GameServices } from '../core/GameServices';
import type { RoomId } from '../assets/explorationAssets';
import { BASE_STATS, getStyle, isStyleId, STYLES } from '../config/styles';
import type { ExplorationPlayer } from '../characters/ExplorationPlayer';
import { ScreenView } from './ScreenView';
import { icons } from './icons';

const ROOM_NAMES = { lobby: 'ЛОББИ КЛУБА', gym: 'ТРЕНАЖЁРНЫЙ ЗАЛ', dojo: 'ЗАЛ ЕДИНОБОРСТВ' } as const;

export class ExplorationView extends ScreenView {
  private readonly region: HTMLElement;
  private lastAction = '';
  private elapsed = 0;

  constructor(services: GameServices, room: RoomId, onInteract: () => void) {
    const style = getStyle(services.saves.lobbyState.style);
    super(services, room, `
      <section class="world-hud" aria-label="Характеристики бойца">
        <div class="fighter-class"><b>01</b><span>ТВОЙ КЛАСС<small>НАЧИНАЮЩИЙ</small></span></div>
        <div class="stat-meter hp-meter"><div><span>ЗДОРОВЬЕ</span><strong>${BASE_STATS.currentHP}<i> / ${BASE_STATS.maxHP}</i></strong></div><div class="meter-track" role="progressbar" aria-label="Здоровье" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100"><span></span></div></div>
        <div class="stat-meter stamina-meter"><div><span>ВЫНОСЛИВОСТЬ</span><strong>${BASE_STATS.stamina}<i> / ${BASE_STATS.stamina}</i></strong></div><div class="meter-track" role="progressbar" aria-label="Выносливость" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100"><span></span></div></div>
        <div class="damage-stat"><span>УРОН</span><strong id="damage-value">${BASE_STATS.damage}</strong></div>
        <button class="style-picker" id="choose-style" aria-label="Выбрать боевой стиль"><span>БОЕВОЙ СТИЛЬ<strong id="current-style">${style.name}</strong></span>${icons.settings}</button>
      </section>
      <section class="exploration-layer" aria-label="${ROOM_NAMES[room]}">
        <div id="world-focus" class="world-focus" tabindex="0" role="application" aria-label="${ROOM_NAMES[room]}. A и D или стрелки — движение, E — взаимодействие, Escape — ${room === 'lobby' ? 'главное меню' : 'вернуться в лобби'}."><span class="sr-only">${room === 'lobby' ? 'В лобби две двери: тренажёрный зал слева, зал единоборств справа. Между ними доска рейтинга.' : 'Для возвращения в лобби подойди к левому краю зала и нажми E.'}</span></div>
        <div class="location-heading"><span class="eyebrow">${room === 'lobby' ? 'МЕЖДУ ПОЕДИНКАМИ' : 'ТЕРРИТОРИЯ ПОДГОТОВКИ'}</span><h1>${ROOM_NAMES[room]}</h1><p>${room === 'lobby' ? 'Выбери, каким будет твой следующий шаг.' : room === 'gym' ? 'Здесь начинается работа над собой.' : 'Место, где оттачивают характер.'}</p>${room === 'lobby' ? '' : `<span class="room-stage-note">${room === 'gym' ? 'Тренировки со штангой пока недоступны.' : 'Тренировочные поединки пока недоступны.'}</span>`}</div>
        <div class="interaction-area" aria-live="polite"><button id="interact-object" class="interaction-button" hidden><kbd>E</kbd><span id="interaction-label"></span>${icons.arrow}</button><p id="interaction-hint">${room === 'lobby' ? 'Подойди к двери или доске' : 'Выход в лобби — слева'}</p></div>
        <div class="world-actions"><span class="world-save">${icons.check}<span id="save-status">${services.storage.isPersistent ? 'Сохранено на этом устройстве' : 'Сохранено только до перезагрузки'}</span></span><div><button class="button secondary small-button" id="lobby-settings">${icons.settings}<span>Настройки</span></button><button class="button secondary small-button" id="back-menu">${icons.back}<span>Меню</span></button></div></div>
      </section>
    `);
    this.region = this.root.querySelector<HTMLElement>('#world-focus')!;
    this.region.addEventListener('pointerdown', () => this.focusWorld(), { signal: this.events.signal });
    this.on('#interact-object', 'click', onInteract);
    this.on('#lobby-settings', 'click', () => this.showSettings());
    this.on('#choose-style', 'click', () => this.showStyles());
    this.focusWorld();
    this.warnIfTemporary();
  }

  focusWorld(): void { this.focus('#world-focus'); }

  setInteraction(action: string | null): void {
    if ((action ?? '') === this.lastAction) return;
    this.lastAction = action ?? '';
    const button = this.root.querySelector<HTMLButtonElement>('#interact-object')!;
    button.hidden = action === null;
    this.root.querySelector('#interaction-label')!.textContent = action ?? '';
    this.root.querySelector<HTMLElement>('#interaction-hint')!.hidden = action !== null;
  }

  syncPlayer(player: ExplorationPlayer, delta: number): void {
    this.elapsed += delta;
    if (this.elapsed < 80) return;
    this.elapsed = 0;
    this.region.dataset.playerX = player.x.toFixed(2);
    this.region.dataset.facing = player.direction;
    this.region.dataset.animation = player.animationKey;
    this.region.dataset.footY = String(player.sprite.y);
  }

  private showStyles(): void {
    const current = this.services.saves.lobbyState.style;
    const dialog = this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">ТВОЯ ТЕХНИКА</span><button class="icon-button" data-close aria-label="Закрыть выбор стиля">${icons.close}</button></div>
      <h2 id="dialog-title">Боевой стиль<span class="accent">.</span></h2>
      <p class="dialog-description">Выбери манеру боя. Стиль меняет только внешний вид атак: урон, здоровье, выносливость и скорость остаются одинаковыми.</p>
      <fieldset id="style-options" class="style-options"><legend class="sr-only">Боевой стиль</legend>${STYLES.map((style) => `<label class="style-option"><input type="radio" name="style" value="${style.id}" ${current === style.id ? 'checked' : ''} /><span class="style-choice"><span class="style-number">${style.number}</span><span><strong>${style.name}</strong><small>${style.moves.join(' · ')}</small></span><span class="style-check">${icons.check}</span></span></label>`).join('')}</fieldset>
      <p class="style-info">Свободный стиль сейчас использует Jab, Cross и Hook. Конструктор трёх приёмов будет доступен вместе с боями.</p>
      <button class="button primary dialog-done" data-close>Готово ${icons.arrow}</button>
    `, 'styles-dialog');
    dialog?.querySelector('#style-options')?.addEventListener('change', (event) => {
      const value = (event.target as HTMLInputElement).value;
      if (!isStyleId(value)) return;
      this.services.saves.updateLobby({ style: value });
      this.root.querySelector('#current-style')!.textContent = getStyle(value).name;
      this.services.audio.play();
      this.warnIfTemporary();
    });
  }
}
