import { CAREER_ROSTER, careerOpponent, type CareerOpponent } from '../career/Roster';
import { careerAvailable, careerClass, careerComplete, careerScore, careerWinsNeeded, emptyCareerRecord } from '../career/Progress';
import { getStyle } from '../config/styles';
import type { ScreenView } from './ScreenView';
import { icons } from './icons';
import boardTexture from '../../assets/ui/career-board.png?url';
import './career.css';

const portraits=import.meta.glob<string>('../../resourse/enemy/*/idle/idle_right/idle_00.png',{
  eager:true,query:'?url',import:'default',
});
const folders:Record<string,string>={kim:'kim dong won',kwon:'kwon tae-young',yeo:'yeo eun-sol',shim:'shim ha-min',
  bang:'bang jung-eum',jang:'chun-soo jang',cha:'cha so-wol',young:'young woong',sunny:'sunny jaa',lee:'ja-kyung lee',yang:'ki-hoon yang',maria:'maria'};

/** The lobby board is the sole entrance to career matches. */
export function showRanking(view: ScreenView, onFight?: () => void): void {
  const saves=view.services.saves, progress=saves.career, active=saves.activeCareer;
  const currentClass=careerClass(progress);
  let selected=active ? careerOpponent(active.opponentId)! : CAREER_ROSTER[Math.min(progress.victories.length,CAREER_ROSTER.length-1)];
  let selectedClass:number=selected.tier;
  const dialog=view.openDialog(`
    <div class="dialog-top"><div class="board-club-label"><b aria-hidden="true">FC</b><span class="eyebrow">КЛУБНЫЙ РЕЙТИНГ</span></div><button class="icon-button" data-close aria-label="Закрыть рейтинг">${icons.close}</button></div>
    <div class="ranking-heading"><div><h2 id="dialog-title">Доска соперников</h2></div><span class="rank-class-badge"><span>ТВОЙ<br />КЛАСС</span><b>0${currentClass}</b></span></div>
    ${careerComplete(progress) ? '<p class="career-board-intro">Все двенадцать соперников побеждены. Карьера пройдена — любой бой можно повторить.</p>' : ''}
    ${active ? `<div class="career-pending"><p>Сохранён бой с <b>${careerOpponent(active.opponentId)!.name}</b> · раунды ${careerScore(active).playerRounds} : ${careerScore(active).enemyRounds}, до ${careerWinsNeeded(active.opponentId)} побед. Заверши его, чтобы выбрать другого соперника.</p><button class="small-button" id="career-resume">Продолжить бой ${icons.arrow}</button></div>` : ''}
    <div class="ranking-tabs" role="group" aria-label="Класс соперников">${[1,2,3].map(tier=>`<button class="ranking-tab" data-tier="${tier}" aria-pressed="${tier===selectedClass}">КЛАСС 0${tier}<span>${tier<currentClass || careerComplete(progress) ? 'Пройден' : tier===currentClass ? 'Текущий' : 'Заблокирован'}</span></button>`).join('')}</div>
    <div class="ranking-layout"><div class="board-roster"><p class="board-roster-label">ОЧЕРЕДЬ НА БОЙ <span>4 СОПЕРНИКА / КЛАСС</span></p><div id="opponent-list" class="opponent-list" role="group" aria-label="Соперники"></div></div><article id="opponent-profile" class="opponent-profile" aria-live="polite"></article></div>
    <div class="ranking-progress"><span>ПОБЕДЫ <b id="career-tier-progress"></b></span><p id="class-unlock"></p></div>
    <p class="career-total">КАРЬЕРА <b>${progress.victories.length} / 12</b></p>
    <button class="button secondary dialog-done" data-close>Вернуться в лобби ${icons.arrow}</button>
  `,'ranking-dialog career-ranking');
  if(!dialog) return;
  dialog.dataset.currentClass=String(currentClass);
  dialog.style.setProperty('--career-board-texture',`url("${boardTexture}")`);

  const portraitFor=(opponent:CareerOpponent):string=>portraits[`../../resourse/enemy/${folders[opponent.skin]}/idle/idle_right/idle_00.png`];

  const status=(opponent:CareerOpponent):string=>progress.victories.includes(opponent.id) ? 'ПОБЕЖДЁН'
    : active?.opponentId===opponent.id ? 'В БОЮ' : careerAvailable(progress,opponent.id) ? 'ДОСТУПЕН' : 'ЗАКРЫТ';
  const start=(id:string):void=>{
    if(!onFight) return;
    if(!saves.beginCareer(id)) {view.toast('Сначала заверши сохранённый карьерный бой.');return;}
    view.closeDialog();view.services.audio.play('open');onFight();
  };
  const renderProfile=():void=>{
    const available=careerAvailable(progress,selected.id), won=progress.victories.includes(selected.id);
    const lockedByPending=Boolean(active && active.opponentId!==selected.id);
    const record=progress.records[selected.id] ?? emptyCareerRecord();
    const previous=CAREER_ROSTER[selected.order-1];
    const portrait=portraitFor(selected);
    dialog.querySelector('#opponent-profile')!.setAttribute('data-boss',String(selected.boss));
    dialog.querySelector('#opponent-profile')!.innerHTML=`
      <div class="opponent-file-top"><div class="opponent-monogram" aria-hidden="true"><span>№</span>${String(selected.order+1).padStart(2,'0')}</div><div><span class="eyebrow">${selected.boss ? 'БОСС' : 'СОПЕРНИК'} · ${status(selected)}</span><p>КЛАСС 0${selected.tier} / БОЙ 0${selected.rank}</p></div></div>
      <div class="career-fighter-title"><div><h3>${selected.name}</h3><p class="opponent-style">${getStyle(selected.style).name}</p></div><div class="career-portrait" aria-hidden="true"><img src="${portrait}" alt="" /></div></div>
      <dl class="opponent-stats"><div><dt>Здоровье</dt><dd>${selected.maxHP}</dd></div><div><dt>Выносливость</dt><dd>${selected.stamina}</dd></div><div><dt>Урон</dt><dd>${selected.damage}</dd></div></dl>
      <p class="opponent-tactic">${selected.tactic}</p>
      <p class="career-match-format">${selected.boss ? 'БОСС' : 'ОБЫЧНЫЙ СОПЕРНИК'} · МАТЧ ДО ${careerWinsNeeded(selected.id)} ПОБЕД В РАУНДАХ</p>
      <p class="career-fight-record">ПОБЕДЫ <b>${record.wins}</b> <span>ПОРАЖЕНИЯ <b>${record.losses}</b></span> <span>НИЧЬИ <b>${record.draws}</b></span></p>
      ${!available ? `<p class="career-lock-note">Сначала победи ${previous!.name}.</p>` : lockedByPending ? `<p class="career-lock-note">Сначала заверши бой с ${careerOpponent(active!.opponentId)!.name}.</p>` : ''}
      <button class="button primary career-start" id="career-start" ${!available || lockedByPending || !onFight ? 'disabled' : ''} data-fight="${selected.id}">${active?.opponentId===selected.id ? 'Продолжить бой' : won ? 'Повторить бой' : 'Начать бой'} ${icons.arrow}</button>`;
  };
  const renderList=():void=>{
    const tierRoster=CAREER_ROSTER.filter(opponent=>opponent.tier===selectedClass);
    dialog.querySelector('#opponent-list')!.innerHTML=tierRoster.map(opponent=>`<button class="opponent-row" data-opponent="${opponent.id}" data-status="${status(opponent)}" data-boss="${opponent.boss}" aria-pressed="${opponent.id===selected.id}"><b>0${opponent.rank}</b><div class="board-row-photo" aria-hidden="true"><img src="${portraitFor(opponent)}" alt="" loading="lazy" /></div><span>${opponent.name}<small>${opponent.boss ? 'БОСС · ' : ''}${getStyle(opponent.style).name}</small></span><i>${status(opponent)}</i></button>`).join('');
    dialog.querySelector('#career-tier-progress')!.textContent=`${tierRoster.filter(opponent=>progress.victories.includes(opponent.id)).length} / 4`;
    dialog.querySelector('#class-unlock')!.textContent=selectedClass===3 ? 'Высший класс. Победи всех четырёх боссов, чтобы завершить карьеру.'
      : `Победи всех четырёх соперников класса 0${selectedClass}, включая босса, чтобы открыть класс 0${selectedClass+1}.`;
    renderProfile();
  };
  dialog.addEventListener('click',event=>{
    const target=event.target as HTMLElement;
    const tab=target.closest<HTMLButtonElement>('[data-tier]');
    if(tab){selectedClass=Number(tab.dataset.tier);selected=CAREER_ROSTER.find(opponent=>opponent.tier===selectedClass)!;
      dialog.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach(button=>button.setAttribute('aria-pressed',String(button===tab)));
      view.services.audio.play();renderList();return;}
    const row=target.closest<HTMLButtonElement>('[data-opponent]');
    if(row){selected=careerOpponent(row.dataset.opponent!)!;view.services.audio.play();renderList();
      dialog.querySelector<HTMLButtonElement>(`[data-opponent="${selected.id}"]`)?.focus();return;}
    const fight=target.closest<HTMLButtonElement>('[data-fight]');
    if(fight && !fight.disabled) start(fight.dataset.fight!);
    if(target.closest('#career-resume') && active) start(active.opponentId);
  });
  renderList();
}
