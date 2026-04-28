import {fileURLToPath} from 'url';
import {readFileSync, writeFileSync} from 'fs';
import {join, relative, resolve} from 'path';
import {parseArgs} from 'node:util';
import type {Feature, MultiPolygon, Polygon} from 'geojson';
import {findJsonFiles} from './lib/traverse.ts';
import {
  type Violation,
  applyFixes,
  findDuplicatePrefixSuffix,
  runFileChecks,
} from './lib/geometry-checks.ts';

//  CLI

const {values, positionals} = parseArgs({
  args: process.argv.slice(2),
  options: {
    'changed-only': {type: 'boolean'},
    fix: {type: 'boolean'},
    help: {type: 'boolean', short: 'h'},
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`Usage: validate-geometry [options] [files...]

Options:
  --changed-only   Only report errors in files passed as args (or via stdin).
                   Cross-file checks (e.g. duplicate prefix/suffix) still run
                   against the whole dataset, but are only reported when a
                   changed file is involved.
  --fix            Auto-fix closure and coordinate precision in place.
                   Mutually exclusive with --changed-only.
  -h, --help       Show this help.

Exits non-zero on any violation.`);
  process.exit(0);
}

const fix = !!values.fix;
const changedOnly = !!values['changed-only'];

if (fix && changedOnly) {
  console.error('--fix and --changed-only are mutually exclusive');
  process.exit(2);
}

//  Path discovery

const scriptPath = fileURLToPath(new URL(import.meta.url).toString());
const rootPath = join(scriptPath, '../../../');
const boundariesDir = join(rootPath, 'Boundaries');

const allFiles = findJsonFiles(boundariesDir);

function relSlash(file: string): string {
  return relative(rootPath, file).replace(/\\/g, '/');
}

function resolveBoundaryPath(input: string): string | null {
  const abs = resolve(rootPath, input);
  return allFiles.find(f => resolve(f) === abs) ?? null;
}

let changedSet: Set<string> | null = null;
if (changedOnly) {
  const inputs: string[] = [];
  if (positionals.length > 0) {
    inputs.push(...positionals);
  } else if (!process.stdin.isTTY) {
    const stdin = readFileSync(0, 'utf8');
    inputs.push(
      ...stdin
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean),
    );
  }
  const resolved = inputs.map(resolveBoundaryPath).filter((p): p is string => p !== null);
  changedSet = new Set(resolved);
  if (changedSet.size === 0) {
    console.log('No boundary files in changed set; nothing to validate.');
    process.exit(0);
  }
}

//  Main

const violations: Violation[] = [];
const featuresByFile = new Map<string, Feature<Polygon | MultiPolygon>>();

for (const filePath of allFiles) {
  const raw = readFileSync(filePath, 'utf8');
  let feature: Feature<Polygon | MultiPolygon>;
  try {
    feature = JSON.parse(raw);
  } catch (e) {
    violations.push({
      file: filePath,
      rule: 'json-parse',
      severity: 'error',
      message: `Invalid JSON: ${(e as Error).message}`,
    });
    continue;
  }
  featuresByFile.set(filePath, feature);

  if (fix) {
    const fixed = applyFixes(raw);
    if (fixed !== null) {
      writeFileSync(filePath, fixed);
      console.log(`fixed: ${relSlash(filePath)}`);
    }
    continue;
  }

  violations.push(...runFileChecks(filePath, feature));
}

if (fix) {
  console.log('Done. Re-run validate-geometry to confirm.');
  process.exit(0);
}

violations.push(...findDuplicatePrefixSuffix(featuresByFile));

//  Filter by changed set

let toReport = violations;
if (changedSet) {
  toReport = violations.filter(v => {
    if (v.relatedFiles && v.relatedFiles.length > 0) {
      return v.relatedFiles.some(f => changedSet!.has(f));
    }
    return changedSet!.has(v.file);
  });
}

//  Print

for (const v of toReport) {
  const extra = v.relatedFiles
    ? ` (involves: ${v.relatedFiles.map(f => relSlash(f)).join(', ')})`
    : '';
  console.error(`ERROR  ${relSlash(v.file)} [${v.rule}] ${v.message}${extra}`);
}

const summary = `${toReport.length} error(s)${changedSet ? ` across ${changedSet.size} changed file(s)` : ` across ${allFiles.length} file(s)`}`;
console.log(`\n${summary}`);

process.exit(toReport.length > 0 ? 1 : 0);
