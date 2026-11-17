import { test,expect,type Page } from '@playwright/test';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { CLUB_GUIDE_STEPS } from '../src/tutorial/ClubGuide';
import { desktopViewport } from './helpers/desktopViewport';

test.use({hasTouch:true,reducedMotion:'reduce'});

async function setup(page:Page):Promise<void>{
  await page.goto('/');await expect(page.locator('#settings')).toBeVisible();
  await page.evaluate(async()=>{
    const src='/src/';
    const modules=await Promise.all(['core/GameServices','services/StorageService','ui/ExplorationView','ui/TutorialView','tutorial/CombatTutorial','ui/CombatView','ui/BenchTrainingView','ui/RankingView','combat/moves','career/Roster','tutorial/Progress','tutorial/ClubGuide'].map(path=>import(src+path+'.ts')));
    const [core,storage,exploration,tutorial,practice,combat,bench,ranking,moves,career,progress,guide]=modules;
    (window as any).__layout={services:new core.GameServices(new storage.StorageService(localStorage)),exploration,tutorial,practice,combat,bench,ranking,moves,career,progress,guide};
  });
}
async function render(page:Page,kind:string):Promise<void>{
  await page.evaluate(kind=>{
    const a=(window as any).__layout;
    a.benchView?.destroy();a.benchView=null;a.view?.destroy();
    delete document.querySelector<HTMLElement>('#ui')!.dataset.clubGuide;
    a.services.saves.startNew();a.services.saves.skipTutorial();
    if(kind.startsWith('lesson:')){
      a.view=new a.tutorial.TutorialView(a.services);const step=kind.slice(7);
      a.view.showLesson(step);a.view.update(new a.practice.CombatTutorial(step));return;
    }
    if(['pause','result','career-result'].includes(kind)){
      a.view=new a.combat.CombatView(a.services,a.moves.defaultLoadout(),kind==='career-result'?a.career.CAREER_ROSTER[0]:undefined);
      if(kind==='pause')a.view.showPause(()=>{});
      if(kind==='result')a.view.showResult({wins:15,gain:4,damage:25},()=>{},'timeout');
      if(kind==='career-result')a.view.showCareerResult({opponentId:'kim',outcome:'enemy',reason:'timeout',newVictory:false,newClass:1,completed:false,elapsedMs:90000,playerRounds:1,enemyRounds:2},()=>{},()=>{});
      return;
    }
    a.view=new a.exploration.ExplorationView(a.services,kind.startsWith('bench')?'gym':'lobby',()=>{});
    if(kind==='confirm')a.view.confirmNewGame(()=>{});
    if(kind==='styles')document.querySelector<HTMLButtonElement>('#choose-style')!.click();
    if(kind==='board'||kind==='board-guide'){
      if(kind==='board-guide'){
        a.services.saves.beginTutorial();for(const step of a.progress.TUTORIAL_STEPS.slice(0,-1))a.services.saves.advanceTutorial(step);
        for(const step of a.guide.CLUB_GUIDE_STEPS){if(step==='career-board')break;a.services.saves.advanceClubGuide(step);}
      }
      a.ranking.showRanking(a.view,()=>{});
    }
    if(kind.startsWith('bench')){
      a.benchView=new a.bench.BenchTrainingView(a.view,()=>{},()=>{});
      if(kind==='bench-intro')a.benchView.showTutorial(()=>{});
      if(kind==='bench-active'){a.benchView.begin();a.benchView.update('pressing',.55,12,false);}
      if(kind==='bench-result')a.benchView.end(12,true);
    }
  },kind);
}
async function fits(page:Page,selector:string):Promise<void>{
  await expect(page.locator(selector)).toBeVisible();
  const problems=await page.locator(selector).evaluate(root=>{
    const errors:string[]=[];
    for(const el of [root,...root.querySelectorAll<HTMLElement>('*')]){
      const node=el as HTMLElement,style=getComputedStyle(node),rect=node.getBoundingClientRect();
      if(!rect.width||!rect.height||style.display==='none'||node.closest('[hidden]')||style.position==='absolute'&&node.classList.contains('sr-only'))continue;
      if(node.classList.contains('sr-only')||node.tagName==='SELECT'||node.tagName==='SVG'||node.closest('svg')||node.closest('.menu-art'))continue;
      if(node.scrollHeight>node.clientHeight+2&&style.overflowY!=='visible')errors.push(`${node.id||node.className}: vertical ${node.scrollHeight}/${node.clientHeight}`);
      if(node.scrollWidth>node.clientWidth+2&&style.overflowX!=='visible')errors.push(`${node.id||node.className}: horizontal ${node.scrollWidth}/${node.clientWidth}`);
      if(rect.top < -1||rect.bottom>innerHeight+1||rect.left < -1||rect.right>innerWidth+1)errors.push(`${node.id||node.className}: outside viewport ${JSON.stringify(rect.toJSON())}`);
    }
    return errors;
  });
  expect(problems,selector).toEqual([]);
}

