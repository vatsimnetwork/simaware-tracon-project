# Contributing to the VATSIM TRACON Project

Thanks for helping keep this dataset accurate. This guide covers everything you need to know before opening a pull request: how can contribute, how to submit changes, and the geometry standards your data must meet.

> **Important**: All boundary data in this project must conform to [RFC 7946 (the GeoJSON format)](https://datatracker.ietf.org/doc/html/rfc7946) and to any project-specific geometry standards in this document.

## Table of contents

- [Contributing to the VATSIM TRACON Project](#contributing-to-the-vatsim-tracon-project)
  - [Table of contents](#table-of-contents)
  - [Approved contributors](#approved-contributors)
    - [If you are a staff member](#if-you-are-a-staff-member)
    - [If you are not a staff member](#if-you-are-not-a-staff-member)
  - [Submitting a pull request](#submitting-a-pull-request)
  - [Worked example](#worked-example)
  - [Geometry standards](#geometry-standards)
    - [Coordinate format](#coordinate-format)
    - [Coordinate precision (error)](#coordinate-precision-error)
    - [Polygon closure (error)](#polygon-closure-error)
    - [Minimum positions per ring](#minimum-positions-per-ring)
    - [Prefix/suffix uniqueness (error)](#prefixsuffix-uniqueness-error)
  - [Local validation workflow](#local-validation-workflow)

---

## Approved contributors

To contribute boundary data, you'll need approval from local or facility staff. The current list is published [here](https://docs.google.com/spreadsheets/u/4/d/e/2PACX-1vRHzHhKz4icslNkd3I6mF1Mp_6gan4muRcWZb8fCYL8_S0C6GDpG409xQGTmPAXLPupEWWws3euNK7O/pubhtml?gid=0).

> **Note**: The contributor database is shared with the [VAT-Spy Data Project](https://github.com/vatsimnetwork/vatspy-data-project). Approval for one project grants approval for both. If you are opening a PR and have an approval request pending, please note that in your PR.

### If you are a staff member

Email your request to `vatspy-data-project (at) vatsim.net`. If you're using a personal email (e.g. Gmail), include additional proof of your staff status.

Include:

- **GitHub username**
- **VATSIM ID**
- **Name**
- **Region/FIR**
- **Staff role**

### If you are not a staff member

Have a staff member from your facility email the request on your behalf. The email should include:

- **Your GitHub username**
- **Your name**
- **Your VATSIM ID**
- **Your Region/FIR**
- **VATSIM ID and name of the staff member sending the request**

> **Important**:
>
> - The **name** you provide will be published on the contributor list.
> - Approved contributor status lasts **2 years** unless otherwise specified. After that, a fresh request is required.
> - Approved contributors may be tagged in issues or pull requests for review.
> - Non-approved contributors may still submit pull requests if an approved contributor comments approval on the PR. This approval is **scoped to only that PR**.

---

## Submitting a pull request

1. Fork the repository and create a branch for your change.
2. Make your edits inside the appropriate `Boundaries/<FACILITY>/` folder.
3. Run the validators locally before pushing — see [Local validation workflow](#local-validation-workflow).
4. Open a pull request using the GitHub template. Fill in every section of the template.
5. Include one or more **screenshots** of the change in a GIS viewer (e.g. [geojson.io](https://geojson.io)) so reviewers can see what the sector looks like.
6. For new sectors, include supporting documentation (AIP excerpts, SOPs, official charts) so reviewers can verify the geometry against an authoritative source.

A good example PR is [#294](https://github.com/vatsimnetwork/simaware-tracon-project/pull/294).

> **Touching a legacy file?** If your PR modifies a file that contains pre-existing geometry violations (e.g. unclosed rings, excessive coordinate precision), CI will flag those issues. You're expected to clean them up as part of your PR — by editing a file, you take ownership of bringing it up to current standards. Run `yarn validate-geometry --fix` to handle the mechanical fixes automatically.

---

## Worked example

A boundary file is a single GeoJSON `Feature` with a `Polygon` or `MultiPolygon` geometry. Each file lives at `Boundaries/<FACILITY>/<SECTOR>.json` - the directory is the controlling facility's identifier, the filename is the sector identifier (commonly also the airport ICAO).

A minimal valid file looks like this:

```json
{
  "type": "Feature",
  "properties": {
    "id": "XYZ",
    "prefix": ["XYZ"],
    "suffix": "APP",
    "name": "Example Approach"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      {
        [-100.0000000, 40.0000000],
        [-100.0000000, 41.0000000],
        [-99.0000000, 41.0000000],
        [-99.0000000, 40.0000000],
        [-100.000000, 40.0000000]
      }
    ]
  }
}
```

A few things to note about the above example:

- `properties.id` is typically the label shown in the mapping tool. Keep it short.
- `properties.prefix` is an array - a single sector definition can match multiple callsign prefixes (e.g. `["LAX", "SCT"]`).
- `properties.suffix` is optional. If not included, mapping tools should treat it as `"APP"` for matching. The `prefix` and `suffix` pair must be unique across the entire dataset,
- `properties.name` is the the callsign shown to controllers/pilots.
- Coordinates are `[longitude, latitude]` in WGS84, max 7 decimal places.
- The first and last position of every polygon must match (closure). The example's outer ring opens and closes at `[-100.0000000, 40.0000000]`.

For a real-world reference, look at [`Boundaries/NZCH/NZCH.json`](Boundaries/NZCH/NZCH.json) (Christchurch Approach).

## Geometry standards

These rules apply to every Polygon and MultiPolygon in the dataset. `yarn validate-geometry` enforces them programmatically; the JSON Schema (`schema-single.json`) covers the structural rules.

### Coordinate format

- Coordinates are **`[longitude, latitude]`** decimal degrees in WGS84 / CRS84.
- Latitude must be in `[-90, 90]`; longitude in `[-180, 180]`.

### Coordinate precision (error)

Coordinates must use **at most 7 decimal places**. This rule is enforced **on changed files in pull requests**. The `main` branch is not re-validated for legacy data; it will be cleaned up gradually.

> **Auto-fix**: `yarn validate-geometry --fix` rounds all coordinates to 7 DP in place.

### Polygon closure (error)

Every linear ring **must repeat its first position as its last position** (RFC 7946 §3.1.6).

> **Auto-fix**: `yarn validate-geometry --fix` appends the first position to any unclosed ring.

### Minimum positions per ring

Each linear ring needs at least **4 positions** (3 unique vertices + the closure vertex). Anything less is not a polygon. Enforced by `schema-single.json`.

### Prefix/suffix uniqueness (error)

Each `(prefix, suffix)` pair must be unique across the entire dataset. If you need finer sectorisation, use a longer prefix (e.g. `LAX_U` instead of `LAX`) — see the README for how downstream consumers typically resolves callsigns. This is checked dataset-wide, not just per-PR.

---

## Local validation workflow

```bash
cd scripts
yarn install

# Schema check (type/structure)
yarn validate-schema

# Geometry check (RFC 7946 + project rules)
yarn validate-geometry

# Auto-fix safe rules (closure, precision)
yarn validate-geometry --fix

# Run both
yarn validate
```

`yarn validate-geometry` exits non-zero on any violation.

CI runs `yarn validate-geometry --changed-only` against the files modified in your PR. The cross-file `prefix/suffix uniqueness` check considers the full dataset and only fails when a duplicate involves at least one of your changed files.
