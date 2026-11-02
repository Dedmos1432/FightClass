import type { GameServices } from '../core/GameServices';
import { ScreenView } from './ScreenView';
import { icons } from './icons';
import { getStyle } from '../config/styles';
import { ATTACK_SLOTS, COMBAT } from '../config/combat';
import { ATTACK_KEYS } from '../config/controls';
import { type CombatWorld } from '../combat/CombatWorld';
import { type Loadout, moveById } from '../combat/moves';
import type { Opponent } from '../combat/Opponents';
import { rewardFor } from '../combat/EndlessProgress';
import { enemyBoosted, roundRemaining, type SeriesEndReason } from '../combat/RoundRules';
import type { CareerOpponent } from '../career/Roster';
import { careerScore, careerWinsNeeded, type CareerScore, type CareerResult } from '../career/Progress';

const clock = (ms: number): string => {
  const seconds=Math.ceil(ms/1000);
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
};
const boostPercent = Math.round(COMBAT.enemyDamageBoost*100);

export class CombatView extends ScreenView {
  private score=careerScore({});
  private roundNumber=1;
  constructor(services: GameServices, readonly loadout: Loadout, private readonly career?: CareerOpponent) {
    super(services, career ? 'career-fight' : 'fight', `
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
      <section class="combat-layer"><div id="combat-focus" tabindex="0" role="application" aria-label="Поединок. A D движение, Q W E атаки, пробел блок, Shift уклонение, Escape пауза"></div>
        <div class="fight-round"><span id="fight-round-label"></span><p id="fight-tactic"></p><p id="fight-pressure"></p></div>
        <div class="fight-announcement" id="fight-announcement" role="status" aria-live="polite"></div>
        <div class="fight-bottom"><div class="attack-legend">${loadout.map((move, i) => `<span><kbd>${ATTACK_KEYS[i].label}</kbd><b>${moveById(move).name}</b><small>${ATTACK_SLOTS[i].stamina} выносл.</small></span>`).join('')}</div>
          <div class="fight-run-info"><span id="run-reward"></span><small>HP не восстанавливается между соперниками</small></div>
          <button class="button secondary small-button" id="fight-pause">Пауза <kbd>Esc</kbd></button>
        </div>
      </section>`);
    this.root.querySelector('.keyboard-hint')!.innerHTML = '<kbd>A</kbd><kbd>D</kbd> движение / разворот блока '+ATTACK_KEYS.map(key=>`<kbd>${key.label}</kbd>`).join('')+' атаки <kbd>Space</kbd> блок <kbd>Shift</kbd> уклонение';
    if (career) {
      this.root.querySelector('.streak-summary > span')!.textContent = 'СЧЁТ';
      this.root.querySelector('.fight-run-info > small')!.textContent = 'Новый раунд — полные HP и выносливость';
      for(const side of ['player','enemy']) this.root.querySelector(`.${side}-card`)!.insertAdjacentHTML('beforeend',
        `<div class="career-round-marks" id="${side}-round-marks" role="img">${Array.from({length:careerWinsNeeded(career.id)},()=>'<i aria-hidden="true"></i>').join('')}</div>`);
    }
    this.focusArena();
  }
  focusArena(): void { this.focus('#combat-focus'); }
  setCareerScore(score: CareerScore, roundNumber: number): void { this.score={...score}; this.roundNumber=roundNumber; }
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
    this.root.querySelector('#fight-wins')!.textContent = this.career ? `${this.score.playerRounds} : ${this.score.enemyRounds}` : String(wins);
    this.root.querySelector('#fight-record')!.textContent = this.career ? `ДО ${careerWinsNeeded(this.career.id)} ПОБЕД` : `РЕКОРД ${this.services.saves.endless.bestStreak}`;
    this.root.querySelector('#fight-round-label')!.textContent = this.career ? `РАУНД ${this.roundNumber} · ${this.career.boss ? 'БОСС' : 'КАРЬЕРА'} · КЛАСС 0${this.career.tier}` : `БОЙ ${wins + 1} · ${profile.difficulty < 4 ? 'НАЧАЛЬНЫЙ' : profile.difficulty < 10 ? 'ОПЫТНЫЙ' : 'МАСТЕР'}`;
    if(this.career) for(const [side,count] of [['player',this.score.playerRounds],['enemy',this.score.enemyRounds]] as const) {
      const marks=this.root.querySelector<HTMLElement>(`#${side}-round-marks`)!;
      marks.setAttribute('aria-label',`Раунды ${side==='player' ? 'игрока' : 'соперника'}: ${count} из ${careerWinsNeeded(this.career.id)}`);
      marks.querySelectorAll<HTMLElement>('i').forEach((mark,i)=>{mark.dataset.won=String(i<count);});
    }
    this.root.querySelector('#fight-tactic')!.textContent = `${profile.tactic}${profile.canDodge || this.career ? '' : ' Kim не уклоняется.'}`;
    const remaining=roundRemaining(roundMs), boosted=!this.career && enemyBoosted(roundMs);
    const timer=this.root.querySelector<HTMLElement>('#fight-timer')!;
    timer.textContent=clock(remaining); timer.dataset.urgent=String(remaining<=15_000);
    const pressure=this.root.querySelector<HTMLElement>('#fight-pressure')!;
    pressure.textContent=this.career ? '90 СЕКУНД · ПРИ ИСТЕЧЕНИИ ВРЕМЕНИ РЕШАЕТ ПРОЦЕНТ HP' : boosted ? `СОПЕРНИК УСИЛЕН · УРОН +${boostPercent}% ДО КОНЦА БОЯ`
      : `УСИЛЕНИЕ ЧЕРЕЗ ${clock(Math.max(0,COMBAT.enemyBoostAfterMs-roundMs))} · УРОН +${boostPercent}%`;
    pressure.dataset.boosted=String(boosted);
    this.root.querySelector('#run-reward')!.textContent = this.career ? `Урон ${p.damage} · Побед в карьере ${this.services.saves.career.victories.length} / 12` : `Урон ${p.damage} · Награда за серию +${rewardFor(this.services.saves.endless,wins)}`;
    const data = this.root.querySelector<HTMLElement>('#combat-focus')!.dataset;
    Object.assign(data, { phase, playerHp:String(p.hp), enemyHp:String(e.hp), playerX:p.x.toFixed(1), enemyX:e.x.toFixed(1),
      playerAction:p.action, enemyAction:e.action, enemySkin:e.skin, enemyVariant:profile.id, botState, playerFacing:String(p.facing), enemyFacing:String(e.facing), enemyCanDodge:String(e.canDodge),
      wins:String(wins), slot:String(p.slot), combo:String(p.combo), stamina:Math.floor(p.stamina).toString(),
      actionMs:String(Math.floor(p.elapsed)), bufferedSlot:p.buffered===null ? '' : String(p.buffered),
      roundMs:String(roundMs), remainingMs:String(remaining), enemyBoosted:String(boosted), enemyDamage:String(e.damage), mode:this.career ? 'career' : 'endless', boss:String(this.career?.boss ?? false) });
    if(this.career) Object.assign(data,{playerRounds:String(this.score.playerRounds),enemyRounds:String(this.score.enemyRounds),
      drawnRounds:String(this.score.drawnRounds),roundNumber:String(this.roundNumber),targetRounds:String(careerWinsNeeded(this.career.id))});
  }
  showPause(onExit: () => void): void {
    if (this.hasDialog) return;
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">БОЙ ПРИОСТАНОВЛЕН</span><button class="icon-button" data-close aria-label="Продолжить бой">${icons.close}</button></div>
      <h2 id="dialog-title">Пауза</h2>
      <p class="dialog-description">${this.career ? 'Время остановлено. Поединок сохранён — его можно продолжить через доску в лобби.' : 'Время остановлено. Серия сохранена — её можно продолжить в центре зала.'}</p>
      <div class="fight-help" aria-label="Управление бойцом">
        <div><span><kbd>A</kbd><kbd>D</kbd></span><b>Движение</b></div>
        <div><span>${ATTACK_KEYS.map(key=>`<kbd>${key.label}</kbd>`).join('')}</span><b>Три атаки</b></div>
        <div><kbd>Space</kbd><b>Держать блок</b></div>
        <div><kbd>Shift</kbd><b>Уклонение назад</b></div>
      </div>
      <p class="fight-combo-note">Для комбинации нажми следующую атаку в конце восстановления. В цепочке — до трёх ударов. Короткие команды у конца оглушения или уклонения также сохраняются. Блок защищает спереди: A/D разворачивают защиту. В блоке силы медленно восстанавливаются, попадание расходует немного выносливости.</p>
      <div class="fight-rule-note"><b>${COMBAT.roundDurationMs/1000} СЕКУНД НА ${this.career ? 'РАУНД' : 'СОПЕРНИКА'}</b><p>${this.career ? `Матч до ${careerWinsNeeded(this.career.id)} побед в раундах для любого бойца. Счёт ${this.score.playerRounds} : ${this.score.enemyRounds}. По времени решает процент HP. Ничья не меняет счёт. Каждый новый раунд начинается с полными HP, выносливостью и новым таймером; счёт сохраняется при выходе.` : `После первых ${COMBAT.enemyBoostAfterMs/1000} секунд — однократное усиление урона на ${boostPercent}%. Когда время выйдет, побеждает боец с большим процентом HP. Ничья или поражение завершают серию; награда за прошлые победы остаётся.`}</p></div>
      <button class="button primary dialog-done" data-close>Продолжить бой ${icons.arrow}</button>
      <button class="button secondary dialog-done" id="pause-exit">Сохранить и выйти в лобби</button>`, 'combat-pause');
    this.on('#pause-exit','click',onExit);
  }
  showCareerResult(result: CareerResult, onLobby: () => void, onRetry: () => void): void {
    if (!this.career) return;
    this.announce('');
    const won = result.outcome === 'player';
    const verdict = result.outcome === 'draw' ? 'Ничья' : won ? 'Победа' : 'Поражение';
    const explanation = result.reason === 'draw' ? 'Время вышло. Процент оставшегося HP одинаковый.'
      : result.reason === 'timeout' ? 'Последний раунд решён по проценту HP.' : 'Последний раунд завершён нокаутом.';
    const progress = result.completed ? 'Все 12 соперников побеждены. Карьера высшего класса завершена.'
      : result.newVictory && this.career.rank === 4 ? `Открыт класс 0${result.newClass}. Следующий соперник ждёт на доске.`
      : won ? 'Победа сохранена. Следующего соперника можно выбрать на доске.' : 'Прошлые победы сохранены. Можно повторить этот поединок с полным HP.';
    this.openDialog(`
      <div class="dialog-top"><span class="eyebrow">КАРЬЕРА · КЛАСС 0${this.career.tier}</span><span class="result-verdict">${result.reason === 'knockout' ? 'K.O.' : 'ВРЕМЯ'}</span></div>
      <h2 id="dialog-title">${verdict}</h2>
      <p class="dialog-description">${this.career.name} · ${explanation}</p>
      <p class="career-final-score">РАУНДЫ <strong>${result.playerRounds ?? 0} : ${result.enemyRounds ?? 0}</strong><span>Матч до ${careerWinsNeeded(this.career.id)} побед</span></p>
      <div class="run-result"><span>ПОБЕДЫ<strong>${this.services.saves.career.victories.length} / 12</strong></span><span>ТВОЙ КЛАСС<strong>0${result.newClass}</strong></span></div>
      <p class="career-result-progress">${progress}</p>
      <p class="settings-note">Урон прокачивается в бесконечных боях, HP и выносливость — на скамье.</p>
      <button class="button primary dialog-done" id="career-result-lobby">Вернуться в лобби ${icons.arrow}</button>
      <button class="button secondary dialog-done" id="career-result-retry">${won ? 'Повторить поединок' : 'Попробовать ещё раз'}</button>`, 'combat-result career-result');
    this.on('#career-result-lobby','click',onLobby);
    this.on('#career-result-retry','click',onRetry);
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
