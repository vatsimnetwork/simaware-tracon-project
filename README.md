# SimAware TRACON Project
Tired of TRACON circles? SimAware TRACON Project is a community-driven initiative to draw accurate TRACON (and other APP/DEP) facilities on SimAware and other VATSIM mapping tools.

## Contributing
SimAware TRACON Project is open to anyone willing to contribute.

## Feature Properties
A typical feature property is shown:
`{ "id":"SCT", "prefix": ["LAX"], "suffix": "DEP", "name": "SoCal Departure" }`


`id`: (mandatory string) An identifier for the boundary.  This will be shown as the tooltip label on the SimAware map.  
`prefix`: (mandatory array) The set of callsign prefixes to match with the boundary.  
`suffix`: (optional string) Set as "DEP" if the boundary applies specifically to DEP suffixes.  The above, for example, will match "LAX_DEP".  
`name`: The radio callsign of the boundary.  
`label_lat`: (optional number) latitude of desired label location.  If not set, SimAware will choose the location automatically.  
`label_lon`: (optional number) longitude of desired label location.  If not set, SimAware will choose the location automatically.  

## How SimAware Determines TRACON Boundaries
1. SimAware reads this GeoJSON file and records the prefix(es) and suffix of each boundary.
2. When a callsign with a matching prefix/suffix pair is found, SimAware chooses the correct TRACON boundary to draw.
3. If no matching prefix/suffix pair is found, SimAware will revert back to a TRACON circle.  Note that SimAware will assume `"suffix"="APP"` if none is specified.

Note 1: If a double prefix callsign connects, e.g. LAX_U_APP, SimAware will check for matches on *both* "LAX_U" and "LAX" before reverting to a TRACON circle.  This can be useful if further sectorization is desired, e.g. SCT Downey/Zuma sectors.  
Note 2: If the same prefix/suffix pair is specified in the GeoJSON file, SimAware *will not* know which one to choose.  Each prefix/suffix pair *must* be unique.
