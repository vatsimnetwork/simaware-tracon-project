# SimAware TRACON Project
Tired of TRACON circles? SimAware TRACON Project is a community-driven initiative to draw accurate TRACON (and other APP/DEP) facilities on SimAware and other VATSIM mapping tools.


## How Do I Submit Updates?

We have chosen GitHub to be the core of this project so far, as it allows for collaboration on the project and near real-time updates to VAT-Spy data once a pull request has been pushed to the live data. Updates to data should be made directly by submitting a PR to the corresponding AIRAC branch through GitHub. Updates on GitHub that will be merged will be those that either come from verified GitHub accounts belonging to Regions, Divisions, or FIRs/ARTCCs or that have been explicitly authorized by a staff account.

If you are submitting a new boundary, create a new folder in the `Boundaries` folder with the name of the folder matching the `id` of the feature property (see **Feature Properties** below). In the folder, create one `<yoursector>.json` file for the airport, or use one JSON file per sector if you have multiple sectors that can be online (example: [Boundaries/N90](https://github.com/vatsimnetwork/simaware-tracon-project/tree/main/Boundaries/N90)).

## Submitting a Pull Request
When submitting a Pull Request in GitHub, please make sure to use the template provided by GitHub, and fill out the information asked. This way, we can more easily identify what the change is, and how to test that it is working.

You should include one or more screenshots of the change in the PR using a GIS viewer, demonstrating what the sector is supposed to look like. If this is a new change, you should also ensure that there is documentation backing up the change as necessary, for example images from an AIP that shows the sector. You can use [this example](https://github.com/vatsimnetwork/simaware-tracon-project/pull/294) to see what a PR should look like.

## How Do I Verify My Account To Submit Updates?

While we work on a contribution policy, please send an email to, or have your Region, Division, or FIR/ARTCC Leadership send an email from your/their staff Region, Division, or FIR/ARTCC linked e-mail account with your GitHub username to CURRENTLY NOT DECIDED (address subject to change). Only authorized users from each Region, Division, or FIR/ARTCC will be permitted to submit updates. **PRs from non-verified accounts will NOT be merged.**


## Feature Properties
A typical feature property is shown:

```json
{ "id":"SCT", "prefix": ["LAX"], "suffix": "DEP", "name": "SoCal Departure" }
```

* `id` - Required string. Identifier for the boundary. This will be shown as the tooltip label on the SimAware map.
* `prefix` - Required string. The set of callsign prefixes to match with the boundary.
* `suffix` - Optional string. Set as `"DEP"` if the boundary applies specifically to DEP suffixes. The above, for example, will match `"LAX_DEP"`.
* `name` - Required string. The radio callsign of the boundary.
* `label_lat` - Optional number. Latitude of desired label location. If not set, SimAware will choose the location automatically.
* `label_lon` - Optional number. Longitude of desired label location. If not set, SimAware will choose the location automatically.

## How SimAware Determines TRACON Boundaries
1. SimAware reads this GeoJSON file and records the prefix(es) and suffix of each boundary.
2. When a callsign with a matching prefix/suffix pair is found, SimAware chooses the correct TRACON boundary to draw.
3. If no matching prefix/suffix pair is found, SimAware will revert back to a TRACON circle.  Note that SimAware will assume `"suffix"="APP"` if none is specified.

Note 1: If a double prefix callsign connects, e.g. LAX_U_APP, SimAware will check for matches on *both* "LAX_U" and "LAX" before reverting to a TRACON circle.  This can be useful if further sectorization is desired, e.g. SCT Downey/Zuma sectors.  
Note 2: If the same prefix/suffix pair is specified in the GeoJSON file, SimAware *will not* know which one to choose.  Each prefix/suffix pair *must* be unique.
