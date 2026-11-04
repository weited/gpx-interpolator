# GPX Interpolate - TypeScript

TypeScript/Node.js implementation of GPX interpolation using piecewise cubic Hermite splines.

[中文文档](./README-zh.md) | [快速开始](./QUICKSTART-zh.md)

## Features

- 📍 Insert intermediate points between GPX track points
- 🎯 Smooth interpolation using PCHIP (Piecewise Cubic Hermite Interpolating Polynomial)
- 📏 Distance-based interpolation resolution (specify meters between points)
- ⏱️ Preserve and interpolate timestamp information
- 📈 Optional speed calculation and saving
- 🔄 Automatically remove duplicate track points
- 🚫 Gap detection for GPS signal loss
- 📊 Track statistics (distance, duration, elevation gain, etc.)

## Installation

```bash
npm install @weited/gpx-interpolator
```

Or for development:

```bash
git clone <repo>
cd gpx-interpolator
npm install
npm run build
```

## CLI Usage

```bash
# Basic usage (default 1 meter resolution)
gpx-interpolator your-track.gpx

# Specify resolution in meters
gpx-interpolator -r 5 your-track.gpx

# Specify output point count
gpx-interpolator -n 1000 your-track.gpx

# Only interpolate segments > 100 meters
gpx-interpolator -r 5 -m 100 your-track.gpx

# Split track at GPS gaps > 500 meters
gpx-interpolator -r 5 -g 500 your-track.gpx

# Custom output file
gpx-interpolator -r 5 -o output.gpx your-track.gpx

# Verbose mode with statistics
gpx-interpolator -v your-track.gpx

# Show statistics only (no interpolation)
gpx-interpolator --stats-only your-track.gpx

# Dry run (preview without saving)
gpx-interpolator --dry-run -r 5 your-track.gpx

# Save speed information
gpx-interpolator -s your-track.gpx

# Process multiple files
gpx-interpolator *.gpx

# Convert and interpolate a KML file (output is always GPX)
gpx-interpolator -r 5 your-track.kml

# Process every .gpx and .kml file in a folder
gpx-interpolator -r 5 tracks/

# Include subfolders
gpx-interpolator -r 5 -R tracks/
```

Inputs can be files or folders. Files whose name contains `_interpolated.` are skipped.

KML input supports `gx:Track` and `LineString`. Each track is interpolated separately and written as its own `<trkseg>`, so `-n` applies per track. As with `-g`, a file with several segments produces more than `-n` points in total. Points with no usable `<when>` are dropped if other points have one, and elevation is left out unless every point has it. A `gx:Track` with different numbers of `<when>` and `<gx:coord>` elements is an error.

### CLI Options

| Option                        | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `-r, --resolution <meters>`   | Interpolation resolution in meters (default: 1.0)      |
| `-n, --num <count>`           | Force exact point count in output                      |
| `-m, --min-distance <meters>` | Only interpolate segments longer than this             |
| `-g, --max-gap <meters>`      | Split track at gaps larger than this (GPS signal loss) |
| `-o, --output <file>`         | Output file name (single file only)                    |
| `-s, --speed`                 | Save interpolated speed in output                      |
| `-v, --verbose`               | Verbose output with statistics                         |
| `--dry-run`                   | Preview what would be done without writing files       |
| `--stats-only`                | Only show track statistics, don't interpolate          |
| `-R, --recursive`             | Scan folders recursively                               |

## Module Usage

```typescript
import {
  gpxRead,
  gpxWrite,
  gpxInterpolate,
  interpolateTrack,
  gpxCalculateStatistics,
  gpxDataToPoints,
  pointsToGpxData,
} from "@weited/gpx-interpolator";

// Read GPX file
const gpxData = gpxRead("input.gpx");

// Basic interpolation (1 meter resolution)
const interpolated = gpxInterpolate(gpxData, 1.0);

// Advanced interpolation with options
const result = interpolateTrack(gpxData, {
  resolution: 5, // 5 meters between points
  minDistance: 100, // Only interpolate segments > 100m
  maxGap: 500, // Split at gaps > 500m
  onProgress: (percent) => console.log(`${percent}%`),
});

// Get statistics
const stats = gpxCalculateStatistics(gpxData);
console.log(`Distance: ${stats.totalDistance}m`);
console.log(`Duration: ${stats.totalDuration}s`);
console.log(`Elevation gain: ${stats.elevationGain}m`);

// Convert between formats
const points = gpxDataToPoints(gpxData); // GPXData -> GPXPoint[]
const data = pointsToGpxData(points); // GPXPoint[] -> GPXData

// Save result
gpxWrite("output.gpx", result);
```

