import {parse} from 'csv-parse/sync';

export const CONTRIBUTOR_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRHzHhKz4icslNkd3I6mF1Mp_6gan4muRcWZb8fCYL8_S0C6GDpG409xQGTmPAXLPupEWWws3euNK7O/pub?gid=0&single=true&output=csv';

export interface ContributorRow {
  username: string;
  expiry: string;
  cid: string;
  name: string;
  region: string;
  role: string;
  approvingCid: string;
  approvingStaff: string;
}

export type ContributorStatus =
  | {status: 'not-found'}
  | {status: 'approved'; row: ContributorRow}
  | {status: 'expired'; row: ContributorRow}
  | {status: 'invalid-expiry'; row: ContributorRow};

export interface ContributorCheck {
  /** Text for the PR comment and job log. Exactly "not found" when the login is unlisted. */
  output: string;
  /** Set when a strict check should fail the job. */
  error: string | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function utcDate(year: number, monthIndex: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day;
  return valid ? date : null;
}

/**
 * Parses the sheet's "5 Aug 2027" format, or ISO "2027-08-05", as 00:00 UTC on that day.
 * Returns null for anything else, including dates that would roll over (31 Feb).
 */
export function parseExpiry(text: string): Date | null {
  const value = text.trim();
  const sheet = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (sheet) {
    const month = MONTHS.indexOf(sheet[2].toLowerCase());
    return month === -1 ? null : utcDate(Number(sheet[3]), month, Number(sheet[1]));
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A login may be listed more than once (renewals), so it is approved if any of its
 * rows is still valid. Approval runs through the whole expiry day (UTC).
 */
export function evaluateContributor(
  rows: readonly ContributorRow[],
  login: string | undefined,
  now: Date,
): ContributorStatus {
  const wanted = login?.trim().toLowerCase();
  if (!wanted) return {status: 'not-found'};
  const matches = rows.filter(r => r.username.trim().toLowerCase() === wanted);
  if (matches.length === 0) return {status: 'not-found'};

  let latestExpired: {row: ContributorRow; date: Date} | null = null;
  let unreadable: ContributorRow | null = null;
  for (const row of matches) {
    const date = parseExpiry(row.expiry);
    if (date === null) {
      unreadable ??= row;
    } else if (now.getTime() < date.getTime() + DAY_MS) {
      return {status: 'approved', row};
    } else if (latestExpired === null || date > latestExpired.date) {
      latestExpired = {row, date};
    }
  }
  if (latestExpired) return {status: 'expired', row: latestExpired.row};
  return {status: 'invalid-expiry', row: unreadable!};
}

export function checkContributor(
  rows: readonly ContributorRow[],
  login: string | undefined,
  now: Date,
  failWhenMissing: boolean,
): ContributorCheck {
  const result = evaluateContributor(rows, login, now);
  switch (result.status) {
    case 'not-found':
      return {
        output: 'not found',
        error: failWhenMissing ? `Contributor with login ${login} was not found` : null,
      };
    case 'approved': {
      const u = result.row;
      return {
        output: `Contributor data:\n- CID: ${u.cid}\n- Name: ${u.name}\n- Region: ${u.region}\n- Role: ${u.role}\n- Approving CID: ${u.approvingCid}\n- Approving staff: ${u.approvingStaff}\n- Expires: ${u.expiry}`,
        error: null,
      };
    }
    case 'expired':
      return {
        output: `Approval for ${login} expired on ${result.row.expiry}. Ask the facility's staff to request a renewal; see CONTRIBUTING.md.`,
        error: failWhenMissing
          ? `Contributor ${login} approval expired on ${result.row.expiry}`
          : null,
      };
    case 'invalid-expiry':
      return {
        output: `Approval for ${login} has an unreadable expiry date "${result.row.expiry}" in the contributor list.`,
        error: failWhenMissing
          ? `Contributor ${login} has an unreadable expiry date "${result.row.expiry}"`
          : null,
      };
  }
}

export function parseContributorCsv(csv: string): ContributorRow[] {
  return parse<ContributorRow>(csv, {
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
}

export async function loadContributorRows(): Promise<ContributorRow[]> {
  const response = await fetch(CONTRIBUTOR_CSV_URL);
  if (!response.ok) {
    throw new Error(`Contributor list request failed: HTTP ${response.status}`);
  }
  return parseContributorCsv(await response.text());
}
