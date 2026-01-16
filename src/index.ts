/**
 * GPX Interpolate - TypeScript implementation
 * Interpolate GPX files using piecewise cubic Hermite splines
 */

// Types
export {
  GPXData,
  GPXPoint,
  InterpolateOptions,
  TrackSegment,
  TrackStatistics,
} from './types';

// Core interpolation
export { gpxInterpolate, interpolateTrack } from './interpolate';

// File I/O (Node.js only)
export { gpxRead, gpxWrite } from './gpx-io';

// Utilities
export {
  gpxCalculateDistance,
  gpxCalculateSpeed,
  gpxRemoveDuplicates,
  gpxCalculateStatistics,
  gpxDataToPoints,
  pointsToGpxData,
  detectSegments,
  haversineDistance,
  formatDistance,
  formatDuration,
  cumsum,
  linspace,
} from './gpx-utils';

// PCHIP interpolation (for advanced usage)
export { pchipInterpolate, pchipInterpolateMulti } from './pchip';
