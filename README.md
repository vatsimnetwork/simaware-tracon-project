# SimAware TRACON Project

The SimAware TRACON Project is a community-driven initiative to have accurate TRACON (and other APP/DEP) facilities depicted on various VATSIM mapping tools. This project was originally developed exclusively for SimAware, although is open for community use.

## Approved Contributors

To contribute to this dataset, you'll need approval from a local or facility staff member. You can find a list of currently approved contributors [here](https://docs.google.com/spreadsheets/u/4/d/e/2PACX-1vRHzHhKz4icslNkd3I6mF1Mp_6gan4muRcWZb8fCYL8_S0C6GDpG409xQGTmPAXLPupEWWws3euNK7O/pubhtml?gid=0).

> [!Note]
> A common contributor database is shared between this project and the [VAT-Spy Data Project](https://github.com/vatsimnetwork/vatspy-data-project). If you have approval to contribute to one project, you are approved to contribute to either.

### If you are a staff member

Email your request to vatspy-data-project (at) vatsim.net.  
If you're using a personal email (e.g., Gmail), we'll need additional proof of your staff status.

Please include the following information in your email:

- **GitHub username:**
- **VATSIM ID:**
- **Name:**
- **Region/FIR:**
- **Staff role**
 
### If you are not a staff member

Contact the staff in your facility and have them send a request for your account to be approved.

The email they send should include:

- **Your GitHub username:**
- **Your Name:**
- **Your VATSIM ID:**
- **Your Region/FIR:**
- **VATSIM ID + name of staff member sending the request:**

> [!IMPORTANT]
>
> - The **Name** you provide will be published on the contributor list.
> - Approved contributor status lasts **2 years** unless otherwise specified. After this, a new request must be sent.
> - Contributors on the list may be tagged in issues or pull requests for their attention or input.
> - Non-approved users can still contribute if an approved user comments on their pull request, confirming they approve the changes.

### Submitting a Pull Request

When submitting a Pull Request in GitHub, please make sure to use the template provided by GitHub, and fill out the information asked. This way, we can more easily identify what the change is, and how to test that it is working.

You should include one or more screenshots of the change in the PR using a GIS viewer, demonstrating what the sector is supposed to look like. If this is a new change, you should also ensure that there is documentation backing up the change as necessary, for example images from an AIP that shows the sector. You can use [this example](https://github.com/vatsimnetwork/simaware-tracon-project/pull/294) to see what a PR should look like.

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

Note 1: If a double prefix callsign connects, e.g. LAX_U_APP, SimAware will check for matches on _both_ "LAX_U" and "LAX" before reverting to a TRACON circle. This can be useful if further sectorization is desired, e.g. SCT Downey/Zuma sectors.  
Note 2: If the same prefix/suffix pair is specified in the GeoJSON file, SimAware _will not_ know which one to choose. Each prefix/suffix pair _must_ be unique.

## Who's on the SimAware TRACON Project?

- Tom Kilpatrick - Project Lead
- Danila Rodichkin - Data Management Team

We also wish to thank previous contributors to this project, notably Karl Mathias Moberg and Maius Wong.
