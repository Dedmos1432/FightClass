import { OPPONENT_PREVIEW, type OpponentPreview } from '../config/rankingPreview';
import { getStyle } from '../config/styles';
import type { ScreenView } from './ScreenView';
import { icons } from './icons';

export function showRanking(view: ScreenView): void {
  let selectedClass = 1;
  let selected: OpponentPreview = OPPONENT_PREVIEW[0];
  const dialog = view.openDialog(`
    <div class="dialog-top"><span class="eyebrow">ДОСКА СОПЕРНИКОВ / КАРЬЕРА</span><button class="icon-button" data-close aria-label="Закрыть рейтинг">${icons.close}</button></div>
    <div class="ranking-heading"><h2 id="dialog-title">Путь к вершине<span class="accent">.</span></h2><span class="rank-class-badge">ТВОЙ КЛАСС <b>01</b></span></div>
    <p class="dialog-description">Три класса. Девять имён. Начни с первого.</p>
    <div class="ranking-tabs" role="group" aria-label="Класс соперников">${[1, 2, 3].map((tier) => `<button class="ranking-tab" data-tier="${tier}" aria-pressed="${tier === 1}">КЛАСС 0${tier}<span>${tier === 1 ? 'Текущий' : 'Заблокирован'}</span></button>`).join('')}</div>
    <div class="ranking-layout"><div id="opponent-list" class="opponent-list" role="group" aria-label="Соперники"></div><article id="opponent-profile" class="opponent-profile" aria-live="polite"></article></div>
    <div class="ranking-progress"><span>ПОБЕДЫ <b>0 / 3</b></span><p id="class-unlock"></p></div>
    <p class="ranking-preview-note">Предварительный просмотр рейтинга. Карьерные поединки пока недоступны. Побеждённых соперников ещё нет.</p>
    <button class="button primary dialog-done" data-close>Вернуться в лобби ${icons.arrow}</button>
  `, 'ranking-dialog');
  if (!dialog) return;

  const renderProfile = (): void => {
    dialog.querySelector('#opponent-profile')!.innerHTML = `
      <div class="opponent-monogram" aria-hidden="true">${selected.name.charAt(0)}<span>0${selected.rank}</span></div>
      <span class="eyebrow">${selected.class === 1 && selected.rank === 3 ? 'ПЕРВЫЙ СОПЕРНИК' : 'ЗАБЛОКИРОВАН'}</span>
      <h3>${selected.name} <span>«${selected.alias}»</span></h3>
      <p class="opponent-style">${getStyle(selected.style).name}</p>
      <dl class="opponent-stats"><div><dt>Здоровье</dt><dd>${selected.hp}</dd></div><div><dt>Выносливость</dt><dd>${selected.stamina}</dd></div><div><dt>Урон</dt><dd>${selected.damage}</dd></div></dl>
      <p class="opponent-tactic">${selected.tactic}</p>
      <p class="opponent-fairness">Характеристики заданы бойцу. Боевой стиль не даёт скрытых бонусов.</p>`;
  };
  const renderList = (): void => {
    const list = dialog.querySelector('#opponent-list')!;
    list.innerHTML = OPPONENT_PREVIEW.filter((opponent) => opponent.class === selectedClass).map((opponent) => `<button class="opponent-row" data-opponent="${opponent.id}" aria-pressed="${opponent.id === selected.id}"><b>0${opponent.rank}</b><span>${opponent.name}<small>«${opponent.alias}» · ${getStyle(opponent.style).name}</small></span><i>${opponent.class === 1 && opponent.rank === 3 ? 'ПЕРВЫЙ' : 'ЗАКРЫТ'}</i></button>`).join('');
    const unlock = dialog.querySelector('#class-unlock')!;
    unlock.textContent = selectedClass === 3 ? 'Высший класс. Победи всех трёх соперников, чтобы завершить карьеру.' : `Для открытия класса 0${selectedClass + 1} нужно победить всех трёх обязательных соперников класса 0${selectedClass}.`;
    renderProfile();
  };
  dialog.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLButtonElement>('[data-tier]');
    if (tab) {
      selectedClass = Number(tab.dataset.tier);
      selected = OPPONENT_PREVIEW.find((opponent) => opponent.class === selectedClass)!;
      dialog.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((button) => button.setAttribute('aria-pressed', String(button === tab)));
      view.services.audio.play(); renderList(); return;
    }
    const row = target.closest<HTMLButtonElement>('[data-opponent]');
    if (row) {
      selected = OPPONENT_PREVIEW.find((opponent) => opponent.id === row.dataset.opponent)!;
      view.services.audio.play(); renderList();
      dialog.querySelector<HTMLButtonElement>(`[data-opponent="${selected.id}"]`)?.focus();
    }
  });
  renderList();
}
