import { GPXData, GPXPoint, TrackStatistics, TrackSegment } from './types';

// Constants
const EARTH_RADIUS = 6371e3; // meters
const EPS = 1e-6; // seconds

/**
 * Calculate distance between GPX trackpoints using Haversine formula
 */
export function gpxCalculateDistance(
  gpxData: GPXData,
  useEle: boolean = true
): number[] {
  const gpxDist = new Array(gpxData.lat.length).fill(0);

  for (let i = 0; i < gpxDist.length - 1; i++) {
    const lat1 = (gpxData.lat[i] * Math.PI) / 180;
    const lon1 = (gpxData.lon[i] * Math.PI) / 180;
    const lat2 = (gpxData.lat[i + 1] * Math.PI) / 180;
    const lon2 = (gpxData.lon[i + 1] * Math.PI) / 180;

    const deltaLat = lat2 - lat1;
    const deltaLon = lon2 - lon1;

    // Haversine formula
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(a));

    const distLatLon = EARTH_RADIUS * c; // great-circle distance

    if (gpxData.ele && useEle) {
      const distEle = gpxData.ele[i + 1] - gpxData.ele[i];
      gpxDist[i + 1] = Math.sqrt(distLatLon ** 2 + distEle ** 2);
    } else {
      gpxDist[i + 1] = distLatLon;
    }
  }

  return gpxDist;
}

/**
 * Calculate speed between GPX trackpoints
 */
export function gpxCalculateSpeed(gpxData: GPXData): number[] {
  const gpxDist = gpxCalculateDistance(gpxData, true);

  if (!gpxData.tstamp || gpxData.tstamp.length === 0) {
    throw new Error('Timestamp data is required to calculate speed');
  }

  const gpxDtstamp: number[] = [0];
  for (let i = 1; i < gpxData.tstamp.length; i++) {
    gpxDtstamp.push(gpxData.tstamp[i] - gpxData.tstamp[i - 1]);
  }

  const gpxSpeed: number[] = [];
  for (let i = 0; i < gpxDist.length; i++) {
    if (gpxDtstamp[i] < EPS) {
      gpxSpeed.push(0);
    } else {
      gpxSpeed.push(gpxDist[i] / gpxDtstamp[i]);
    }
  }

  return gpxSpeed;
}

/**
 * Remove duplicate trackpoints
 */
export function gpxRemoveDuplicates(gpxData: GPXData): GPXData {
  const gpxDist = gpxCalculateDistance(gpxData, false);

  const iDist: number[] = [0];
  for (let i = 1; i < gpxDist.length; i++) {
    if (gpxDist[i] !== 0) {
      iDist.push(i);
    }
  }

  if (iDist.length === gpxDist.length) {
    return gpxData;
  }

  const gpxDataNodup: GPXData = {
    lat: iDist.map((i) => gpxData.lat[i]),
    lon: iDist.map((i) => gpxData.lon[i]),
    ele: gpxData.ele ? iDist.map((i) => gpxData.ele![i]) : null,
    tstamp: gpxData.tstamp ? iDist.map((i) => gpxData.tstamp![i]) : null,
    tzinfo: gpxData.tzinfo,
  };

  return gpxDataNodup;
}

/**
 * Cumulative sum of an array
 */
export function cumsum(arr: number[]): number[] {
  const result: number[] = [];
  let sum = 0;
  for (const val of arr) {
    sum += val;
    result.push(sum);
  }
  return result;
}

/**
 * Create linearly spaced array
 */
export function linspace(start: number, end: number, num: number): number[] {
  const result: number[] = [];
  const step = (end - start) / (num - 1);
  for (let i = 0; i < num; i++) {
    result.push(start + step * i);
  }
  return result;
}

/**
 * Calculate distance between two points (Haversine formula)
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lon1Rad = (lon1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const lon2Rad = (lon2 * Math.PI) / 180;

  const deltaLat = lat2Rad - lat1Rad;
  const deltaLon = lon2Rad - lon1Rad;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));

  return EARTH_RADIUS * c;
}

/**
 * Convert GPXData (internal format) to GPXPoint[] (user-friendly format)
 */
