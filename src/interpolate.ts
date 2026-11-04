import { GPXData, InterpolateOptions } from './types';
import {
  gpxRemoveDuplicates,
  gpxCalculateDistance,
  cumsum,
  linspace,
} from './gpx-utils';
import { pchipInterpolate } from './pchip';

/**
 * Interpolate a single segment of GPX data
 */
function interpolateSegment(
  gpxData: GPXData,
  startIdx: number,
  endIdx: number,
  resolution: number,
  numPoints: number | null,
  onProgress?: (percent: number) => void,
  progressStart?: number,
  progressEnd?: number
): GPXData {
  // Extract segment data
  const segmentData: GPXData = {
    lat: gpxData.lat.slice(startIdx, endIdx + 1),
    lon: gpxData.lon.slice(startIdx, endIdx + 1),
    ele: gpxData.ele ? gpxData.ele.slice(startIdx, endIdx + 1) : null,
    tstamp: gpxData.tstamp ? gpxData.tstamp.slice(startIdx, endIdx + 1) : null,
    tzinfo: gpxData.tzinfo,
  };

  // Skip if only one point
  if (segmentData.lat.length < 2) {
    return segmentData;
  }

  // Calculate cumulative distance
  const _gpxDist = gpxCalculateDistance(segmentData, true);
  const xi = cumsum(_gpxDist);
  const totalDist = xi[xi.length - 1];

  // Skip if total distance is too small
  if (totalDist < resolution) {
    return segmentData;
  }

  // Prepare data arrays for interpolation
  const yi: number[][] = [];
  yi.push(segmentData.lat);
  yi.push(segmentData.lon);
  if (segmentData.ele) yi.push(segmentData.ele);
  if (segmentData.tstamp) yi.push(segmentData.tstamp);

  // Determine number of output points
  const numPts = numPoints !== null ? numPoints : Math.ceil(totalDist / resolution);

  // Create interpolation points
  const x = linspace(xi[0], xi[xi.length - 1], Math.max(2, numPts));

  // Interpolate each dimension with progress updates
  // For very large arrays, process in chunks to avoid stack overflow
  const CHUNK_SIZE = 50000;
  const interpolatedData: number[][] = [];

  for (let i = 0; i < yi.length; i++) {
    if (x.length <= CHUNK_SIZE) {
      // Small enough - interpolate all at once
      interpolatedData.push(pchipInterpolate(xi, yi[i], x));
    } else {
      // Large array - interpolate in chunks
      const result: number[] = [];
      for (let start = 0; start < x.length; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, x.length);
        const xChunk = x.slice(start, end);
        const chunkResult = pchipInterpolate(xi, yi[i], xChunk);
        result.push(...chunkResult);
      }
      interpolatedData.push(result);
    }

    if (onProgress && progressStart !== undefined && progressEnd !== undefined) {
      const progress = progressStart + ((i + 1) / yi.length) * (progressEnd - progressStart);
      onProgress(progress);
    }
  }

  // Build output data structure
  let idx = 0;
  return {
    lat: interpolatedData[idx++],
    lon: interpolatedData[idx++],
    ele: segmentData.ele ? interpolatedData[idx++] : null,
    tstamp: segmentData.tstamp ? interpolatedData[idx++] : null,
    tzinfo: segmentData.tzinfo,
  };
}

/**
 * Interpolate GPX data using piecewise cubic Hermite splines
 *
 * @param gpxData - Input GPX data
 * @param options - Interpolation options (or resolution in meters for backward compatibility)
 * @param num - Force point count in output (deprecated, use options.numPoints)
 * @returns Interpolated GPX data
 */
