import type { GameServices } from '../core/GameServices';
import { GAME } from '../config/game';
import { icons } from './icons';

export class ScreenView {
  readonly root = document.querySelector<HTMLElement>('#ui')!;
  readonly events = new AbortController();
  private dialog: HTMLDialogElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private previousFocus: HTMLElement | null = null;

  get hasDialog(): boolean { return this.dialog !== null; }

  constructor(readonly services: GameServices, screen: string, content: string) {
    const world = screen === 'lobby' || screen === 'gym' || screen === 'dojo' || screen === 'fight';
    const locations: Record<string, string> = { lobby: 'ЛОББИ', gym: 'ТРЕНАЖЁРНЫЙ ЗАЛ', dojo: 'ЗАЛ ЕДИНОБОРСТВ', fight: 'БЕСКОНЕЧНАЯ СЕРИЯ' };
    const location = locations[screen];
    this.root.dataset.screen = screen;
    delete this.root.dataset.training;
    this.root.innerHTML = `
      <div class="screen ${world ? 'exploration-screen' : ''}">
        <header class="topbar">
          <a class="brand" href="#" aria-label="${GAME.title} — главное меню">
            <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
            <span>${GAME.title.toUpperCase()}</span>
          </a>
          <div class="top-actions">
            <button class="icon-button" id="mute-button" type="button" title="Звук интерфейса"></button>
            <button class="icon-button" id="fullscreen-button" type="button" aria-label="Полный экран" title="Полный экран · F">${icons.fullscreen}</button>
          </div>
        </header>
        ${content}
        <footer class="footer">
          <span class="build-label"><i></i> ЭТАП 04 <span class="footer-divider">/</span> ${location ?? 'ГЛАВНОЕ МЕНЮ'}</span>
          <span class="keyboard-hint">${world ? '<kbd>A</kbd><kbd>D</kbd> движение <kbd>E</kbd> действие' : '<kbd>Tab</kbd> выбор <kbd>Enter</kbd> подтвердить'}</span>
          <span class="version">ЛОКАЛЬНАЯ ВЕРСИЯ <b>${GAME.version}</b></span>
        </footer>
      </div>`;
    this.on('#mute-button', 'click', () => {
      services.settings.update({ muted: !services.settings.current.muted });
      services.audio.play();
      this.warnIfTemporary();
    });
    this.on('#fullscreen-button', 'click', () => { void this.toggleFullscreen(); });
    this.listen(document, 'keydown', (event: KeyboardEvent) => {
      if (event.code === 'KeyF' && !event.repeat && !this.dialog && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        void this.toggleFullscreen();
      }
    });
    this.listen(document, 'fullscreenchange', () => this.updateFullscreen());
    this.unsubscribe = services.settings.subscribe(() => this.updateSoundButton());
    this.updateSoundButton();
    this.updateFullscreen();
  }

  listen<K extends keyof DocumentEventMap>(target: EventTarget, type: K, callback: (event: DocumentEventMap[K]) => void): void {
    target.addEventListener(type, callback as EventListener, { signal: this.events.signal });
  }

  on(selector: string, type: 'click' | 'input' | 'change', callback: (event: Event) => void): void {
    this.root.querySelector(selector)?.addEventListener(type, callback, { signal: this.events.signal });
  }

  focus(selector: string): void {
    this.root.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }

  toast(message: string): void {
    const toast = document.querySelector<HTMLElement>('#toast')!;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(Number(toast.dataset.timer));
    toast.dataset.timer = String(window.setTimeout(() => toast.classList.remove('visible'), 5500));
  }

  warnIfTemporary(): void {
    if (!this.services.storage.isPersistent) {
      this.toast('Хранилище браузера недоступно. Прогресс и настройки сохранятся только до перезагрузки страницы.');
    }
  }