export function gpxDataToPoints(data: GPXData): GPXPoint[] {
  const points: GPXPoint[] = [];
  for (let i = 0; i < data.lat.length; i++) {
    const point: GPXPoint = {
      lat: data.lat[i],
      lon: data.lon[i],
    };
    if (data.ele && data.ele[i] !== undefined) {
      point.ele = data.ele[i];
    }
    if (data.tstamp && data.tstamp[i] !== undefined) {
      point.time = new Date(data.tstamp[i] * 1000);
    }
    points.push(point);
  }
  return points;
}

/**
 * Convert GPXPoint[] (user-friendly format) to GPXData (internal format)
 */
export function pointsToGpxData(
  points: GPXPoint[],
  tzinfo: string | null = 'Z'
): GPXData {
  const hasEle = points.some((p) => p.ele !== undefined);
  const hasTime = points.some((p) => p.time !== undefined);

  return {
    lat: points.map((p) => p.lat),
    lon: points.map((p) => p.lon),
    ele: hasEle ? points.map((p) => p.ele ?? 0) : null,
    tstamp: hasTime
      ? points.map((p) => (p.time ? p.time.getTime() / 1000 : 0))
      : null,
    tzinfo,
  };
}

/**
 * Detect track segments separated by gaps larger than maxGap
 */
export function detectSegments(
  gpxData: GPXData,
  maxGap: number = Infinity
): TrackSegment[] {
  const segments: TrackSegment[] = [];
  const distances = gpxCalculateDistance(gpxData, true);

  let segmentStart = 0;

  for (let i = 1; i < gpxData.lat.length; i++) {
    const isGap = distances[i] > maxGap;
    const isLast = i === gpxData.lat.length - 1;

    if (isGap || isLast) {
      const endIndex = isGap ? i - 1 : i;

      // Calculate segment distance
      let segmentDistance = 0;
      for (let j = segmentStart + 1; j <= endIndex; j++) {
        segmentDistance += distances[j];
      }

      // Calculate segment duration
      let duration: number | null = null;
      if (gpxData.tstamp) {
        duration = gpxData.tstamp[endIndex] - gpxData.tstamp[segmentStart];
      }

      segments.push({
        startIndex: segmentStart,
        endIndex,
        distance: segmentDistance,
        duration,
      });

      segmentStart = i;
    }
  }

  return segments;
}

/**
 * Calculate track statistics
 */
export function gpxCalculateStatistics(
  gpxData: GPXData,
  maxGap: number = Infinity
): TrackStatistics {
  const distances = gpxCalculateDistance(gpxData, true);
  const totalDistance = distances.reduce((a, b) => a + b, 0);

  // Duration
  let totalDuration: number | null = null;
  if (gpxData.tstamp && gpxData.tstamp.length >= 2) {
    totalDuration =
      gpxData.tstamp[gpxData.tstamp.length - 1] - gpxData.tstamp[0];
  }

  // Speed calculations
  let avgSpeed: number | null = null;
  let maxSpeed: number | null = null;
  if (gpxData.tstamp) {
    const speeds = gpxCalculateSpeed(gpxData);
    avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    maxSpeed = Math.max(...speeds);
  }

  // Elevation calculations
  let elevationGain: number | null = null;
  let elevationLoss: number | null = null;
  let minElevation: number | null = null;
  let maxElevation: number | null = null;

  if (gpxData.ele && gpxData.ele.length > 0) {
    elevationGain = 0;
    elevationLoss = 0;

    for (let i = 1; i < gpxData.ele.length; i++) {
      const diff = gpxData.ele[i] - gpxData.ele[i - 1];
      if (diff > 0) {
        elevationGain += diff;
      } else {
        elevationLoss += Math.abs(diff);
      }
    }

    minElevation = Math.min(...gpxData.ele);
    maxElevation = Math.max(...gpxData.ele);
  }

  // Bounds
  const bounds = {
    minLat: Math.min(...gpxData.lat),
    maxLat: Math.max(...gpxData.lat),
    minLon: Math.min(...gpxData.lon),
    maxLon: Math.max(...gpxData.lon),
  };

  // Segments
  const segments = detectSegments(gpxData, maxGap);

  return {
    totalDistance,
    totalDuration,
    pointCount: gpxData.lat.length,
    avgSpeed,
    maxSpeed,
    elevationGain,
    elevationLoss,
    minElevation,
    maxElevation,
    bounds,
    segmentCount: segments.length,
  };
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format distance in human-readable format
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters.toFixed(0)} m`;
}
