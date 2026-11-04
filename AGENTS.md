# GPX Interpolator - Project Summary

## Overview
TypeScript/Node.js library and CLI tool for interpolating GPX track files using Piecewise Cubic Hermite Interpolating Polynomial (PCHIP) splines. Adds intermediate points between GPS track points for smoother, more detailed tracks.

**Package Name:** `@weited/gpx-interpolator`
**Version:** 0.1.0
**License:** MIT

## Key Features
- Smooth interpolation using PCHIP algorithm (maintains monotonicity, prevents overshooting)
- Distance-based resolution (specify meters between interpolated points)
- Point-based resolution (force exact output point count)
- Automatic duplicate point removal
- GPS gap detection and track segmentation
- Timestamp and elevation preservation/interpolation
- Optional speed calculation
- Track statistics (distance, duration, elevation gain/loss, bounds)
- Both CLI tool and programmatic API

## Project Structure

```
src/
├── types.ts          # TypeScript interfaces (GPXData, GPXPoint, InterpolateOptions, etc.)
├── pchip.ts          # PCHIP interpolation algorithm implementation
├── gpx-utils.ts      # Utility functions (distance, speed, statistics, formatting)
├── gpx-io.ts         # File I/O (read/write GPX XML files)
├── interpolate.ts    # Main interpolation logic
├── cli.ts            # Command-line interface
└── index.ts          # Public API exports
```

## Core Data Types

### GPXData (Internal Format)
Parallel arrays for efficient processing:
```typescript
{
  lat: number[];           // Latitude values
  lon: number[];           // Longitude values
  ele: number[] | null;    // Elevation in meters
  tstamp: number[] | null; // Unix timestamps (seconds)
  tzinfo: string | null;   // Timezone (e.g., "Z", "+08:00")
}
```

### GPXPoint (User-Friendly Format)
```typescript
{
  lat: number;
  lon: number;
  ele?: number;
  time?: Date;
  speed?: number;
}
```

### InterpolateOptions
```typescript
{
  resolution?: number;      // meters between points (default: 1.0)
  numPoints?: number;       // force exact count (overrides resolution)
  minDistance?: number;     // only interpolate segments > this (default: 0)
  maxGap?: number;          // split at gaps > this (default: Infinity)
  preserveOriginal?: boolean;
  onProgress?: (percent: number) => void;
}
```

## Algorithm Flow

1. **Read & Parse:** Extract lat/lon/ele/time from GPX XML
2. **Clean:** Remove duplicate consecutive points
3. **Segment:** Detect GPS signal gaps (> maxGap threshold)
4. **Distance:** Calculate cumulative distance using Haversine formula
5. **Interpolate:** Apply PCHIP to each dimension (lat, lon, ele, time)
6. **Generate:** Create evenly-spaced points based on resolution
7. **Write:** Save to GPX XML format

## Key Functions

### Core API
- `gpxInterpolate(gpxData, options)` - Main interpolation function
- `interpolateTrack(gpxData, options)` - Recommended alias with options object
- `gpxRead(filename)` - Read GPX file to GPXData
- `gpxWrite(filename, gpxData, writeSpeed?)` - Write GPXData to file

### Utilities
- `gpxCalculateDistance(gpxData, useEle)` - Distance between points (Haversine)
- `gpxCalculateSpeed(gpxData)` - Speed array from distance/time
- `gpxCalculateStatistics(gpxData, maxGap)` - Comprehensive track stats
- `gpxRemoveDuplicates(gpxData)` - Remove consecutive duplicates
- `detectSegments(gpxData, maxGap)` - Find track segments split by gaps
- `gpxDataToPoints(data)` / `pointsToGpxData(points)` - Format conversion
- `haversineDistance(lat1, lon1, lat2, lon2)` - Distance between coordinates
- `formatDistance(meters)` / `formatDuration(seconds)` - Human-readable formatting

### PCHIP Algorithm
- `pchipInterpolate(xi, yi, x)` - 1D PCHIP interpolation
- `pchipInterpolateMulti(xi, yi, x)` - Multiple arrays

## CLI Usage

