import assert from 'node:assert/strict';
import test from 'node:test';

import {applyFixes} from './geometry-checks.ts';

interface ConsoleErrorCall {
  message: unknown;
  error: unknown;
}

async function captureConsoleError(action: () => string | null): Promise<{
  result: string | null;
  calls: ConsoleErrorCall[];
}> {
  const calls: ConsoleErrorCall[] = [];
  const original = console.error;
  console.error = (message?: unknown, error?: unknown): void => {
    calls.push({message, error});
  };
  try {
    return {result: action(), calls};
  } finally {
    console.error = original;
  }
}

function closedPolygonRaw(): string {
  return JSON.stringify({
    type: 'Feature',
    properties: {id: 'SCT'},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [10, 20],
          [30, 20],
          [30, 40],
          [10, 20],
        ],
      ],
    },
  });
}

test('returns null and logs context once when geometry JSON is malformed', async () => {
  // Given: malformed input and an instrumented console.error
  // When: applyFixes attempts to parse the raw geometry file
  const {result, calls} = await captureConsoleError(() => applyFixes('{ malformed json'));

  // Then: no rewritten content is produced and exactly one contextual SyntaxError is logged
  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, 'Failed to parse geometry JSON while applying fixes:');
  assert.ok(calls[0].error instanceof SyntaxError);
});

test('returns null without logging when valid geometry is unchanged', async () => {
  // Given: already valid closed Polygon coordinates within the precision limit
  // When: applyFixes checks the feature
  const {result, calls} = await captureConsoleError(() => applyFixes(closedPolygonRaw()));

  // Then: no rewrite and no diagnostics are emitted
  assert.equal(result, null);
  assert.equal(calls.length, 0);
});

test('rounds and closes Polygon coordinates idempotently without logging', async () => {
  // Given: an unclosed Polygon with coordinates beyond the precision limit
  const raw = JSON.stringify({
    type: 'Feature',
    properties: {id: 'SCT'},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [10.123456789, 20.123456789],
          [30, 20],
          [30, 40],
        ],
      ],
    },
  });

  // When: applyFixes rewrites the feature
  const {result, calls} = await captureConsoleError(() => applyFixes(raw));

  // Then: coordinates are rounded, the ring is closed, and no diagnostic is logged
  assert.notEqual(result, null);
  const fixed = JSON.parse(result!);
  assert.deepEqual(fixed.geometry.coordinates[0], [
    [10.1234568, 20.1234568],
    [30, 20],
    [30, 40],
    [10.1234568, 20.1234568],
  ]);
  assert.equal(calls.length, 0);

  // When: applyFixes runs again on the fixed output
  const second = await captureConsoleError(() => applyFixes(result!));

  // Then: the rewrite is idempotent and silent
  assert.equal(second.result, null);
  assert.equal(second.calls.length, 0);
});

test('rounds and closes MultiPolygon coordinates idempotently without logging', async () => {
  // Given: a MultiPolygon with an imprecise closed ring and an unclosed ring
  const raw = JSON.stringify({
    type: 'Feature',
    properties: {id: 'SCT'},
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [10.123456789, 20.123456789],
            [30, 20],
            [10.123456789, 20.123456789],
          ],
        ],
        [
          [
            [40, 20],
            [50, 20],
            [50, 40],
          ],
        ],
      ],
    },
  });

  // When: applyFixes rewrites the feature
  const {result, calls} = await captureConsoleError(() => applyFixes(raw));

  // Then: each ring is rounded and closed, and no diagnostic is logged
  assert.notEqual(result, null);
  const fixed = JSON.parse(result!);
  assert.deepEqual(fixed.geometry.coordinates, [
    [
      [
        [10.1234568, 20.1234568],
        [30, 20],
        [10.1234568, 20.1234568],
      ],
    ],
    [
      [
        [40, 20],
        [50, 20],
        [50, 40],
        [40, 20],
      ],
    ],
  ]);
  assert.equal(calls.length, 0);

  // When: applyFixes runs again on the fixed output
  const second = await captureConsoleError(() => applyFixes(result!));

  // Then: the rewrite is idempotent and silent
  assert.equal(second.result, null);
  assert.equal(second.calls.length, 0);
});
