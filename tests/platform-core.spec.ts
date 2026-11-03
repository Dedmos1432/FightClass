import { test,expect } from '@playwright/test';
import { PlatformService, type CloudPlayer, type YandexSdk } from '../src/platform/YandexPlatform';
import { CloudSaves,CLOUD_KEY } from '../src/platform/CloudSaves';
import { StorageService } from '../src/services/StorageService';
import { SaveService } from '../src/services/SaveService';
import { GAME } from '../src/config/game';

function mock(remote:unknown={}) {
  const events=new Map<string,()=>void>(),calls:string[]=[],writes:Record<string,unknown>[]=[];
  const player:CloudPlayer={getData:async()=>({[CLOUD_KEY]:remote}),setData:async data=>{writes.push(structuredClone(data));}};
  const sdk:YandexSdk={features:{LoadingAPI:{ready:()=>calls.push('ready')},GameplayAPI:{start:()=>calls.push('start'),stop:()=>calls.push('stop')}},
    on:(key,listener)=>{events.set(key,listener);},off:(key)=>{events.delete(key);},getPlayer:async()=>player};
  return {events,calls,writes,player,sdk};
}
const saved=()=>{const service=new SaveService(new StorageService(null));service.startNew();service.skipTutorial();return service.current!;};

test('SDK: готовность однократная, разметка не дублируется, пауза платформы не запускает меню',()=>{
  const m=mock(),platform=new PlatformService(m.sdk),paused:boolean[]=[];platform.subscribe(value=>paused.push(value));
  platform.markReady();platform.markReady();platform.setPlaying(false);platform.setPlaying(true);platform.setPlaying(true);
  m.events.get('game_api_pause')!();platform.setPlaying(true);m.events.get('game_api_resume')!();
  expect(m.calls).toEqual(['ready','start','stop']);expect(paused).toEqual([true,false]);
  platform.setPlaying(true);platform.setPlaying(false);m.events.get('game_api_pause')!();m.events.get('game_api_resume')!();
  expect(m.calls.slice(-2)).toEqual(['start','stop']);platform.destroy();expect(m.events.size).toBe(0);
});
test('SDK: игра вне платформы не зависит от SDK и поддерживает тот же цикл состояний',()=>{
  const platform=new PlatformService(null);platform.markReady();platform.setPlaying(true);platform.setPlaying(false);platform.destroy();
  expect(platform.paused).toBe(false);
});
test('облако: целиком восстанавливает более новое проверенное сохранение до создания SaveService',async()=>{
  const local=saved(),remote={...saved(),updatedAt:'2090-01-01T00:00:00.000Z'};
  const storage=new StorageService(null);storage.write(GAME.storage.session,local);const m=mock(remote);
  const cloud=await CloudSaves.connect(storage,m.player);
  expect(new SaveService(storage).current?.id).toBe(remote.id);cloud.destroy();
});
test('облако: старое или повреждённое сохранение не перезаписывает локальное; начатая новая игра защищена от поздней загрузки',async()=>{
  for(const remote of [{...saved(),updatedAt:'2000-01-01T00:00:00.000Z'},null,{version:99}]){
    const storage=new StorageService(null),local=saved();storage.write(GAME.storage.session,local);
    const cloud=await CloudSaves.connect(storage,mock(remote).player);expect(new SaveService(storage).current?.id).toBe(local.id);cloud.destroy();
  }
  const storage=new StorageService(null),m=mock(),remote={...saved(),updatedAt:'2090-01-01T00:00:00.000Z'};
  let respond!:(data:Record<string,unknown>)=>void;
  m.player.getData=()=>new Promise(resolve=>{respond=resolve;});
  const connecting=CloudSaves.connect(storage,m.player),local=saved();storage.write(GAME.storage.session,local);
  respond({[CLOUD_KEY]:remote});const cloud=await connecting;expect(new SaveService(storage).current?.id).toBe(local.id);cloud.destroy();
});
test('облако: частые checkpoints объединяются, запросы разделены 10 секундами, последняя версия не теряется',async()=>{
  const storage=new StorageService(null),m=mock();let now=0;
  const cloud=new CloudSaves(storage,m.player,()=>now),local=saved();storage.write(GAME.storage.session,local);
  await cloud.flush();expect(m.writes).toHaveLength(1);
  for(let i=0;i<20;i++)storage.write(GAME.storage.session,{...local,player:{...local.player!,x:500+i}});
  await cloud.flush();expect(m.writes).toHaveLength(1);now=10_000;await cloud.flush();expect(m.writes).toHaveLength(2);
  expect((m.writes[1][CLOUD_KEY] as typeof local).player?.x).toBe(519);cloud.destroy();
});
test('облако: ошибка отправки сохраняет локальный прогресс и допускает повтор, уничтожение отключает новые запросы',async()=>{
  const storage=new StorageService(null),m=mock();let now=0,attempts=0;
  m.player.setData=async()=>{if(++attempts===1)throw new Error('offline');};
  const cloud=new CloudSaves(storage,m.player,()=>now),local=saved();storage.write(GAME.storage.session,local);
  await cloud.flush();expect(new SaveService(storage).current?.id).toBe(local.id);
  now=10_000;await cloud.flush();expect(attempts).toBe(2);cloud.destroy();
  storage.write(GAME.storage.session,saved());now=20_000;await cloud.flush();expect(attempts).toBe(2);
});
