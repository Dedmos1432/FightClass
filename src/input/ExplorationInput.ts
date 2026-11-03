import { clearVirtualInput, inputSuspended, onVirtualInput } from './VirtualInput';

export class ExplorationInput {
  private readonly held = new Set<string>();
  private readonly touch = new Set<string>();
  private readonly events = new AbortController();

  constructor(private readonly blocked: () => boolean, private readonly interact: () => void, private readonly escape: () => void) {
    document.addEventListener('keydown', this.onDown, { signal: this.events.signal });
    document.addEventListener('keyup', (event) => this.held.delete(event.code), { signal: this.events.signal });
    window.addEventListener('blur', () => this.clear(), { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, { signal: this.events.signal });
    onVirtualInput(command=>{
      if('clear' in command){this.held.clear();this.touch.clear();return;}
      if(!command.down){this.touch.delete(command.code);return;}
      if(this.blocked() || inputSuspended())return;
      if(command.code==='KeyE'){this.clear();this.interact();}
      else if(command.code==='Escape'){this.clear();this.escape();}
      else this.touch.add(command.code);
    },this.events.signal);
  }

  get direction(): number {
    if (this.blocked() || inputSuspended()) { this.clear(); return 0; }
    const left = this.held.has('KeyA') || this.held.has('ArrowLeft') || this.touch.has('KeyA');
    const right = this.held.has('KeyD') || this.held.has('ArrowRight') || this.touch.has('KeyD');
    return Number(right) - Number(left);
  }

  clear(): void { this.held.clear(); this.touch.clear(); clearVirtualInput(); }
  destroy(): void { this.clear(); this.events.abort(); }

  private readonly onDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || this.blocked() || inputSuspended()) return;
    if ((event.target as HTMLElement | null)?.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
      this.held.add(event.code);
    } else if (event.code === 'KeyE' && !event.repeat) {
      event.preventDefault(); this.clear(); this.interact();
    } else if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault(); this.clear(); this.escape();
    }
  };
}
