/**
 * Release gate: fails while debug switches are on or required assets are missing.
 * Run before building a release HAP: npm run check:release
 */
const fs = require('fs');
const path = require('path');
const { checkIcons } = require('./check-icons');

const ROOT = path.resolve(__dirname, '..');
const errors = [];

const buildConfig = fs.readFileSync(
  path.join(ROOT, 'entry/src/main/js/MainAbility/common/config/buildConfig.js'), 'utf8');
if (!/DEBUG:\s*false/.test(buildConfig)) {
  errors.push('BuildConfig.DEBUG must be false for release');
}

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'entry/src/main/config.json'), 'utf8'));
const pages = config.module.js[0].pages;
if (pages.indexOf('pages/diagnostics/diagnostics') !== -1) {
  errors.push('diagnostics page must be removed from config.json pages for release');
}

errors.push(...checkIcons().errors);

if (errors.length) {
  console.error('Release check FAILED:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('Release check OK');
