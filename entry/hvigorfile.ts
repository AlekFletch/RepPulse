import { legacyHapTasks } from '@ohos/hvigor-ohos-plugin';
import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Minifies the lite page bundles between LegacyCompileLiteJS and LegacyGenerateLiteCode.
 *
 * The watch refuses page JS over 48 KB and has ~100 KB of JS heap, but the SDK minifies only in
 * release mode, and DevEco Assistant cannot install a release-format HAP ("Failed to decompress").
 * So every build — debug included, IDE or command line — gets its JS minified here with the SDK's
 * own terser (tools/minify-lite.js), before the files are packed into the signed .bin.
 */
const minifyLiteJs = {
  pluginId: 'reppulse.minifyLiteJs',
  apply(node) {
    node.registerTask({
      name: 'default@RepPulseMinifyLiteJS',
      dependencies: ['default@LegacyCompileLiteJS'],
      postDependencies: ['default@LegacyGenerateLiteCode'],
      run() {
        const script = path.resolve(node.getNodePath(), '..', 'tools', 'minify-lite.js');
        execFileSync(process.execPath, [script], { stdio: 'inherit' });
      }
    });
  }
};

export default {
  system: legacyHapTasks, /* Built-in plugin of Hvigor. It cannot be modified. */
  plugins: [minifyLiteJs] /* Custom plugin to extend the functionality of Hvigor. */
}
