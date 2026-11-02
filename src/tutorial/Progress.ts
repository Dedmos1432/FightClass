export const TUTORIAL_STEPS = ['movement','attacks','combo','block','dodge','stamina','club','complete'] as const;
export type TutorialStep = typeof TUTORIAL_STEPS[number];
export type PracticeStep = Exclude<TutorialStep,'complete'>;
export function isTutorialStep(value: unknown): value is TutorialStep {
  return typeof value==='string' && TUTORIAL_STEPS.includes(value as TutorialStep);
}
export function nextTutorialStep(step: TutorialStep): TutorialStep {
  return TUTORIAL_STEPS[Math.min(TUTORIAL_STEPS.length-1,TUTORIAL_STEPS.indexOf(step)+1)];
}