export function gpxInterpolate(
  gpxData: GPXData,
  options: InterpolateOptions | number = 1.0,
  num: number | null = null
): GPXData {
  // Handle backward compatibility: gpxInterpolate(data, resolution, numPoints)
  const opts: InterpolateOptions =
    typeof options === 'number'
      ? { resolution: options, numPoints: num }
      : options;

  const {
    resolution = 1.0,
    numPoints = null,
    minDistance = 0,
    maxGap = Infinity,
    preserveOriginal = false,
    onProgress,
  } = opts;

  // Check if data is empty
  if (
    (!gpxData.lat || gpxData.lat.length === 0) &&
    (!gpxData.lon || gpxData.lon.length === 0) &&
    (!gpxData.ele || gpxData.ele.length === 0) &&
    (!gpxData.tstamp || gpxData.tstamp.length === 0)
  ) {
    return gpxData;
  }

  // Remove duplicates
  const _gpxData = gpxRemoveDuplicates(gpxData);

  // If only one or two points, return as is
  if (_gpxData.lat.length < 2) {
    return _gpxData;
  }

  // Calculate distances between consecutive points
  const distances = gpxCalculateDistance(_gpxData, true);
  const sourceBreaks = new Set(_gpxData.segmentStarts ?? []);

  // Build segments based on gaps and minDistance threshold
  interface ProcessSegment {
    startIdx: number;
    endIdx: number;
    shouldInterpolate: boolean;
  }

  const segments: ProcessSegment[] = [];
  let segmentStart = 0;

  for (let i = 1; i < _gpxData.lat.length; i++) {
    const dist = distances[i];
    const isGap = dist > maxGap || sourceBreaks.has(i);
    const isLast = i === _gpxData.lat.length - 1;

    if (isGap) {
      // End current segment before the gap
      if (i - 1 >= segmentStart) {
        // Check if segment needs interpolation
        let segmentDist = 0;
        for (let j = segmentStart + 1; j < i; j++) {
          segmentDist += distances[j];
        }
        segments.push({
          startIdx: segmentStart,
          endIdx: i - 1,
          shouldInterpolate: segmentDist > minDistance,
        });
      }
      segmentStart = i;
    }

    if (isLast) {
      // Calculate segment distance
      let segmentDist = 0;
      for (let j = segmentStart + 1; j <= i; j++) {
        if (j < distances.length && distances[j] <= maxGap) {
          segmentDist += distances[j];
        }
      }
      segments.push({
        startIdx: segmentStart,
        endIdx: i,
        shouldInterpolate: segmentDist > minDistance,
      });
    }
  }

  // Process each segment
  const resultLat: number[] = [];
  const resultLon: number[] = [];
  const resultEle: number[] = [];
  const resultTstamp: number[] = [];
  const resultSegmentStarts: number[] = [];

  const totalSegments = segments.length;

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    if (sourceBreaks.has(segment.startIdx)) {
      resultSegmentStarts.push(resultLat.length);
    }
    const progressStart = (s / totalSegments) * 100;
    const progressEnd = ((s + 1) / totalSegments) * 100;

    if (segment.shouldInterpolate && segment.endIdx > segment.startIdx) {
      // Interpolate this segment
      const interpolated = interpolateSegment(
        _gpxData,
        segment.startIdx,
        segment.endIdx,
        resolution,
        numPoints,
        onProgress,
        progressStart,
        progressEnd
      );

      // Add original points if preserveOriginal is true
      if (preserveOriginal) {
        // Merge original points with interpolated
        const origPoints = new Set<string>();
        for (let i = segment.startIdx; i <= segment.endIdx; i++) {
          origPoints.add(`${_gpxData.lat[i]},${_gpxData.lon[i]}`);
        }

        for (let i = 0; i < interpolated.lat.length; i++) {
          resultLat.push(interpolated.lat[i]);
          resultLon.push(interpolated.lon[i]);
          if (interpolated.ele) resultEle.push(interpolated.ele[i]);
          if (interpolated.tstamp) resultTstamp.push(interpolated.tstamp[i]);
        }
      } else {
        // Use Array.prototype.push.apply or concat for large arrays to avoid stack overflow
        // The spread operator (...) can cause stack overflow with large arrays
        for (let i = 0; i < interpolated.lat.length; i++) {
          resultLat.push(interpolated.lat[i]);
          resultLon.push(interpolated.lon[i]);
          if (interpolated.ele) resultEle.push(interpolated.ele[i]);
          if (interpolated.tstamp) resultTstamp.push(interpolated.tstamp[i]);
        }
      }
    } else {
      // Copy segment as-is (no interpolation needed or gap)
      for (let i = segment.startIdx; i <= segment.endIdx; i++) {
        resultLat.push(_gpxData.lat[i]);
        resultLon.push(_gpxData.lon[i]);
        if (_gpxData.ele) resultEle.push(_gpxData.ele[i]);
        if (_gpxData.tstamp) resultTstamp.push(_gpxData.tstamp[i]);
      }
    }

    if (onProgress) {
      onProgress(progressEnd);
    }
  }

  return {
    lat: resultLat,
    lon: resultLon,
    ele: _gpxData.ele ? resultEle : null,
    tstamp: _gpxData.tstamp ? resultTstamp : null,
    tzinfo: _gpxData.tzinfo,
    ...(resultSegmentStarts.length > 0 && { segmentStarts: resultSegmentStarts }),
  };
}

/**
 * Interpolate GPX data with advanced options
 * This is the recommended API for new code
 */
export function interpolateTrack(
  gpxData: GPXData,
  options: InterpolateOptions = {}
): GPXData {
  return gpxInterpolate(gpxData, options);
}
