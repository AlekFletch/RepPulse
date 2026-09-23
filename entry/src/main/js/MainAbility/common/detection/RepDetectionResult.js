import { clamp } from '../util/obj.js';

/**
 * RepDetectionResult (spec 3.2).
 * signalSummary is diagnostic data for debug builds only and must never be shown in the user UI.
 */
export function createRepDetectionResult(fields) {
  const confidence = typeof fields.confidence === 'number' ? clamp(fields.confidence, 0, 1) : 0;
  return {
    detected: fields.detected === true,
    exerciseType: fields.exerciseType,
    timestamp: fields.timestamp,
    confidence: confidence,
    phase: fields.phase,
    reason: fields.reason || '',
    signalSummary: fields.signalSummary || null
  };
}
