export interface CloudPlayer { getData(keys?:string[]):Promise<Record<string,unknown>>;setData(data:Record<string,unknown>,flush?:boolean):Promise<void> }
export interface YandexSdk {
  features:{LoadingAPI?:{ready():void};GameplayAPI?:{start():void;stop():void}};
  on(event:'game_api_pause'|'game_api_resume',listener:()=>void):void;
  off(event:'game_api_pause'|'game_api_resume',listener:()=>void):void;
  getPlayer():Promise<CloudPlayer>;
}
declare global { interface Window { YaGames?:{init():Promise<YandexSdk>} } }
export function deadline<T>(promise:Promise<T>,ms:number):Promise<T> {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Platform timeout')),ms);
    promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
export async function initializeYandex(enabled:boolean):Promise<PlatformService> {
  if(!enabled && !window.YaGames)return new PlatformService(null);
  try {
    if(!window.YaGames)await deadline(new Promise<void>((resolve,reject)=>{
      const script=document.createElement('script');script.src='/sdk.js';script.async=true;
      script.onload=()=>resolve();script.onerror=()=>reject(new Error('SDK unavailable'));document.head.append(script);
    }),8000);
    return new PlatformService(await deadline(window.YaGames!.init(),8000));
  } catch { return new PlatformService(null); }
}
/** Idempotent platform events, independent of Phaser and safe outside Yandex Games. */
export class PlatformService {
  private ready=false;
  private playing=false;
  private pauseValue=false;
  private readonly listeners=new Set<(paused:boolean)=>void>();
  private readonly pause=()=>this.changePause(true);
  private readonly resume=()=>this.changePause(false);
  constructor(readonly sdk:YandexSdk|null){sdk?.on('game_api_pause',this.pause);sdk?.on('game_api_resume',this.resume);}
  get paused():boolean {return this.pauseValue;}
  markReady():void {if(this.ready)return;this.ready=true;try{this.sdk?.features.LoadingAPI?.ready();}catch{/* Keep local play available. */}}
  setPlaying(value:boolean):void {
    const active=value&&!this.paused;if(active===this.playing)return;this.playing=active;
    try{if(active)this.sdk?.features.GameplayAPI?.start();else this.sdk?.features.GameplayAPI?.stop();}catch{/* Optional telemetry. */}
  }
  subscribe(listener:(paused:boolean)=>void):()=>void {this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  private changePause(value:boolean):void {if(value===this.pauseValue)return;this.pauseValue=value;if(value)this.setPlaying(false);this.listeners.forEach(listener=>listener(value));}
  destroy():void {this.setPlaying(false);this.sdk?.off('game_api_pause',this.pause);this.sdk?.off('game_api_resume',this.resume);this.listeners.clear();}
}
