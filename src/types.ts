/**
 * GPX data structure containing track points and metadata (internal format)
 * Uses parallel arrays for efficient processing
 */
export interface GPXData {
  lat: number[];
  lon: number[];
  ele: number[] | null;
  tstamp: number[] | null;
  tzinfo: string | null;
}

/**
 * GPX track point (user-friendly format)
 */
export interface GPXPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: Date;
  speed?: number;
}

/**
 * Interpolation options
 */
export interface InterpolateOptions {
  /** Interpolation resolution in meters (distance between output points). Default: 1.0 */
  resolution?: number;
  /** Force exact number of output points (overrides resolution) */
  numPoints?: number | null;
  /** Only interpolate segments longer than this threshold in meters. Default: 0 (interpolate all) */
  minDistance?: number;
  /** Skip interpolation for segments longer than this (GPS signal loss gaps). Default: Infinity */
  maxGap?: number;
  /** Preserve original points in output. Default: false */
  preserveOriginal?: boolean;
  /** Progress callback for long operations (0-100) */
  onProgress?: (percent: number) => void;
}

/**
 * Track segment (for handling GPS gaps)
 */
export interface TrackSegment {
  startIndex: number;
  endIndex: number;
  distance: number;
  duration: number | null;
}

/**
 * Track statistics
 */
export interface TrackStatistics {
  /** Total track distance in meters */
  totalDistance: number;
  /** Total duration in seconds (null if no timestamps) */
  totalDuration: number | null;
  /** Number of track points */
  pointCount: number;
  /** Average speed in m/s (null if no timestamps) */
  avgSpeed: number | null;
  /** Maximum speed in m/s (null if no timestamps) */
  maxSpeed: number | null;
  /** Elevation gain in meters (null if no elevation data) */
  elevationGain: number | null;
  /** Elevation loss in meters (null if no elevation data) */
  elevationLoss: number | null;
  /** Minimum elevation in meters (null if no elevation data) */
  minElevation: number | null;
  /** Maximum elevation in meters (null if no elevation data) */
  maxElevation: number | null;
  /** Bounding box */
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  /** Segment count (separated by gaps > maxGap) */
  segmentCount: number;
}
