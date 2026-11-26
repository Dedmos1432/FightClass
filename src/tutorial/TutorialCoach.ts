import { attackDuration } from '../combat/CombatWorld';
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
        if (player.action === 'idle') return this.strike(0, 'combo-start', 'Начни комбинацию', 'Нанеси первый удар.');
        if (player.action === 'attack' && player.combo === 1 && player.buffered === null &&
          player.elapsed >= attackDuration(player.slot) - COMBAT.comboBufferMs) {
          return this.prompt('combo-follow', 'Продолжи комбинацию', 'Введи второй удар до конца первого.', ['W', 'или', 'E'], ['KeyW', 'KeyE']);
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
    const id = this.cue?.id;
    if (id === `strike-${slot + 1}` || (id === 'combo-start' && slot === 0) ||
      (id === 'combo-follow' && slot !== 0) || id === 'spend') {
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

  private prompt(id: string, title: string, detail: string, keys: string[], touch: string[], frozen = true): TutorialCue {
    return { id, title, detail, keys, touch, frozen };
  }
}
