import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type ContributorRow,
  checkContributor,
  evaluateContributor,
  parseExpiry,
} from './contributors.ts';

function row(username: string, expiry: string, name = 'Test Person'): ContributorRow {
  return {
    username,
    expiry,
    cid: '1234567',
    name,
    region: 'Oceania',
    role: 'Staff',
    approvingCid: '7654321',
    approvingStaff: 'Approver',
  };
}

const utc = (iso: string): Date => new Date(`${iso}Z`);

test('parseExpiry reads the spreadsheet format and ISO dates as UTC midnight', () => {
  // Given: dates in the format used by the contributor sheet and in ISO form
  // When: they are parsed
  // Then: both resolve to the same UTC calendar day
  assert.equal(parseExpiry('5 Aug 2027')?.toISOString(), '2027-08-05T00:00:00.000Z');
  assert.equal(parseExpiry('18 Jul 2027')?.toISOString(), '2027-07-18T00:00:00.000Z');
  assert.equal(parseExpiry('2027-08-05')?.toISOString(), '2027-08-05T00:00:00.000Z');
  assert.equal(parseExpiry('  5 aug 2027  ')?.toISOString(), '2027-08-05T00:00:00.000Z');
});

test('parseExpiry rejects text that is not a real calendar date', () => {
  // Given: values that Date() would silently accept, reinterpret or roll over
  // When: they are parsed
  // Then: none of them produce a date
  for (const bad of [
    '',
    'Expiry date',
    '31 Feb 2027',
    '5 Foo 2027',
    'never',
    '2027-13-01',
    '5/8/2027',
  ]) {
    assert.equal(parseExpiry(bad), null, `expected "${bad}" to be rejected`);
  }
});

test('approval holds through the whole expiry day and lapses the next UTC day', () => {
  // Given: a contributor whose approval expires on 5 Aug 2027
  const rows = [row('alice', '5 Aug 2027')];

  // When: evaluated at the start of the day, the last second of it, and the next midnight
  const first = evaluateContributor(rows, 'alice', utc('2027-08-05T00:00:00'));
  const last = evaluateContributor(rows, 'alice', utc('2027-08-05T23:59:59'));
  const next = evaluateContributor(rows, 'alice', utc('2027-08-06T00:00:00'));

  // Then: only the next day is expired
  assert.equal(first.status, 'approved');
  assert.equal(last.status, 'approved');
  assert.equal(next.status, 'expired');
});

test('login matching ignores case and surrounding whitespace', () => {
  // Given: a mixed-case username in the sheet
  const rows = [row(' DirtyFormal ', '5 Aug 2027')];

  // When: looked up with a different case
  const result = evaluateContributor(rows, 'dirtyformal', utc('2027-01-01T00:00:00'));

  // Then: it matches
  assert.equal(result.status, 'approved');
});

test('an unknown or missing login is not found', () => {
  // Given: a sheet that does not list the login
  const rows = [row('alice', '5 Aug 2027')];
  const now = utc('2027-01-01T00:00:00');

  // When/Then: unknown, empty and undefined logins all report not-found
  assert.equal(evaluateContributor(rows, 'bob', now).status, 'not-found');
  assert.equal(evaluateContributor(rows, '', now).status, 'not-found');
  assert.equal(evaluateContributor(rows, undefined, now).status, 'not-found');
});

test('a renewal row approves even when an older row for the same login has expired', () => {
  // Given: the same login listed twice, an old expired row and a newer valid one
  const rows = [row('alice', '9 Nov 2025'), row('alice', '5 Mar 2028')];

  // When: evaluated while only the newer row is valid, in either row order
  const now = utc('2026-11-01T00:00:00');
  const forward = evaluateContributor(rows, 'alice', now);
  const reversed = evaluateContributor([...rows].reverse(), 'alice', now);

  // Then: approved on the renewal row both times
  assert.equal(forward.status, 'approved');
  assert.equal(reversed.status, 'approved');
  assert.equal(forward.status === 'approved' && forward.row.expiry, '5 Mar 2028');
});

test('a login whose every row has expired is reported as expired with the latest date', () => {
  // Given: two expired rows for the same login
  const rows = [row('alice', '9 Nov 2024'), row('alice', '5 Mar 2025')];

  // When: evaluated after both
  const result = evaluateContributor(rows, 'alice', utc('2026-11-01T00:00:00'));

  // Then: expired, naming the most recent expiry
  assert.equal(result.status, 'expired');
  assert.equal(result.status === 'expired' && result.row.expiry, '5 Mar 2025');
});

test('an unreadable expiry fails closed instead of approving', () => {
  // Given: a row whose expiry is not a date
  const rows = [row('alice', 'sometime')];

  // When: evaluated
  const result = evaluateContributor(rows, 'alice', utc('2026-11-01T00:00:00'));

  // Then: it is not approved
  assert.equal(result.status, 'invalid-expiry');
});

test('a valid row still approves when another row for the login is unreadable', () => {
  // Given: one unreadable row and one valid row
  const rows = [row('alice', 'sometime'), row('alice', '5 Mar 2028')];

  // When: evaluated
  const result = evaluateContributor(rows, 'alice', utc('2026-11-01T00:00:00'));

  // Then: the valid row wins
  assert.equal(result.status, 'approved');
});

test('checkContributor keeps the exact "not found" output the PR bot matches on', () => {
  // Given: a login that is not listed
  const rows = [row('alice', '5 Aug 2027')];
  const now = utc('2026-11-01T00:00:00');

  // When: checked without and with failWhenMissing
  const soft = checkContributor(rows, 'bob', now, false);
  const hard = checkContributor(rows, 'bob', now, true);

  // Then: output is exactly "not found" and only the strict mode errors
  assert.equal(soft.output, 'not found');
  assert.equal(soft.error, null);
  assert.equal(hard.error, 'Contributor with login bob was not found');
});

test('checkContributor shows the expiry for an approved contributor and does not error', () => {
  // Given: a valid contributor
  const rows = [row('alice', '5 Aug 2027', 'Alice Example')];

  // When: checked in strict mode
  const result = checkContributor(rows, 'alice', utc('2026-11-01T00:00:00'), true);

  // Then: details include the expiry date
  assert.equal(result.error, null);
  assert.match(result.output, /^Contributor data:/);
  assert.match(result.output, /- Name: Alice Example/);
  assert.match(result.output, /- Expires: 5 Aug 2027/);
});

test('checkContributor errors in strict mode for an expired contributor and says so otherwise', () => {
  // Given: an expired contributor
  const rows = [row('alice', '5 Aug 2025')];
  const now = utc('2026-11-01T00:00:00');

  // When: checked in strict and non-strict mode
  const strict = checkContributor(rows, 'alice', now, true);
  const soft = checkContributor(rows, 'alice', now, false);

  // Then: strict mode errors, and both outputs lead with the expiry so a PR comment is clear
  assert.equal(strict.error, 'Contributor alice approval expired on 5 Aug 2025');
  assert.equal(soft.error, null);
  for (const out of [strict.output, soft.output]) {
    assert.match(out, /^Approval for alice expired on 5 Aug 2025\./);
  }
  assert.notEqual(soft.output, 'not found');
});

test('checkContributor errors in strict mode for an unreadable expiry', () => {
  // Given: a row with a non-date expiry
  const rows = [row('alice', 'sometime')];

  // When: checked in strict mode
  const result = checkContributor(rows, 'alice', utc('2026-11-01T00:00:00'), true);

  // Then: it errors and quotes the bad value
  assert.match(result.error ?? '', /unreadable expiry date "sometime"/);
});
