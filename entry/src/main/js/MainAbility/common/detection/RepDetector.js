/**
 * RepDetector contract used by WorkoutSessionController:
 *   reset()                 forget the current motion (start / resume of a set)
 *   process(sample)         -> RepDetectionResult | null; `detected: true` means a confirmed rep
 *
 * The rule-based RepDetectionEngine arrives in Stage 4. Until then the null detector keeps
 * the workout flow working: reps are corrected manually on the pause screen.
 */
export function createNullRepDetector() {
  return {
    reset: function () {},
    process: function () {
      return null;
    }
  };
}
