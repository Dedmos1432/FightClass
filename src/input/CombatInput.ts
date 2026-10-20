import type { AttackSlot } from '../config/combat';

export class CombatInput {
  private readonly held = new Set<string>();
  private readonly events = new AbortController();
  constructor(private readonly blocked: () => boolean, private readonly attack: (slot: AttackSlot) => void,
    private readonly dodge: () => void, private readonly pause: () => void) {
    document.addEventListener('keydown', this.onDown, { signal: this.events.signal });
    document.addEventListener('keyup', event => this.held.delete(event.code), { signal: this.events.signal });
    window.addEventListener('blur', () => { this.clear(); this.pause(); }, { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); this.pause(); } }, { signal: this.events.signal });
  }
  get direction(): number { return Number(this.held.has('KeyD') || this.held.has('ArrowRight')) - Number(this.held.has('KeyA') || this.held.has('ArrowLeft')); }
  get block(): boolean { return this.held.has('Space'); }
  clear(): void { this.held.clear(); }
  destroy(): void { this.clear(); this.events.abort(); }
  private readonly onDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.code === 'Escape') { event.preventDefault(); this.clear(); this.pause(); return; }
    if (this.blocked() || (event.target as HTMLElement | null)?.closest('input,select,textarea,[contenteditable="true"]')) return;
    const codes = ['KeyA','KeyD','ArrowLeft','ArrowRight','Space','KeyJ','KeyK','KeyL','ShiftLeft','ShiftRight'];
    if (!codes.includes(event.code)) return;
    event.preventDefault(); this.held.add(event.code);
    const slot = ['KeyJ','KeyK','KeyL'].indexOf(event.code);
    if (slot >= 0) this.attack(slot as AttackSlot);
    if (event.code.startsWith('Shift')) this.dodge();
  };
}
