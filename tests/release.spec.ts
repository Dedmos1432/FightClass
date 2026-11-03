import { test,expect,type Page } from '@playwright/test';
import { GAME } from '../src/config/game';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { CLOUD_KEY } from '../src/platform/CloudSaves';
import { walkTo } from './helpers/walkTo';

interface Probe {calls:{name:string;screen?:string}[];writes:Record<string,unknown>[];events:Record<string,()=>void>}
const mockSdk=`window.__sdk={calls:[],writes:[],events:{}};
window.YaGames={init:async()=>({
 features:{LoadingAPI:{ready:()=>window.__sdk.calls.push({name:'ready',screen:document.querySelector('#ui').dataset.screen})},
 GameplayAPI:{start:()=>window.__sdk.calls.push({name:'start'}),stop:()=>window.__sdk.calls.push({name:'stop'})}},
 on:(name,fn)=>window.__sdk.events[name]=fn,off:(name)=>delete window.__sdk.events[name],
 getPlayer:async()=>({getData:async()=>window.__remote||{},setData:async data=>{window.__sdk.writes.push(data);}})
})};`;
async function sdk(page:Page):Promise<void>{await page.route('**/sdk.js',route=>route.fulfill({contentType:'application/javascript',body:mockSdk}));}
const probe=(page:Page)=>page.evaluate(()=>(window as unknown as {__sdk:Probe}).__sdk.calls);
const emit=(page:Page,event:string)=>page.evaluate(event=>(window as unknown as {__sdk:Probe}).__sdk.events[event](),event);
async function audioProbe(page:Page):Promise<void>{
  await page.addInitScript(()=>{
    const Native=window.AudioContext,contexts:AudioContext[]=[],gains:GainNode[]=[];
    Object.assign(window,{__audio:contexts,__gains:gains});
    window.AudioContext=class extends Native{
      constructor(){super();contexts.push(this);}
      createGain():GainNode{const gain=super.createGain();gains.push(gain);return gain;}
    };
  });
}
async function local(page:Page,fight=false):Promise<void>{
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();
  if(fight){const run=saves.beginEndless()!;saves.checkpointEndless(run.id,{...run,playerX:200,enemyX:1500});saves.updateLobby({x:1468});}
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:GAME.storage.session,value:saves.current});
}

test('Yandex build: /sdk.js, Game Ready на интерактивном меню, разметка меню и диалогов',async({page})=>{
  const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await sdk(page);await local(page);await page.goto('/');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','menu');
  await expect.poll(()=>probe(page)).toEqual([{name:'ready',screen:'menu'}]);
  expect(requests.some(url=>new URL(url).pathname==='/sdk.js')).toBe(true);
  await page.locator('#continue-game').click();await expect.poll(async()=>(await probe(page)).at(-1)?.name).toBe('start');
  await page.locator('#lobby-settings').click();await expect.poll(async()=>(await probe(page)).at(-1)?.name).toBe('stop');
  const before=(await probe(page)).length;await emit(page,'game_api_pause');await expect(page.locator('#platform-pause')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.dialog')).toBeVisible();
  await emit(page,'game_api_resume');await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(150);expect((await probe(page)).length).toBe(before);
  await page.keyboard.press('Escape');await expect.poll(async()=>(await probe(page)).at(-1)?.name).toBe('start');
  expect((await probe(page)).filter(call=>call.name==='ready')).toHaveLength(1);expect(errors).toEqual([]);
});

test('пауза платформы замораживает бой и звук, блокирует ввод и возобновляет тот же таймер',async({page})=>{
  await audioProbe(page);
  await sdk(page);await local(page,true);await page.goto('/');await page.locator('#continue-game').click();
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);await page.keyboard.press('e');
  // Resume an actual saved series through the dojo's centre.
  await walkTo(page,960);
  await page.keyboard.press('e');const arena=page.locator('#combat-focus');await expect(arena).toHaveAttribute('data-phase','fighting');
  await emit(page,'game_api_pause');await expect(page.locator('#platform-pause')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__audio:AudioContext[]}).__audio[0]?.state)).toBe('suspended');
  const before=await arena.getAttribute('data-round-ms'),x=await arena.getAttribute('data-player-x');
  await page.keyboard.press('d');await page.keyboard.press('q');await page.waitForTimeout(350);
  expect(await arena.getAttribute('data-round-ms')).toBe(before);expect(await arena.getAttribute('data-player-x')).toBe(x);
  await expect(page.locator('#ui')).toHaveAttribute('inert','');
  await emit(page,'game_api_resume');await expect(page.locator('#platform-pause')).toBeHidden();
  await expect.poll(async()=>Number(await arena.getAttribute('data-round-ms'))).toBeGreaterThan(Number(before));
  expect(await arena.getAttribute('data-player-x')).toBe(x);
  await page.keyboard.press('Escape');await page.locator('#pause-exit').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
});

test('облачное сохранение восстанавливается до меню, затем новая игра отправляет новый снимок',async({page})=>{
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();
  const run=saves.beginBenchSession()!;saves.completeBenchRep(run,1);saves.finishBenchSession(run);
  const remote=saves.current!;
  await page.addInitScript(({key,value})=>{(window as unknown as {__remote:Record<string,unknown>}).__remote={[key]:value};},{key:CLOUD_KEY,value:remote});
  await sdk(page);await page.goto('/');await expect(page.locator('#continue-game')).toBeEnabled();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).id,GAME.storage.session)).toBe(remote.id);
  await page.locator('#continue-game').click();await expect(page.locator('#hp-value')).toHaveText('102');
  await page.locator('#back-menu').click();await page.locator('#start-game').click();await page.locator('#confirm-new').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','tutorial');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__sdk:Probe}).__sdk.writes.length),{timeout:20_000}).toBeGreaterThan(0);
  const latest=await page.evaluate(key=>(window as unknown as {__sdk:Probe}).__sdk.writes.at(-1)![key] as {id:string},CLOUD_KEY);
  expect(latest.id).not.toBe(remote.id);
});

test('недоступный SDK не мешает загрузить игру, локально сохранить и продолжить',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/sdk.js',route=>route.abort());
  await page.goto('/');await page.locator('#start-game').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','tutorial');
  await page.locator('#tutorial-skip').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  const id=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).id,GAME.storage.session);
  await page.reload();await page.locator('#continue-game').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).id,GAME.storage.session)).toBe(id);expect(errors).toEqual([]);
});

test('звук: общий mute действует на мастер-канал, быстрая пауза/resume не оставляет звук выключенным',async({page})=>{
  await audioProbe(page);await sdk(page);await page.goto('/');await page.locator('#settings').click();
  const master=()=>page.evaluate(()=>(window as unknown as {__gains:GainNode[]}).__gains[0]?.gain.value);
  await expect.poll(master).toBeGreaterThan(.2);await page.locator('#sound-enabled').uncheck();await expect.poll(master).toBeLessThan(.001);
  await page.locator('#sound-enabled').check();await expect.poll(master).toBeGreaterThan(.2);await page.keyboard.press('Escape');
  await page.evaluate(()=>{const events=(window as unknown as {__sdk:Probe}).__sdk.events;events.game_api_pause();events.game_api_resume();});
  await expect(page.locator('#platform-pause')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__audio:AudioContext[]}).__audio[0]?.state)).toBe('running');
  expect((await probe(page)).filter(call=>call.name==='start')).toHaveLength(0);
});
