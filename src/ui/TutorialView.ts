import type { GameServices } from '../core/GameServices';
import { canLinkAttack } from '../combat/CombatWorld';
import type { CombatTutorial } from '../tutorial/CombatTutorial';
import type { TutorialCue } from '../tutorial/TutorialCoach';
import type { PracticeStep } from '../tutorial/Progress';
import { ScreenView } from './ScreenView';
import { icons } from './icons';

export class TutorialView extends ScreenView {
  private readonly arena: HTMLElement;
  private readonly card: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly checks: HTMLElement;
  private readonly shade: HTMLElement;
  private readonly completion: HTMLElement;
  private readonly touchButtons: NodeListOf<HTMLButtonElement>;
  private readonly touch: boolean;
  private cueId: string | null = null;

  constructor(services: GameServices) {
    super(services, 'tutorial', `
      <section class="tutorial-hud" aria-label="Учебный боец">
        <div class="tutorial-vital"><span>Здоровье <b id="tutorial-hp-text">100 / 100</b></span><div id="tutorial-hp" role="progressbar" aria-label="Здоровье" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>
        <div class="tutorial-vital tutorial-energy"><span>Выносливость <b id="tutorial-stamina-text">100 / 100</b></span><div id="tutorial-stamina" role="progressbar" aria-label="Выносливость" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>
      </section>
      <section class="tutorial-main">
        <div id="tutorial-focus" tabindex="0" role="application" aria-label="Учебный спарринг"></div>
        <div class="tutorial-shade" aria-hidden="true"></div>
        <section id="tutorial-card" class="tutorial-lesson" aria-labelledby="tutorial-title" hidden>
          <div id="tutorial-prompt" role="status" aria-atomic="true">
            <div class="tutorial-keycaps"></div>
            <div class="tutorial-copy">
              <h1 id="tutorial-title"></h1>
              <p id="tutorial-description"></p>
            </div>
          </div>
          <div id="tutorial-club" hidden>
            <h1 id="tutorial-club-title">Базовые приёмы освоены</h1>
            <p>Дальше — короткая экскурсия по клубу.</p>
            <button id="tutorial-finish" class="button primary">Войти в лобби ${icons.arrow}</button>
          </div>
          <div id="tutorial-checks" aria-hidden="true"></div>
        </section>
        <div class="tutorial-actions">
          <button id="tutorial-skip" class="button secondary small-button">Пропустить <span class="sr-only">обучение</span></button>
          <button id="tutorial-pause" class="button secondary small-button">Пауза <kbd>Esc</kbd></button>
        </div>
      </section>
    `);
    this.arena = this.root.querySelector('#tutorial-focus')!;
    this.card = this.root.querySelector('#tutorial-card')!;
    this.prompt = this.root.querySelector('#tutorial-prompt')!;
    this.title = this.root.querySelector('#tutorial-title')!;
    this.detail = this.root.querySelector('#tutorial-description')!;
    this.keys = this.root.querySelector('.tutorial-keycaps')!;
    this.checks = this.root.querySelector('#tutorial-checks')!;
    this.shade = this.root.querySelector('.tutorial-shade')!;
    this.completion = this.root.querySelector('#tutorial-club')!;
    this.touchButtons = this.root.querySelectorAll<HTMLButtonElement>('.touch-controls [data-touch]');
    this.touch = this.root.dataset.touch === 'true';
    this.keys.hidden = this.touch;

    this.on('#tutorial-focus', 'click', () => this.focusArena());
    this.warnIfTemporary();
  }

  focusArena(): void {
    this.focus('#tutorial-focus');
  }

  showLesson(step: PracticeStep): void {
    this.arena.dataset.step = step;
    this.checks.replaceChildren();
    if (step === 'club') {
      this.renderCue(null, true);
      this.focus('#tutorial-finish');
    } else {
      this.renderCue(null, false);
      this.focusArena();
    }
  }