for(const [width,height] of [[320,568],[390,844],[568,320],[844,390]]){
  test(`мобильные окна без прокрутки ${width}x${height}`,async({page})=>{
    test.setTimeout(120_000);await desktopViewport(page,{width,height});await setup(page);
    await fits(page,'.screen');await page.locator('#settings').tap();await fits(page,'.settings-dialog');
    await page.getByRole('button',{name:'Готово',exact:true}).tap();
    for(const kind of ['confirm','styles','bench-intro','bench-active','bench-result','pause','result','career-result']){
      await render(page,kind);const selector=kind==='bench-active'?'#bench-workout':'.dialog';
      await fits(page,selector);await page.screenshot({path:`.cache/mobile-layout/${kind}-${width}.png`});
      if(kind==='styles'){
        await page.locator('input[value="freestyle"]').check();await fits(page,selector);
        await page.locator('[data-style-panel="info"]').tap();await fits(page,selector);
        await page.locator('[data-style-panel="styles"]').tap();await fits(page,selector);
      }
      if(kind==='bench-intro')for(let i=0;i<3;i++){await page.locator('#bench-lesson-next').tap();await fits(page,selector);}
      if(kind==='pause')for(const tab of ['Приёмы','Правила']){await page.getByRole('button',{name:tab,exact:true}).tap();await fits(page,selector);}
    }
  });
  test(`все страницы обучения без прокрутки ${width}x${height}`,async({page})=>{
    test.setTimeout(120_000);await desktopViewport(page,{width,height});await setup(page);
    for(const lesson of ['movement','attacks','combo','block','dodge','stamina','club']){
      await render(page,'lesson:'+lesson);await fits(page,'#tutorial-card');
      const next=page.locator('#tutorial-page-next');
      for(let p=0;p<20 && await next.isEnabled();p++){await next.tap();await fits(page,'#tutorial-card');}
      await expect(page.locator('#tutorial-skip')).toBeInViewport();
      await page.screenshot({path:`.cache/mobile-layout/lesson-${lesson}-${width}.png`});
      if(lesson!=='club'){
        await page.locator('#tutorial-practice').tap();await fits(page,'#tutorial-card');
        await expect(page.locator('.touch-controls')).toBeVisible();
        const collision=await page.locator('#tutorial-card').evaluate(card=>{
          const a=card.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>('.touch-controls button')].some(button=>{
            const b=button.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
          });
        });
        expect(collision,'Practice card must leave both thumb zones clear').toBe(false);
        await page.screenshot({path:`.cache/mobile-layout/practice-${lesson}-${width}.png`});
      }
    }
  });
  test(`экскурсия во всех комнатах без прокрутки ${width}x${height}`,async({page})=>{
    test.setTimeout(120_000);await desktopViewport(page,{width,height});
    await page.addInitScript(key=>{const value=sessionStorage.getItem('layout-guide-seed');if(value)localStorage.setItem(key,value);},GAME.storage.session);
    await page.goto('/');await expect(page.locator('#settings')).toBeVisible();
    const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();
    for(const step of CLUB_GUIDE_STEPS.slice(0,-1)){
      if(await page.locator('#ui').getAttribute('data-screen')!=='menu')await page.locator('#back-menu').tap();
      const value={...saves.current!,clubGuide:{step,repsBefore:0}};
      await page.evaluate(value=>sessionStorage.setItem('layout-guide-seed',JSON.stringify(value)),value);
      await page.goto('/');await page.locator('#continue-game').tap();
      await expect(page.locator('#club-guide')).toHaveAttribute('data-step',step);await fits(page,'#club-guide');
      const next=page.locator('#club-guide-next');
      for(let p=0;p<20 && await next.isEnabled();p++){await next.tap();await fits(page,'#club-guide');}
      if(step==='style'||step==='dojo-start')await page.screenshot({path:`.cache/mobile-layout/guide-${step}-${width}.png`});
    }
  });
}
