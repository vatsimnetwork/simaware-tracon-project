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
