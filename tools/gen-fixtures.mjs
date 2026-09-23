// Regenerates synthetic replay fixtures in tests/fixtures (deterministic seeds).
// Real device logs recorded on the Watch Fit 4 go next to them with a "_device" suffix.
// Run: node tools/gen-fixtures.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { squatSeries, pushUpSeries } from '../entry/src/main/js/MainAbility/common/sensors/mock/scenarios.js';
import { serializeSensorLog } from '../entry/src/main/js/MainAbility/common/sensors/mock/sensorLog.js';
import { ALGORITHM_VERSION } from '../entry/src/main/js/MainAbility/common/detection/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'tests', 'fixtures');

const fixtures = [
  { name: 'squat_5_left_synthetic.json', exerciseType: 'SQUAT', build: () => squatSeries(5, { seed: 501 }) },
  { name: 'pushup_5_left_synthetic.json', exerciseType: 'PUSH_UP', build: () => pushUpSeries(5, { seed: 502 }) }
];

for (const f of fixtures) {
  const sc = f.build();
  const text = serializeSensorLog({
    exerciseType: f.exerciseType,
    wristSide: 'LEFT',
    recordedAt: 0,
    algorithmVersion: ALGORITHM_VERSION,
    expectedReps: sc.truth.expectedReps
  }, sc.samples);
  fs.writeFileSync(path.join(out, f.name), text + '\n');
  console.log('wrote', f.name, sc.samples.length, 'samples');
}
