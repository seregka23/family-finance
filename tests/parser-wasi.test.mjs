import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test(
  'Angular parser WebAssembly fallback remains compatible with its runtime',
  { timeout: 20000 },
  () => {
    // The native parser used by normal Linux builds would not exercise this dependency override.
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const requireBuild = createRequire(import.meta.resolve('@angular/build/package.json'));
    const { parse, parseSync } = await import(pathToFileURL(requireBuild.resolve('oxc-parser')).href);
    const source = 'export const total: number = 42;';
    for (const result of [parseSync('fixture.ts', source), await parse('fixture.ts', source)]) {
      assert.equal(result.errors.length, 0);
      assert.equal(result.program.body[0].type, 'ExportNamedDeclaration');
    }
  `
      ],
      {
        env: { ...process.env, NAPI_RS_FORCE_WASI: 'error' },
        encoding: 'utf8',
        timeout: 15000
      }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
);
