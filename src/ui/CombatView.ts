import type { GameServices } from '../core/GameServices';
import { ScreenView } from './ScreenView';
import { icons } from './icons';
import { getStyle } from '../config/styles';
import { ATTACK_SLOTS, COMBAT } from '../config/combat';
import { type CombatWorld } from '../combat/CombatWorld';
import { type Loadout, moveById } from '../combat/moves';
import type { Opponent } from '../combat/Opponents';
import { rewardFor } from '../combat/EndlessProgress';
import { enemyBoosted, roundRemaining, type SeriesEndReason } from '../combat/RoundRules';

const clock = (ms: number): string => {
  const seconds=Math.ceil(ms/1000);
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
};
const boostPercent = Math.round(COMBAT.enemyDamageBoost*100);

export class CombatView extends ScreenView {
  constructor(services: GameServices, readonly loadout: Loadout) {
    super(services, 'fight', `
      <section class="fight-hud" aria-label="Показатели поединка">
        <div class="fight-card player-card"><div class="fight-corner-label"><span>ТВОЙ УГОЛ</span><span>HP</span></div><div class="fight-name"><strong>ТВОЙ БОЕЦ</strong><span>${getStyle(services.saves.lobbyState.style).name}</span></div>
          <div class="fight-health" role="progressbar" aria-label="HP игрока" aria-valuemin="0"><span></span><b id="fight-player-hp"></b></div>
          <div class="fight-stamina" role="progressbar" aria-label="Выносливость игрока" aria-valuemin="0"><span></span></div>
        </div>
        <div class="streak-card"><span class="fight-timer-label">ВРЕМЯ РАУНДА</span><time id="fight-timer" role="timer" aria-label="Оставшееся время боя">${clock(COMBAT.roundDurationMs)}</time><div class="streak-summary"><span>ПОБЕДЫ</span><strong id="fight-wins">0</strong></div><small id="fight-record"></small></div>
        <div class="fight-card enemy-card"><div class="fight-corner-label"><span>СОПЕРНИК</span><span>HP</span></div><div class="fight-name"><strong id="enemy-name"></strong><span id="enemy-style"></span></div>
          <div class="fight-health" role="progressbar" aria-label="HP соперника" aria-valuemin="0"><span></span><b id="fight-enemy-hp"></b></div>
          <div class="fight-stamina" role="progressbar" aria-label="Выносливость соперника" aria-valuemin="0"><span></span></div>
        </div>
      </section>
      <section class="combat-layer"><div id="combat-focus" tabindex="0" role="application" aria-label="Поединок. A D движение, J K L атаки, пробел блок, Shift уклонение, Escape пауза"></div>
        <div class="fight-round"><span id="fight-round-label"></span><p id="fight-tactic"></p><p id="fight-pressure"></p></div>
        <div class="fight-announcement" id="fight-announcement" role="status" aria-live="polite"></div>
        <div class="fight-bottom"><div class="attack-legend">${loadout.map((move, i) => `<span><kbd>${['J','K','L'][i]}</kbd><b>${moveById(move).name}</b><small>${ATTACK_SLOTS[i].stamina} выносл.</small></span>`).join('')}</div>
          <div class="fight-run-info"><span id="run-reward"></span><small>HP не восстанавливается между соперниками</small></div>
          <button class="button secondary small-button" id="fight-pause">Пауза <kbd>Esc</kbd></button>
        </div>
      </section>`);
    this.root.querySelector('.keyboard-hint')!.innerHTML = '<kbd>A</kbd><kbd>D</kbd> движение <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> атаки <kbd>Space</kbd> блок <kbd>Shift</kbd> уклонение';
    this.focusArena();
  }
  focusArena(): void { this.focus('#combat-focus'); }
  announce(text: string): void {
    const announcement=this.root.querySelector<HTMLElement>('#fight-announcement')!;
    announcement.textContent=text;
    announcement.dataset.kind=text.includes('СИЛЬНЕЕ') ? 'warning' : 'round';
  }
  update(world: CombatWorld, profile: Opponent, wins: number, phase: string, botState: string, roundMs: number): void {
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
    const remaining=roundRemaining(roundMs), boosted=enemyBoosted(roundMs);
    const timer=this.root.querySelector<HTMLElement>('#fight-timer')!;
    timer.textContent=clock(remaining); timer.dataset.urgent=String(remaining<=15_000);
    const pressure=this.root.querySelector<HTMLElement>('#fight-pressure')!;
    pressure.textContent=boosted ? `СОПЕРНИК УСИЛЕН · УРОН +${boostPercent}% ДО КОНЦА БОЯ`
      : `УСИЛЕНИЕ ЧЕРЕЗ ${clock(Math.max(0,COMBAT.enemyBoostAfterMs-roundMs))} · УРОН +${boostPercent}%`;
    pressure.dataset.boosted=String(boosted);
    this.root.querySelector('#run-reward')!.textContent = `Урон ${p.damage} · Награда за серию +${rewardFor(this.services.saves.endless,wins)}`;
    const data = this.root.querySelector<HTMLElement>('#combat-focus')!.dataset;
    Object.assign(data, { phase, playerHp:String(p.hp), enemyHp:String(e.hp), playerX:p.x.toFixed(1), enemyX:e.x.toFixed(1),
      playerAction:p.action, enemyAction:e.action, enemySkin:e.skin, enemyVariant:profile.id, botState, playerFacing:String(p.facing), enemyFacing:String(e.facing), enemyCanDodge:String(e.canDodge),
      wins:String(wins), slot:String(p.slot), combo:String(p.combo), stamina:Math.floor(p.stamina).toString(),
      roundMs:String(roundMs), remainingMs:String(remaining), enemyBoosted:String(boosted), enemyDamage:String(e.damage) });
  }
  showPause(onExit: () => void): void {
    if (this.hasDialog) return;
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">БОЙ ПРИОСТАНОВЛЕН</span><button class="icon-button" data-close aria-label="Продолжить бой">${icons.close}</button></div>
      <h2 id="dialog-title">Пауза</h2>
      <p class="dialog-description">Время остановлено. Серия сохранена — её можно продолжить в центре зала.</p>
      <div class="fight-help" aria-label="Управление бойцом">
        <div><span><kbd>A</kbd><kbd>D</kbd></span><b>Движение</b></div>
        <div><span><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd></span><b>Три атаки</b></div>
        <div><kbd>Space</kbd><b>Держать блок</b></div>
        <div><kbd>Shift</kbd><b>Уклонение назад</b></div>
      </div>
      <p class="fight-combo-note">Для комбинации нажми следующую атаку в конце восстановления. В цепочке — до трёх ударов.</p>
      <div class="fight-rule-note"><b>${COMBAT.roundDurationMs/1000} СЕКУНД НА СОПЕРНИКА</b><p>После первых ${COMBAT.enemyBoostAfterMs/1000} секунд — однократное усиление урона на ${boostPercent}%. Когда время выйдет, побеждает боец с большим процентом HP. Ничья или поражение завершают серию; награда за прошлые победы остаётся.</p></div>
      <button class="button primary dialog-done" data-close>Продолжить бой ${icons.arrow}</button>
      <button class="button secondary dialog-done" id="pause-exit">Сохранить и выйти в лобби</button>`, 'combat-pause');
    this.on('#pause-exit','click',onExit);
  }
  showResult(result: { wins: number; gain: number; damage: number }, onReturn: () => void, reason: SeriesEndReason = 'knockout'): void {
    this.announce('');
    const description=reason==='draw' ? 'Время вышло. Процент оставшегося HP одинаковый — ничья. Награда за прошлые победы сохраняется.'
      : reason==='timeout' ? 'Время вышло. У соперника осталось больше HP в процентах. Награда за прошлые победы сохраняется.'
      : 'Бой завершён нокаутом. Награда за одержанные победы сохранена.';
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">ЗАПИСЬ О ПОЕДИНКЕ</span><span class="result-verdict">${reason==='draw' ? 'НИЧЬЯ' : reason==='timeout' ? 'ВРЕМЯ' : 'K.O.'}</span></div>
      <h2 id="dialog-title">Серия завершена</h2>
      <p class="dialog-description">${description}</p>
      <div class="run-result"><span>ПОБЕДЫ<strong>${result.wins}</strong></span><span>ПРИРОСТ УРОНА<strong>+${result.gain}</strong></span><span>ОБЩИЙ УРОН<strong>${result.damage}</strong></span></div>
      <p class="settings-note">Рекорд: ${this.services.saves.endless.bestStreak}. Результат сохранён. Следующая серия начинается с полным HP.</p>
      <button class="button primary dialog-done" id="result-return">Вернуться в лобби ${icons.arrow}</button>`, 'combat-result');
    this.on('#result-return','click',onReturn);
  }
}
