import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const workflowPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../.github/workflows/check.yml',
);

function extractRunBlock(workflow: string, stepName: string): string {
  const lines = workflow.split(/\r?\n/);
  const nameIdx = lines.findIndex(l => l.trim() === `- name: ${stepName}`);
  assert.notEqual(nameIdx, -1, `step "${stepName}" not found in check.yml`);
  const runIdx = lines.findIndex((l, i) => i > nameIdx && l.trim() === 'run: |');
  assert.notEqual(runIdx, -1, `run block for "${stepName}" not found`);
  const body: string[] = [];
  const baseIndent = lines[runIdx + 1].length - lines[runIdx + 1].trimStart().length;
  for (const line of lines.slice(runIdx + 1)) {
    const indent = line.length - line.trimStart().length;
    if (line.trim() !== '' && indent < baseIndent) break;
    body.push(line.slice(baseIndent));
  }
  return body.join('\n');
}

const script = extractRunBlock(readFileSync(workflowPath, 'utf8'), 'Validate Directory Structure');

// On Windows, `bash` on PATH is often the WSL launcher, which neither shares the
// working directory nor passes `$` through, so use Git Bash there. A shell is only
// accepted once it proves it runs in the given directory and expands variables.
function findBash(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')]
      : ['bash'];
  for (const candidate of candidates) {
    const dir = mkdtempSync(join(tmpdir(), 'bash-probe-'));
    try {
      writeFileSync(join(dir, 'marker.txt'), '');
      const probe = spawnSync(candidate, ['-s'], {
        input: 'v=ok; for f in *.txt; do echo "$v:$f"; done\n',
        cwd: dir,
        encoding: 'utf8',
      });
      if (probe.status === 0 && probe.stdout.trim() === 'ok:marker.txt') return candidate;
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  }
  return null;
}

const bash = findBash();
const bashAvailable = bash !== null || process.env.CI === 'true';

function runStep(root: string): {status: number | null; stdout: string} {
  const result = spawnSync(bash!, ['-s'], {
    input: script.replace(/\r\n/g, '\n') + '\n',
    cwd: root,
    encoding: 'utf8',
  });
  return {status: result.status, stdout: result.stdout};
}

function createSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'dir-structure-'));
  mkdirSync(join(root, 'Boundaries'));
  return root;
}

test(
  'enforce-dir-structure accepts facility folders that contain JSON files',
  {skip: !bashAvailable},
  t => {
    // Given: a facility folder holding one boundary file
    const root = createSandbox();
    t.after(() => rmSync(root, {recursive: true, force: true}));
    mkdirSync(join(root, 'Boundaries', 'OK'));
    writeFileSync(join(root, 'Boundaries', 'OK', 'OK.json'), '{}');

    // When: the workflow step runs
    const result = runStep(root);

    // Then: it passes
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Directory structure is valid\./);
  },
);

test('enforce-dir-structure rejects an empty facility folder', {skip: !bashAvailable}, t => {
  // Given: a facility folder with no files at all
  const root = createSandbox();
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'Boundaries', 'EMPTY'));

  // When: the workflow step runs
  const result = runStep(root);

  // Then: it fails and names the folder instead of reporting success
  assert.equal(result.status, 1);
  assert.match(result.stdout, /No JSON files found in directory Boundaries\/EMPTY/);
  assert.doesNotMatch(result.stdout, /Directory structure is valid\./);
});

test(
  'enforce-dir-structure rejects a folder with only non-JSON files',
  {skip: !bashAvailable},
  t => {
    // Given: a facility folder containing a non-JSON file
    const root = createSandbox();
    t.after(() => rmSync(root, {recursive: true, force: true}));
    mkdirSync(join(root, 'Boundaries', 'TXT'));
    writeFileSync(join(root, 'Boundaries', 'TXT', 'notes.txt'), 'x');

    // When: the workflow step runs
    const result = runStep(root);

    // Then: it fails
    assert.equal(result.status, 1);
  },
);

test(
  'enforce-dir-structure rejects a stray file directly under Boundaries',
  {skip: !bashAvailable},
  t => {
    // Given: a file that is not inside a facility folder
    const root = createSandbox();
    t.after(() => rmSync(root, {recursive: true, force: true}));
    writeFileSync(join(root, 'Boundaries', 'stray.json'), '{}');

    // When: the workflow step runs
    const result = runStep(root);

    // Then: it fails
    assert.equal(result.status, 1);
  },
);
