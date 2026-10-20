import { BENCH } from '../config/training';
import { BASE_STATS } from '../config/styles';

export interface TrainingProgress {
  totalReps: number;
  sessions: number;
  bestSession: number;
  lastSessionReps: number;
  tutorialSeen: boolean;
}

export interface CharacterStats {
  maxHP: number;
  currentHP: number;
  stamina: number;
  currentStamina: number;
  damage: number;
}

export function freshTraining(): TrainingProgress {
  return { totalReps: 0, sessions: 0, bestSession: 0, lastSessionReps: 0, tutorialSeen: false };
}

export function trainingAttributes(totalReps: number): { maxHP: number; stamina: number } {
  const effort = Math.sqrt(Math.max(0, totalReps));
  return { maxHP: BASE_STATS.maxHP + Math.floor(BENCH.hpGrowth * effort), stamina: BASE_STATS.stamina + Math.floor(BENCH.staminaGrowth * effort) };
}

export function restoredStats(totalReps: number, previous?: CharacterStats): CharacterStats {
  const attributes = trainingAttributes(totalReps);
  return {
    ...attributes,
    currentHP: Math.min(attributes.maxHP, previous?.currentHP ?? attributes.maxHP),
    currentStamina: Math.min(attributes.stamina, previous?.currentStamina ?? attributes.stamina),
    damage: previous?.damage ?? BASE_STATS.damage,
  };
}

export function repsToNextGain(totalReps: number, attribute: 'hp' | 'stamina'): number {
  const growth = attribute === 'hp' ? BENCH.hpGrowth : BENCH.staminaGrowth;
  const bonus = Math.floor(growth * Math.sqrt(totalReps));
  const threshold = Math.ceil(((bonus + 1) / growth) ** 2 - 1e-9);
  return Math.max(1, threshold - totalReps);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isTrainingProgress(value: unknown): value is TrainingProgress {
  return record(value) && count(value.totalReps) && count(value.sessions) && count(value.bestSession)
    && count(value.lastSessionReps) && value.bestSession <= value.totalReps
    && value.lastSessionReps <= value.totalReps && typeof value.tutorialSeen === 'boolean';
}

export function isCharacterStats(value: unknown): value is CharacterStats {
  return record(value) && count(value.maxHP) && value.maxHP >= BASE_STATS.maxHP
    && count(value.currentHP) && value.currentHP <= value.maxHP
    && count(value.stamina) && value.stamina >= BASE_STATS.stamina
    && count(value.currentStamina) && value.currentStamina <= value.stamina
    && count(value.damage) && value.damage >= BASE_STATS.damage;
}
