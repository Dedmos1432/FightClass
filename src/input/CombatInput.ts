import type { AttackSlot } from '../config/combat';
import { ATTACK_KEYS } from '../config/controls';
import { clearVirtualInput, inputSuspended, onVirtualInput } from './VirtualInput';

export class CombatInput {
  private readonly held = new Set<string>();
  private readonly touch = new Set<string>();
  private readonly events = new AbortController();
  constructor(private readonly blocked: () => boolean, private readonly attack: (slot: AttackSlot) => void,
    private readonly dodge: () => void, private readonly pause: () => void, private readonly releaseBuffered: () => void = () => {}) {
    document.addEventListener('keydown', this.onDown, { signal: this.events.signal });
    document.addEventListener('keyup', event => this.held.delete(event.code), { signal: this.events.signal });
    window.addEventListener('blur', () => { this.clear(); this.pause(); }, { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); this.pause(); } }, { signal: this.events.signal });
    onVirtualInput(command=>{
      if('clear' in command){this.held.clear();this.touch.clear();this.releaseBuffered();return;}
      if(!command.down){this.touch.delete(command.code);return;}
      if(command.code==='Escape'){this.clear();this.pause();return;}
      if(this.blocked() || inputSuspended())return;
      this.touch.add(command.code);this.action(command.code);
    },this.events.signal);
  }
  private has(code:string):boolean { return this.held.has(code)||this.touch.has(code); }
  get direction(): number { return this.blocked() || inputSuspended() ? 0 : Number(this.has('KeyD') || this.has('ArrowRight')) - Number(this.has('KeyA') || this.has('ArrowLeft')); }
  get block(): boolean { return !this.blocked() && !inputSuspended() && this.has('Space'); }
  clear(): void { this.held.clear(); this.touch.clear(); this.releaseBuffered(); clearVirtualInput(); }
  destroy(): void { this.clear(); this.events.abort(); }
  private readonly onDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || inputSuspended()) return;
    if (event.code === 'Escape') { event.preventDefault(); this.clear(); this.pause(); return; }
    if (this.blocked() || (event.target as HTMLElement | null)?.closest('input,select,textarea,[contenteditable="true"]')) return;
    const codes = ['KeyA','KeyD','ArrowLeft','ArrowRight','Space',...ATTACK_KEYS.map(key=>key.code),'ShiftLeft','ShiftRight'];
    if (!codes.includes(event.code)) return;
    event.preventDefault(); this.held.add(event.code);
    this.action(event.code);
  };
  private action(code:string):void {
    const slot = ATTACK_KEYS.findIndex(key=>key.code===code);
    if (slot >= 0) this.attack(slot as AttackSlot);
    if (code.startsWith('Shift')) this.dodge();
  }
}
