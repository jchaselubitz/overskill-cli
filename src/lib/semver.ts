import semver from 'semver';

/**
 * Check if a version string is valid semver
 */
export function isValidVersion(version: string): boolean {
  return semver.valid(version) !== null;
}

/**
 * Parse a version string
 */
export function parseVersion(version: string): semver.SemVer | null {
  return semver.parse(version);
}

/**
 * Compare two versions
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  return semver.compare(v1, v2);
}

/**
 * Check if a version satisfies a constraint
 */
export function satisfies(version: string, constraint: string): boolean {
  return semver.satisfies(version, constraint);
}

/**
 * Get the highest version from a list that satisfies a constraint
 */
export function maxSatisfying(versions: string[], constraint: string): string | null {
  return semver.maxSatisfying(versions, constraint);
}

/**
 * Bump a version by type
 */
export function bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string | null {
  return semver.inc(version, type);
}

/**
 * Auto-bump version (patch by default)
 */
export function autoBump(version: string): string {
  const bumped = semver.inc(version, 'patch');
  return bumped || version;
}

/**
 * Check if v1 is greater than v2
 */
export function isGreaterThan(v1: string, v2: string): boolean {
  return semver.gt(v1, v2);
}

/**
 * Check if v1 is less than v2
 */
export function isLessThan(v1: string, v2: string): boolean {
  return semver.lt(v1, v2);
}

/**
 * Check if two versions are equal
 */
export function isEqual(v1: string, v2: string): boolean {
  return semver.eq(v1, v2);
}

/**
 * Parse a version constraint
 * Supports: exact (1.0.0), range (>=1.0.0, ^1.0.0, ~1.0.0)
 */
export function parseConstraint(constraint: string): {
  type: 'exact' | 'range';
  value: string;
} {
  const cleanConstraint = constraint.trim();

  if (
    cleanConstraint.startsWith('>=') ||
    cleanConstraint.startsWith('^') ||
    cleanConstraint.startsWith('~') ||
    cleanConstraint.startsWith('>') ||
    cleanConstraint.startsWith('<') ||
    cleanConstraint.includes(' ')
  ) {
    return { type: 'range', value: cleanConstraint };
  }

  return { type: 'exact', value: cleanConstraint };
}

/**
 * Resolve a version from a list based on constraint
 */
export function resolveVersion(
  versions: string[],
  constraint?: string
): string | null {
  if (!constraint) {
    // No constraint - return latest (highest version)
    const sorted = [...versions].sort(semver.rcompare);
    return sorted[0] || null;
  }

  const { type, value } = parseConstraint(constraint);

  if (type === 'exact') {
    return versions.includes(value) ? value : null;
  }

  return maxSatisfying(versions, value);
}

/**
 * Sort versions in descending order (newest first)
 */
export function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort(semver.rcompare);
}

/**
 * Sort versions in ascending order (oldest first)
 */
export function sortVersionsAsc(versions: string[]): string[] {
  return [...versions].sort(semver.compare);
}