### Basic Commands
```bash
# Default 1m resolution
gpx-interpolator track.gpx

# 5m resolution
gpx-interpolator -r 5 track.gpx

# Force exact point count
gpx-interpolator -n 1000 track.gpx

# Only interpolate long segments
gpx-interpolator -r 5 -m 100 track.gpx

# Split at GPS gaps
gpx-interpolator -r 5 -g 500 track.gpx

# Statistics only
gpx-interpolator --stats-only track.gpx

# Multiple files
gpx-interpolator *.gpx
```

### CLI Options
- `-r, --resolution <meters>` - Interpolation resolution (default: 1.0)
- `-n, --num <count>` - Force exact point count
- `-m, --min-distance <meters>` - Only interpolate segments longer than this
- `-g, --max-gap <meters>` - Split track at GPS gaps
- `-o, --output <file>` - Custom output filename (single file only)
- `-s, --speed` - Include speed data in output
- `-v, --verbose` - Show detailed statistics
- `--dry-run` - Preview without writing
- `--stats-only` - Statistics only, no interpolation

## Important Implementation Details

### Distance Calculation
- Uses Haversine formula for great-circle distance on Earth sphere (6371km radius)
- Optionally includes elevation difference: `sqrt(horizontal² + vertical²)`
- Returns array where first element is always 0

### PCHIP Algorithm
- Preserves monotonicity (no new extrema between data points)
- Shape-preserving interpolation (no overshooting)
- Calculated slopes using weighted harmonic mean
- Hermite basis functions for cubic polynomial evaluation
- Handles large arrays with chunking (50,000 point chunks) to avoid stack overflow

### Gap Handling
- Detects GPS signal loss when distance between consecutive points > maxGap
- Creates separate track segments
- Each segment interpolated independently
- Gaps copied as-is to output

### Performance Optimizations
- Parallel array format for efficient memory access
- Chunked processing for very large tracks (> 50k points)
- Avoids spread operator for large arrays (stack overflow risk)
- Progress callbacks for long operations

### File Format
- Reads GPX 1.0/1.1 format
- Outputs GPX 1.1 by default (1.0 if speed included)
- Preserves timezone information from input
- Handles multiple tracks and segments
- Filters out points without timestamps if some have them

## Dependencies
- `@xmldom/xmldom` - GPX XML parsing/serialization
- `commander` - CLI argument parsing
- `typescript` - Build toolchain
- Node.js >= 16.0.0

## Build & Development
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm start           # Run CLI from compiled code
npm run dev         # Run CLI from source (ts-node)
npm test            # Run test file
npm run lint        # Type checking
```

## Common Use Cases

### Programmatic Usage
```typescript
import { gpxRead, gpxInterpolate, gpxWrite } from '@weited/gpx-interpolator';

const gpxData = gpxRead('input.gpx');
const result = gpxInterpolate(gpxData, {
  resolution: 5,
  maxGap: 500,
  onProgress: (p) => console.log(`${p}%`)
});
gpxWrite('output.gpx', result);
```

### Statistics Analysis
```typescript
import { gpxRead, gpxCalculateStatistics } from '@weited/gpx-interpolator';

const gpxData = gpxRead('track.gpx');
const stats = gpxCalculateStatistics(gpxData);
console.log(`${stats.totalDistance}m in ${stats.totalDuration}s`);
```

### Working with Points
```typescript
import { gpxDataToPoints, pointsToGpxData } from '@weited/gpx-interpolator';

const points = gpxDataToPoints(gpxData);  // Array of {lat, lon, ele?, time?}
// ... modify points ...
const newData = pointsToGpxData(points);
```

## Testing
- Test file: `test-long-distance.ts` - Tests long-distance interpolation
- Sample GPX files in root directory (flight paths, etc.)

## Notes for Future Development

### Current Limitations
- Only processes `<trk>` elements (not routes or waypoints)
- Assumes WGS84 coordinate system
- Earth treated as perfect sphere (6371km radius) - good enough for most cases
- Large files (millions of points) may have memory constraints

### Potential Improvements
- Add support for routes and waypoints
- More sophisticated Earth models (ellipsoid)
- Streaming processing for massive files
- Additional interpolation methods (linear, cubic spline, Bezier)
- Filtering/smoothing options
- Track simplification (Douglas-Peucker algorithm)

### Code Conventions
- Parallel array format preferred internally for performance
- User-facing API uses object arrays (GPXPoint[])
- All distances in meters, all timestamps in seconds (Unix epoch)
- Elevation in meters above sea level
