import type { CharacterStats } from '../training/Progression';
import { repsToNextGain } from '../training/Progression';
import type { ExplorationView } from './ExplorationView';
import { icons } from './icons';

export type BenchPhase = 'idle' | 'approaching' | 'preparing' | 'cancel-preparing' | 'unracking' | 'pressing' | 'lowering' | 'racking' | 'getting-up';

const PHASE_LABELS: Record<BenchPhase, string> = {
  idle: '', approaching: 'Подходим к скамье', preparing: 'Принимаем положение', unracking: 'Снимаем штангу',
  pressing: 'Нажимай E несколько раз', lowering: 'Повторение выполнено — опускаем', racking: 'Возвращаем штангу', 'getting-up': 'Завершаем подход', 'cancel-preparing': 'Возвращаемся в исходное положение',
};

export class BenchTrainingView {
  private readonly panel: HTMLElement;
  private before: Readonly<CharacterStats>;

  constructor(private readonly view: ExplorationView, tap: () => void, stop: () => void) {
    this.before = view.services.saves.stats;
    this.panel = document.createElement('section');
    this.panel.id = 'bench-workout';
    this.panel.className = 'bench-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Жим лёжа');
    this.panel.innerHTML = `
      <div class="bench-panel-top"><span class="eyebrow">ЖИМ ЛЁЖА</span><button class="bench-help" id="bench-help" aria-label="Обучение жиму">?</button></div>
      <div class="bench-rep-line"><strong id="bench-reps">00</strong><span>ПОВТОРЕНИЙ ЗА ПОДХОД<small id="bench-gains">+0 HP · +0 выносливости</small></span></div>
      <p id="bench-status" role="status"></p>
      <div class="bench-progress-label"><span>ТЕКУЩИЙ ЖИМ</span><output id="bench-percent">0%</output></div>
      <div class="bench-progress" role="progressbar" aria-label="Прогресс жима" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="bench-progress-fill"></span></div>
      <p id="bench-next-gain"></p>
      <div class="bench-panel-actions"><button class="button primary" id="bench-tap"><kbd>E</kbd> Жать</button><button class="button secondary" id="bench-stop">Завершить <kbd>Esc</kbd></button></div>
      <p class="bench-footnote">Нажимай повторно. Удержание E не засчитывается.</p>`;
    view.root.querySelector('.exploration-layer')!.append(this.panel);
    this.panel.querySelector('#bench-tap')!.addEventListener('click', tap);
    this.panel.querySelector('#bench-tap')!.addEventListener('keydown', (event) => { if ((event as KeyboardEvent).repeat) event.preventDefault(); });
    this.panel.querySelector('#bench-stop')!.addEventListener('click', stop);
    this.panel.querySelector('#bench-help')!.addEventListener('click', () => this.showTutorial());
  }

  showTutorial(start?: () => void): void {
    const dialog = this.view.openDialog(`
      <div class="dialog-top"><span class="eyebrow">${start ? 'ПЕРВОЕ ЗНАКОМСТВО СО СКАМЬЁЙ' : 'ТЕХНИКА ЖИМА'}</span><button class="icon-button" data-close aria-label="Закрыть обучение">${icons.close}</button></div>
      <h2 id="dialog-title">Сильнее с каждым<br />повторением<span class="accent">.</span></h2>
      <ol class="bench-lesson">
        <li><b>01</b><span><strong>Займи положение</strong><small>Подойди к скамье и нажми E. Боец ляжет и возьмётся за штангу.</small></span></li>
        <li><b>02</b><span><strong>Нажимай E повторно</strong><small>Каждое нажатие поднимает штангу. Держи ритм: без нажатий прогресс снижается. Удерживать клавишу бесполезно.</small></span></li>
        <li><b>03</b><span><strong>Заверши, когда захочешь</strong><small>Escape или «Завершить» — вернуть штангу и встать. Засчитываются только полные подъёмы.</small></span></li>
      </ol>
      <p class="bench-lesson-note">Повторения навсегда повышают максимальные HP и выносливость. Чем больше уже натренировано, тем больше повторений нужно для следующего прироста. Завершённые повторения сохраняются сразу.</p>
      <button class="button primary dialog-done" id="bench-tutorial-start">${start ? 'Начать подход' : 'Понятно'} ${icons.arrow}</button>
    `, 'bench-tutorial');
    dialog?.querySelector('#bench-tutorial-start')?.addEventListener('click', () => {
      this.view.closeDialog();
      this.view.services.audio.play();
      start?.();
    });
  }

  begin(): void {
    this.before = this.view.services.saves.stats;
    this.panel.hidden = false;
    this.view.root.dataset.training = 'active';
    this.view.focusWorld();
  }

  update(phase: BenchPhase, progress: number, reps: number, paused: boolean): void {
    this.panel.dataset.phase = phase;
    this.panel.dataset.paused = String(paused);
    this.panel.querySelector('#bench-reps')!.textContent = String(reps).padStart(2, '0');
    this.panel.querySelector('#bench-status')!.textContent = paused ? 'Пауза — вернись в игру или закрой окно' : PHASE_LABELS[phase];
    const percent = Math.round(progress * 100);
    this.panel.querySelector('#bench-percent')!.textContent = `${percent}%`;
    (this.panel.querySelector('#bench-progress-fill') as HTMLElement).style.width = `${percent}%`;
    this.panel.querySelector('.bench-progress')!.setAttribute('aria-valuenow', String(percent));
    const stats = this.view.services.saves.stats;
    const total = this.view.services.saves.training.totalReps;
    this.panel.querySelector('#bench-gains')!.textContent = `+${stats.maxHP - this.before.maxHP} HP · +${stats.stamina - this.before.stamina} выносливости`;
    this.panel.querySelector('#bench-next-gain')!.textContent = `До прироста HP: ещё ${repsToNextGain(total, 'hp')} повт. · Выносливости: ${repsToNextGain(total, 'stamina')}`;
    this.panel.querySelector<HTMLButtonElement>('#bench-tap')!.disabled = phase !== 'pressing' || paused;
    this.panel.querySelector<HTMLButtonElement>('#bench-stop')!.disabled = phase === 'racking' || phase === 'getting-up' || phase === 'cancel-preparing';
  }

  end(reps: number, showResult: boolean): void {
    this.panel.hidden = true;
    delete this.view.root.dataset.training;
    if (!showResult) return;
    const stats = this.view.services.saves.stats;
    this.view.openDialog(`
      <div class="dialog-top"><span class="eyebrow">РАБОТА НАД СОБОЙ</span><button class="icon-button" data-close aria-label="Закрыть результат">${icons.close}</button></div>
      <h2 id="dialog-title">Подход завершён<span class="accent">.</span></h2>
      <div class="bench-result-count"><strong>${reps}</strong><span>ПОВТОРЕНИЙ</span></div>
      <div class="bench-result-stats"><div><span>МАКСИМУМ HP</span><strong>${stats.maxHP}<i>+${stats.maxHP - this.before.maxHP}</i></strong></div><div><span>ВЫНОСЛИВОСТЬ</span><strong>${stats.stamina}<i>+${stats.stamina - this.before.stamina}</i></strong></div></div>
      <p class="dialog-description">${reps ? 'Завершённые повторения и улучшения сохранены. Каждое следующее повторение приближает новый прирост.' : 'Ни одного полного повторения. Можно попробовать снова — прогресс не потерян.'}</p>
      <button class="button primary dialog-done" data-close>Вернуться к тренировкам ${icons.arrow}</button>
    `);
  }

  destroy(): void { this.panel.remove(); delete this.view.root.dataset.training; }
}
