import { test,expect,type Page,type CDPSession } from '@playwright/test';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { skipTutorial } from './helpers/tutorial';
import { TUTORIAL_STEPS, type PracticeStep } from '../src/tutorial/Progress';
import { desktopViewport } from './helpers/desktopViewport';

test.use({hasTouch:true,viewport:{width:844,height:390}});
const button=(page:Page,code:string)=>page.locator(`[data-touch="${code}"]`);
const coach=(page:Page,id:string)=>page.locator(`#tutorial-card[data-cue="${id}"]`);
async function point(page:Page,code:string,id:number){const box=(await button(page,code).boundingBox())!;return{x:box.x+box.width/2,y:box.y+box.height/2,id};}
async function touchWalk(page:Page,cdp:CDPSession,target:number):Promise<void>{
  const position=async()=>Number(await page.locator('#world-focus').getAttribute('data-player-x'));
  for(let i=0;i<5;i++){
    const x=await position();if(Math.abs(x-target)<75)break;
    const right=x<target;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(page,right?'KeyD':'KeyA',1)]});
    try{await expect.poll(position,{intervals:[25],timeout:12_000})[right?'toBeGreaterThanOrEqual':'toBeLessThanOrEqual'](target+(right?-50:50));}
    finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    await expect(page.locator('#world-focus')).toHaveAttribute('data-animation',/idle/);
  }
  expect(Math.abs(await position()-target)).toBeLessThan(110);
}
async function seeded(page:Page,fight=false):Promise<void>{
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();
  if(fight){saves.updateLobby({x:1468});const run=saves.beginEndless()!;saves.checkpointEndless(run.id,{...run,playerX:200,enemyX:1500});}
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').click();await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
}
async function seededLesson(page:Page,lesson:PracticeStep):Promise<void>{
  const saves=new SaveService(new StorageService(null));saves.startNew();
  for(const step of TUTORIAL_STEPS){if(step===lesson)break;saves.advanceTutorial(step);}
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').tap();
  await expect(page.locator('#tutorial-focus')).toHaveAttribute('data-step',lesson);
}

test('сенсорные двери, настоящий QTE-жим и возврат в лобби без клавиатуры',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await seeded(page);const cdp=await context.newCDPSession(page);
  await touchWalk(page,cdp,457);await button(page,'KeyE').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','gym');
  await touchWalk(page,cdp,1180);await expect(page.locator('#interact-object')).toContainText('Начать жим');
  await button(page,'KeyE').tap();expect(errors).toEqual([]);await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#bench-tutorial-start').tap();
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase','pressing');await expect(page.locator('.touch-controls')).toBeHidden();
  for(let i=0;i<18;i++){
    if(await page.locator('#bench-reps').textContent()==='01')break;
    await page.locator('#bench-tap').tap();await page.waitForTimeout(150);
  }
  await expect(page.locator('#bench-reps')).toHaveText('01');await expect(page.locator('#hp-value')).toHaveText('102');
  await page.locator('#bench-stop').tap();await page.getByRole('button',{name:/Вернуться к тренировкам/}).tap();
  await button(page,'Escape').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');expect(errors).toEqual([]);
});

test('мультитач: движение с атакой, отмена касания, уклонение и пауза',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await seeded(page,true);const cdp=await context.newCDPSession(page);
  await button(page,'KeyE').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','dojo');
  await touchWalk(page,cdp,960);await button(page,'KeyE').tap();const arena=page.locator('#combat-focus');await expect(arena).toHaveAttribute('data-phase','fighting');
  await page.screenshot({path:'.cache/stage6/touch-fight.png'});
  const before=Number(await arena.getAttribute('data-player-x')),move=await point(page,'KeyD',1),attack=await point(page,'KeyQ',2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move]});
  await expect.poll(async()=>Number(await arena.getAttribute('data-player-x'))).toBeGreaterThan(before+20);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move,attack]});await expect(arena).toHaveAttribute('data-player-action','attack');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(arena).toHaveAttribute('data-player-action','idle');
  await expect(button(page,'Space')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(page,'KeyA',1)]});
  await expect(button(page,'KeyA')).toHaveAttribute('aria-pressed','true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(button(page,'KeyA')).toHaveAttribute('aria-pressed','false');
  await expect(arena).toHaveAttribute('data-player-action','idle');
  const dodge=await point(page,'ShiftLeft',2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[dodge]});
  await expect(button(page,'ShiftLeft')).toHaveAttribute('aria-pressed','true');
  await expect(arena).toHaveAttribute('data-player-action','idle');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[dodge,move]});
  await expect(arena).toHaveAttribute('data-player-dodge-direction','1');
  await expect(arena).toHaveAttribute('data-player-dodge-forward','true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('#fight-pause').tap();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.touch-controls')).toBeHidden();
  await page.locator('#pause-exit').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await page.screenshot({path:'.cache/stage6/touch-lobby.png'});expect(errors).toEqual([]);
});

