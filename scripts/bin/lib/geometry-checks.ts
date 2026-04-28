// Geometry validation logic shared by validate-geometry.ts and
// ownership-report.ts.

import type {Feature, MultiPolygon, Polygon, Position} from 'geojson';

export const PRECISION_LIMIT = 7;

export type Severity = 'error' | 'warning';

export interface Violation {
  file: string;
  rule: string;
  severity: Severity;
  message: string;
  /** Files involved when the rule is cross-file (e.g. duplicate-prefix-suffix). */
  relatedFiles?: string[];
}

//  Geometry helpers

export function eachRing(
  feature: Feature<Polygon | MultiPolygon>,
  cb: (ring: Position[], polygonIndex: number, ringIndex: number) => void,
): void {
  const geom = feature.geometry;
  if (!geom) return;
  if (geom.type === 'Polygon') {
    geom.coordinates.forEach((ring, ri) => cb(ring as Position[], 0, ri));
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach((poly, pi) =>
      poly.forEach((ring, ri) => cb(ring as Position[], pi, ri)),
    );
  }
}

export function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = n.toString();
  if (s.includes('e') || s.includes('E')) {
    const [mantissa, expStr] = s.split(/[eE]/);
    const dotIdx = mantissa.indexOf('.');
    const mantissaDp = dotIdx === -1 ? 0 : mantissa.length - dotIdx - 1;
    const exp = parseInt(expStr, 10);
    return Math.max(0, mantissaDp - exp);
  }
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

export function roundCoord(n: number): number {
  const factor = 10 ** PRECISION_LIMIT;
  return Math.round(n * factor) / factor;
}

// Per-file checks

export function runFileChecks(file: string, feature: Feature<Polygon | MultiPolygon>): Violation[] {
  const violations: Violation[] = [];
  const where = (pi: number, ri: number) =>
    feature.geometry.type === 'MultiPolygon' ? `polygon ${pi}, ring ${ri}` : `ring ${ri}`;

  // Closure
  eachRing(feature, (ring, pi, ri) => {
    if (ring.length === 0) return;
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) {
      violations.push({
        file,
        rule: 'closure',
        severity: 'error',
        message: `unclosed ring at ${where(pi, ri)}: first ${JSON.stringify(f)} != last ${JSON.stringify(l)}`,
      });
    }
  });

  // Precision
  let precisionCount = 0;
  let worstDp = 0;
  let worstSample: Position | null = null;
  eachRing(feature, ring => {
    for (const pos of ring) {
      const dp = Math.max(decimalPlaces(pos[0]), decimalPlaces(pos[1]));
      if (dp > PRECISION_LIMIT) {
        precisionCount++;
        if (dp > worstDp) {
          worstDp = dp;
          worstSample = pos;
        }
      }
    }
  });
  if (precisionCount > 0) {
    violations.push({
      file,
      rule: 'precision',
      severity: 'error',
      message: `${precisionCount} coord(s) exceed ${PRECISION_LIMIT} DP (worst: ${worstDp} DP, e.g. ${JSON.stringify(worstSample)})`,
    });
  }

  return violations;
}

//  Cross-file check: duplicate prefix/suffix

export function findDuplicatePrefixSuffix(
  features: Map<string, Feature<Polygon | MultiPolygon>>,
): Violation[] {
  const seen = new Map<string, string[]>();
  for (const [file, feature] of features) {
    const props = feature.properties as {
      prefix?: string[];
      suffix?: string;
    } | null;
    if (!props || !Array.isArray(props.prefix)) continue;
    const suffix = props.suffix || 'APP';
    for (const prefix of props.prefix) {
      const key = `${prefix}|${suffix}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(file);
    }
  }
  const out: Violation[] = [];
  for (const [key, files] of seen) {
    const unique = Array.from(new Set(files));
    if (unique.length > 1) {
      for (const file of unique) {
        out.push({
          file,
          rule: 'duplicate-prefix-suffix',
          severity: 'error',
          message: `prefix/suffix '${key.replace('|', '/')}' duplicated`,
          relatedFiles: unique,
        });
      }
    }
  }
  return out;
}

//  --fix

/** Returns the rewritten file content if any change is needed, else null. */
export function applyFixes(raw: string): string | null {
  let feature: Feature<Polygon | MultiPolygon>;
  try {
    feature = JSON.parse(raw);
  } catch {
    return null;
  }
  let mutated = false;

  function mutateRing(ring: Position[]): Position[] {
    const rounded = ring.map(pos => {
      const np: Position = [roundCoord(pos[0]), roundCoord(pos[1])];
      if (np[0] !== pos[0] || np[1] !== pos[1]) mutated = true;
      return np;
    });
    if (rounded.length > 0) {
      const f = rounded[0];
      const l = rounded[rounded.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) {
        rounded.push([f[0], f[1]]);
        mutated = true;
      }
    }
    return rounded;
  }

  const geom = feature.geometry;
  if (geom?.type === 'Polygon') {
    geom.coordinates = geom.coordinates.map(r => mutateRing(r as Position[]));
  } else if (geom?.type === 'MultiPolygon') {
    geom.coordinates = geom.coordinates.map(poly => poly.map(r => mutateRing(r as Position[])));
  }

  return mutated ? JSON.stringify(feature, null, 2) : null;
}
