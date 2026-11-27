import { test,expect,type Page } from '@playwright/test';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { walkTo } from './helpers/walkTo';

interface OrientationSdk {events:Record<string,()=>void>;calls:string[]}
const overlay=(page:Page)=>page.locator('#orientation-prompt');
const ui=(page:Page)=>page.locator('#ui');
const portrait=async(page:Page)=>{
  await page.setViewportSize({width:390,height:844});await expect(overlay(page)).toBeVisible();
  await expect(ui(page)).toHaveAttribute('inert','');
};
const landscape=async(page:Page)=>{
  await page.setViewportSize({width:844,height:390});await expect(overlay(page)).toBeHidden();
};
async function seed(page:Page,room:'gym'|'dojo'):Promise<void>{
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();
  saves.updateLobby({x:room==='gym'?457:1468});
  if(room==='dojo'){
    const run=saves.beginEndless()!;saves.checkpointEndless(run.id,{...run,playerX:200,enemyX:1500});
  }
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:GAME.storage.session,value:saves.current});
}
async function mockSdk(page:Page):Promise<void>{
  await page.addInitScript(()=>{
    const events:Record<string,()=>void>={},calls:string[]=[];
    Object.assign(window,{__orientationSdk:{events,calls}});
    window.YaGames={init:async()=>({
      features:{LoadingAPI:{ready:()=>calls.push('ready')},GameplayAPI:{start:()=>calls.push('start'),stop:()=>calls.push('stop')}},
      on:(event,fn)=>{events[event]=fn;},off:event=>{delete events[event];},
      getPlayer:async()=>({getData:async()=>({}),setData:async()=>{}}),
    })};
  });
}
const emit=(page:Page,event:string)=>page.evaluate(event=>(window as unknown as {__orientationSdk:OrientationSdk}).__orientationSdk.events[event](),event);
const calls=(page:Page)=>page.evaluate(()=>(window as unknown as {__orientationSdk:OrientationSdk}).__orientationSdk.calls);
async function fight(page:Page):Promise<void>{
  await seed(page,'dojo');await page.goto('/');await page.locator('#continue-game').tap();
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await page.locator('[data-touch="KeyE"]').tap();await expect(ui(page)).toHaveAttribute('data-screen','dojo');
  await walkTo(page,960);await page.locator('[data-touch="KeyE"]').tap();
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
}

test.describe('телефон: просьба повернуть устройство',()=>{
  test.use({hasTouch:true,isMobile:true,deviceScaleFactor:3,screen:{width:390,height:844},viewport:{width:390,height:844},reducedMotion:'no-preference'});
  test('при запуске: анимация, заблокированный ввод и автоматическое продолжение после поворота',async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await mockSdk(page);await page.goto('/');
    await expect(overlay(page)).toBeVisible();await expect(overlay(page)).toContainText('Поверни телефон');
    await expect(ui(page)).toHaveAttribute('data-screen','menu');await expect(ui(page)).toHaveAttribute('inert','');
    await expect.poll(()=>calls(page)).toEqual(['ready']);
    await expect(page.locator('.orientation-phone')).toHaveCSS('animation-name','turn-phone');
    const before=(await page.locator('#start-game').boundingBox())!;
    await page.touchscreen.tap(before.x+before.width/2,before.y+before.height/2);await page.keyboard.press('Enter');await page.keyboard.press('Escape');
    await expect(overlay(page)).toBeVisible();await expect(ui(page)).toHaveAttribute('data-screen','menu');
    expect(await page.evaluate(key=>localStorage.getItem(key),GAME.storage.session)).toBeNull();
    await page.screenshot({path:'.cache/orientation/phone-390.png'});
    await landscape(page);await expect(ui(page)).not.toHaveAttribute('inert','');
    const canvas = page.locator('#game canvas');
    await expect(canvas).toHaveAttribute('width', '1688');
    await expect(canvas).toHaveAttribute('height', '780');
    await expect(canvas).toHaveCSS('width', '844px');
    await expect(canvas).toHaveCSS('height', '390px');
    await expect(canvas).toHaveCSS('image-rendering', 'auto');
    await page.locator('#settings').tap();await expect(page.locator('.settings-dialog')).toBeVisible();
    await portrait(page);await page.keyboard.press('Escape');await expect(page.locator('.settings-dialog')).toBeVisible();
    await landscape(page);await expect(page.locator('.settings-dialog')).toBeVisible();
    await page.getByRole('button',{name:'Готово',exact:true}).tap();await page.locator('#start-game').tap();
    await expect(ui(page)).toHaveAttribute('data-screen','tutorial');expect(errors).toEqual([]);
  });
  test('маленький телефон: подсказка помещается, уменьшенное движение отключает анимацию',async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:568});await page.goto('/');
    await expect(overlay(page)).toBeVisible();await expect(page.locator('.orientation-phone')).toHaveCSS('animation-name','none');
    const bounds=await page.locator('.orientation-content').boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(568);
    expect(await overlay(page).evaluate(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:'.cache/orientation/phone-320-reduced.png'});await landscape(page);
    await expect(ui(page)).toHaveAttribute('data-screen','menu');
  });
});

