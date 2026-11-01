import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const sourceBin = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(sourceBin, '../..');

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function createSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-geometry-'));
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

test('--fix with file arguments only rewrites the selected files', t => {
  // Given: two fixable boundaries, only one of which is selected
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const messy = [
    [10.123456789, 20],
    [30, 20],
    [30, 40],
  ];
  const selected = writeBoundary(root, 'Boundaries/AAA/AAA.json', polygon('AAA', messy));
  const untouched = writeBoundary(root, 'Boundaries/BBB/BBB.json', polygon('BBB', messy));
  const untouchedBefore = readFileSync(untouched, 'utf8');

  // When: fix mode is given a single path
  const result = runCli(root, ['--fix', 'Boundaries/AAA/AAA.json']);

  // Then: only the selected file is rewritten
  assert.equal(result.status, 0);
  assert.match(result.stdout, /fixed: Boundaries\/AAA\/AAA\.json/);
  assert.doesNotMatch(result.stdout, /BBB/);
  assert.deepEqual(
    JSON.parse(readFileSync(selected, 'utf8')).geometry.coordinates[0][0],
    [10.1234568, 20],
  );
  assert.equal(readFileSync(untouched, 'utf8'), untouchedBefore);
});

test('--fix with file arguments ignores malformed JSON in unselected files', t => {
  // Given: a malformed boundary that is not selected and a fixable one that is
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/BAD/BAD.json', '{ malformed');
  writeBoundary(
    root,
    'Boundaries/FIX/FIX.json',
    polygon('FIX', [
      [10.123456789, 20],
      [30, 20],
      [30, 40],
    ]),
  );

  // When: fix mode is scoped to the fixable file
  const result = runCli(root, ['--fix', 'Boundaries/FIX/FIX.json']);

  // Then: the unselected file is not read, so it is not reported
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /BAD/);
});

test('--fix rejects every unmatched file argument without changing anything', t => {
  // Given: one fixable boundary and one stale path
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const fixable = writeBoundary(
    root,
    'Boundaries/FIX/FIX.json',
    polygon('FIX', [
      [10.123456789, 20],
      [30, 20],
      [30, 40],
    ]),
  );
  const before = readFileSync(fixable, 'utf8');

  // When: fix mode receives a matched and an unmatched path
  const result = runCli(root, ['--fix', 'Boundaries/FIX/FIX.json', 'Boundaries/OLD/OLD.json']);

  // Then: the command fails before writing anything
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Boundaries\/OLD\/OLD\.json.*not a boundary JSON file/);
  assert.equal(readFileSync(fixable, 'utf8'), before);
});

test('file arguments without --fix or --changed-only are rejected', t => {
  // Given: a boundary that would otherwise be validated as part of the full dataset
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeBoundary(root, 'Boundaries/NEW/NEW.json', polygon('NEW'));

  // When: a path is supplied with neither scoping flag
  const result = runCli(root, ['Boundaries/NEW/NEW.json']);

  // Then: the command refuses rather than silently validating everything
  assert.equal(result.status, 2);
  assert.match(result.stderr, /require --fix or --changed-only/);
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
