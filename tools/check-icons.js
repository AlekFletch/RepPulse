/**
 * Build-pipeline check: the launcher icon and every in-app icon referenced by the code exist,
 * are real PNG files of the expected size, and the manifest points at the RepPulse app icon.
 * Run: npm run check:icons   (also executed by the Jest suite)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(ROOT, 'entry', 'src', 'main');
const JS_ROOT = path.join(MAIN, 'js', 'default');
const LAUNCHER_ICON_REF = '$media:app_icon';
const LAUNCHER_ICON_FILE = path.join(MAIN, 'resources', 'base', 'media', 'app_icon.png');
// Official "[Lite]Empty Ability" template ships a 104x104 launcher icon.
const LAUNCHER_SIZE = 104;
const MAX_LAUNCHER_BYTES = 64 * 1024;

function readPngSize(file) {
  const buf = fs.readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.slice(0, 8).toString('hex') !== signature) {
    return null;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

/** "/common/icons/squat_icon_64.png" paths referenced in watch sources (js/css/hml). */
function referencedIcons() {
  const found = new Set();
  const stack = [JS_ROOT];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.(js|hml|css)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        const re = /\/common\/icons\/[\w-]+\.png/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          found.add(m[0]);
        }
        // icons.js builds paths as ROOT + 'name.png'
        const rel = /'([\w-]+\.png)'/g;
        if (entry.name === 'icons.js') {
          while ((m = rel.exec(text)) !== null) {
            found.add('/common/icons/' + m[1]);
          }
        }
      }
    }
  }
  return Array.from(found).sort();
}

function checkIcons() {
  const errors = [];
  const config = JSON.parse(fs.readFileSync(path.join(MAIN, 'config.json'), 'utf8'));
  const abilities = (config.module && config.module.abilities) || [];
  if (!abilities.length || abilities.some((a) => a.icon !== LAUNCHER_ICON_REF)) {
    errors.push('config.json abilities must use icon ' + LAUNCHER_ICON_REF);
  }

  if (!fs.existsSync(LAUNCHER_ICON_FILE)) {
    errors.push('launcher icon missing: ' + path.relative(ROOT, LAUNCHER_ICON_FILE));
  } else {
    const size = readPngSize(LAUNCHER_ICON_FILE);
    if (!size) {
      errors.push('launcher icon is not a PNG');
    } else {
      if (size.width !== LAUNCHER_SIZE || size.height !== LAUNCHER_SIZE) {
        errors.push(`launcher icon must be ${LAUNCHER_SIZE}x${LAUNCHER_SIZE}, got ${size.width}x${size.height}`);
      }
      if (size.bytes > MAX_LAUNCHER_BYTES) {
        errors.push(`launcher icon too large: ${size.bytes} bytes`);
      }
    }
  }

  const icons = referencedIcons();
  for (const ref of icons) {
    const file = path.join(JS_ROOT, ref);
    if (!fs.existsSync(file)) {
      errors.push('referenced icon missing: ' + ref);
      continue;
    }
    const size = readPngSize(file);
    const expected = Number((ref.match(/_(\d+)\.png$/) || [])[1]);
    if (!size) {
      errors.push('not a PNG: ' + ref);
    } else if (expected && (size.width !== expected || size.height !== expected)) {
      errors.push(`${ref} should be ${expected}x${expected}, got ${size.width}x${size.height}`);
    }
  }
  return { errors: errors, checkedIcons: icons };
}

module.exports = { checkIcons, readPngSize };

if (require.main === module) {
  const result = checkIcons();
  if (result.errors.length) {
    console.error('Icon check FAILED:\n  ' + result.errors.join('\n  '));
    process.exit(1);
  }
  console.log('Icon check OK (' + result.checkedIcons.length + ' in-app icons + launcher)');
}
