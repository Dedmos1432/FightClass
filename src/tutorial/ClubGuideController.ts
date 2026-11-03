import type Phaser from 'phaser';
import { WORLD, LOBBY_OBJECTS } from '../config/lobby';
import { BENCH } from '../config/training';
import { COMBAT } from '../config/combat';
import type { ExplorationPlayer } from '../characters/ExplorationPlayer';
import type { ExplorationView } from '../ui/ExplorationView';
import type { BenchTrainingController } from '../training/BenchTrainingController';
import { CLUB_GUIDE_STEPS, observedClubStep, type ClubRoom } from './ClubGuide';

interface Hint { title:string; text:string; target:number; action:string }
/** An in-world continuation of combat onboarding. Observes real room/workout actions. */
export class ClubGuideController {
  private readonly panel:HTMLElement;
  private readonly marker:Phaser.GameObjects.Ellipse;
  private readonly arrow:Phaser.GameObjects.Text;
  private lastHint='';
  constructor(scene:Phaser.Scene,private readonly view:ExplorationView,private readonly room:ClubRoom,
    private readonly player:ExplorationPlayer,private readonly bench:BenchTrainingController|null) {
    view.root.querySelector('.exploration-layer')!.insertAdjacentHTML('beforeend',`
      <aside id="club-guide" class="club-guide" aria-labelledby="club-guide-title">
        <span class="eyebrow" id="club-guide-number"></span><h2 id="club-guide-title"></h2>
        <p id="club-guide-text"></p><div class="club-guide-route" id="club-guide-route" role="status" aria-live="polite"></div>
        <button id="club-guide-skip" class="button secondary small-button">Пропустить экскурсию</button>
      </aside>`);
    this.panel=view.root.querySelector<HTMLElement>('#club-guide')!;
    this.marker=scene.add.ellipse(0,WORLD.floorY+4,195,32,0xd94436,.13).setStrokeStyle(3,0xf1bca1,.95).setDepth(8);
    this.arrow=scene.add.text(0,WORLD.floorY-390,'▼',{fontFamily:'Consolas, monospace',fontSize:'40px',color:'#f1bca1',stroke:'#17191a',strokeThickness:5}).setOrigin(.5).setDepth(8);
    view.on('#club-guide-skip','click',()=>{view.services.saves.skipClubGuide();this.update();view.focusWorld();});
    this.update();
  }
  update():void {
    const saves=this.view.services.saves;
    if(!saves.needsClubGuide) {
      this.panel.hidden=true;this.marker.setVisible(false);this.arrow.setVisible(false);delete this.view.root.dataset.clubGuide;return;
    }
    const progress=saves.clubGuide,next=observedClubStep(progress,this.room,Boolean(this.bench?.active),saves.training.totalReps);
    if(next!==progress.step)saves.advanceClubGuide(progress.step);
    const step=saves.clubGuide.step;
    this.view.root.dataset.clubGuide=step;this.panel.dataset.step=step;
    const hidden=this.view.hasDialog;
    this.panel.hidden=hidden;this.marker.setVisible(!hidden);this.arrow.setVisible(!hidden);
    const hint=this.hint(),key=JSON.stringify([step,hint]);
    this.panel.dataset.anchor=hint.target>WORLD.width/2 ? 'left' : 'right';
    if(key!==this.lastHint) {
      this.lastHint=key;
      this.panel.querySelector('#club-guide-number')!.textContent=`ОСВОЙСЯ В КЛУБЕ / ${CLUB_GUIDE_STEPS.indexOf(step)+1} ИЗ ${CLUB_GUIDE_STEPS.length-1}`;
      this.panel.querySelector('#club-guide-title')!.textContent=hint.title;
      this.panel.querySelector('#club-guide-text')!.textContent=hint.text;
    }
    const near=Math.abs(this.player.x-hint.target)<=WORLD.interactionRadius;
    const direction=near ? 'ЗДЕСЬ' : this.player.x>hint.target ? '← ВЛЕВО' : 'ВПРАВО →';
    const route=`${direction} · ${hint.action}`,routeNode=this.panel.querySelector('#club-guide-route')!;
    if(routeNode.textContent!==route)routeNode.textContent=route;
    this.marker.x=hint.target;this.arrow.x=hint.target;
    // The combined bench sprite already shows where to train; keep its animation clear.
    if(this.bench?.active){this.marker.setVisible(false);this.arrow.setVisible(false);}
  }
  private hint():Hint {
    const saves=this.view.services.saves,step=saves.clubGuide.step;
    const exit={title:'Вернись в лобби',text:'Выход — слева. Подойди к нему и нажми E или нажми Escape. Следующая подсказка появится в лобби.',target:160,action:'E / Esc — в лобби'};
    if(this.room==='lobby') {
      if(step==='career-board'||step==='career-review')return {title:'Карьера — на доске',
        text:'Доска между дверями открывает карьеру: три класса и двенадцать соперников. Подойди к ней — рамка загорится зелёным. Нажми E, чтобы открыть рейтинг и узнать, как выбрать бой и подняться в следующий класс.',
        target:LOBBY_OBJECTS[1].x,action:'E — открыть карьерный рейтинг'};
      const gym=['gym-door','bench','press'].includes(step);
      return gym ? {title:'Сначала — качалка',text:'Левая дверь ведёт в тренажёрный зал. Жим штанги навсегда повышает максимальные HP и выносливость. Пройди влево на A или стрелке, подойди к подсвеченной двери и нажми E.',target:LOBBY_OBJECTS[0].x,action:'E — войти в качалку'}
        : {title:'Теперь — бесконечные бои',text:'Правая дверь ведёт в зал единоборств. Здесь прокачивается общий урон всех атак. Пройди вправо на D или стрелке и нажми E у подсвеченной двери. Доска между дверями нужна для карьеры.',target:LOBBY_OBJECTS[2].x,action:'E — войти в зал'};
    }
    if(this.room==='gym') {
      if(step==='gym-exit')return this.bench?.active
        ? {title:'Повторение готово',text:'Полное повторение уже сохранено. Следи за максимальными HP и выносливостью сверху: они растут по мере тренировок. Нажми Escape или «Завершить», дождись подъёма со скамьи и закрой результат подхода. Затем вернись в лобби.',target:BENCH.x,action:'Esc — завершить подход'}
        : {...exit,text:'Повторение и улучшения сохранены. Позже для следующего прироста потребуется больше повторений, жёсткого потолка нет. Сейчас вернись в лобби: выход слева или Escape.'};
      if(step==='career-board'||step==='career-review'||step==='dojo-door'||step==='dojo-start')return exit;
      return this.bench?.active
        ? {title:'Выполни одно повторение',text:'Дождись, пока боец ляжет и снимет штангу. Затем нажимай и отпускай E несколько раз, чтобы заполнить шкалу жима. Зажатая E не считается. Доведи штангу до верха — повторение засчитается и сохранится.',target:BENCH.x,action:'E — повторения · Esc — закончить'}
        : {title:'Подойди к скамье',text:'Скамья для жима находится справа. Подойди к подсветке и нажми E. Прочитай подсказку первого подхода и выбери «Начать подход». Нужно сделать одно полное повторение.',target:BENCH.x,action:'E — начать жим лёжа'};
    }
    if(step==='career-board'||step==='career-review')return {...exit,text:'Сначала познакомимся с карьерой. Вернись в лобби через выход слева или Escape, подойди к доске между дверями и нажми E.'};
    if(step!=='dojo-door'&&step!=='dojo-start')return {...exit,text:'Мы ещё не закончили знакомство с качалкой. Вернись в лобби через выход слева или Escape, затем войди в левую дверь.'};
    return {title:saves.activeRun ? 'Продолжи серию в центре' : 'Начни серию в центре',
      text:'Встань в подсвеченную зону и нажми E. Новая серия начинается с полными HP и выносливостью. После победы следующий бот появляется без восстановления HP. На каждого — 90 секунд; после 15 секунд его урон один раз растёт на 10%. Поражение или ничья завершат серию: награда к урону за прошлые победы сохранится. Больше побед — больше награда; по мере прокачки рост замедляется. Escape ставит бой на паузу и позволяет сохранить серию.',
      target:COMBAT.centerX,action:saves.activeRun?'E — продолжить серию':'E — начать бесконечную серию'};
  }
  destroy():void {
    this.panel.remove();this.marker.destroy();this.arrow.destroy();delete this.view.root.dataset.clubGuide;
  }
}