test('автоблок: урок ждёт отпускания кнопок и защищает от настоящего попадания',async({page,context})=>{
  await seededLesson(page,'block');const cdp=await context.newCDPSession(page),arena=page.locator('#tutorial-focus');
  await expect(button(page,'Space')).toHaveCount(0);
  // Both arrows cancel movement, but the player is still giving input.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(page,'KeyA',1),await point(page,'KeyD',2)]});
  await expect(button(page,'KeyA')).toHaveAttribute('aria-pressed','true');
  await expect(button(page,'KeyD')).toHaveAttribute('aria-pressed','true');
  await expect(coach(page,'guard')).toContainText('Отпусти');
  await expect(arena).toHaveAttribute('data-time-scale','0');
  const windup=await arena.getAttribute('data-enemy-ms');
  await page.waitForTimeout(750);
  await expect(arena).toHaveAttribute('data-enemy-ms',windup!);
  await expect(arena).toHaveAttribute('data-step','block');
  await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','false');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(button(page,'KeyA')).toHaveAttribute('aria-pressed','false');
  await expect(button(page,'KeyD')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','true');
  await expect(page.locator('#tutorial-hp-text')).toHaveText('100 / 100');
  await expect(arena).toHaveAttribute('data-step','dodge');
});

test('новая игра: первые задания обучения выполняются сенсорными кнопками',async({page,context})=>{
  await page.goto('/');await page.locator('#start-game').tap();const arena=page.locator('#tutorial-focus');
  await expect(arena).toHaveAttribute('data-step','movement');const cdp=await context.newCDPSession(page);
  for(const [code,id,check] of [['KeyA','move-left',0],['KeyD','move-right',1]] as const){
    await expect(coach(page,id)).toBeVisible();
    await expect(button(page,code)).toHaveAttribute('data-tutorial-highlight',/.*/);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(page,code,1)]});
    try{await expect(page.locator(`[data-check="${check}"]`)).toHaveAttribute('data-done','true');}
    finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  }
  await expect(arena).toHaveAttribute('data-step','attacks');await expect(coach(page,'strike-1')).toBeVisible();
  await expect(button(page,'KeyQ')).toHaveAttribute('data-tutorial-highlight',/.*/);await button(page,'KeyQ').tap();
  await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','true');
  await page.locator('#tutorial-skip').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
});

test('карьерный бой: мобильный автоблок защищает от бота, пауза объясняет новое управление',async({page})=>{
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();
  const run=saves.beginCareer('kim')!;
  saves.checkpointCareer(run.id,{...run,playerX:780,enemyX:950});
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').tap();
  await page.locator('#interact-object').tap();await page.locator('[data-opponent="kim"]').tap();await page.locator('#career-start').tap();
  const arena=page.locator('#combat-focus');await expect(arena).toHaveAttribute('data-phase','fighting');
  await expect(arena).toHaveAttribute('data-player-action','block');
  await expect(arena).toHaveAttribute('data-player-hp','100');
  await page.locator('#fight-pause').tap();
  await expect(page.locator('.combat-pause')).toContainText('Блок в покое');
  await expect(page.locator('.fight-combo-note')).toContainText('Отпусти все кнопки');
  await expect(button(page,'Space')).toHaveCount(0);
});

for(const [width,height] of [[320,568],[844,390]])test(`сенсорные кнопки доступны и не пересекаются ${width}x${height}`,async({page})=>{
  await desktopViewport(page,{width,height});await page.goto('/');await page.locator('#start-game').tap();
  await expect(coach(page,'move-left')).toBeVisible();
  const codes=['KeyA','KeyD','ShiftLeft','KeyQ','KeyW','KeyE'];const boxes=[];
  await expect(button(page,'Space')).toHaveCount(0);
  for(const code of codes){await expect(button(page,code)).toBeInViewport();const box=(await button(page,code).boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);boxes.push(box);}
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    if(i<2 || j<2)expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
    else expect(Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2)).toBeGreaterThanOrEqual((a.width+b.width)/2);
  }
  const left=boxes[0],right=boxes[1],dodge=boxes[2],q=boxes[3],w=boxes[4],e=boxes[5];
  expect(left.x+left.width).toBeLessThanOrEqual(right.x);
  expect(right.x+right.width).toBeLessThanOrEqual(Math.min(q.x,w.x,e.x,dodge.x));
  // The three attacks and lower dodge form the four-button diamond from the sketch.
  expect(q.x+q.width/2).toBeLessThan(w.x+w.width/2);
  expect(w.x+w.width/2).toBeLessThan(e.x+e.width/2);
  expect(w.y+w.height/2).toBeLessThan(q.y+q.height/2);
  expect(Math.abs(q.y+q.height/2-e.y-e.height/2)).toBeLessThan(2);
  expect(dodge.y+dodge.height/2).toBeGreaterThan(q.y+q.height/2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.cache/stage6/touch-tutorial-${width}.png`});
  const card=page.locator('#tutorial-card');
  expect(await card.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  await expect(card.locator('kbd')).toHaveCount(0);
  await expect(button(page,'KeyA')).toHaveAttribute('data-tutorial-highlight',/.*/);
  await skipTutorial(page);
});
