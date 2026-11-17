import { CAREER_ROSTER, careerOpponent, type CareerOpponent } from '../career/Roster';
import { careerAvailable, careerClass, careerComplete, careerScore, careerWinsNeeded, emptyCareerRecord } from '../career/Progress';
import { getStyle } from '../config/styles';
import type { ScreenView } from './ScreenView';
import { icons } from './icons';
import { CLUB_GUIDE_STEPS } from '../tutorial/ClubGuide';
import boardTexture from '../../assets/optimized/career-board.webp?url';
import './career.css';
import { portraitURL } from '../assets/deliveryAssets';

/** The lobby board is the sole entrance to career matches. */
export function showRanking(view: ScreenView, onFight?: () => void): void {
  const saves=view.services.saves, progress=saves.career, active=saves.activeCareer;
  const currentClass=careerClass(progress);
  let selected=active ? careerOpponent(active.opponentId)! : CAREER_ROSTER[Math.min(progress.victories.length,CAREER_ROSTER.length-1)];
  let selectedClass:number=selected.tier;
  const guidingCareer=saves.needsClubGuide && ['career-board','career-review'].includes(saves.clubGuide.step);
  const mobile=view.root.dataset.touch==='true';
  const dialog=view.openDialog(`
    <div class="dialog-top"><div class="board-club-label"><b aria-hidden="true">FC</b><span class="eyebrow">КЛУБНЫЙ РЕЙТИНГ</span></div><button class="icon-button" data-close aria-label="Закрыть рейтинг">${icons.close}</button></div>
    <div class="ranking-heading"><div><h2 id="dialog-title">Доска соперников</h2></div><span class="rank-class-badge"><span>ТВОЙ<br />КЛАСС</span><b>0${currentClass}</b></span></div>
    ${guidingCareer ? `<aside class="career-guide" id="career-guide" aria-labelledby="career-guide-title">
      <div><span class="eyebrow">ОСВОЙСЯ В КЛУБЕ / ${CLUB_GUIDE_STEPS.indexOf('career-review')+1} ИЗ ${CLUB_GUIDE_STEPS.length-1}</span><h3 id="career-guide-title">Выбери свой следующий бой</h3></div>
      <p><b>Карточки и классы.</b> Нажми на карточку соперника: в его досье появятся стиль, характеристики и кнопка «Начать бой». Закрытые бойцы доступны для просмотра. Побеждай по порядку: все четыре победы в классе откроют следующий. В третьем классе все соперники — боссы.</p>
      <p><b>Победы в раундах.</b> Обычного соперника нужно победить в 2 раундах, босса — в 3; столько же поражений проигрывают матч. Каждый раунд начинается с полными HP и выносливостью. Карьерный прогресс сохраняется, поражение не отнимает открытых бойцов — матч можно повторить.</p>
      <div class="career-guide-pages"><p id="career-guide-page"></p><div class="career-reading-nav"><button id="career-guide-prev" class="button secondary small-button" aria-label="Предыдущая подсказка">←</button><span id="career-guide-page-number"></span><button id="career-guide-next" class="button secondary small-button">Далее →</button></div></div>
      <div class="career-guide-actions"><span>Можешь начать настоящий матч сейчас или продолжить экскурсию в зале единоборств.</span><button id="career-guide-done" class="button secondary small-button">Понятно · дальше к залу ${icons.arrow}</button></div>
    </aside>` : ''}
    ${careerComplete(progress) ? '<p class="career-board-intro">Все двенадцать соперников побеждены. Карьера пройдена — любой бой можно повторить.</p>' : ''}
    ${active ? `<div class="career-pending"><p>Сохранён бой с <b>${careerOpponent(active.opponentId)!.name}</b> · раунды ${careerScore(active).playerRounds} : ${careerScore(active).enemyRounds}, до ${careerWinsNeeded(active.opponentId)} побед. Заверши его, чтобы выбрать другого соперника.</p><button class="small-button" id="career-resume">Продолжить бой ${icons.arrow}</button></div>` : ''}
    <div class="ranking-tabs" role="group" aria-label="Класс соперников">${[1,2,3].map(tier=>`<button class="ranking-tab" data-tier="${tier}" aria-pressed="${tier===selectedClass}">КЛАСС 0${tier}<span>${tier<currentClass || careerComplete(progress) ? 'Пройден' : tier===currentClass ? 'Текущий' : mobile ? 'Закрыт' : 'Заблокирован'}</span></button>`).join('')}</div>
    <div class="career-mobile-toolbar"><button id="career-list-back" class="button secondary small-button">← К доске</button><button id="career-mobile-help" class="button secondary small-button">${guidingCareer ? 'Обучение' : 'Правила'} ?</button></div>
    <div class="ranking-layout"><div class="board-roster"><p class="board-roster-label">ОЧЕРЕДЬ НА БОЙ <span>4 СОПЕРНИКА / КЛАСС</span></p><div id="opponent-list" class="opponent-list" role="group" aria-label="Соперники"></div></div><article id="opponent-profile" class="opponent-profile" aria-live="polite"></article></div>
    <div class="ranking-progress"><span>ПОБЕДЫ <b id="career-tier-progress"></b></span><p id="class-unlock"></p></div>
    <p class="career-total">КАРЬЕРА <b>${progress.victories.length} / 12</b></p>
    <button class="button secondary dialog-done" data-close>Вернуться в лобби ${icons.arrow}</button>
  `,'ranking-dialog career-ranking');
  if(!dialog) return;
  if(guidingCareer)saves.advanceClubGuide('career-board');
  dialog.dataset.currentClass=String(currentClass);
  dialog.dataset.mobileBoard=String(mobile);
  dialog.dataset.boardView=mobile && guidingCareer ? 'guide' : 'board';
  if(mobile)dialog.querySelector('.dialog-top')!.insertBefore(dialog.querySelector('.career-mobile-toolbar')!,dialog.querySelector('.dialog-top [data-close]'));
  dialog.style.setProperty('--career-board-texture',`url("${boardTexture}")`);
  const setBoardView=(value:'board'|'rules'|'guide'):void=>{
    dialog.dataset.boardView=value;
    if(mobile)dialog.querySelector<HTMLElement>(value==='guide'?'#career-guide-next':value==='rules'?'#career-list-back':'[data-tier][aria-pressed="true"]')?.focus({preventScroll:true});
  };
  const guidePages=[
    'Нажми карточку соперника. На листе рядом появятся его стиль, характеристики и кнопка «Начать бой». Закрытых бойцов тоже можно изучать.',
    'Побеждай соперников по порядку. Все четыре победы в классе открывают следующий. В третьем классе тебя ждут четыре босса.',
    'Обычного соперника нужно победить в 2 раундах, босса — в 3. Столько же поражений проигрывают матч. Каждый раунд начинается с полными HP и выносливостью.',
    'Прогресс сохраняется. Поражение не закрывает открытых бойцов: матч можно повторить. Изучи доску и начни бой или нажми «Понятно», чтобы продолжить экскурсию.'
  ];
  let guidePage=0;
  const renderGuidePage=():void=>{
    if(!guidingCareer)return;
    dialog.querySelector('#career-guide-page')!.textContent=guidePages[guidePage];
    dialog.querySelector('#career-guide-page-number')!.textContent=`${guidePage+1} / ${guidePages.length}`;
    (dialog.querySelector('#career-guide-prev') as HTMLButtonElement).disabled=guidePage===0;
    dialog.querySelector('#career-guide-next')!.textContent=guidePage===guidePages.length-1?'К доске →':'Далее →';
  };
  renderGuidePage();

  const portraitFor=(opponent:CareerOpponent):string=>portraitURL(opponent.skin);

  const status=(opponent:CareerOpponent):string=>progress.victories.includes(opponent.id) ? 'ПОБЕЖДЁН'
    : active?.opponentId===opponent.id ? 'В БОЮ' : careerAvailable(progress,opponent.id) ? 'ДОСТУПЕН' : 'ЗАКРЫТ';
  const start=(id:string):void=>{
    if(!onFight) return;
    if(!saves.beginCareer(id)) {view.toast('Сначала заверши сохранённый карьерный бой.');return;}
    if(guidingCareer)saves.advanceClubGuide('career-review');
    view.closeDialog();view.services.audio.play('open');onFight();
  };
  const fitDossier=():void=>{
    if(!mobile)return;
    const profile=dialog.querySelector<HTMLElement>('#opponent-profile')!;
    if(!profile.getBoundingClientRect().height || profile.dataset.notes==='true')return;
    profile.dataset.fullDetails='true';
    const action=profile.querySelector('#career-start')!.getBoundingClientRect();
    const text=[...profile.querySelectorAll<HTMLElement>('h3,.opponent-style,dt,dd,.opponent-tactic,.career-match-format,.career-fight-record,.career-lock-note')];
    const fits=profile.scrollHeight<=profile.clientHeight+1 && text.every(node=>{
      const bounds=node.getBoundingClientRect();return !bounds.height || bounds.bottom<=action.top-3;
    });
    profile.dataset.fullDetails=String(fits);
  };
  const renderProfile=():void=>{
    const available=careerAvailable(progress,selected.id), won=progress.victories.includes(selected.id);
    const lockedByPending=Boolean(active && active.opponentId!==selected.id);
    const record=progress.records[selected.id] ?? emptyCareerRecord();
    const previous=CAREER_ROSTER[selected.order-1];
    const portrait=portraitFor(selected);
    dialog.querySelector('#opponent-profile')!.setAttribute('data-boss',String(selected.boss));
    dialog.querySelector('#opponent-profile')!.setAttribute('data-notes','false');
    dialog.querySelector('#opponent-profile')!.setAttribute('data-full-details','false');
    dialog.querySelector('#opponent-profile')!.innerHTML=`
      <div class="opponent-file-top"><div class="opponent-monogram" aria-hidden="true"><span>№</span>${String(selected.order+1).padStart(2,'0')}</div><div><span class="eyebrow">${selected.boss ? 'БОСС' : 'СОПЕРНИК'} · ${status(selected)}</span><p>КЛАСС 0${selected.tier} / БОЙ 0${selected.rank}</p></div></div>
      <div class="career-fighter-title"><div><h3>${selected.name}</h3><div class="career-profile-subline"><p class="opponent-style">${getStyle(selected.style).name}</p><button type="button" id="career-profile-notes" aria-expanded="false">Тактика ↗</button></div></div><div class="career-portrait" aria-hidden="true"><img src="${portrait}" alt="" /></div></div>
      <dl class="opponent-stats"><div><dt>Здоровье</dt><dd>${selected.maxHP}</dd></div><div><dt>Выносливость</dt><dd>${selected.stamina}</dd></div><div><dt>Урон</dt><dd>${selected.damage}</dd></div></dl>
      <p class="opponent-tactic">${selected.tactic}</p>
      <p class="career-match-format">${mobile && active?.opponentId===selected.id ? `СЧЁТ ${careerScore(active).playerRounds} : ${careerScore(active).enemyRounds} · ` : ''}${mobile ? `${selected.boss ? 'БОСС' : 'МАТЧ'} · ДО ${careerWinsNeeded(selected.id)} ПОБЕД` : `${selected.boss ? 'БОСС' : 'ОБЫЧНЫЙ СОПЕРНИК'} · МАТЧ ДО ${careerWinsNeeded(selected.id)} ПОБЕД В РАУНДАХ`}</p>
      <p class="career-fight-record">ПОБЕДЫ <b>${record.wins}</b> <span>ПОРАЖЕНИЯ <b>${record.losses}</b></span> <span>НИЧЬИ <b>${record.draws}</b></span></p>
      ${!available ? `<p class="career-lock-note">Сначала победи ${previous!.name}.</p>` : lockedByPending ? `<p class="career-lock-note">Сначала заверши бой с ${careerOpponent(active!.opponentId)!.name}.</p>` : ''}
      <button class="button primary career-start" id="career-start" ${!available || lockedByPending || !onFight ? 'disabled' : ''} data-fight="${selected.id}">${active?.opponentId===selected.id ? 'Продолжить бой' : won ? 'Повторить бой' : 'Начать бой'} ${icons.arrow}</button>`;
    fitDossier();
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
    if(target.closest('#career-list-back')){setBoardView('board');return;}
    if(target.closest('#career-profile-notes')){
      const profile=dialog.querySelector<HTMLElement>('#opponent-profile')!,button=dialog.querySelector<HTMLButtonElement>('#career-profile-notes')!;
      const notes=profile.dataset.notes!=='true';profile.dataset.notes=String(notes);button.setAttribute('aria-expanded',String(notes));button.textContent=notes?'← Досье':'Тактика ↗';fitDossier();return;
    }
    if(target.closest('#career-mobile-help')){setBoardView(guidingCareer?'guide':'rules');return;}
    if(target.closest('#career-guide-prev')){guidePage=Math.max(0,guidePage-1);renderGuidePage();return;}
    if(target.closest('#career-guide-next')){
      if(guidePage===guidePages.length-1)setBoardView('board');else{guidePage++;renderGuidePage();}return;
    }
    if(target.closest('#career-guide-done')){
      saves.advanceClubGuide('career-review');view.closeDialog();view.services.audio.play();return;
    }
    const tab=target.closest<HTMLButtonElement>('[data-tier]');
    if(tab){selectedClass=Number(tab.dataset.tier);selected=CAREER_ROSTER.find(opponent=>opponent.tier===selectedClass)!;
      dialog.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach(button=>button.setAttribute('aria-pressed',String(button===tab)));
      view.services.audio.play();renderList();if(mobile)setBoardView('board');return;}
    const row=target.closest<HTMLButtonElement>('[data-opponent]');
    if(row){selected=careerOpponent(row.dataset.opponent!)!;view.services.audio.play();renderList();
      dialog.querySelector<HTMLButtonElement>(`[data-opponent="${selected.id}"]`)?.focus({preventScroll:true});return;}
    const fight=target.closest<HTMLButtonElement>('[data-fight]');
    if(fight && !fight.disabled) start(fight.dataset.fight!);
    if(target.closest('#career-resume') && active) start(active.opponentId);
  });
  renderList();
  if(mobile){
    const observer=new ResizeObserver(fitDossier);observer.observe(dialog.querySelector('#opponent-profile')!);
    const stop=():void=>{observer.disconnect();view.events.signal.removeEventListener('abort',stop);};
    dialog.addEventListener('close',stop,{once:true});view.events.signal.addEventListener('abort',stop,{once:true});
  }
}
