import { canLinkAttack } from '../combat/CombatWorld';
import { ATTACK_SLOTS, COMBAT, type AttackSlot, type DodgeDirection } from '../config/combat';
import { ATTACK_KEYS } from '../config/controls';
import type { CombatTutorial } from './CombatTutorial';

export interface TutorialCue {
  id: string;
  title: string;
  detail: string;
  keys: readonly string[];
  touch: readonly string[];
  frozen: boolean;
  currentKey?: string;
}

const SLOWDOWN_MS = 260;
const AUTO_GUARD_READING_MS = 700;
const attackSlots = [0, 1, 2] as const;
const movementCode = (direction: DodgeDirection) => direction < 0 ? 'KeyA' : 'KeyD';
const movementKey = (direction: DodgeDirection) => direction < 0 ? 'A' : 'D';

/** The coach owns the wall clock. The fighters, attacks and timing windows use the scaled game clock. */
export class TutorialCoach {
  private previousCue: string | undefined;
  private cueMs = 0;

  constructor(private readonly trainer: CombatTutorial, private readonly touch: boolean) {}

  get movement(): DodgeDirection {
    return this.trainer.left < 70 ? -1 : 1;
  }

  get cue(): TutorialCue | null {
    const t = this.trainer;
    const { player, enemy } = t.world;
    if (t.ready) return null;
    switch (t.step) {
      case 'movement': {
        const direction = this.movement;
        return this.prompt(direction < 0 ? 'move-left' : 'move-right',
          direction < 0 ? 'Шаг влево' : 'Шаг вправо', 'Удерживай направление, чтобы двигаться.',
          [movementKey(direction), '/', direction < 0 ? '←' : '→'], [movementCode(direction)]);
      }
      case 'attacks': {
        if (player.action !== 'idle') return null;
        const slot = attackSlots.find(index => !t.strikes.has(index));
        return slot === undefined ? null : this.strike(slot, `strike-${slot + 1}`,
          ['Первый удар', 'Второй удар', 'Третий удар'][slot], 'Попади по партнёру.');
      }
      case 'combo':
        if (player.action === 'idle') {
          if (t.repeatBlocked) return this.comboStrike(0, 'combo-start', 'Начни связку', 'Партнёр прочитал повтор. Попади и смени удар.');
          if (t.strikes.has(0)) return this.strike(0, 'combo-repeat', 'Повтори удар', 'Смотри, как ответит партнёр.');
          return this.strike(0, 'combo-demo', 'Одиночный удар', 'Попади по партнёру.');
        }
        if (t.repeatBlocked && canLinkAttack(player) && player.buffered === null) {
          return player.combo === 1
            ? this.comboStrike(1, 'combo-follow', 'Свяжи второй удар', `Следующее попадание даст +${COMBAT.comboBonuses[1]}% урона.`)
            : this.comboStrike(2, 'combo-finish', 'Заверши связку', `Третье попадание даст +${COMBAT.comboBonuses[2]}% урона.`);
        }
        return null;
      case 'block':
        if (enemy.action !== 'attack' || enemy.elapsed >= ATTACK_SLOTS[enemy.slot].startup) return null;
        return this.prompt('guard', 'Заблокируй удар', this.touch ? 'Отпусти все кнопки. Боец поставит блок сам.' : 'Удерживай пробел до попадания.', ['Пробел'], []);
      case 'dodge': {
        if (player.action !== 'idle' || (!t.dodged && !t.dodgeCue)) return null;
        const direction = t.dodgePracticeDirection;
        return this.prompt(t.dodged ? 'advance' : 'evade', t.dodged ? 'Рывок вперёд' : 'Уйди от удара',
          this.touch ? 'Удерживай обе подсвеченные кнопки.' : 'Нажми обе клавиши вместе.',
          ['Shift', '+', movementKey(direction)], ['ShiftLeft', movementCode(direction)]);
      }
      case 'stamina':
        if (t.spent) return this.prompt('recover', 'Восстанови выносливость', 'Отпусти кнопки. Дай запасу восстановиться до 80.', [], [], false);
        return player.action === 'idle' ? this.prompt('spend', 'Потрать выносливость', 'Атакуй, пока запас не опустится до 40.',
          ['Q', 'или', 'W', 'или', 'E'], ['KeyQ', 'KeyW', 'KeyE']) : null;
      case 'club':
        return this.prompt('finish', 'Тренировка завершена', 'В лобби тебя ждёт знакомство с клубом.', [], [], false);
    }
  }

  attack(slot: AttackSlot): void {
    if (this.cue?.touch.includes(ATTACK_KEYS[slot].code)) {
      this.trainer.world.attack(this.trainer.world.player, slot);
    }
  }

  dodge(direction: DodgeDirection): void {
    const id = this.cue?.id;
    if ((id === 'evade' || id === 'advance') && direction === this.trainer.dodgePracticeDirection) {
      this.trainer.world.dodge(this.trainer.world.player, direction);
    }
  }

  frame(delta: number, direction: DodgeDirection | 0, blocking: boolean, autoGuard: boolean) {
    const cue = this.cue;
    if (cue?.id !== this.previousCue) {
      this.previousCue = cue?.id;
      this.cueMs = 0;
    }
    this.cueMs += delta;
    const moving = this.trainer.step === 'movement' && !this.trainer.ready && direction === this.movement;
    const guard = this.trainer.step === 'block';
    const guardPerformed = this.touch ? autoGuard && this.cueMs >= AUTO_GUARD_READING_MS : blocking;
    const timeScale = !cue?.frozen || moving || (guard && guardPerformed)
      ? 1 : Math.max(0, 1 - this.cueMs / SLOWDOWN_MS);
    return { timeScale, direction: moving ? direction : 0, blocking: guard && blocking, autoGuard: guard && autoGuard };
  }

  private strike(slot: AttackSlot, id: string, title: string, detail: string): TutorialCue {
    const key = ATTACK_KEYS[slot];
    return this.prompt(id, title, detail, [key.label], [key.code]);
  }

  private comboStrike(slot: AttackSlot, id: string, title: string, detail: string): TutorialCue {
    const [first, second, third] = ATTACK_KEYS;
    return { ...this.prompt(id, title, detail, [first.label, '→', second.label, '→', third.label], [ATTACK_KEYS[slot].code]),
      currentKey: ATTACK_KEYS[slot].label };
  }

  private prompt(id: string, title: string, detail: string, keys: string[], touch: string[], frozen = true): TutorialCue {
    return { id, title, detail, keys, touch, frozen };
  }
}
