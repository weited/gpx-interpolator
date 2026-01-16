#!/usr/bin/env node

import { Command } from "commander";
import * as path from "path";
import { gpxRead, gpxWrite } from "./gpx-io";
import { gpxInterpolate } from "./interpolate";
import {
  gpxRemoveDuplicates,
  gpxCalculateStatistics,
  formatDistance,
  formatDuration,
} from "./gpx-utils";
import { InterpolateOptions } from "./types";

const program = new Command();

program
  .name("gpx-interpolate")
  .description("Interpolate GPX files using piecewise cubic Hermite splines")
  .version("1.1.0")
  .argument("<files...>", "GPX file(s) to interpolate")
  .option(
    "-r, --resolution <meters>",
    "interpolation resolution in meters (default: 1.0)",
    "1.0"
  )
  .option(
    "-n, --num <count>",
    "force point count in output (overrides resolution)"
  )
  .option(
    "-m, --min-distance <meters>",
    "only interpolate segments longer than this (default: 0)"
  )
  .option(
    "-g, --max-gap <meters>",
    "split track at gaps larger than this (GPS signal loss)"
  )
  .option(
    "-o, --output <file>",
    "output file name (only for single file input)"
  )
  .option("-s, --speed", "save interpolated speed", false)
  .option("-v, --verbose", "verbose output with statistics", false)
  .option("--dry-run", "show what would be done without writing files", false)
  .option(
    "--stats-only",
    "only show track statistics, do not interpolate",
    false
  )
  .action((files: string[], options) => {
    const resolution = parseFloat(options.resolution);
    const numPoints = options.num ? parseInt(options.num) : null;
    const minDistance = options.minDistance
      ? parseFloat(options.minDistance)
      : 0;
    const maxGap = options.maxGap ? parseFloat(options.maxGap) : Infinity;
    const writeSpeed = options.speed;
    const verbose = options.verbose;
    const dryRun = options.dryRun;
    const statsOnly = options.statsOnly;
    const outputFile = options.output;

    // Validate output option
    if (outputFile && files.length > 1) {
      console.error(
        "Error: --output option can only be used with a single input file"
      );
      process.exit(1);
    }

    let totalInputPoints = 0;
    let totalOutputPoints = 0;

    for (const gpxFile of files) {
      // Skip already interpolated files
      if (gpxFile.endsWith("_interpolated.gpx")) {
        if (verbose) {
          console.log(`Skipping already interpolated file: ${gpxFile}`);
        }
        continue;
      }

      try {
        console.log(`\n📍 Processing ${gpxFile}...`);
        console.log("─".repeat(50));

        // Read GPX file
        const gpxData = gpxRead(gpxFile);
        totalInputPoints += gpxData.lat.length;

        if (verbose || statsOnly) {
          console.log(`\n📊 Track Statistics:`);
          const stats = gpxCalculateStatistics(gpxData, maxGap);
          console.log(`   Points: ${stats.pointCount}`);
          console.log(`   Distance: ${formatDistance(stats.totalDistance)}`);
          if (stats.totalDuration !== null) {
            console.log(`   Duration: ${formatDuration(stats.totalDuration)}`);
            console.log(
              `   Avg Speed: ${(stats.avgSpeed! * 3.6).toFixed(1)} km/h`
            );
            console.log(
              `   Max Speed: ${(stats.maxSpeed! * 3.6).toFixed(1)} km/h`
            );
          }
          if (stats.elevationGain !== null) {
            console.log(
              `   Elevation Gain: ${stats.elevationGain.toFixed(0)} m`
            );
            console.log(
              `   Elevation Loss: ${stats.elevationLoss!.toFixed(0)} m`
            );
            console.log(
              `   Min/Max Elevation: ${stats.minElevation!.toFixed(
                0
              )}m / ${stats.maxElevation!.toFixed(0)}m`
            );
          }
          if (maxGap !== Infinity) {
            console.log(
              `   Segments (gap > ${formatDistance(maxGap)}): ${
                stats.segmentCount
              }`
            );
          }
          console.log(
            `   Bounds: [${stats.bounds.minLat.toFixed(
              4
            )}, ${stats.bounds.minLon.toFixed(
              4
            )}] to [${stats.bounds.maxLat.toFixed(
              4
            )}, ${stats.bounds.maxLon.toFixed(4)}]`
          );
        }

        if (statsOnly) {
          continue;
        }

        // Remove duplicates
        const gpxDataNodup = gpxRemoveDuplicates(gpxData);
        const duplicatesRemoved = gpxData.lat.length - gpxDataNodup.lat.length;
        if (duplicatesRemoved > 0 && verbose) {
          console.log(
            `\n🔄 Removed ${duplicatesRemoved} duplicate trackpoint(s)`
          );
        }

        // Build interpolation options
        const interpolateOptions: InterpolateOptions = {
          resolution,
          numPoints,
          minDistance,
          maxGap,
        };

        if (verbose) {
          console.log(`\n⚙️  Interpolation Settings:`);
          console.log(`   Resolution: ${resolution} m`);
          if (numPoints) console.log(`   Forced point count: ${numPoints}`);
          if (minDistance > 0)
            console.log(
              `   Min distance threshold: ${formatDistance(minDistance)}`
            );
          if (maxGap !== Infinity)
            console.log(`   Max gap (split at): ${formatDistance(maxGap)}`);
        }

        // Interpolate
        const gpxDataInterp = gpxInterpolate(gpxDataNodup, interpolateOptions);
        totalOutputPoints += gpxDataInterp.lat.length;

        // Generate output filename
        const outFile =
          outputFile ||
          (() => {
            const ext = path.extname(gpxFile);
            const base = gpxFile.slice(0, -ext.length);
            return `${base}_interpolated${ext}`;
          })();

        if (dryRun) {
          console.log(
            `\n🔍 Dry run - would save ${gpxDataInterp.lat.length} points to ${outFile}`
          );
        } else {
          // Write output file
          gpxWrite(outFile, gpxDataInterp, writeSpeed);
          console.log(
            `\n✅ Saved ${gpxDataInterp.lat.length} trackpoints to ${outFile}`
          );
        }

        // Show compression/expansion ratio
        const ratio = gpxDataInterp.lat.length / gpxDataNodup.lat.length;
        if (ratio > 1) {
          console.log(`   (${ratio.toFixed(1)}x more points than original)`);
        } else if (ratio < 1) {
          console.log(
            `   (${(1 / ratio).toFixed(1)}x fewer points than original)`
          );
        }
      } catch (error) {
        console.error(`\n❌ Error processing ${gpxFile}:`, error);
        process.exit(1);
      }
    }

    // Summary for multiple files
    if (files.length > 1 && !statsOnly) {
      console.log("\n" + "═".repeat(50));
      console.log(
        `📈 Summary: ${totalInputPoints} → ${totalOutputPoints} points across ${files.length} files`
      );
    }
  });

program.parse();
