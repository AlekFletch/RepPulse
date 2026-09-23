/**
 * Git clean filter for build-profile.json5: replaces the contents of "signingConfigs"
 * with an empty array, so local signing material (key paths, encrypted passwords)
 * never reaches the repository while the working copy keeps it.
 *
 * Enabled per clone (see docs/04-deveco-device-setup.md):
 *   git config filter.strip-signing.clean "node tools/strip-signing.js"
 *   git config filter.strip-signing.smudge cat
 *   git config filter.strip-signing.required true
 */
function stripSigning(text) {
  const key = /"signingConfigs"\s*:\s*\[/.exec(text);
  if (!key) {
    return text;
  }
  const open = key.index + key[0].length - 1;
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return text.slice(0, open) + '[]' + text.slice(i + 1);
      }
    }
  }
  throw new Error('strip-signing: unbalanced signingConfigs array');
}

module.exports = { stripSigning };

if (require.main === module) {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    process.stdout.write(stripSigning(Buffer.concat(chunks).toString('utf8')));
  });
}
