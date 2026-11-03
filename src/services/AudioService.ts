import { SettingsService } from './SettingsService';

export type Sound = 'select'|'open'|'hit'|'block'|'guard-break'|'dodge'|'knockout'|'victory'|'rep'|'step';
/** Original procedural sounds: no downloads, autoplay or third-party recordings. */
export class AudioService {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private air:GainNode|null=null;
  private noise:AudioBuffer|null=null;
  private suspended=false;
  private active=false;
  private room='menu';
  private lastStep=0;
  constructor(private readonly settings:SettingsService) { settings.subscribe(()=>this.updateVolume()); }
  unlock():void {
    if(this.suspended)return;
    try {
      if(!this.context){
        this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);
        this.noise=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);
        const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        this.createAmbience();this.updateVolume();
      }
      if(this.context.state==='suspended')void this.context.resume().catch(()=>{});
    } catch { /* Audio support is optional. */ }
  }
  setEnvironment(room:string):void { this.room=room;this.updateVolume(); }
  setGameplayActive(active:boolean):void { if(this.active!==active){this.active=active;this.updateVolume();} }
  setSuspended(value:boolean):void {
    this.suspended=value;
    if(value)this.suspend();else if(this.context?.state==='suspended')void this.context.resume().catch(()=>{});
  }
  private updateVolume():void {
    if(!this.context || !this.master)return;
    const {muted,volume}=this.settings.current,now=this.context.currentTime;
    this.master.gain.setTargetAtTime(muted?0:volume,now,.02);
    this.air?.gain.setTargetAtTime(this.active ? (this.room==='gym' ? .015 : .009) : 0,now,.15);
  }
  private createAmbience():void {
    const c=this.context!;
    this.air=c.createGain();this.air.gain.value=0;this.air.connect(this.master!);
    const air=c.createBufferSource(),filter=c.createBiquadFilter();air.buffer=this.noise;air.loop=true;
    filter.type='lowpass';filter.frequency.value=420;air.connect(filter);filter.connect(this.air);air.start();
    const hum=c.createOscillator(),level=c.createGain();hum.frequency.value=55;level.gain.value=.13;
    hum.connect(level);level.connect(this.air);hum.start();
  }
  play(kind:Sound='select'):void {
    if(this.suspended || this.settings.current.muted || this.settings.current.volume<=0)return;
    if(kind==='step' && performance.now()-this.lastStep<260)return;
    if(kind==='step')this.lastStep=performance.now();
    this.unlock();const c=this.context;if(!c || !this.master)return;
    const now=c.currentTime;
    const noise=(duration:number,level:number,frequency:number)=>{
      const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;
      filter.type='lowpass';filter.frequency.value=frequency;
      gain.gain.setValueAtTime(level,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
      source.connect(filter);filter.connect(gain);gain.connect(this.master!);source.start(now);source.stop(now+duration);
      source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    };
    const tone=(frequency:number,end:number,duration:number,level:number,type:OscillatorType='sine',delay=0)=>{
      const source=c.createOscillator(),gain=c.createGain(),start=now+delay;source.type=type;
      source.frequency.setValueAtTime(frequency,start);source.frequency.exponentialRampToValueAtTime(end,start+duration);
      gain.gain.setValueAtTime(.001,start);gain.gain.linearRampToValueAtTime(level,start+.006);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
      source.connect(gain);gain.connect(this.master!);source.start(start);source.stop(start+duration+.01);
      source.onended=()=>{source.disconnect();gain.disconnect();};
    };
    switch(kind){
      case 'hit': noise(.11,.22,1700);tone(130,47,.15,.32);break;
      case 'guard-break': noise(.23,.25,2400);tone(180,40,.26,.28,'triangle');break;
      case 'block': noise(.06,.14,4200);tone(800,240,.09,.1,'triangle');break;
      case 'dodge': noise(.14,.09,3000);break;
      case 'knockout': noise(.3,.14,900);tone(100,32,.55,.23);break;
      case 'victory': tone(660,650,.4,.08,'sine');tone(990,980,.32,.05,'sine',.12);break;
      case 'rep': tone(360,240,.1,.08,'triangle');noise(.07,.09,2700);break;
      case 'step': noise(.045,.06,500);break;
      default: tone(kind==='open'?330:440,kind==='open'?660:320,.1,.07,'triangle');
    }
  }
  suspend():void { if(this.context?.state==='running')void this.context.suspend().catch(()=>{}); }
  destroy():void { if(this.context)void this.context.close().catch(()=>{});this.context=null; }
}
