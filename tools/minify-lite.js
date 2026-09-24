/**
 * Minifies the page bundles of a *debug* lite build in place, with the SDK's own terser and the
 * options the SDK uses for release builds (mangle only, no compress).
 *
 * Why: the watch rejects page JS over 48 KB, and the SDK minifies only in release mode, but
 * DevEco Assistant cannot install a release-format HAP ("Failed to decompress"). So the HAP is
 * built in debug format with minified JS: the RepPulseMinifyLiteJS task in entry/hvigorfile.ts runs
 * this script between LegacyCompileLiteJS and LegacyGenerateLiteCode.
 */
const fs = require('fs');
const path = require('path');

const SDK = process.env.DEVECO_SDK_HOME || 'C:/Program Files/Huawei/DevEco Studio/sdk';
const terser = require(path.join(SDK, 'default/openharmony/js/build-tools/ace-loader/node_modules/terser'));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'entry/build/default/intermediates/loader_out_lite/default/js/MainAbility');

function jsFiles(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(jsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  if (!fs.existsSync(OUT)) {
    throw new Error('no debug build output at ' + OUT);
  }
  for (const file of jsFiles(OUT)) {
    const source = fs.readFileSync(file, 'utf8');
    const result = await terser.minify(source, { compress: false, mangle: true, ecma: 5 });
    if (!result.code) {
      throw new Error('terser produced nothing for ' + file);
    }
    fs.writeFileSync(file, result.code);
    console.log(path.relative(OUT, file).padEnd(40) + (source.length + ' -> ' + result.code.length).padStart(18));
  }
}

main().catch(function (e) {
  console.error(e.message);
  process.exit(1);
});
