# Maintaining the VATSIM TRACON Project

This guide is for project maintainers. Contributors should read [CONTRIBUTING.md](CONTRIBUTING.md).

## Table of contents

- [Maintaining the VATSIM TRACON Project](#maintaining-the-vatsim-tracon-project)
  - [Table of contents](#table-of-contents)
  - [Reviewing a pull request](#reviewing-a-pull-request)
    - [What CI checks](#what-ci-checks)
    - [What CI does not check](#what-ci-does-not-check)
  - [Tracking data quality on main](#tracking-data-quality-on-main)
  - [Cleanup outreach with the ownership report](#cleanup-outreach-with-the-ownership-report)
  - [Working on the scripts](#working-on-the-scripts)
  - [Releasing](#releasing)

---

## Reviewing a pull request

When a PR is opened, a workflow comments with a link to compare the data on the VATSIM Radar map, and a second comment reports whether the author is on the approved-contributor list.

### What CI checks

Every PR runs [`check.yml`](.github/workflows/check.yml):

| Job                         | What it does                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `check-schemas`             | Validates every boundary file against `schema-single.json`.                                                              |
| `validate-geometry-changed` | Runs `validate-geometry --changed-only` on boundary files added, modified or renamed in the PR. Skipped if none changed. |
| `validate-contributor`      | Fails if the PR author's GitHub login is not on the contributor list.                                                    |
| `compile-boundaries`        | Builds `TRACONBoundaries.geojson` and uploads it as the `TRACONBoundaries-pr-<number>` artifact.                         |
| `enforce-dir-structure`     | Requires `Boundaries/<FACILITY>/<name>.json` and no empty facility folders.                                              |
| `lint`                      | ESLint and Prettier on `scripts/`.                                                                                       |
| `test`                      | Unit tests for the scripts.                                                                                              |

Geometry rules are enforced on changed files only. Legacy violations in files a PR does not touch are deliberately ignored. The one cross-file rule, prefix/suffix uniqueness, looks at the whole dataset but only reports duplicate groups that include a changed file.

`validate-contributor` will be red for authors who are not on the list. CONTRIBUTING.md allows a non-listed author to submit if an approved contributor comments approval on the PR, so check for that comment yourself.

### What CI does not check

Whether the geometry is correct. Use the PR template's evidence:

- Screenshots of the new geometry in a GIS viewer, plus an overview if several sectors changed.
- A screenshot or excerpt of the authoritative source (AIP, SOP, chart).
- Supporting documentation for any new sector.

Also check that a PR touching a legacy file has cleaned that file up, and that the VATSIM Radar compare link looks right.

## Tracking data quality on main

Each push to `main` runs [`push.yml`](.github/workflows/push.yml), which includes a non-blocking full-dataset geometry sweep. It never fails the workflow. Download the `geometry-report` artifact from the run in the Actions tab (kept for 30 days). The last line of the file is the exit code of the sweep, and `0` means the dataset is clean.

The same check locally:

```bash
cd scripts
yarn validate-geometry
```

This exits non-zero while any legacy violation exists, so `yarn validate` (schema plus full geometry) is not a usable pass/fail gate until the dataset is cleaned up.

## Cleanup outreach with the ownership report

`ownership-report` runs the geometry checks over the whole dataset, then maps each violating file to the people who last edited it. It is for working out who to ask to fix their files.

```bash
cd scripts
yarn ownership-report > ../OWNERSHIP_REPORT.md
```

`OWNERSHIP_REPORT.md` at the repository root is in `.gitignore`. Use that name so the report cannot be committed by accident.

On Windows PowerShell, do not redirect with `>` or pipe the output. PowerShell decodes the script's output with the console code page and corrupts non-ASCII characters such as the dashes in the report title. Use `cmd` instead:

```bat
cd scripts
cmd /c "yarn ownership-report > ..\OWNERSHIP_REPORT.md"
```

Things to know before you trust the output:

- **It needs the full git history.** The script reads `git log --all`, and a shallow clone makes it wrong. In a shallow clone the oldest visible commit appears to add every file, gets classed as a bulk edit, and is thrown away, so files whose real history was cut off are reported as orphaned. If `git rev-parse --is-shallow-repository` prints `true`, run `git fetch --unshallow` first.
- **It reads the contributor spreadsheet over the network.** If the fetch fails it logs a message to stderr and carries on without contributor details, so authors are marked as not in the spreadsheet.
- **It runs one `git log --follow` per violating file**, so expect it to take a while on the full dataset.
- **Orphaned files** are files where every commit was filtered out as bulk. They have no attributable author and need a maintainer to follow up.

## Working on the scripts

All commands run from `scripts/`:

```bash
yarn            # install dependencies
yarn test       # unit tests (node's built-in test runner)
yarn lint       # ESLint
yarn format     # Prettier, rewrites files
yarn format:check
```

CI runs `lint`, `format:check` and `test` on every PR. Scripts run directly as TypeScript through Node's `--experimental-strip-types`, so Node 22 or newer is required.

## Releasing

Releases are manual. Run the **Version bump, build and release** workflow from the Actions tab. It compiles `TRACONBoundaries.geojson`, bumps the patch version tag, builds a changelog from the commits since the previous tag, and publishes a GitHub release with the compiled file attached.
