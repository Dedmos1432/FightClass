import type { GameServices } from '../core/GameServices';
import { ScreenView } from './ScreenView';
import { icons } from './icons';
import { ATTACK_KEYS } from '../config/controls';
import { COMBAT } from '../config/combat';
import { attackDuration } from '../combat/CombatWorld';
import { TUTORIAL_STEPS, type PracticeStep } from '../tutorial/Progress';
import type { CombatTutorial } from '../tutorial/CombatTutorial';
import { lessonPages } from './LessonPages';
import { clearVirtualInput } from '../input/VirtualInput';

const lessons: Record<PracticeStep,{title:string;body:string;checks:string[]}> = {
  movement:{title:'Почувствуй дистанцию',body:'Пройди в обе стороны: <kbd>A</kbd> / <kbd>D</kbd> или стрелки. Боец сам поворачивается к сопернику. Через него можно пройти за спину.',checks:['Пройти влево','Пройти вправо']},
  attacks:{title:'Три удара. Три кнопки.',body:'Попади каждым приёмом: <kbd>Q</kbd>, <kbd>W</kbd>, <kbd>E</kbd>. Между ударами дай анимации закончиться. Вне дальности удар не попадёт. Урон всех трёх приёмов одинаковый.',checks:['Попасть ударом Q','Попасть ударом W','Попасть ударом E']},
  combo:{title:'Свяжи удары в комбинацию',body:'Нажми <kbd>Q</kbd>. Когда указатель войдёт в красную зону восстановления, нажми <kbd>W</kbd> или <kbd>E</kbd>. В бою так можно связать до трёх ударов.',checks:['Попасть вторым ударом одной комбинации']},
  block:{title:'Встреть удар защитой',body:'Удерживай <kbd>Space</kbd>, пока партнёр не ударит. Блок защищает спереди; <kbd>A</kbd> / <kbd>D</kbd> разворачивают его без движения. Попадание расходует немного выносливости.',checks:['Заблокировать удар партнёра']},
  dodge:{title:'Уйди в нужный момент',body:'Дождись сигнала и нажми <kbd>Shift</kbd>. Уклонение отводит назад и ненадолго даёт неуязвимость. Оно стоит 25 выносливости. Если промахнулся по времени — попробуй на следующем ударе.',checks:['Избежать удара уклонением']},
  stamina:{title:'Оставляй силы на защиту',body:'Следи за полосой выносливости сверху. Удары стоят 12 / 16 / 20, уклонение — 25. Потрать запас до 40 или ниже, затем сделай паузу в атаках и восстанови его до 80. В блоке восстановление медленнее; пустой блок могут пробить.',checks:['Потратить выносливость до 40','Восстановить запас до 80']},
  club:{title:'Теперь — твой путь в клубе',body:'HP — здоровье: при нуле будет нокаут. Эта тренировка не тратит твой прогресс. В лобби двигайся <kbd>A</kbd> / <kbd>D</kbd>, подходи к объектам и нажимай <kbd>E</kbd>.',checks:[]},
};
const touchLessons:Partial<Record<PracticeStep,string>>={
  movement:'Удерживай стрелки ← / → внизу экрана, чтобы пройти в обе стороны. Боец сам поворачивается к сопернику. Через него можно пройти за спину.',
  attacks:'Касайся кнопок Q, W и E внизу справа. Попади каждым приёмом и дай анимации закончиться между ударами. Вне дальности удар не попадёт. Урон всех трёх приёмов одинаковый.',
  combo:'Коснись Q. Когда указатель войдёт в красную зону восстановления, коснись W или E. Так можно связать до трёх ударов. Можно одновременно удерживать стрелку движения и нажимать атаку.',
  block:'Отпусти все кнопки и дождись удара партнёра. На мобильном боец автоматически блокирует удары спереди, когда стоит без действий. Во время движения, атаки и уклонения автоблок не работает. Блок расходует немного выносливости; пустую защиту могут пробить.',
  dodge:'Дождись сигнала и коснись «Уклонение». Оно отводит назад, ненадолго даёт неуязвимость и стоит 25 выносливости. Если промахнулся по времени — попробуй на следующем ударе.',
  club:'HP — здоровье: при нуле будет нокаут. Эта тренировка не тратит твой прогресс. В лобби удерживай стрелки ← / → и нажимай E у объектов. «Назад» возвращает в лобби из комнаты. В качалке для повторений есть кнопка «Жать».',
};