  private renderCue(cue: TutorialCue | null, complete: boolean): void {
    const id = cue?.id ?? (complete ? 'finish' : null);
    if (id === this.cueId) return;
    this.cueId = id;
    this.card.hidden = id === null;
    this.prompt.hidden = complete;
    this.completion.hidden = !complete;
    this.card.setAttribute('aria-labelledby', complete ? 'tutorial-club-title' : 'tutorial-title');
    if (id === null) delete this.card.dataset.cue;
    else this.card.dataset.cue = id;
    this.card.toggleAttribute('data-complete', complete);

    if (cue) {
      this.title.textContent = cue.title;
      this.detail.textContent = cue.detail;
      if (!this.touch) {
        this.keys.replaceChildren(...cue.keys.map(key => {
          const separator = key === '+' || key === '/' || key === 'или' || (key === '→' && cue.currentKey !== undefined);
          const cap = document.createElement(separator ? 'span' : 'kbd');
          cap.textContent = key;
          if (key === cue.currentKey) cap.setAttribute('data-current', '');
          return cap;
        }));
        this.keys.hidden = cue.keys.length === 0;
      }
    }
    this.touchButtons.forEach(button => {
      button.toggleAttribute('data-tutorial-highlight', this.touch && Boolean(cue?.touch.includes(button.dataset.touch!)));
    });
  }

  update(trainer: CombatTutorial, cue: TutorialCue | null, timeScale: number): void {
    const { player, enemy } = trainer.world;
    const complete = trainer.step === 'club';
    this.renderCue(cue, complete);
    const opacity = complete ? .44 : cue?.frozen ? .2 + .25 * (1 - timeScale) : 0;
    this.shade.style.opacity = opacity.toFixed(3);

    for (const [key, value] of [['hp', player.hp], ['stamina', player.stamina]] as const) {
      const points = Math.ceil(value);
      this.root.querySelector(`#tutorial-${key}-text`)!.textContent = `${points} / 100`;
      const meter = this.root.querySelector<HTMLElement>(`#tutorial-${key}`)!;
      meter.setAttribute('aria-valuenow', String(points));
      (meter.firstElementChild as HTMLElement).style.width = `${value}%`;
      meter.dataset.low = String(value <= 40);
    }

    const checks = trainer.checks;
    if (this.checks.childElementCount !== checks.length) {
      this.checks.replaceChildren(...checks.map((_, index) => {
        const mark = document.createElement('i');
        mark.dataset.check = String(index);
        return mark;
      }));
    }
    checks.forEach((done, index) => {
      (this.checks.children[index] as HTMLElement).dataset.done = String(done);
    });

    Object.assign(this.arena.dataset, {
      step: trainer.step,
      playerX: player.x.toFixed(1),
      playerAction: player.action,
      enemyAction: enemy.action,
      enemyMs: String(enemy.elapsed),
      actionMs: String(player.elapsed),
      slot: String(player.slot),
      combo: String(player.combo),
      stamina: String(Math.floor(player.stamina)),
      ready: String(trainer.ready),
      dodgeCue: String(trainer.dodgeCue),
      comboCue: String(canLinkAttack(player)),
      paused: String(this.hasDialog),
      timeScale: String(timeScale),
    });
  }

  showPause(onMenu: () => void): void {
    this.openDialog(`<div class="dialog-top"><span class="eyebrow">ПЕРВАЯ ТРЕНИРОВКА</span><button class="icon-button" data-close aria-label="Продолжить обучение">${icons.close}</button></div>
      <h2 id="dialog-title">Пауза</h2><p class="dialog-description">После перезапуска «Продолжить» вернёт тебя к текущему приёму.</p>
      <button class="button primary dialog-done" data-close>Продолжить обучение</button><button class="button secondary dialog-done" id="tutorial-menu">Сохранить и выйти в меню</button>`, 'tutorial-pause');
    this.on('#tutorial-menu', 'click', onMenu);
  }
}
