export type VirtualCommand = { code: string; down: boolean } | { clear: true };
const commands = new EventTarget();
let suspended = false;
export const inputSuspended = (): boolean => suspended;
export function setInputSuspended(value: boolean): void { suspended=value; clearVirtualInput(); }
export function sendVirtualInput(code: string, down: boolean): void {
  if(down && suspended)return;
  commands.dispatchEvent(new CustomEvent<VirtualCommand>('command',{detail:{code,down}}));
}
export function clearVirtualInput(): void { commands.dispatchEvent(new CustomEvent<VirtualCommand>('command',{detail:{clear:true}})); }
export function onVirtualInput(listener:(command:VirtualCommand)=>void,signal:AbortSignal):void {
  commands.addEventListener('command',event=>listener((event as CustomEvent<VirtualCommand>).detail),{signal});
}
