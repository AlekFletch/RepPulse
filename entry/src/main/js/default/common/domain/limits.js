/** Ranges and timings from the v1 spec (sections 2.4, 2.5, 3.1). */
export const Limits = Object.freeze({
  SET_COUNT: Object.freeze({ min: 1, max: 20 }),
  TARGET_REPS: Object.freeze({ min: 1, max: 500 }),
  WORK_DURATION_SEC: Object.freeze({ min: 10, max: 3600 }),
  TIMER_DURATION_SEC: Object.freeze({ min: 10, max: 3600 }),
  REST_DURATION_SEC: Object.freeze({ min: 10, max: 600 })
});

export const Timing = Object.freeze({
  COUNTDOWN_SEC: 3,
  REST_WARNING_SEC: 3,
  REST_EXTEND_SEC: 15,
  /** Motion right after start/resume is ignored (spec: 500–1000 ms). */
  RESUME_IGNORE_MS: 750
});

export const Defaults = Object.freeze({
  TIMER_DURATION_SEC: 60,
  SET_COUNT: 3,
  TARGET_REPS: 15,
  WORK_DURATION_SEC: 60,
  REST_DURATION_SEC: 60
});
