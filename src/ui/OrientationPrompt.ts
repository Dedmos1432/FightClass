/** The physical screen distinguishes phones from resized desktop/touch windows. */
export function needsLandscape():boolean {
  const touch=navigator.maxTouchPoints>0 || window.matchMedia('(pointer: coarse)').matches;
  return touch && Math.min(screen.width,screen.height)<=600 && window.innerHeight>window.innerWidth;
}

export class OrientationPrompt {
  private readonly dialog:HTMLDialogElement;
  private readonly events=new AbortController();
  private readonly listeners=new Set<()=>void>();
  private value=false;
  private covered=false;
  private destroyed=false;
  private previousFocus:HTMLElement|null=null;

  constructor(){
    this.dialog=document.createElement('dialog');this.dialog.id='orientation-prompt';this.dialog.hidden=true;
    this.dialog.setAttribute('aria-labelledby','orientation-title');
    this.dialog.setAttribute('aria-describedby','orientation-description');
    this.dialog.innerHTML=`<div class="orientation-content">
      <svg class="orientation-symbol" viewBox="0 0 200 160" aria-hidden="true">
        <rect class="orientation-target" x="44" y="50" width="112" height="60" rx="10"/>
        <g class="orientation-phone"><rect x="70" y="24" width="60" height="112" rx="11"/><path d="M90 33h20M94 126h12"/><rect class="orientation-screen" x="77" y="43" width="46" height="70" rx="2"/></g>
        <path class="orientation-arrow" d="M145 18c23 9 37 29 38 52m-13-11 13 12 10-15"/>
      </svg>
      <span class="orientation-caption">FIGHT CLASS</span>
      <h1 id="orientation-title">Поверни телефон</h1>
      <p id="orientation-description">Переверни устройство горизонтально,<br/>чтобы продолжить игру.</p>
      <small>Игра продолжится автоматически</small>
    </div>`;
    this.dialog.addEventListener('cancel',event=>event.preventDefault(),{signal:this.events.signal});
    document.body.append(this.dialog);
    window.addEventListener('resize',this.update,{signal:this.events.signal});
    window.addEventListener('orientationchange',this.update,{signal:this.events.signal});
    this.update();
  }
  get blocked():boolean { return this.value; }
  subscribe(listener:()=>void):()=>void { this.listeners.add(listener);return()=>this.listeners.delete(listener); }
  setCovered(value:boolean):void { this.covered=value;this.render(); }
  private readonly update=():void=>{
    const next=needsLandscape();if(next===this.value)return;
    this.value=next;this.render();this.listeners.forEach(listener=>listener());
  };
  private render():void {
    const show=this.value&&!this.covered;
    if(show&&!this.dialog.open){
      const active=document.activeElement;
      if(active instanceof HTMLElement && active!==document.body && !active.closest('#platform-pause,#orientation-prompt'))this.previousFocus=active;
      this.dialog.hidden=false;this.dialog.showModal();
    }else if(!show){
      const wasOpen=this.dialog.open;
      if(wasOpen)this.dialog.close();this.dialog.hidden=true;
      if(wasOpen&&!this.value&&!this.covered)queueMicrotask(()=>{
        if(this.destroyed||this.value||this.covered)return;
        const previous=this.previousFocus;
        if(previous?.isConnected && previous.getClientRects().length && !previous.closest('[inert]'))previous.focus({preventScroll:true});
        else document.querySelector<HTMLElement>('#ui dialog[open] button,#continue-game:not(:disabled),#start-game,#world-focus,#combat-focus,#tutorial-focus')?.focus({preventScroll:true});
      });
    }
  }
  destroy():void {
    this.destroyed=true;this.events.abort();this.listeners.clear();
    if(this.dialog.open)this.dialog.close();this.dialog.remove();
  }
}
