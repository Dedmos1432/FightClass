import type { GameServices } from '../core/GameServices';
import { ScreenView } from './ScreenView';
import { icons } from './icons';
import { getStyle } from '../config/styles';
import { ATTACK_SLOTS } from '../config/combat';
import { type CombatWorld } from '../combat/CombatWorld';
import { type Loadout, moveById } from '../combat/moves';
import type { Opponent } from '../combat/Opponents';
import { rewardFor } from '../combat/EndlessProgress';

export class CombatView extends ScreenView {
  constructor(services: GameServices, readonly loadout: Loadout) {
    super(services, 'fight', `
      <section class="fight-hud" aria-label="Показатели поединка">
        <div class="fight-card player-card"><div class="fight-name"><strong>ТВОЙ БОЕЦ</strong><span>${getStyle(services.saves.lobbyState.style).name}</span></div>
          <div class="fight-health" role="progressbar" aria-label="HP игрока" aria-valuemin="0"><span></span><b id="fight-player-hp"></b></div>
          <div class="fight-stamina" role="progressbar" aria-label="Выносливость игрока" aria-valuemin="0"><span></span></div>
        </div>
        <div class="streak-card"><span>ПОБЕД В СЕРИИ</span><strong id="fight-wins">0</strong><small id="fight-record"></small></div>
        <div class="fight-card enemy-card"><div class="fight-name"><strong id="enemy-name"></strong><span id="enemy-style"></span></div>
          <div class="fight-health" role="progressbar" aria-label="HP соперника" aria-valuemin="0"><span></span><b id="fight-enemy-hp"></b></div>
          <div class="fight-stamina" role="progressbar" aria-label="Выносливость соперника" aria-valuemin="0"><span></span></div>
        </div>
      </section>
      <section class="combat-layer"><div id="combat-focus" tabindex="0" role="application" aria-label="Поединок. A D движение, J K L атаки, пробел блок, Shift уклонение, Escape пауза"></div>
        <div class="fight-round"><span id="fight-round-label"></span><p id="fight-tactic"></p></div>
        <div class="fight-announcement" id="fight-announcement" role="status"></div>
        <div class="fight-bottom"><div class="attack-legend">${loadout.map((move, i) => `<span><kbd>${['J','K','L'][i]}</kbd><b>${moveById(move).name}</b><small>${ATTACK_SLOTS[i].stamina} выносл.</small></span>`).join('')}</div>
          <div class="fight-run-info"><span id="run-reward"></span><small>HP не восстанавливается между соперниками</small></div>
          <button class="button secondary small-button" id="fight-pause">Пауза <kbd>Esc</kbd></button>
        </div>
      </section>`);
    this.root.querySelector('.keyboard-hint')!.innerHTML = '<kbd>A</kbd><kbd>D</kbd> движение <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> атаки <kbd>Space</kbd> блок <kbd>Shift</kbd> уклонение';
    this.focusArena();
  }
  focusArena(): void { this.focus('#combat-focus'); }
  announce(text: string): void { this.root.querySelector('#fight-announcement')!.textContent = text; }
  update(world: CombatWorld, profile: Opponent, wins: number, phase: string, botState: string): void {
    const p = world.player, e = world.enemy;
    for (const [side,f] of [['player',p],['enemy',e]] as const) {
      const health = this.root.querySelector<HTMLElement>(`.${side}-card .fight-health`)!;
      health.setAttribute('aria-valuenow',String(Math.ceil(f.hp))); health.setAttribute('aria-valuemax',String(f.maxHP));
      health.querySelector<HTMLElement>('span')!.style.width = `${f.hp / f.maxHP * 100}%`;
      health.querySelector('b')!.textContent = `${Math.ceil(f.hp)} / ${f.maxHP}`;
      const stamina = this.root.querySelector<HTMLElement>(`.${side}-card .fight-stamina`)!;
      stamina.setAttribute('aria-valuenow',String(Math.floor(f.stamina))); stamina.setAttribute('aria-valuemax',String(f.maxStamina));
      stamina.querySelector<HTMLElement>('span')!.style.width = `${f.stamina / f.maxStamina * 100}%`;
    }
    this.root.querySelector('#enemy-name')!.textContent = profile.name;
    this.root.querySelector('#enemy-style')!.textContent = `${getStyle(profile.style).name} · ${profile.variantName}`;
    this.root.querySelector('#fight-wins')!.textContent = String(wins);
    this.root.querySelector('#fight-record')!.textContent = `РЕКОРД ${this.services.saves.endless.bestStreak}`;
    this.root.querySelector('#fight-round-label')!.textContent = `БОЙ ${wins + 1} · ${profile.difficulty < 4 ? 'НАЧАЛЬНЫЙ' : profile.difficulty < 10 ? 'ОПЫТНЫЙ' : 'МАСТЕР'}`;
    this.root.querySelector('#fight-tactic')!.textContent = `${profile.tactic}${profile.canDodge ? '' : ' Kim не уклоняется.'}`;
    this.root.querySelector('#run-reward')!.textContent = `Урон ${p.damage} · Награда за серию +${rewardFor(this.services.saves.endless,wins)}`;
    const data = this.root.querySelector<HTMLElement>('#combat-focus')!.dataset;
    Object.assign(data, { phase, playerHp:String(p.hp), enemyHp:String(e.hp), playerX:p.x.toFixed(1), enemyX:e.x.toFixed(1),
      playerAction:p.action, enemyAction:e.action, enemySkin:e.skin, enemyVariant:profile.id, botState, playerFacing:String(p.facing), enemyFacing:String(e.facing), enemyCanDodge:String(e.canDodge),
      wins:String(wins), slot:String(p.slot), combo:String(p.combo), stamina:Math.floor(p.stamina).toString() });
  }
  showPause(onExit: () => void): void {
    if (this.hasDialog) return;
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">ПЕРЕВЕДИ ДЫХАНИЕ</span><button class="icon-button" data-close aria-label="Продолжить бой">${icons.close}</button></div>
      <h2 id="dialog-title">Пауза<span class="accent">.</span></h2>
      <p class="dialog-description">Серия сохранена. При выходе её можно продолжить в центре зала. Награда начисляется после поражения.</p>
      <p class="fight-help">A / D — движение<br />J / K / L — три атаки<br />Пробел — держать блок<br />Shift — уклонение назад<br />В конце восстановления нажми следующую атаку для комбинации до трёх ударов.</p>
      <button class="button primary dialog-done" data-close>Продолжить бой ${icons.arrow}</button>
      <button class="button secondary dialog-done" id="pause-exit">Сохранить и выйти в лобби</button>`);
    this.on('#pause-exit','click',onExit);
  }
  showResult(result: { wins: number; gain: number; damage: number }, onReturn: () => void): void {
    this.announce('');
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">СЕРИЯ ЗАВЕРШЕНА</span><span>K.O.</span></div>
      <h2 id="dialog-title">Стань сильнее<span class="accent">.</span></h2>
      <p class="dialog-description">Поражение завершает подход. Заслуженное улучшение остаётся с тобой.</p>
      <div class="run-result"><span>Побед<strong>${result.wins}</strong></span><span>Урон<strong>+${result.gain}</strong></span><span>Теперь<strong>${result.damage}</strong></span></div>
      <p class="settings-note">Рекорд: ${this.services.saves.endless.bestStreak}. Результат сохранён. Следующая серия начинается с полным HP.</p>
      <button class="button primary dialog-done" id="result-return">Вернуться в лобби ${icons.arrow}</button>`);
    this.on('#result-return','click',onReturn);
  }
}
