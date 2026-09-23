const { stripSigning } = require('../../tools/strip-signing');

describe('strip-signing git filter', () => {
  test('empties signingConfigs and keeps everything else', () => {
    const input = [
      '{',
      '  "app": {',
      '    // local only',
      '    "signingConfigs": [',
      '      { "name": "default", "material": { "storeFile": "C:/k/a].p12", "storePassword": "00AB" } }',
      '    ],',
      '    "products": [{ "name": "default", "compatibleSdkVersion": "5.0.0(12)" }]',
      '  }',
      '}'
    ].join('\n');
    const out = stripSigning(input);
    expect(out).toContain('"signingConfigs": [],');
    expect(out).not.toContain('storePassword');
    expect(out).toContain('"compatibleSdkVersion": "5.0.0(12)"');
    expect(out).toContain('// local only');
  });

  test('is idempotent and leaves files without signingConfigs untouched', () => {
    const empty = '{ "app": { "signingConfigs": [], "products": [] } }';
    expect(stripSigning(empty)).toBe(empty);
    expect(stripSigning('{ "modules": [] }')).toBe('{ "modules": [] }');
  });

  test('rejects a broken file instead of committing garbage', () => {
    expect(() => stripSigning('{ "signingConfigs": [ { "a": 1 }')).toThrow(/unbalanced/);
  });
});
