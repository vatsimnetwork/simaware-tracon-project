// Generates a markdown report grouping geometry violations by primary
// contributor
//
// "Bulk-move" commits — commits that touched a very large number of files in
// one go are filtered out so they don't claim attribution they shouldn't have.
// Bulk commits are detected by file count, not by author; pass --bulk-threshold to
// tune. Files with no remaining attributable author after filtering are
// flagged as **orphaned**
//
// Usage:
//   yarn ownership-report > OWNERSHIP_REPORT.md
//   yarn ownership-report --bulk-threshold=150
//   yarn ownership-report --exclude-sha=abc123,def456

import {fileURLToPath} from 'url';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'fs';
import {join, relative} from 'path';
import {parseArgs} from 'node:util';
import {parse as parseCsv} from 'csv-parse/sync';
import type {Feature, MultiPolygon, Polygon} from 'geojson';
import {findJsonFiles} from './lib/traverse.ts';
import {type Violation, findDuplicatePrefixSuffix, runFileChecks} from './lib/geometry-checks.ts';

// --- Configuration -----------------------------------------------------------

const DEFAULT_BULK_THRESHOLD = 100;
const CONTRIBUTOR_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRHzHhKz4icslNkd3I6mF1Mp_6gan4muRcWZb8fCYL8_S0C6GDpG409xQGTmPAXLPupEWWws3euNK7O/pub?gid=0&single=true&output=csv';

// --- CLI ---------------------------------------------------------------------

const {values} = parseArgs({
  args: process.argv.slice(2),
  options: {
    'bulk-threshold': {type: 'string'},
    'exclude-sha': {type: 'string'},
    help: {type: 'boolean', short: 'h'},
  },
});

if (values.help) {
  console.log(`Usage: ownership-report [options]

Generates a markdown report grouping geometry violations by primary git
author. Output goes to stdout — pipe to a file (e.g. OWNERSHIP_REPORT.md).

Options:
  --bulk-threshold=N   Commits touching more than N files are treated as
                       structural/bulk and excluded from attribution
                       (default: ${DEFAULT_BULK_THRESHOLD}).
  --exclude-sha=A,B,C  Additional commit SHAs to exclude from attribution.
  -h, --help           Show this help.`);
  process.exit(0);
}

const bulkThreshold = values['bulk-threshold']
  ? parseInt(values['bulk-threshold'], 10)
  : DEFAULT_BULK_THRESHOLD;
if (!Number.isFinite(bulkThreshold) || bulkThreshold < 1) {
  console.error(`Invalid --bulk-threshold: ${values['bulk-threshold']}`);
  process.exit(2);
}

