export const CLUB_GUIDE_STEPS = ['style','gym-door','bench','press','gym-exit','career-board','career-review','dojo-door','dojo-start','complete'] as const;
export type ClubGuideStep = typeof CLUB_GUIDE_STEPS[number];
export interface ClubGuideProgress { step: ClubGuideStep; repsBefore: number }
export type ClubRoom = 'lobby' | 'gym' | 'dojo';
export type ClubInteraction = 'style' | 'gym' | 'board' | 'dojo' | 'bench' | 'series' | 'exit';
export const freshClubGuide = (repsBefore=0): ClubGuideProgress => ({step:'style',repsBefore});
export function isClubGuide(value:unknown):value is ClubGuideProgress {
  if(typeof value!=='object' || value===null || Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  return CLUB_GUIDE_STEPS.includes(v.step as ClubGuideStep) && typeof v.repsBefore==='number' && Number.isSafeInteger(v.repsBefore) && v.repsBefore>=0;
}
export function nextClubGuideStep(step:ClubGuideStep):ClubGuideStep {
  return CLUB_GUIDE_STEPS[Math.min(CLUB_GUIDE_STEPS.length-1,CLUB_GUIDE_STEPS.indexOf(step)+1)];
}
/** Continue in the room containing the unfinished task, without changing the lobby position. */
export function clubGuideRoom(step:ClubGuideStep):ClubRoom {
  return step==='bench'||step==='press'||step==='gym-exit' ? 'gym' : step==='dojo-start' ? 'dojo' : 'lobby';
}
/** Returning to a room resumes its task; unrelated destinations stay out of the tour. */
export function clubGuideTarget(step:ClubGuideStep,room:ClubRoom):ClubInteraction|null {
  if(step==='complete')return null;
  if(step==='style')return 'style';
  if(room==='lobby') {
    if(['gym-door','bench','press','gym-exit'].includes(step))return 'gym';
    if(step==='career-board'||step==='career-review')return 'board';
    return 'dojo';
  }
  if(room==='gym')return ['gym-door','bench','press'].includes(step) ? 'bench' : 'exit';
  return step==='dojo-door'||step==='dojo-start' ? 'series' : 'exit';
}
export function clubGuideAllows(step:ClubGuideStep,room:ClubRoom,interaction:ClubInteraction):boolean {
  // Exits and technique editing remain available; neither advances an unfinished lesson.
  return step==='complete' || interaction==='exit' || interaction==='style' || interaction===clubGuideTarget(step,room);
}
export function observedClubStep(progress:ClubGuideProgress,room:ClubRoom,benchActive:boolean,totalReps:number):ClubGuideStep {
  switch(progress.step) {
    case 'gym-door': return room==='gym' ? 'bench' : progress.step;
    case 'bench': return room==='gym' && benchActive ? 'press' : progress.step;
    case 'press': return totalReps>progress.repsBefore ? 'gym-exit' : progress.step;
    case 'gym-exit': return room==='lobby' ? 'career-board' : progress.step;
    case 'dojo-door': return room==='dojo' ? 'dojo-start' : progress.step;
    // Career tasks advance in the real ranking UI; the last task requires starting a series.
    default: return progress.step;
  }
}
