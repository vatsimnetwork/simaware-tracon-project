import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const sourceBin = dirname(fileURLToPath(import.meta.url));

function createSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'compile-'));
  const bin = join(root, 'scripts', 'bin');
  mkdirSync(bin, {recursive: true});
  copyFileSync(join(sourceBin, 'compile.ts'), join(bin, 'compile.ts'));
  mkdirSync(join(root, 'Boundaries', 'AAA'), {recursive: true});
  copyFileSync(
    join(sourceBin, '..', '..', 'Boundaries', 'NZCH', 'NZCH.json'),
    join(root, 'Boundaries', 'AAA', 'AAA.json'),
  );
  return root;
}

function runCompile(root: string): {status: number | null; stderr: string} {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', join(root, 'scripts', 'bin', 'compile.ts')],
    {cwd: join(root, 'scripts'), encoding: 'utf8'},
  );
  return {status: result.status, stderr: result.stderr};
}

test('compile writes the combined file and exits 0', t => {
  // Given: a dataset with one boundary file
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));

  // When: the compile script runs
  const result = runCompile(root);

  // Then: it succeeds and writes a FeatureCollection containing the boundary
  assert.equal(result.status, 0);
  const output = JSON.parse(readFileSync(join(root, 'TRACONBoundaries.geojson'), 'utf8'));
  assert.equal(output.type, 'FeatureCollection');
  assert.equal(output.features.length, 1);
});

test('compile exits non-zero and reports the error when the output cannot be written', t => {
  // Given: a directory squatting on the output path, so the write fails with EISDIR
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'TRACONBoundaries.geojson'));

  // When: the compile script runs
  const result = runCompile(root);

  // Then: the failure is visible to callers and CI instead of reported as success
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EISDIR/);
});