const explicitExcludes = new Set(
  (values['exclude-sha'] ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
);

// --- Setup -------------------------------------------------------------------

const scriptPath = fileURLToPath(new URL(import.meta.url).toString());
const rootPath = join(scriptPath, '../../../');
const boundariesDir = join(rootPath, 'Boundaries');

// --- Bulk commit detection ---------------------------------------------------

function detectBulkCommits(threshold: number): Map<string, number> {
  // Walk every commit reachable from any ref, collecting file-change count
  // per commit via --shortstat. Returns a map of SHA -> filesChanged for
  // commits exceeding the threshold.
  const out = execFileSync('git', ['log', '--all', '--shortstat', '--format=COMMIT %H'], {
    cwd: rootPath,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const result = new Map<string, number>();
  let currentSha: string | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('COMMIT ')) {
      currentSha = line.slice(7).trim().toLowerCase();
    } else if (currentSha && /files? changed/.test(line)) {
      const m = line.match(/(\d+) files? changed/);
      if (m) {
        const count = parseInt(m[1], 10);
        if (count > threshold) {
          result.set(currentSha, count);
        }
      }
      currentSha = null;
    }
  }
  return result;
}

// --- Git attribution ---------------------------------------------------------

interface CommitRecord {
  sha: string;
  name: string;
  email: string;
  date: string;
}

interface AuthorAttribution {
  name: string;
  email: string;
  commitCount: number;
  lastTouched: string;
}

function gitFileHistory(file: string): CommitRecord[] {
  let out: string;
  try {
    out = execFileSync('git', ['log', '--follow', '--format=%H|%an|%ae|%aI', '--', file], {
      cwd: rootPath,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  return out
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [sha, name, email, date] = line.split('|');
      return {
        sha: (sha ?? '').toLowerCase(),
        name: name ?? '',
        email: email ?? '',
        date: date ?? '',
      };
    });
}

function attribute(
  file: string,
  excludedShas: Set<string>,
): {primary: AuthorAttribution | null; all: AuthorAttribution[]} {
  const history = gitFileHistory(file);
  const filtered = history.filter(c => !excludedShas.has(c.sha));
  if (filtered.length === 0) return {primary: null, all: []};

  const groups = new Map<string, AuthorAttribution>();
  for (const c of filtered) {
    const key = `${c.name}|${c.email.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.commitCount++;
      if (c.date > existing.lastTouched) existing.lastTouched = c.date;
    } else {
      groups.set(key, {
        name: c.name,
        email: c.email,
        commitCount: 1,
        lastTouched: c.date,
      });
    }
  }
  const all = Array.from(groups.values()).sort((a, b) => {
    if (a.commitCount !== b.commitCount) return b.commitCount - a.commitCount;
    return b.lastTouched.localeCompare(a.lastTouched);
  });
  return {primary: all[0], all};
}

// --- Contributor CSV ---------------------------------------------------------

interface ContributorRow {
  username: string;
  expiry: string;
  cid: string;
  name: string;
  region: string;
  role: string;
  approvingCid: string;
  approvingStaff: string;
}

async function loadContributorIndex(): Promise<Map<string, ContributorRow>> {
  const csv = await (await fetch(CONTRIBUTOR_CSV_URL)).text();
  const rows = parseCsv<ContributorRow>(csv, {
    columns: [
      'username',
      'expiry',
      'cid',
      'name',
      'region',
      'role',
      'approvingCid',
      'approvingStaff',
    ],
    skip_empty_lines: true,
  });
  const idx = new Map<string, ContributorRow>();
  for (const row of rows) {
    if (row.name) idx.set(row.name.toLowerCase().trim(), row);
    if (row.username) idx.set(row.username.toLowerCase().trim(), row);
  }
  return idx;
}

/**
 * Extract the GitHub username from a github.com noreply email.
 *   modern: 12345678+username@users.noreply.github.com  -> username
 *   legacy: username@users.noreply.github.com           -> username
 * Returns null for any other email.
 */
function extractGithubUsername(email: string): string | null {
  const m = email
    .toLowerCase()
    .trim()
    .match(/^(?:\d+\+)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)@users\.noreply\.github\.com$/);
  return m ? m[1] : null;
}

function lookupContributor(
  author: AuthorAttribution,
  idx: Map<string, ContributorRow>,
): ContributorRow | null {
  const ghUser = extractGithubUsername(author.email);
  if (ghUser) {
    const hit = idx.get(ghUser);
    if (hit) return hit;
  }
  return idx.get(author.name.toLowerCase().trim()) ?? null;
}

// --- Types -------------------------------------------------------------------

interface FileEntry {
  file: string;
  relPath: string;
  rules: Set<string>;
  primary: AuthorAttribution | null;
  allAuthors: AuthorAttribution[];
}

// --- Main --------------------------------------------------------------------

async function main() {
  console.error('Detecting bulk-move commits...');
  const detectedBulk = detectBulkCommits(bulkThreshold);
  const excludedShas = new Set<string>([...detectedBulk.keys(), ...explicitExcludes]);
  console.error(
    `  ${detectedBulk.size} commit(s) exceed --bulk-threshold=${bulkThreshold} (excluded from attribution)` +
      (explicitExcludes.size > 0 ? `; +${explicitExcludes.size} explicit --exclude-sha` : ''),
  );
  if (detectedBulk.size > 0) {
    const top = [...detectedBulk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [sha, files] of top) {
      console.error(`    ${sha.slice(0, 12)}  ${files} files`);
    }
  }

  console.error('Scanning Boundaries/ ...');
  const allFiles = findJsonFiles(boundariesDir);
  const featuresByFile = new Map<string, Feature<Polygon | MultiPolygon>>();
  const violations: Violation[] = [];

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
    violations.push(...runFileChecks(filePath, feature));
  }
  violations.push(...findDuplicatePrefixSuffix(featuresByFile));

  const perFile = new Map<string, FileEntry>();
  for (const v of violations) {
    const rel = relative(rootPath, v.file).replace(/\\/g, '/');
    if (!perFile.has(v.file)) {
      perFile.set(v.file, {
        file: v.file,
        relPath: rel,
        rules: new Set(),
        primary: null,
        allAuthors: [],
      });
    }
    perFile.get(v.file)!.rules.add(v.rule);
  }

  console.error(`Attributing ${perFile.size} files via git log...`);
  let i = 0;
  for (const entry of perFile.values()) {
    if (++i % 100 === 0) console.error(`  ... ${i}/${perFile.size}`);
    const {primary, all} = attribute(entry.file, excludedShas);
    entry.primary = primary;
    entry.allAuthors = all;
  }

  console.error('Fetching contributor spreadsheet...');
  let contributorIdx: Map<string, ContributorRow>;
  try {
    contributorIdx = await loadContributorIndex();
  } catch (e) {
    console.error(`(failed: ${(e as Error).message}; continuing without contributor metadata)`);
    contributorIdx = new Map();
  }

  renderReport(perFile, violations, contributorIdx, {
    bulkThreshold,
    bulkCommitsExcluded: detectedBulk.size,
    explicitExcludes: explicitExcludes.size,
  });
}

interface ReportMeta {
  bulkThreshold: number;
  bulkCommitsExcluded: number;
  explicitExcludes: number;
}

function renderReport(
  perFile: Map<string, FileEntry>,
  allViolations: Violation[],
  contributorIdx: Map<string, ContributorRow>,
  meta: ReportMeta,
) {
  const out: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const errorRules = new Map<string, number>();
  const warningRules = new Map<string, number>();
  for (const v of allViolations) {
    const m = v.severity === 'error' ? errorRules : warningRules;
    m.set(v.rule, (m.get(v.rule) ?? 0) + 1);
  }

  out.push(`# Cleanup Ownership Report — ${today}`);
  out.push('');
  out.push(
    `Generated by \`yarn ownership-report\`. Commits that touched more than \`${meta.bulkThreshold}\` files are excluded from attribution as structural/bulk operations (\`${meta.bulkCommitsExcluded}\` such commit(s) detected${meta.explicitExcludes > 0 ? `; +${meta.explicitExcludes} explicit --exclude-sha` : ''}). Files with no remaining attributable author are flagged as **orphaned**.`,
  );
  out.push('');

  out.push('## Summary');
  out.push('');
  out.push(`- Files with at least one violation: **${perFile.size}**`);
  out.push('');
  out.push('### Errors');
  out.push('');
  for (const [rule, count] of [...errorRules.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`- \`${rule}\`: ${count}`);
  }
  out.push('');
  out.push('### Warnings');
  out.push('');
  for (const [rule, count] of [...warningRules.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`- \`${rule}\`: ${count}`);
  }
  out.push('');

  const orphans = [...perFile.values()].filter(e => e.primary === null);
  out.push(`## Orphaned files — ${orphans.length}`);
  out.push('');
  if (orphans.length === 0) {
    out.push('_(none — every violating file has at least one non-bulk-move author)_');
  } else {
    out.push(
      'Files where every commit was filtered as bulk/structural. The maintainer must reclaim or rebuild attribution for these.',
    );
    out.push('');
    out.push('| File | Violations |');
    out.push('|---|---|');
    for (const e of orphans.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      out.push(`| \`${e.relPath}\` | ${[...e.rules].sort().join(', ')} |`);
    }
  }
  out.push('');

  const byAuthor = new Map<string, FileEntry[]>();
  for (const e of perFile.values()) {
    if (!e.primary) continue;
    const key = `${e.primary.name}|${e.primary.email.toLowerCase()}`;
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key)!.push(e);
  }
  const sortedAuthors = [...byAuthor.entries()].sort((a, b) => b[1].length - a[1].length);

  out.push(`## Files by primary author — ${sortedAuthors.length} contributor(s)`);
  out.push('');

  for (const [, files] of sortedAuthors) {
    const author = files[0].primary!;
    const contributor = lookupContributor(author, contributorIdx);
    const ghUser = extractGithubUsername(author.email);
    const ghHint = ghUser ? ` — gh: \`${ghUser}\`` : '';
    const status = contributor
      ? `**${contributor.name || author.name}** (${contributor.username || '—'}, ${contributor.region || '—'}, role: ${contributor.role || '—'}, expires ${contributor.expiry || '—'})`
      : `**${author.name}** \`<${author.email}>\`${ghHint} *(not in contributor spreadsheet)*`;
    out.push(`### ${status} — ${files.length} file(s)`);
    out.push('');
    for (const e of files.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const otherAuthors = e.allAuthors
        .slice(1)
        .map(a => `${a.name} (${a.commitCount})`)
        .join(', ');
      const others = otherAuthors ? ` — also: ${otherAuthors}` : '';
      const last = e.primary!.lastTouched.slice(0, 10);
      out.push(
        `- [ ] \`${e.relPath}\` — ${[...e.rules].sort().join(', ')} — ${e.primary!.commitCount} commit(s), last ${last}${others}`,
      );
    }
    out.push('');
  }

  const dupes = allViolations.filter(v => v.rule === 'duplicate-prefix-suffix');
  if (dupes.length > 0) {
    out.push('## Duplicate prefix/suffix pairs (manual resolution required)');
    out.push('');
    out.push(
      'Each pair below has two or more files matching the same `(prefix, suffix)`. One file in each group must be renamed (different prefix/suffix) or deleted.',
    );
    out.push('');
    const grouped = new Map<string, Set<string>>();
    for (const v of dupes) {
      const m = v.message.match(/'([^']+)'/);
      if (!m) continue;
      const key = m[1];
      if (!grouped.has(key)) grouped.set(key, new Set());
      (v.relatedFiles ?? []).forEach(f =>
        grouped.get(key)!.add(relative(rootPath, f).replace(/\\/g, '/')),
      );
    }
    for (const [key, files] of grouped) {
      out.push(
        `- \`${key}\` — ${[...files]
          .sort()
          .map(f => `\`${f}\``)
          .join(' + ')}`,
      );
    }
    out.push('');
  }

  process.stdout.write(out.join('\n') + '\n');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
