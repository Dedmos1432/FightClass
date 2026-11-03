import { test,expect,type Page,type CDPSession } from '@playwright/test';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { skipTutorial } from './helpers/tutorial';

test.use({hasTouch:true,viewport:{width:844,height:390}});
const button=(page:Page,code:string)=>page.locator(`[data-touch="${code}"]`);
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

test('мультитач: движение с атакой, удержание блока, отмена касания, уклонение и пауза',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await seeded(page,true);const cdp=await context.newCDPSession(page);
  await button(page,'KeyE').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','dojo');
  await touchWalk(page,cdp,960);await button(page,'KeyE').tap();const arena=page.locator('#combat-focus');await expect(arena).toHaveAttribute('data-phase','fighting');
  await page.screenshot({path:'.cache/stage6/touch-fight.png'});
  const before=Number(await arena.getAttribute('data-player-x')),move=await point(page,'KeyD',1),attack=await point(page,'KeyQ',2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move]});
  await expect.poll(async()=>Number(await arena.getAttribute('data-player-x'))).toBeGreaterThan(before+20);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move,attack]});await expect(arena).toHaveAttribute('data-player-action','attack');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(arena).toHaveAttribute('data-player-action','idle');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(page,'Space',1)]});await expect(arena).toHaveAttribute('data-player-action','block');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(button(page,'Space')).toHaveAttribute('aria-pressed','false');
  await expect(arena).not.toHaveAttribute('data-player-action','block');
  await button(page,'ShiftLeft').tap();await expect(arena).toHaveAttribute('data-player-action','dodge');
  await page.locator('#fight-pause').tap();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.touch-controls')).toBeHidden();
  await page.locator('#pause-exit').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await page.screenshot({path:'.cache/stage6/touch-lobby.png'});expect(errors).toEqual([]);
});

test('новая игра: первые задания обучения выполняются сенсорными кнопками',async({page,context})=>{
  await page.goto('/');await page.locator('#start-game').tap();const arena=page.locator('#tutorial-focus');
  await expect(arena).toHaveAttribute('data-step','movement');const cdp=await context.newCDPSession(page);
  for(const [code,check] of [['KeyA',0],['KeyD',1]] as const){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(page,code,1)]});
    try{await expect(page.locator(`[data-check="${check}"]`)).toHaveAttribute('data-done','true');}
    finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  }
  await expect(arena).toHaveAttribute('data-step','attacks');await button(page,'KeyQ').tap();
  await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','true');
  await page.locator('#tutorial-skip').tap();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
});

for(const [width,height] of [[320,568],[844,390]])test(`сенсорные кнопки доступны и не пересекаются ${width}x${height}`,async({page,context})=>{
  await page.setViewportSize({width,height});await page.goto('/');await page.locator('#start-game').tap();
  const codes=['KeyA','KeyD','Space','ShiftLeft','KeyQ','KeyW','KeyE'];const boxes=[];
  for(const code of codes){await expect(button(page,code)).toBeInViewport();boxes.push((await button(page,code).boundingBox())!);}
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.cache/stage6/touch-tutorial-${width}.png`});
  if(width===320){
    const card=page.locator('#tutorial-card'),box=(await card.boundingBox())!,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height-12,id:1}]});
    for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height-12-i*20,id:1}]});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>card.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  }
  await skipTutorial(page);
});
