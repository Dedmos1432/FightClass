import type { ScreenView } from './ScreenView';
import { clearVirtualInput, inputSuspended, onVirtualInput, sendVirtualInput } from '../input/VirtualInput';

/** Pointer capture and per-pointer ownership allow moving, blocking and attacking together. */
export class TouchControls {
  private readonly pointers=new Map<number,{code:string;button:HTMLButtonElement}>();
  constructor(view:ScreenView,combat:boolean) {
    const button=(code:string,label:string,caption:string)=>`<button type="button" data-touch="${code}" aria-label="${caption}" aria-pressed="false"><b>${label}</b><span>${caption}</span></button>`;
    view.root.querySelector('.screen')!.insertAdjacentHTML('beforeend',`<nav class="touch-controls" aria-label="Сенсорное управление">
      <div class="touch-movement">${button('KeyA','←','Влево')}${button('KeyD','→','Вправо')}</div>
      <div class="touch-actions">${combat ? button('Space','▰','Блок')+button('ShiftLeft','↶','Уклонение')+button('KeyQ','Q','Удар 1')+button('KeyW','W','Удар 2')+button('KeyE','E','Удар 3') : button('Escape','↩','Назад')+button('KeyE','E','Действие')}</div>
    </nav>`);
    for(const node of view.root.querySelectorAll<HTMLButtonElement>('[data-touch]')) {
      node.addEventListener('pointerdown',event=>{
        if(view.hasDialog || inputSuspended() || event.button>0)return;
        event.preventDefault();node.setPointerCapture(event.pointerId);
        const code=node.dataset.touch!;
        const already=[...this.pointers.values()].some(p=>p.code===code);
        this.pointers.set(event.pointerId,{code,button:node});node.setAttribute('aria-pressed','true');
        view.services.audio.unlock();if(!already)sendVirtualInput(code,true);
      },{signal:view.events.signal});
      const release=(event:PointerEvent)=>{
        const entry=this.pointers.get(event.pointerId);if(!entry)return;
        this.pointers.delete(event.pointerId);
        if(![...this.pointers.values()].some(p=>p.code===entry.code)){
          entry.button.setAttribute('aria-pressed','false');sendVirtualInput(entry.code,false);
        }
      };
      for(const event of ['pointerup','pointercancel','lostpointercapture'] as const)node.addEventListener(event,release,{signal:view.events.signal});
      node.addEventListener('contextmenu',event=>event.preventDefault(),{signal:view.events.signal});
    }
    onVirtualInput(command=>{if('clear' in command){this.pointers.clear();view.root.querySelectorAll('[data-touch]').forEach(node=>node.setAttribute('aria-pressed','false'));}},view.events.signal);
    window.addEventListener('blur',clearVirtualInput,{signal:view.events.signal});
    window.addEventListener('orientationchange',clearVirtualInput,{signal:view.events.signal});
  }
}
