import { GAME } from '../config/game';
import { isSessionSave } from '../services/SaveService';
import type { StorageService } from '../services/StorageService';
import { deadline, type CloudPlayer } from './YandexPlatform';
export const CLOUD_KEY='fightClassSession';
const INTERVAL=10_000;
/** Whole validated snapshots preserve matches, tutorial steps and new-game resets together. */
export class CloudSaves {
  private dirty=false;
  private sending=false;
  private closed=false;
  private lastSent=-Infinity;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private readonly unsubscribe:()=>void;
  constructor(private readonly storage:StorageService,private readonly player:CloudPlayer,private readonly now=Date.now){
    this.unsubscribe=storage.subscribe(key=>{if(key===GAME.storage.session){this.dirty=true;this.schedule();}});
  }
  static async connect(storage:StorageService,player:CloudPlayer):Promise<CloudSaves> {
    const original=storage.read(GAME.storage.session);
    const remote=(await deadline(player.getData([CLOUD_KEY]),6000))[CLOUD_KEY];
    const current=storage.read(GAME.storage.session);
    if(JSON.stringify(current)===JSON.stringify(original) && isSessionSave(remote) &&
      (current.status!=='ok' || !isSessionSave(current.value) || Date.parse(remote.updatedAt)>Date.parse(current.value.updatedAt)))storage.write(GAME.storage.session,remote);
    const cloud=new CloudSaves(storage,player);
    if(current.status==='ok' && isSessionSave(current.value)){cloud.dirty=true;cloud.schedule();}
    return cloud;
  }
  private schedule(delay=INTERVAL):void {if(!this.closed&&this.timer===null)this.timer=setTimeout(()=>{this.timer=null;void this.flush();},delay);}
  async flush():Promise<void> {
    if(this.closed || !this.dirty || this.sending)return;
    const remaining=INTERVAL-(this.now()-this.lastSent);
    if(remaining>0){this.schedule(remaining);return;}
    const value=this.storage.read(GAME.storage.session);
    if(value.status!=='ok'||!isSessionSave(value.value))return;
    this.dirty=false;this.sending=true;this.lastSent=this.now();
    try{await deadline(this.player.setData({[CLOUD_KEY]:value.value},true),8000);}
    catch{this.dirty=true;}
    finally{this.sending=false;if(this.dirty)this.schedule();}
  }
  destroy():void {this.closed=true;this.unsubscribe();if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
}
