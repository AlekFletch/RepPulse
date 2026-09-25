import { ExerciseType } from '../domain/enums.js';
import { ACCEL_ONLY_CONFIDENCE_BONUS, FILTERS, getBaseline, getSensitivityScale } from './DetectionConfig.js';
import { createFeatureExtractor } from './FeatureExtractor.js';
import { createPushUpStrategy } from './PushUpDetectionStrategy.js';
import { RepPhase } from './RepPhase.js';
import { lowPassGain } from './SignalFilter.js';
import { createSquatStrategy } from './SquatDetectionStrategy.js';

/** A rep opens when the signal rises this share of the amplitude threshold above the top level. */
const START_FRACTION = 0.3;
/** ...and closes when it comes back within this share of the rep's own amplitude. */
const RETURN_FRACTION = 0.35;
/** The bottom is confirmed once the signal falls back this share of the rep amplitude. */
const BOTTOM_HYSTERESIS = 0.15;
/** How fast the "top" level follows the signal upwards while READY. */
const TOP_TAU_S = 1.5;

const P = RepPhase;

/**
 * RepDetector for one exercise (spec 3.1–3.5). Only a full READY → DESCENT → BOTTOM → ASCENT
 * cycle counts, checked for amplitude, phase and rep durations, then COOLDOWN.
 *
 * The strategy turns features into one "depth" signal (squat: wrist depth in m, push-up: forearm
 * tilt in degrees) and rejects look-alike motions. Amplitude is measured from a "top" level that
 * the signal left, so offsets and slow drift do not matter.
 *
 * options:
 *   exerciseType   SQUAT | PUSH_UP
 *   profile        CalibrationProfile fields (min/maxRepDurationMs, minAmplitudeThreshold,
 *                  minGyroThreshold, confidenceThreshold, descentSignature {amplitude, durationMs});
 *                  missing fields fall back to the baseline
 *   sensitivity    LOW | STANDARD | HIGH (scales the amplitude threshold)
 *   debug          keep the last rejection reason and signal summary for the debug overlay
 *
 * process(sample) -> RepDetectionResult for a confirmed rep, otherwise null (no allocations).
 * Rejected cycles are reported through onReject(reason) when given (calibration / debug).
 */