export class TutorialView extends ScreenView {
  private message='';
  private pages:string[]=[];
  private page=0;
  private lecture=true;
  private lessonStep:PracticeStep='movement';
  get reading():boolean { return this.root.dataset.touch==='true' && this.lecture && this.lessonStep!=='club'; }
  constructor(services:GameServices) {
    super(services,'tutorial',`
      <section class="tutorial-hud" aria-label="Учебный боец">
        <div class="tutorial-vital"><span>ЗДОРОВЬЕ <b id="tutorial-hp-text">100 / 100</b></span><div id="tutorial-hp" role="progressbar" aria-label="HP учебного бойца" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>
        <div class="tutorial-vital tutorial-energy"><span>ВЫНОСЛИВОСТЬ <b id="tutorial-stamina-text">100 / 100</b></span><div id="tutorial-stamina" role="progressbar" aria-label="Выносливость учебного бойца" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>
        <span class="tutorial-safe">УЧЕБНЫЙ СПАРРИНГ<small>Без поражений и потери прогресса</small></span>
      </section>
      <section class="tutorial-main">
        <div id="tutorial-focus" tabindex="0" role="application" aria-label="Обучение. A D движение, Q W E удары, пробел блок, Shift уклонение, Escape пауза"></div>
        <section id="tutorial-card" class="tutorial-lesson" aria-labelledby="tutorial-title">
          <div class="tutorial-copy"><span class="eyebrow" id="tutorial-number"></span><h1 id="tutorial-title"></h1><p id="tutorial-description"></p></div>
          <div class="tutorial-tasks"><ul id="tutorial-checks"></ul><p id="tutorial-feedback" role="status" aria-live="polite"></p></div>
          <div id="tutorial-timing" hidden><span>СЛЕДУЮЩИЙ УДАР — В КРАСНОЙ ЗОНЕ</span><div class="tutorial-timing-track"><i class="tutorial-timing-window"></i><i id="tutorial-needle"></i></div></div>
          <nav id="tutorial-reader" class="lesson-reader" aria-label="Страницы подсказки" hidden><button id="tutorial-page-prev" type="button" aria-label="Предыдущая подсказка">←</button><span id="tutorial-page-count" aria-live="polite"></span><button id="tutorial-page-next" type="button" aria-label="Следующая подсказка">→</button></nav>
          <button id="tutorial-practice" class="button primary" hidden>К практике ${icons.arrow}</button>
          <button id="tutorial-help" class="icon-button" aria-label="Открыть пояснение урока" hidden>?</button>
          <div id="tutorial-club" hidden>
            <div><b>01 / КАЧАЛКА</b><p>Левая дверь. Жим штанги улучшает максимальные HP и выносливость.</p></div>
            <div><b>02 / ДОСКА</b><p>В центре лобби. В каждом из трёх классов четыре бойца. Победи всех, чтобы открыть следующий класс. Обычные матчи — до 2 побед в раундах, боссы — до 3.</p></div>
            <div><b>03 / ЗАЛ ЕДИНОБОРСТВ</b><p>Правая дверь. В центре зала нажми E, чтобы начать серию. HP между противниками не восстанавливается. Награда к урону выдаётся после завершения серии.</p></div>
            <p class="tutorial-match-rules">В бою 90 секунд. По времени решает процент HP. В бесконечной серии соперник один раз усиливается на 10% после 15 секунд. Стиль меняет анимации, а не характеристики.</p>
            <p class="tutorial-match-rules">Дальше — экскурсия в самом лобби: подсветка проведёт тебя к качалке, поможет выполнить жим, объяснит карьерную доску и покажет, как начать бесконечные бои.</p>
            <button id="tutorial-finish" class="button primary">Войти в лобби ${icons.arrow}</button>
          </div>
        </section>
        <div class="tutorial-actions"><button id="tutorial-skip" class="button secondary small-button">Пропустить обучение</button><button id="tutorial-pause" class="button secondary small-button">Пауза <kbd>Esc</kbd></button></div>
      </section>`);
    this.root.querySelector('.keyboard-hint')!.innerHTML='<kbd>A</kbd><kbd>D</kbd> движение '+ATTACK_KEYS.map(key=>`<kbd>${key.label}</kbd>`).join('')+' удары <kbd>Space</kbd> блок <kbd>Shift</kbd> уклонение';
    this.on('#tutorial-focus','click',()=>this.focusArena());
    this.on('#tutorial-page-prev','click',()=>this.changePage(-1));
    this.on('#tutorial-page-next','click',()=>this.changePage(1));
    this.on('#tutorial-practice','click',()=>{this.lecture=false;this.renderReading();this.focusArena();});
    this.on('#tutorial-help','click',()=>{clearVirtualInput();this.lecture=true;this.renderReading();this.focus('#tutorial-practice');});
    this.warnIfTemporary();
  }
  focusArena():void { this.focus('#tutorial-focus'); }
  showLesson(step:PracticeStep):void {
    const lesson=lessons[step],root=this.root;
    this.lessonStep=step;this.lecture=true;
    root.querySelector('#tutorial-focus')!.setAttribute('data-step',step);
    root.querySelector('#tutorial-number')!.textContent=`ПЕРВАЯ ТРЕНИРОВКА / ${String(TUTORIAL_STEPS.indexOf(step)+1).padStart(2,'0')} ИЗ 07`;
    root.querySelector('#tutorial-title')!.textContent=lesson.title;
    const touch=root.dataset.touch==='true';
    const body=(touch&&touchLessons[step])||lesson.body;
    this.pages=touch ? lessonPages(body,180) : [body];this.page=0;
    if(touch && step==='club') {
      this.pages=[
        'HP — здоровье. При нуле будет нокаут. В этой тренировке твой прогресс не тратится.',
        'В лобби двигайся стрелками. У двери или доски касайся «Действие». Из комнаты возвращайся кнопкой «Назад».',
        'КАЧАЛКА / Левая дверь. Касайся «Жать», чтобы поднимать штангу. Жим повышает максимальные HP и выносливость.',
        'КАРЬЕРА / Доска между дверями. Три класса по четыре соперника. Победи всех по порядку, чтобы открыть следующий класс.',
        'РАУНДЫ / Обычный матч — до двух побед, бой с боссом — до трёх. HP и выносливость восстанавливаются перед раундом.',
        'БЕСКОНЕЧНЫЕ БОИ / Правая дверь. В центре — «Действие». HP между противниками не восстанавливается.',
        'НАГРАДА / После завершения серии прошлые победы дадут постоянную прибавку к урону. Даже после поражения.',
        'ТАЙМЕР / 90 секунд. По времени побеждает больший процент HP. В серии после 15 секунд урон бота один раз растёт на 10%.',
        'ТЕХНИКА / Стиль меняет анимации, характеристики одинаковые. В лобби экскурсия покажет стили, качалку, карьеру и зал.',
      ];
    }
    this.renderPage();
    root.querySelector('#tutorial-checks')!.innerHTML=lesson.checks.map((check,i)=>`<li data-check="${i}" data-done="false"><i aria-hidden="true"></i><span>${check}</span></li>`).join('');
    (root.querySelector('#tutorial-timing') as HTMLElement).hidden=step!=='combo';
    (root.querySelector('#tutorial-club') as HTMLElement).hidden=step!=='club';
    root.querySelector('#tutorial-card')!.setAttribute('data-lesson',step);
    this.message=''; root.querySelector('#tutorial-feedback')!.textContent='';
    this.renderReading();
    if(step==='club') this.focus('#tutorial-finish'); else if(this.reading)this.focus('#tutorial-practice');else this.focusArena();
  }
  private renderReading():void {
    const touch=this.root.dataset.touch==='true',reading=touch&&this.lecture;
    if(touch)this.root.dataset.tutorialReading=String(reading);else delete this.root.dataset.tutorialReading;
    this.root.querySelector<HTMLElement>('#tutorial-practice')!.hidden=!reading||this.lessonStep==='club';
    this.root.querySelector<HTMLElement>('#tutorial-help')!.hidden=!touch||reading||this.lessonStep==='club';
  }
  private changePage(direction:number):void {
    this.page=Math.max(0,Math.min(this.pages.length-1,this.page+direction));this.renderPage();
  }
  private renderPage():void {
    const touch=this.root.dataset.touch==='true';
    const description=this.root.querySelector('#tutorial-description')!;
    if(touch)description.textContent=this.pages[this.page];else description.innerHTML=this.pages[this.page];
    (this.root.querySelector('#tutorial-reader') as HTMLElement).hidden=!touch || this.pages.length<2;
    this.root.querySelector<HTMLButtonElement>('#tutorial-page-prev')!.disabled=this.page===0;
    this.root.querySelector<HTMLButtonElement>('#tutorial-page-next')!.disabled=this.page===this.pages.length-1;
    this.root.querySelector('#tutorial-page-count')!.textContent=`ПОДСКАЗКА ${this.page+1} / ${this.pages.length}`;
  }
  update(trainer:CombatTutorial):void {
    const p=trainer.world.player,e=trainer.world.enemy;
    for(const [key,value] of [['hp',p.hp],['stamina',p.stamina]] as const) {
      this.root.querySelector(`#tutorial-${key}-text`)!.textContent=`${Math.ceil(value)} / 100`;
      const meter=this.root.querySelector<HTMLElement>(`#tutorial-${key}`)!;
      meter.setAttribute('aria-valuenow',String(Math.ceil(value)));
      meter.firstElementChild!.setAttribute('style',`width:${value}%`);
      meter.dataset.low=String(value<=40);
    }
    trainer.checks.forEach((done,i)=>this.root.querySelector(`[data-check="${i}"]`)?.setAttribute('data-done',String(done)));
    const timing=this.root.querySelector<HTMLElement>('#tutorial-timing')!;
    const duration=attackDuration(p.slot),open=p.action==='attack' && p.elapsed>=duration-COMBAT.comboBufferMs && p.combo<COMBAT.maxCombo;
    timing.dataset.open=String(open);
    this.root.querySelector<HTMLElement>('#tutorial-needle')!.style.left=`${p.action==='attack'?Math.min(100,p.elapsed/duration*100):0}%`;
    this.root.querySelector<HTMLElement>('.tutorial-timing-window')!.style.width=`${COMBAT.comboBufferMs/duration*100}%`;
    const touch=this.root.dataset.touch==='true';
    const message=trainer.ready ? 'Готово. Следующий приём…' : trainer.dodgeCue ? touch?'СЕЙЧАС — УКЛОНЕНИЕ':'СЕЙЧАС — SHIFT' : trainer.step==='block' && e.action==='attack' ? touch?'Отпусти кнопки — сработает автоблок':'Держи SPACE — партнёр атакует'
      : trainer.step==='dodge' ? 'Дождись удара партнёра' : trainer.step==='combo' && open ? 'СЕЙЧАС — W ИЛИ E' : trainer.step==='stamina' && trainer.spent ? 'Отпусти атаки. Верни запас до 80.' : '';
    if(message!==this.message) { this.root.querySelector('#tutorial-feedback')!.textContent=message; this.message=message; }
    this.root.querySelector('#tutorial-feedback')!.setAttribute('data-cue',String(trainer.dodgeCue || open));
    Object.assign(this.root.querySelector<HTMLElement>('#tutorial-focus')!.dataset,{
      step:trainer.step,playerX:p.x.toFixed(1),playerAction:p.action,enemyAction:e.action,enemyMs:String(e.elapsed),
      actionMs:String(p.elapsed),slot:String(p.slot),combo:String(p.combo),stamina:String(Math.floor(p.stamina)),
      ready:String(trainer.ready),dodgeCue:String(trainer.dodgeCue),comboCue:String(open),paused:String(this.hasDialog),
    });
  }
  showPause(onMenu:()=>void):void {
    this.openDialog(`<div class="dialog-top"><span class="eyebrow">ПЕРВАЯ ТРЕНИРОВКА</span><button class="icon-button" data-close aria-label="Продолжить обучение">${icons.close}</button></div>
      <h2 id="dialog-title">Пауза</h2><p class="dialog-description">Завершённые уроки сохранены. После перезапуска «Продолжить» вернёт тебя к текущему приёму.</p>
      <button class="button primary dialog-done" data-close>Продолжить обучение</button><button class="button secondary dialog-done" id="tutorial-menu">Сохранить и выйти в меню</button>`,'tutorial-pause');
    this.on('#tutorial-menu','click',onMenu);
  }
  destroy():void { delete this.root.dataset.tutorialReading;super.destroy(); }
}
