import { SettingsService } from './SettingsService';

/** Short, locally synthesized UI tones. No network audio or autoplay. */
export class AudioService {
  private context: AudioContext | null = null;

  constructor(private readonly settings: SettingsService) {}

  play(kind: 'select' | 'open' = 'select'): void {
    const { muted, volume } = this.settings.current;
    if (muted || volume <= 0) return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      void context.resume().then(() => {
        if (this.settings.current.muted || this.settings.current.volume <= 0) return;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const now = context.currentTime;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(kind === 'open' ? 330 : 440, now);
        oscillator.frequency.exponentialRampToValueAtTime(kind === 'open' ? 660 : 320, now + 0.08);
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(this.settings.current.volume * 0.07, now + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        oscillator.connect(envelope);
        envelope.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.12);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      }).catch(() => { /* Audio is optional when the browser blocks it. */ });
    } catch { /* Browsers without Web Audio can still run the menu. */ }
  }

  suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
  }
}