## API Reference

### Core Functions

#### `gpxInterpolate(gpxData, options)`

Interpolate GPX data using piecewise cubic Hermite splines.

```typescript
// Simple usage (backward compatible)
gpxInterpolate(gpxData, 1.0); // 1 meter resolution
gpxInterpolate(gpxData, 5.0, 1000); // 5m resolution, force 1000 points

// With options object
gpxInterpolate(gpxData, {
  resolution: 5, // meters between points (default: 1.0)
  numPoints: null, // force exact point count (overrides resolution)
  minDistance: 0, // only interpolate segments > this (default: 0)
  maxGap: Infinity, // split at gaps > this (default: Infinity)
  preserveOriginal: false, // keep original points (default: false)
  onProgress: (p) => {}, // progress callback (0-100)
});
```

#### `interpolateTrack(gpxData, options)`

Alias for `gpxInterpolate` with options object. Recommended for new code.

### I/O Functions

#### `gpxRead(filename)`

Read GPX data from file.

#### `gpxWrite(filename, gpxData, writeSpeed?)`

Write GPX data to file.

### Utility Functions

#### `gpxCalculateStatistics(gpxData, maxGap?)`

Calculate track statistics:

- `totalDistance` - Total distance in meters
- `totalDuration` - Duration in seconds (null if no timestamps)
- `pointCount` - Number of track points
- `avgSpeed` / `maxSpeed` - Speed in m/s
- `elevationGain` / `elevationLoss` - Elevation changes
- `minElevation` / `maxElevation` - Elevation range
- `bounds` - Bounding box (minLat, maxLat, minLon, maxLon)
- `segmentCount` - Number of segments (based on maxGap)

#### `gpxDataToPoints(gpxData)`

Convert internal GPXData format to user-friendly GPXPoint[] array.

#### `pointsToGpxData(points, tzinfo?)`

Convert GPXPoint[] array to internal GPXData format.

#### `gpxCalculateDistance(gpxData, useEle?)`

Calculate distance between consecutive points (Haversine formula).

#### `gpxCalculateSpeed(gpxData)`

Calculate speed between consecutive points.

#### `detectSegments(gpxData, maxGap)`

Detect track segments separated by gaps larger than maxGap.

#### `haversineDistance(lat1, lon1, lat2, lon2)`

Calculate distance between two coordinates in meters.

#### `formatDistance(meters)` / `formatDuration(seconds)`

Format values for display.

### Types

```typescript
interface GPXData {
  lat: number[]; // Latitude array
  lon: number[]; // Longitude array
  ele: number[] | null; // Elevation array (meters)
  tstamp: number[] | null; // Unix timestamps (seconds)
  tzinfo: string | null; // Timezone info
}

interface GPXPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: Date;
  speed?: number;
}

interface InterpolateOptions {
  resolution?: number; // meters between points
  numPoints?: number | null;
  minDistance?: number;
  maxGap?: number;
  preserveOriginal?: boolean;
  onProgress?: (percent: number) => void;
}

interface TrackStatistics {
  totalDistance: number;
  totalDuration: number | null;
  pointCount: number;
  avgSpeed: number | null;
  maxSpeed: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  minElevation: number | null;
  maxElevation: number | null;
  bounds: { minLat; maxLat; minLon; maxLon };
  segmentCount: number;
}
```

## How It Works

1. **Read**: Parse GPX file and extract lat, lon, elevation, and timestamps
2. **Clean**: Remove duplicate track points
3. **Distance**: Calculate distances using Haversine formula (Earth curvature)
4. **Segment**: Detect gaps (GPS signal loss) and split track if needed
5. **Interpolate**: Use PCHIP algorithm to smoothly interpolate each dimension
6. **Generate**: Create new points based on resolution or point count
7. **Output**: Save to new GPX file or return data structure

## Project Structure

```
gpx-interpolator/
├── src/
│   ├── types.ts          # TypeScript type definitions
│   ├── pchip.ts          # PCHIP interpolation algorithm
│   ├── gpx-utils.ts      # GPX utility functions
│   ├── gpx-io.ts         # File I/O
│   ├── interpolate.ts    # Main interpolation function
│   ├── index.ts          # Module exports
│   └── cli.ts            # CLI tool
├── dist/                 # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