  showSettings(): void {
    if (this.dialog) return;
    const { volume, muted, animatedBackground } = this.services.settings.current;
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">ПАРАМЕТРЫ ИГРЫ</span><button class="icon-button" data-close aria-label="Закрыть настройки">${icons.close}</button></div>
      <h2 id="dialog-title">Настройки<span class="accent">.</span></h2>
      <p class="dialog-description">Твой ритм. Твои правила.</p>
      <div class="setting-row volume-row">
        <label for="volume">Громкость интерфейса<small>Короткие звуки нажатий</small></label>
        <output id="volume-value" for="volume">${Math.round(volume * 100)}%</output>
        <input id="volume" type="range" min="0" max="100" step="1" value="${Math.round(volume * 100)}" />
      </div>
      <label class="setting-row" for="sound-enabled"><span>Звук интерфейса<small>Отключить все звуки меню</small></span><input type="checkbox" role="switch" id="sound-enabled" ${muted ? '' : 'checked'} /><span class="switch-track" aria-hidden="true"></span></label>
      <label class="setting-row" for="motion-enabled"><span>Анимация фона<small>Частицы пыли в свете ламп</small></span><input type="checkbox" role="switch" id="motion-enabled" ${animatedBackground ? 'checked' : ''} /><span class="switch-track" aria-hidden="true"></span></label>
      <p class="settings-note">${icons.check} Изменения сохраняются автоматически</p>
      <button class="button primary dialog-done" data-close>Готово ${icons.arrow}</button>
    `);
    this.on('#volume', 'input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      this.root.querySelector('#volume-value')!.textContent = `${value}%`;
      this.services.settings.update({ volume: value / 100 });
      this.warnIfTemporary();
    });
    this.on('#volume', 'change', () => this.services.audio.play());
    this.on('#sound-enabled', 'change', (event) => {
      this.services.settings.update({ muted: !(event.target as HTMLInputElement).checked });
      this.services.audio.play();
      this.warnIfTemporary();
    });
    this.on('#motion-enabled', 'change', (event) => {
      this.services.settings.update({ animatedBackground: (event.target as HTMLInputElement).checked });
      this.warnIfTemporary();
    });
  }

  confirmNewGame(onConfirm: () => void): void {
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">НОВАЯ ИГРА</span><button class="icon-button" data-close aria-label="Закрыть">${icons.close}</button></div>
      <h2 id="dialog-title">Начать заново<span class="accent">?</span></h2>
      <p class="dialog-description">Текущее сохранение будет заменено. Настройки звука и фона останутся прежними.</p>
      <div class="confirm-actions"><button class="button secondary" data-close>Отмена</button><button class="button primary" id="confirm-new">Начать заново ${icons.arrow}</button></div>
    `);
    this.on('#confirm-new', 'click', () => { this.closeDialog(); onConfirm(); });
    this.focus('.confirm-actions [data-close]');
  }

  openDialog(content: string, modifier = ''): HTMLDialogElement | null {
    if (this.dialog) return null;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.createElement('dialog');
    dialog.className = `dialog ${modifier}`;
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.innerHTML = content;
    this.root.append(dialog);
    this.dialog = dialog;
    dialog.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => { this.services.audio.play(); this.closeDialog(); });
    });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); this.closeDialog(); });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.closeDialog();
    });
    this.services.audio.play('open');
    dialog.showModal();
    return dialog;
  }

  closeDialog(): void {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.previousFocus?.focus({ preventScroll: true });
  }

  private updateSoundButton(): void {
    const muted = this.services.settings.current.muted;
    const button = this.root.querySelector<HTMLButtonElement>('#mute-button')!;
    button.innerHTML = muted ? icons.muted : icons.sound;
    button.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    button.setAttribute('aria-pressed', String(muted));
    const soundToggle = this.root.querySelector<HTMLInputElement>('#sound-enabled');
    if (soundToggle) soundToggle.checked = !muted;
  }

  private updateFullscreen(): void {
    const button = this.root.querySelector<HTMLButtonElement>('#fullscreen-button')!;
    button.disabled = !document.fullscreenEnabled;
    button.setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полного экрана' : 'Полный экран');
    button.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  }

  private async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenEnabled) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.toast('Браузер не разрешил полноэкранный режим. Попробуй кнопку полного экрана в меню браузера.');
    }
  }

  destroy(): void {
    this.closeDialog();
    this.events.abort();
    this.unsubscribe?.();
    const toast = document.querySelector<HTMLElement>('#toast');
    if (toast) {
      window.clearTimeout(Number(toast.dataset.timer));
      toast.classList.remove('visible');
      toast.textContent = '';
    }
    this.root.replaceChildren();
  }
}
