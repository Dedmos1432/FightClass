import type { GameServices } from '../core/GameServices';
import type { RoomId } from '../assets/explorationAssets';
import { getStyle, isStyleId, STYLES } from '../config/styles';
import type { ExplorationPlayer } from '../characters/ExplorationPlayer';
import { MOVES, moveById } from '../combat/moves';
import { ScreenView } from './ScreenView';
import { icons } from './icons';

const ROOM_NAMES = { lobby: 'ЛОББИ', gym: 'ТРЕНАЖЁРНЫЙ ЗАЛ', dojo: 'ЗАЛ ЕДИНОБОРСТВ' } as const;

export class ExplorationView extends ScreenView {
  private readonly region: HTMLElement;
  private lastAction = '';
  private elapsed = 0;

  constructor(services: GameServices, room: RoomId, onInteract: () => void) {
    const style = getStyle(services.saves.lobbyState.style);
    const stats = services.saves.stats;
    const roomNote = room === 'gym' ? 'Подойди к скамье · E — начать подход.<br /><span id="gym-progress-note"></span>'
      : `В центре зала · E — ${services.saves.activeRun ? 'продолжить' : 'начать'} серию.<br />Рекорд: ${services.saves.endless.bestStreak} побед. HP между боями не восстанавливается.`;
    super(services, room, `
      <section class="world-hud" aria-label="Характеристики бойца">
        <div class="fighter-class"><b>01</b><span>КЛАСС<small>БОЕЦ КЛУБА</small></span></div>
        <div class="world-vitals">
          <div class="stat-meter hp-meter"><div><span>ЗДОРОВЬЕ</span><strong id="hp-value">${stats.currentHP}<i> / ${stats.maxHP}</i></strong></div><div class="meter-track" role="progressbar" aria-label="Здоровье" aria-valuenow="${stats.currentHP}" aria-valuemin="0" aria-valuemax="${stats.maxHP}"><span></span></div></div>
          <div class="stat-meter stamina-meter"><div><span>ВЫНОСЛИВОСТЬ</span><strong id="stamina-value">${stats.currentStamina}<i> / ${stats.stamina}</i></strong></div><div class="meter-track" role="progressbar" aria-label="Выносливость" aria-valuenow="${stats.currentStamina}" aria-valuemin="0" aria-valuemax="${stats.stamina}"><span></span></div></div>
        </div>
        <div class="damage-stat"><span>УРОН</span><strong id="damage-value">${stats.damage}</strong></div>
        <button class="style-picker" id="choose-style" aria-label="Выбрать боевой стиль"><span>ТЕХНИКА<strong id="current-style">${style.name}</strong></span>${icons.arrow}</button>
      </section>
      <section class="exploration-layer" aria-label="${ROOM_NAMES[room]}">
        <div id="world-focus" class="world-focus" tabindex="0" role="application" aria-label="${ROOM_NAMES[room]}. A и D или стрелки — движение, E — взаимодействие, Escape — ${room === 'lobby' ? 'главное меню' : 'вернуться в лобби'}."><span class="sr-only">${room === 'lobby' ? 'В лобби две двери: тренажёрный зал слева, зал единоборств справа. Между ними доска рейтинга.' : 'Для возвращения в лобби подойди к левому краю зала и нажми E.'}</span></div>
        <div class="location-heading"><span class="eyebrow">${room === 'lobby' ? 'МЕЖДУ БОЯМИ' : room === 'gym' ? 'СИЛОВАЯ ПОДГОТОВКА' : 'ТРЕНИРОВОЧНЫЕ БОИ'}</span><h1>${ROOM_NAMES[room]}</h1>${room === 'lobby' ? '' : `<span class="room-stage-note">${roomNote}</span>`}</div>
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
    this.refreshStats();
    this.warnIfTemporary();
  }

  focusWorld(): void { this.focus('#world-focus'); }

  refreshStats(): void {
    const stats = this.services.saves.stats;
    this.root.querySelector('#hp-value')!.innerHTML = `${stats.currentHP}<i> / ${stats.maxHP}</i>`;
    this.root.querySelector('#stamina-value')!.innerHTML = `${stats.currentStamina}<i> / ${stats.stamina}</i>`;
    this.root.querySelector('#damage-value')!.textContent = String(stats.damage);
    for (const [selector, current, maximum] of [['.hp-meter', stats.currentHP, stats.maxHP], ['.stamina-meter', stats.currentStamina, stats.stamina]] as const) {
      const track = this.root.querySelector(`${selector} .meter-track`)!;
      track.setAttribute('aria-valuenow', String(current)); track.setAttribute('aria-valuemax', String(maximum));
      (track.firstElementChild as HTMLElement).style.width = `${current / maximum * 100}%`;
    }
    const note = this.root.querySelector('#gym-progress-note');
    if (note) note.textContent = `Повторений всего: ${this.services.saves.training.totalReps} · Рекорд: ${this.services.saves.training.bestSession}`;
  }

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
      <div class="dialog-top"><span class="eyebrow">ЛИЧНОЕ ДЕЛО / ТЕХНИКА</span><button class="icon-button" data-close aria-label="Закрыть выбор стиля">${icons.close}</button></div>
      <div class="styles-heading"><h2 id="dialog-title">Боевой стиль</h2><span>05 <small>ВАРИАНТОВ</small></span></div>
      <p class="dialog-description">Стиль меняет анимации атак. Характеристики и боевые параметры остаются прежними.</p>
      <div class="style-workspace">
        <fieldset id="style-options" class="style-options"><legend class="sr-only">Боевой стиль</legend>${STYLES.map((style) => `<label class="style-option"><input type="radio" name="style" value="${style.id}" ${current === style.id ? 'checked' : ''} /><span class="style-choice"><span class="style-number">${style.number}</span><span class="style-choice-name"><strong>${style.name}</strong><small>${(style.id === 'freestyle' ? this.services.saves.freestyle.map(move => moveById(move).name) : style.moves).join(' · ')}</small></span><span class="style-check">${icons.check}</span></span></label>`).join('')}</fieldset>
        <div class="style-notes">
          <div class="style-rules"><span class="eyebrow">НА ПРАКТИКЕ</span><dl><div><dt>J / K / L</dt><dd>Три атакующих приёма</dd></div><div><dt>УРОН</dt><dd>Общая характеристика бойца</dd></div><div><dt>КОМБО</dt><dd>Следующая атака в конце восстановления</dd></div></dl></div>
          <section id="freestyle-editor" class="freestyle-editor" ${current === 'freestyle' ? '' : 'hidden'}>
            <h3>Свой набор</h3><p>Три приёма из двенадцати. Занятые приёмы меняются местами.</p>
            ${this.services.saves.freestyle.map((selected, slot) => `<label for="custom-slot-${slot}"><span><kbd>${['J','K','L'][slot]}</kbd> Слот ${slot + 1}</span><select id="custom-slot-${slot}" data-custom-slot="${slot}">${MOVES.map(move => `<option value="${move.id}" ${move.id === selected ? 'selected' : ''}>${move.name} · ${getStyle(move.style).name}</option>`).join('')}</select></label>`).join('')}
            <small>Урон, дальность, расход выносливости и время атаки не зависят от выбранной анимации.</small>
          </section>
        </div>
      </div>
      <p class="style-info">Любой из пяти стилей использует те же HP, выносливость, скорость и защиту.</p>
      <button class="button primary dialog-done" data-close>Готово ${icons.arrow}</button>
    `, 'styles-dialog');
    dialog?.querySelector('#style-options')?.addEventListener('change', (event) => {
      const value = (event.target as HTMLInputElement).value;
      if (!isStyleId(value)) return;
      this.services.saves.updateLobby({ style: value });
      this.root.querySelector<HTMLElement>('#freestyle-editor')!.hidden = value !== 'freestyle';
      this.root.querySelector('#current-style')!.textContent = getStyle(value).name;
      this.services.audio.play();
      this.warnIfTemporary();
    });
    dialog?.querySelector('#freestyle-editor')?.addEventListener('change', event => {
      const select = event.target as HTMLSelectElement;
      if (!select.matches('[data-custom-slot]')) return;
      const slot = Number(select.dataset.customSlot), moves = this.services.saves.freestyle;
      const chosen = MOVES.find(move => move.id === select.value);
      if (!chosen || slot < 0 || slot > 2) return;
      const other = moves.indexOf(chosen.id);
      if (other >= 0) moves[other] = moves[slot];
      moves[slot] = chosen.id;
      if (!this.services.saves.updateFreestyle(moves)) return;
      moves.forEach((move, index) => { dialog.querySelector<HTMLSelectElement>(`#custom-slot-${index}`)!.value = move; });
      const freeChoice = dialog.querySelector<HTMLInputElement>('input[value="freestyle"]')?.closest('label')?.querySelector('small');
      if (freeChoice) freeChoice.textContent = moves.map(move => moveById(move).name).join(' · ');
      this.services.audio.play();
    });
  }
}
