import { WorkoutStatus as S } from '../../entry/src/main/js/default/common/domain/enums.js';
import {
  canTransition, createWorkoutStateMachine, isTerminal, isCounting
} from '../../entry/src/main/js/default/common/domain/workoutStateMachine.js';

describe('workout state machine', () => {
  test('sets flow: draft -> countdown -> active -> rest -> countdown -> active -> completed', () => {
    const events = [];
    const sm = createWorkoutStateMachine(S.DRAFT, (to, from) => events.push(from + '>' + to));
    [S.PREPARING, S.ACTIVE, S.RESTING, S.PREPARING, S.ACTIVE, S.COMPLETED].forEach((s) => sm.transition(s));
    expect(sm.getStatus()).toBe(S.COMPLETED);
    expect(events).toEqual([
      'DRAFT>PREPARING', 'PREPARING>ACTIVE', 'ACTIVE>RESTING',
      'RESTING>PREPARING', 'PREPARING>ACTIVE', 'ACTIVE>COMPLETED'
    ]);
  });

  test('pause / resume / finish from pause', () => {
    const sm = createWorkoutStateMachine(S.ACTIVE);
    sm.transition(S.PAUSED);
    sm.transition(S.ACTIVE);
    sm.transition(S.PAUSED);
    sm.transition(S.COMPLETED);
    expect(isTerminal(sm.getStatus())).toBe(true);
  });

  test('"Начать сейчас" without countdown: RESTING -> ACTIVE', () => {
    expect(canTransition(S.RESTING, S.ACTIVE)).toBe(true);
  });

  test('invalid transitions throw with a code and do not change state', () => {
    const sm = createWorkoutStateMachine(S.DRAFT);
    expect(() => sm.transition(S.RESTING)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(sm.getStatus()).toBe(S.DRAFT);
    expect(canTransition(S.COMPLETED, S.ACTIVE)).toBe(false);
    expect(canTransition(S.CANCELLED, S.DRAFT)).toBe(false);
    expect(canTransition(S.PAUSED, S.RESTING)).toBe(false);
    expect(canTransition('BOGUS', S.ACTIVE)).toBe(false);
  });

  test('every non-terminal state can be cancelled', () => {
    [S.DRAFT, S.PREPARING, S.ACTIVE, S.PAUSED, S.RESTING].forEach((s) => {
      expect(canTransition(s, S.CANCELLED)).toBe(true);
    });
  });

  test('reps are counted only while ACTIVE', () => {
    Object.values(S).forEach((s) => {
      expect(isCounting(s)).toBe(s === S.ACTIVE);
    });
  });
});
