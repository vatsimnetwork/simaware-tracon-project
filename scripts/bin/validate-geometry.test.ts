import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const sourceBin = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(sourceBin, '../..');
const windowsTempRoot = 'C:\\Users\\tompk\\AppData\\Local\\Temp\\opencode';

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function createSandbox(): string {
  const tempRoot = process.platform === 'win32' ? windowsTempRoot : tmpdir();
  mkdirSync(tempRoot, {recursive: true});
  const root = mkdtempSync(join(tempRoot, 'validate-geometry-'));
  const bin = join(root, 'scripts', 'bin');
  const lib = join(bin, 'lib');
  mkdirSync(lib, {recursive: true});
  copyFileSync(join(sourceBin, 'validate-geometry.ts'), join(bin, 'validate-geometry.ts'));
  copyFileSync(join(sourceBin, 'lib', 'geometry-checks.ts'), join(lib, 'geometry-checks.ts'));
  copyFileSync(join(sourceBin, 'lib', 'traverse.ts'), join(lib, 'traverse.ts'));
  mkdirSync(join(root, 'Boundaries'), {recursive: true});
  return root;
}

function writeBoundary(root: string, relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, content);
  return path;
}

function polygon(prefix: string, coordinates?: number[][]): string {
  return JSON.stringify({
    type: 'Feature',
    properties: {id: prefix, prefix: [prefix], suffix: 'APP', name: prefix},
    geometry: {
      type: 'Polygon',
      coordinates: [
        coordinates ?? [
          [10, 20],
          [30, 20],
          [30, 40],
          [10, 20],
        ],
      ],
    },
  });
}

function runCli(root: string, args: readonly string[], input?: string): CliResult {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', join(root, 'scripts', 'bin', 'validate-geometry.ts'), ...args],
    {
      cwd: join(root, 'scripts'),
      encoding: 'utf8',
      input,
    },
  );
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

test('--help describes changed-only path and empty-input behavior', t => {
  // Given: an isolated validator CLI
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));

  // When: help is requested
  const result = runCli(root, ['--help']);

  // Then: selection failure and no-op behavior are explicit
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Every supplied path must match; empty input/);
  assert.match(result.stdout, /is a successful no-op/);
});

test('--fix reports malformed JSON while fixing other files', t => {
  // Given: one malformed boundary and one safely fixable boundary
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/BAD/BAD.json', '{ malformed');
  const fixable = writeBoundary(
    root,
    'Boundaries/FIX/FIX.json',
    polygon('FIX', [
      [10.123456789, 20],
      [30, 20],
      [30, 40],
    ]),
  );

  // When: fix mode processes the dataset
  const result = runCli(root, ['--fix']);

  // Then: parse failure is reported, exit is non-zero, and fixable file is still repaired
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Boundaries\/BAD\/BAD\.json \[json-parse\] Invalid JSON:/);
  assert.match(result.stdout, /fixed: Boundaries\/FIX\/FIX\.json/);
  const fixed = JSON.parse(readFileSync(fixable, 'utf8'));
  assert.deepEqual(fixed.geometry.coordinates[0][0], [10.1234568, 20]);
  assert.deepEqual(fixed.geometry.coordinates[0].at(-1), [10.1234568, 20]);
});

test('--fix succeeds and is idempotent for valid fixable files', t => {
  // Given: one fixable boundary
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(
    root,
    'Boundaries/FIX/FIX.json',
    polygon('FIX', [
      [10.123456789, 20],
      [30, 20],
      [30, 40],
    ]),
  );

  // When: fix mode runs twice
  const first = runCli(root, ['--fix']);
  const second = runCli(root, ['--fix']);

  // Then: both runs succeed and only first rewrites the file
  assert.equal(first.status, 0);
  assert.match(first.stdout, /fixed: Boundaries\/FIX\/FIX\.json/);
  assert.equal(second.status, 0);
  assert.doesNotMatch(second.stdout, /fixed:/);
});

test('--changed-only rejects every unmatched positional input', t => {
  // Given: one existing boundary and one supplied missing path
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/NEW/NEW.json', polygon('NEW'));

  // When: changed-only receives mixed matched and unmatched positionals
  const result = runCli(root, [
    '--changed-only',
    'Boundaries/NEW/NEW.json',
    'Boundaries/OLD/OLD.json',
  ]);

  // Then: renamed/new path resolves but stale path is rejected explicitly
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Boundaries\/OLD\/OLD\.json.*not a boundary JSON file/);
});

test('--changed-only rejects unmatched stdin input', t => {
  // Given: a non-empty dataset
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/NEW/NEW.json', polygon('NEW'));

  // When: changed-only reads an unknown path from stdin
  const result = runCli(root, ['--changed-only'], 'Boundaries/MISSING/MISSING.json\n');

  // Then: path diagnostic is emitted and command fails
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Boundaries\/MISSING\/MISSING\.json.*not a boundary JSON file/);
});

test('--changed-only rejects unmatched mixed-separator input', t => {
  // Given: one existing boundary
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/NEW/NEW.json', polygon('NEW'));

  // When: changed-only receives a path containing both separator styles
  const result = runCli(root, ['--changed-only', 'Boundaries\\MISSING/MISSING.json']);

  // Then: path diagnostic is normalized and command fails
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Boundaries\/MISSING\/MISSING\.json.*not a boundary JSON file/);
});

test('--changed-only accepts empty input as a successful no-op', t => {
  // Given: a non-empty dataset
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/NEW/NEW.json', polygon('NEW'));

  // When: changed-only receives empty stdin
  const result = runCli(root, ['--changed-only'], '');

  // Then: command reports no work and succeeds
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No boundary files in changed set; nothing to validate\./);
});

test('--changed-only reports duplicate groups involving a selected file only', t => {
  // Given: selected and legacy duplicates plus an unrelated legacy duplicate group
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/NEW/NEW.json', polygon('DUP'));
  writeBoundary(root, 'Boundaries/LEGACY/LEGACY.json', polygon('DUP'));
  writeBoundary(root, 'Boundaries/OLD1/OLD1.json', polygon('OLD'));
  writeBoundary(root, 'Boundaries/OLD2/OLD2.json', polygon('OLD'));

  // When: only renamed/new boundary is selected
  const result = runCli(root, ['--changed-only', 'Boundaries/NEW/NEW.json']);

  // Then: its global duplicate group is reported and unrelated legacy group is omitted
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prefix\/suffix 'DUP\/APP' duplicated/);
  assert.match(result.stderr, /Boundaries\/LEGACY\/LEGACY\.json/);
  assert.doesNotMatch(result.stderr, /OLD\/APP/);
});

test('worked example contains valid JSON', () => {
  // Given: CONTRIBUTING worked example JSON block
  const markdown = readFileSync(join(repositoryRoot, 'CONTRIBUTING.md'), 'utf8');
  const workedExample = markdown.match(/## Worked example[\s\S]*?```json\s*([\s\S]*?)```/);
  assert.notEqual(workedExample, null);

  // When: example is parsed
  const parsed = JSON.parse(workedExample?.[1] ?? '');

  // Then: it is a Polygon feature
  assert.equal(parsed.geometry.type, 'Polygon');
});
