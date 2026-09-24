/**
 * Page bundle size gate. The lite runtime refuses to open a page whose JS file is bigger than
 * 48 KB (FILE_CONTENT_LENGTH_MAX in ArkUI ACE lite, "PAGE_FILE_TOO_HUGE"), and a big page also
 * eats the ~100 KB JS heap. Run after a build: npm run check:bundles
 *
 * Only the release build is minified by the SDK (hvigor sets hapMode = !debug), so the HAP for the
 * watch is built with -p buildMode=release; this script checks whatever the last build produced.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'entry', 'build', 'default', 'intermediates', 'loader_out_lite', 'default', 'js', 'MainAbility');
const LIMIT = 48 * 1024;
/** Keep headroom: Stage 4 adds the detection engine to the workout page. */
const WARN = 40 * 1024;

if (!fs.existsSync(OUT)) {
  console.error('No build output at ' + path.relative(ROOT, OUT) + ' — build the HAP first.');
  process.exit(1);
}

const pagesDir = path.join(OUT, 'pages');
const rows = [];
let failed = false;
for (const page of fs.readdirSync(pagesDir)) {
  const file = path.join(pagesDir, page, page + '.js');
  if (!fs.existsSync(file)) {
    continue;
  }
  const size = fs.statSync(file).size;
  const text = fs.readFileSync(file, 'utf8');
  const minified = text.indexOf('\n/***/ ') === -1;
  let status = 'ok';
  if (size > LIMIT) {
    status = 'TOO BIG';
    failed = true;
  } else if (size > WARN) {
    status = 'near limit';
  }
  rows.push({ page: page, kb: (size / 1024).toFixed(1), minified: minified, status: status });
}
rows.sort((a, b) => b.kb - a.kb);
for (const r of rows) {
  console.log(r.page.padEnd(16) + (r.kb + ' KB').padStart(9) + (r.minified ? '' : '  (not minified: debug build)') +
    '  ' + r.status);
}
if (failed) {
  console.error('Some pages exceed 48 KB and will not open on the watch.');
  process.exit(1);
}
