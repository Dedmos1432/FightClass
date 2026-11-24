import type { AttackSlot, DodgeDirection } from '../config/combat';
import { ATTACK_KEYS } from '../config/controls';
import { clearVirtualInput, inputSuspended, onVirtualInput } from './VirtualInput';

const movementKeys = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];
const dodgeKeys = ['ShiftLeft', 'ShiftRight'];
const combatKeys = new Set([...movementKeys, ...dodgeKeys, 'Space', ...ATTACK_KEYS.map(key => key.code)]);

export class CombatInput {
  private readonly held = new Set<string>();
  private readonly touch = new Set<string>();
  private readonly events = new AbortController();
  constructor(private readonly blocked: () => boolean, private readonly attack: (slot: AttackSlot) => void,
    private readonly dodge: (direction: DodgeDirection) => void, private readonly pause: () => void, private readonly releaseBuffered: () => void = () => {},
    private readonly automaticGuard: () => boolean = () => false) {
    document.addEventListener('keydown', this.onDown, { signal: this.events.signal });
    document.addEventListener('keyup', event => this.held.delete(event.code), { signal: this.events.signal });
    window.addEventListener('blur', () => { this.clear(); this.pause(); }, { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); this.pause(); } }, { signal: this.events.signal });
    onVirtualInput(command=>{
      if('clear' in command){this.held.clear();this.touch.clear();this.releaseBuffered();return;}
      if(!command.down){this.touch.delete(command.code);return;}
      if(command.code==='Escape'){this.clear();this.pause();return;}
      if(this.blocked() || inputSuspended())return;
      this.press(this.touch, command.code);
    },this.events.signal);
  }
  private has(code:string):boolean { return this.held.has(code)||this.touch.has(code); }
  get direction(): DodgeDirection | 0 {
    if (this.blocked() || inputSuspended()) return 0;
    const left = this.has('KeyA') || this.has('ArrowLeft');
    const right = this.has('KeyD') || this.has('ArrowRight');
    return left === right ? 0 : right ? 1 : -1;
  }
  get block(): boolean { return !this.blocked() && !inputSuspended() && this.has('Space'); }
  get autoBlock(): boolean {
    return this.automaticGuard() && !this.blocked() && !inputSuspended() && this.held.size===0 && this.touch.size===0;
  }
  clear(): void { this.held.clear(); this.touch.clear(); this.releaseBuffered(); clearVirtualInput(); }
  destroy(): void { this.clear(); this.events.abort(); }
  private readonly onDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || inputSuspended()) return;
    if (event.code === 'Escape') { event.preventDefault(); this.clear(); this.pause(); return; }
    if (this.blocked() || (event.target as HTMLElement | null)?.closest('input,select,textarea,[contenteditable="true"]')) return;
    if (!combatKeys.has(event.code)) return;
    event.preventDefault();
    this.press(this.held, event.code);
  };
  private dodgeChord(): DodgeDirection | 0 {
    return dodgeKeys.some(code => this.has(code)) ? this.direction : 0;
  }
  private press(keys: Set<string>, code: string): void {
    if (keys.has(code)) return;
    const previousChord = this.dodgeChord();
    keys.add(code);
    const slot = ATTACK_KEYS.findIndex(key => key.code === code);
    if (slot >= 0) this.attack(slot as AttackSlot);
    const chord = this.dodgeChord();
    if (chord !== 0 && chord !== previousChord) this.dodge(chord);
  }
}