export function createRepDetectionEngine(options) {
  const exerciseType = options.exerciseType;
  const params = resolveParams(exerciseType, options.profile, options.sensitivity);
  const strategy = exerciseType === ExerciseType.PUSH_UP ? createPushUpStrategy() : createSquatStrategy();
  if (strategy.setMinGyro) {
    strategy.setMinGyro(params.minGyro);
  }
  const features = createFeatureExtractor({
    gravityTauS: FILTERS.gravityTauS[exerciseType],
    integratorTauS: FILTERS.integratorTauS
  });
  const debug = options.debug === true;
  const onReject = options.onReject || null;

  let phase = P.IDLE;
  let top = 0;
  let peak = 0;
  let tStart = 0;
  let tPeak = 0;
  let valley = 0;
  let tValley = 0;
  let cooldownUntil = 0;
  let lastSignal = 0;
  let lastReason = '';
  let accelOnly = false;

  function reset() {
    features.reset();
    if (strategy.resetReference) {
      strategy.resetReference();
    }
    phase = P.IDLE;
    lastReason = '';
  }

  function toReady(x) {
    phase = P.READY;
    top = x;
  }

  function rejectCycle(reason, x) {
    lastReason = reason;
    if (onReject) {
      onReject(reason);
    }
    toReady(x);
  }

  /**
   * Closes the cycle at (t, x). chainFeatures: the signal already turned into the next rep, so
   * a new cycle starts right here instead of a cooldown.
   */
  function confirm(t, x, chainFeatures) {
    const amplitude = peak - top;
    const duration = t - tStart;
    const descent = tPeak - tStart;
    const ascent = t - tPeak;
    if (duration < params.minRepMs) {
      rejectCycle('too fast ' + duration + ' ms', x);
      return null;
    }
    if (ascent < params.minPhaseMs) {
      rejectCycle('ascent too short', x);
      return null;
    }
    const why = strategy.reject();
    if (why) {
      rejectCycle(why, x);
      return null;
    }
    const confidence = score(amplitude, duration, descent, ascent);
    const threshold = params.confidenceThreshold + (accelOnly ? ACCEL_ONLY_CONFIDENCE_BONUS : 0);
    if (confidence < threshold) {
      rejectCycle('low confidence ' + confidence.toFixed(2), x);
      return null;
    }
    if (chainFeatures) {
      phase = P.DESCENT;
      top = x;
      tStart = t;
      strategy.begin(chainFeatures);
    } else {
      phase = P.COOLDOWN;
      cooldownUntil = t + params.cooldownMs;
      top = x;
    }
    lastReason = '';
    // RepDetectionResult shape (spec 3.2), built inline to keep the workout bundle small.
    return {
      detected: true,
      exerciseType: exerciseType,
      timestamp: t,
      confidence: clamp01(confidence),
      phase: P.REP_CONFIRMED,
      reason: 'full cycle',
      signalSummary: debug ? summary(amplitude, duration, descent, ascent) : null
    };
  }

  /**
   * Confidence 0..1 (spec 3.5): amplitude against the threshold (and the calibrated amplitude),
   * duration against the calibrated rep, descent/ascent balance. (Noise needs no own term: a
   * noisy signal fails the amplitude and phase checks before it gets here.)
   */
  function score(amplitude, duration, descent, ascent) {
    const ref = params.expectedAmplitude > 0 ? Math.min(params.expectedAmplitude, params.minAmp * 2) : params.minAmp * 2;
    const ampScore = clamp01(0.5 + 0.5 * (amplitude - params.minAmp) / Math.max(1e-6, ref - params.minAmp));
    let durScore = 1;
    if (params.expectedDurationMs > 0) {
      // Slower than the calibration is normal (tired, pauses); much faster looks like a jerk.
      const ratio = duration / params.expectedDurationMs;
      durScore = ratio < 1 ? clamp01(1 + Math.log(ratio) / Math.log(4)) : clamp01(1 - Math.log(ratio) / Math.log(8));
    }
    const balance = Math.min(descent, ascent) / Math.max(1, Math.max(descent, ascent));
    const phaseScore = clamp01(0.4 + balance);
    return 0.5 * ampScore + 0.3 * durScore + 0.2 * phaseScore;
  }

  function summary(amplitude, duration, descent, ascent) {
    const s = strategy.stats();
    s.amplitude = amplitude;
    s.durationMs = duration;
    s.descentMs = descent;
    s.ascentMs = ascent;
    return s;
  }

  function process(sample) {
    const f = features.update(sample);
    if (f === null) {
      return null;
    }
    accelOnly = !sample.hasGyro;
    const t = sample.t;
    const x = strategy.signal(f);
    lastSignal = x;

    if (phase === P.IDLE || (f.turning && phase !== P.COOLDOWN)) {
      // A turn of the arm is no part of a rep: start over once it is done.
      toReady(x);
      return null;
    }
    if (phase === P.COOLDOWN) {
      if (t >= cooldownUntil) {
        toReady(x);
      }
      return null;
    }
    if (phase === P.READY) {
      strategy.ready(f);
      if (x < top) {
        top = x;
      } else {
        top += (x - top) * lowPassGain(f.dtS, TOP_TAU_S);
      }
      if (x - top > params.minAmp * START_FRACTION) {
        phase = P.DESCENT;
        tStart = t;
        peak = x;
        tPeak = t;
        strategy.begin(f);
      }
      return null;
    }

    // DESCENT / BOTTOM / ASCENT
    strategy.track(f, sample.hasGyro);
    if (t - tStart > params.maxRepMs) {
      rejectCycle('too slow ' + (t - tStart) + ' ms', x);
      return null;
    }
    if (phase === P.DESCENT && t - tStart > params.maxDescentMs) {
      rejectCycle('descent too slow', x);
      return null;
    }
    const amplitude = peak - top;
    const hysteresis = Math.max(amplitude * BOTTOM_HYSTERESIS, params.minAmp * 0.1);
    if (phase === P.DESCENT) {
      if (x > peak) {
        peak = x;
        tPeak = t;
        return null;
      }
      if (x < peak - hysteresis) {
        if (amplitude < params.minAmp) {
          // Turned back before reaching the amplitude: a partial rep. Close the cycle now, so it
          // cannot linger and swallow the start of the next real rep.
          rejectCycle('too shallow ' + amplitude.toFixed(2), x);
          return null;
        }
        if (tPeak - tStart < params.minPhaseMs) {
          rejectCycle('descent too short', x);
          return null;
        }
        phase = P.ASCENT;
        valley = x;
        tValley = t;
      }
      return null;
    }
    // ASCENT: the rep closes when the signal is back near the top level...
    if (x - top < amplitude * RETURN_FRACTION) {
      return confirm(t, x, null);
    }
    if (x < valley) {
      valley = x;
      tValley = t;
      return null;
    }
    // ...or, when slow drift keeps it from getting back there, at the lowest point before the
    // signal turns into the next rep, provided at least half the amplitude came back.
    if (x > valley + hysteresis) {
      if (peak - valley >= Math.max(amplitude * 0.5, params.minAmp)) {
        const result = confirm(tValley, valley, features.current());
        if (result !== null) {
          peak = x;
          tPeak = t;
        }
        return result;
      }
      phase = P.DESCENT;
      if (x > peak) {
        peak = x;
        tPeak = t;
      }
    }
    return null;
  }

  return {
    reset: reset,
    process: process,
    getPhase: function () {
      return phase;
    },
    /** Debug overlay: "DESCENT 0.21 / 0.15", plus the last rejection reason. */
    debugState: function () {
      return phase + ' ' + lastSignal.toFixed(2) + ' / ' + params.minAmp.toFixed(2) +
        (lastReason ? ' · ' + lastReason : '');
    },
    params: params
  };
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/** Baseline values overridden by the calibration profile, amplitude scaled by sensitivity. */
export function resolveParams(exerciseType, profile, sensitivity) {
  const base = getBaseline(exerciseType);
  const p = profile || {};
  function pick(key) {
    return typeof p[key] === 'number' ? p[key] : base[key];
  }
  const signature = p.descentSignature || {};
  return {
    minAmp: pick('minAmplitudeThreshold') * getSensitivityScale(sensitivity),
    // Calibration can only widen the duration window: a profile from brisk reps must not reject
    // slower ones ("too slow" after calibration on the watch, 2026-09-25).
    minRepMs: Math.min(pick('minRepDurationMs'), base.minRepDurationMs),
    maxRepMs: Math.max(pick('maxRepDurationMs'), base.maxRepDurationMs),
    maxDescentMs: base.maxDescentMs,
    minPhaseMs: base.minPhaseDurationMs,
    cooldownMs: base.cooldownMs,
    minGyro: pick('minGyroThreshold'),
    confidenceThreshold: pick('confidenceThreshold'),
    expectedAmplitude: typeof signature.amplitude === 'number' ? signature.amplitude : 0,
    expectedDurationMs: typeof signature.durationMs === 'number' ? signature.durationMs : 0
  };
}
