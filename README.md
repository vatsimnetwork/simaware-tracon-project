# SimAware TRACON Project

The SimAware TRACON Project is a community-driven initiative to have accurate TRACON (and other APP/DEP) facilities depicted on various VATSIM mapping tools. This project was originally developed exclusively for SimAware, although is open for community use.

> Boundary data must conform to [RFC 7946 (The GeoJSON Format)](https://datatracker.ietf.org/doc/html/rfc7946) and the project's geometry standards. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Contributing

Contribution requires approval from Division-level or Sub-Division-level staff. The full process — including the approved-contributor list, PR submission requirements, and the geometry standards your data must meet — lives in **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Feature Properties

A typical feature property is shown:

```json
{ "id": "SCT", "prefix": ["LAX"], "suffix": "DEP", "name": "SoCal Departure" }
```

- `id` - Required string. Identifier for the boundary. This will be shown as the tooltip label on the SimAware map.
- `prefix` - Required string. The set of callsign prefixes to match with the boundary.
- `suffix` - Optional string. Set as `"DEP"` if the boundary applies specifically to DEP suffixes. The above, for example, will match `"LAX_DEP"`.
- `name` - Required string. The radio callsign of the boundary.
- `label_lat` - Optional number. Latitude of desired label location. If not set, SimAware will choose the location automatically.
- `label_lon` - Optional number. Longitude of desired label location. If not set, SimAware will choose the location automatically.

## How SimAware Determines TRACON Boundaries

1. SimAware reads this GeoJSON file and records the prefix(es) and suffix of each boundary.
2. When a callsign with a matching prefix/suffix pair is found, SimAware chooses the correct TRACON boundary to draw.
3. If no matching prefix/suffix pair is found, SimAware will revert back to a TRACON circle. Note that SimAware will assume `"suffix"="APP"` if none is specified.

Note 1: If a double prefix callsign connects, e.g. LAX*U_APP, SimAware will check for matches on \_both* "LAX\*U" and "LAX" before reverting to a TRACON circle. This can be useful if further sectorization is desired, e.g. SCT Downey/Zuma sectors.  
Note 2: If the same prefix/suffix pair is specified in the GeoJSON file, SimAware _will not_ know which one to choose. Each prefix/suffix pair _must_ be unique. This is enforced by the validator — see [CONTRIBUTING.md](CONTRIBUTING.md#prefixsuffix-uniqueness-error).

## Who's on the SimAware TRACON Project?

- Tom Kilpatrick - Project Lead
- Danila Rodichkin - Data Management Team

We also wish to thank previous contributors to this project, notably Karl Mathias Moberg and Maius Wong.
