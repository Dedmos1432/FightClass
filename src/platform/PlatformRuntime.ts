import type Phaser from 'phaser';
import type { GameServices } from '../core/GameServices';
import { setInputSuspended } from '../input/VirtualInput';
import type { CloudSaves } from './CloudSaves';
import type { PlatformService } from './YandexPlatform';
import type { OrientationPrompt } from '../ui/OrientationPrompt';

export function bindPlatform(game:Phaser.Game,services:GameServices,platform:PlatformService,cloud:CloudSaves|null,orientation:OrientationPrompt):()=>void {
  const events=new AbortController(),ui=document.querySelector<HTMLElement>('#ui')!;
  const cover=document.createElement('dialog');cover.id='platform-pause';cover.hidden=true;
  cover.setAttribute('aria-label','Пауза платформы');cover.addEventListener('cancel',event=>event.preventDefault());
  cover.innerHTML='<b>Игра приостановлена</b><p>Продолжим, когда закроется окно платформы.</p>';document.body.append(cover);
  let suspended=false;
  const ready=()=>Boolean(ui.querySelector('.screen')) && !['loading','load-error'].includes(ui.dataset.screen??'loading');
  const suspend=()=>{
    const next=platform.paused||document.hidden||orientation.blocked;ui.inert=next;
    ui.querySelectorAll('dialog').forEach(dialog=>{dialog.inert=next;});
    orientation.setCovered(platform.paused||document.hidden);
    if(platform.paused){cover.hidden=false;if(!cover.open)cover.showModal();}
    else{if(cover.open)cover.close();cover.hidden=true;}
    if(next===suspended)return;suspended=next;
    setInputSuspended(next);services.audio.setSuspended(next);
    if(next){
      window.dispatchEvent(new Event('fightclass-suspend'));services.saves.touch();void cloud?.flush();
      platform.setPlaying(false);if(ready())game.loop.sleep();
    }else{cover.hidden=true;game.loop.wake();}
  };
  const unsubscribe=platform.subscribe(suspend);
  const unsubscribeOrientation=orientation.subscribe(suspend);
  document.addEventListener('visibilitychange',suspend,{signal:events.signal});
  window.addEventListener('pagehide',()=>{window.dispatchEvent(new Event('fightclass-suspend'));services.saves.touch();void cloud?.flush();},{signal:events.signal});
  const unlock=()=>services.audio.unlock();
  document.addEventListener('pointerdown',unlock,{signal:events.signal});document.addEventListener('keydown',unlock,{signal:events.signal});
  const tick=()=>{
    if(ready())platform.markReady();
    if(suspended){if(ready())game.loop.sleep();return;}
    const screen=ui.dataset.screen??'loading',dialog=Boolean(ui.querySelector('dialog[open]'));
    const phase=ui.querySelector<HTMLElement>('#combat-focus')?.dataset.phase;
    const playing=!suspended&&!dialog && (['lobby','gym','dojo'].includes(screen) ||
      (['fight','career-fight'].includes(screen)&&['countdown','fighting'].includes(phase??'')) ||
      (screen==='tutorial'&&ui.querySelector<HTMLElement>('#tutorial-focus')?.dataset.step!=='club'));
    platform.setPlaying(playing);services.audio.setGameplayActive(playing);
  };
  game.events.on('poststep',tick);suspend();
  return()=>{events.abort();unsubscribe();unsubscribeOrientation();game.events.off('poststep',tick);if(cover.open)cover.close();cover.remove();ui.inert=false;ui.querySelectorAll('dialog').forEach(dialog=>{dialog.inert=false;});setInputSuspended(false);cloud?.destroy();platform.destroy();services.audio.destroy();};
}