test.describe('поворот телефона во время игры',()=>{
  test.use({hasTouch:true,isMobile:true,screen:{width:390,height:844},viewport:{width:844,height:390}});
  test('таймер, здоровье, звук и ввод заморожены; открытая пауза сохраняется',async({page})=>{
    await page.addInitScript(()=>{
      const Native=window.AudioContext,contexts:AudioContext[]=[];Object.assign(window,{__orientationAudio:contexts});
      window.AudioContext=class extends Native{constructor(){super();contexts.push(this);}};
    });
    await fight(page);const arena=page.locator('#combat-focus');await portrait(page);
    const snapshot=async()=>arena.evaluate(el=>({ms:el.getAttribute('data-round-ms'),x:el.getAttribute('data-player-x'),hp:el.getAttribute('data-player-hp')}));
    const frozen=await snapshot();await page.keyboard.down('d');await page.keyboard.press('q');await page.keyboard.press('Escape');
    await page.waitForTimeout(350);expect(await snapshot()).toEqual(frozen);
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {__orientationAudio:AudioContext[]}).__orientationAudio[0]?.state)).toBe('suspended');
    await page.screenshot({path:'.cache/orientation/fight-paused.png'});
    await landscape(page);await page.keyboard.up('d');
    await expect.poll(async()=>Number(await arena.getAttribute('data-round-ms'))).toBeGreaterThan(Number(frozen.ms));
    expect(await arena.getAttribute('data-player-x')).toBe(frozen.x);
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {__orientationAudio:AudioContext[]}).__orientationAudio[0]?.state)).toBe('running');
    await page.locator('#fight-pause').tap();await portrait(page);await page.keyboard.press('Escape');
    await expect(page.locator('.combat-pause')).toBeVisible();const paused=await snapshot();
    await landscape(page);await expect(page.locator('.combat-pause')).toBeVisible();await page.waitForTimeout(200);expect(await snapshot()).toEqual(paused);
    await page.locator('#pause-exit').tap();await expect(ui(page)).toHaveAttribute('data-screen','lobby');
  });
  test('пауза SDK и поворот независимы: закрытие одного окна не продолжает бой',async({page})=>{
    await mockSdk(page);await fight(page);const arena=page.locator('#combat-focus');
    await portrait(page);await expect.poll(async()=>(await calls(page)).at(-1)).toBe('stop');
    await emit(page,'game_api_pause');await expect(page.locator('#platform-pause')).toBeVisible();await expect(overlay(page)).toBeHidden();
    const frozen=await arena.getAttribute('data-round-ms');await landscape(page);await page.waitForTimeout(200);
    expect(await arena.getAttribute('data-round-ms')).toBe(frozen);await expect(page.locator('#platform-pause')).toBeVisible();
    await page.setViewportSize({width:390,height:844});await emit(page,'game_api_resume');
    await expect(page.locator('#platform-pause')).toBeHidden();await expect(overlay(page)).toBeVisible();await page.waitForTimeout(200);
    expect(await arena.getAttribute('data-round-ms')).toBe(frozen);expect((await calls(page)).at(-1)).toBe('stop');
    await landscape(page);await expect.poll(async()=>Number(await arena.getAttribute('data-round-ms'))).toBeGreaterThan(Number(frozen));
    await expect.poll(async()=>(await calls(page)).at(-1)).toBe('start');
  });
  test('жим: поворот не даёт повторений и не принимает E/Escape под подсказкой',async({page})=>{
    await seed(page,'gym');await page.goto('/');await page.locator('#continue-game').tap();
    await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);await page.locator('[data-touch="KeyE"]').tap();
    await expect(ui(page)).toHaveAttribute('data-screen','gym');
    await walkTo(page,1180);await page.locator('[data-touch="KeyE"]').tap();await page.locator('#bench-tutorial-start').tap();
    await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase','pressing');await portrait(page);
    const before=await page.locator('#bench-percent').textContent();await page.keyboard.press('e');await page.keyboard.press('Escape');await page.waitForTimeout(250);
    await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase','pressing');expect(await page.locator('#bench-percent').textContent()).toBe(before);
    await landscape(page);await expect(page.locator('#bench-percent')).toHaveText('0%');
    await page.locator('#bench-tap').tap();await expect.poll(async()=>Number((await page.locator('#bench-percent').textContent())!.replace('%',''))).toBeGreaterThan(0);
    await expect(page.locator('#bench-reps')).toHaveText('00');
  });
});

test('обычное окно ПК в портретном размере не требует поворота',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#settings')).toBeVisible();
  await expect(overlay(page)).toBeHidden();await page.locator('#settings').click();await expect(page.locator('.settings-dialog')).toBeVisible();
});
test.describe('планшет',()=>{
  test.use({hasTouch:true,screen:{width:768,height:1024},viewport:{width:768,height:1024}});
  test('большой сенсорный экран не считается телефоном',async({page})=>{
    await page.goto('/');await expect(page.locator('#settings')).toBeVisible();await expect(overlay(page)).toBeHidden();
    await page.locator('#settings').tap();await expect(page.locator('.settings-dialog')).toBeVisible();
  });
});
