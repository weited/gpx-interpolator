#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { gpxRead, gpxWrite } from "./gpx-io";
import { kmlRead } from "./kml-io";
import { gpxInterpolate } from "./interpolate";
import {
  gpxRemoveDuplicates,
  gpxCalculateStatistics,
  formatDistance,
  formatDuration,
} from "./gpx-utils";
import { InterpolateOptions } from "./types";

function expandPaths(inputs: string[], recursive: boolean): string[] {
  const result: string[] = [];
  for (const input of inputs) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(input);
    } catch {
      console.error(`Error: path not found: ${input}`);
      process.exit(1);
    }
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(input, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(input, entry.name);
        if (entry.isDirectory() && recursive) {
          result.push(...expandPaths([full], recursive));
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (lower.endsWith('.gpx') || lower.endsWith('.kml')) {
            result.push(full);
          }
        }
      }
    } else {
      result.push(input);
    }
  }
  return result;
}

const program = new Command();

program
  .name("gpx-interpolate")
  .description("Interpolate GPX files using piecewise cubic Hermite splines")
  .version("1.1.0")
  .argument("<paths...>", "GPX/KML file(s) or folder(s) to interpolate")
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
  .option("-R, --recursive", "scan folders recursively", false)
  .action((paths: string[], options) => {
    const files = expandPaths(paths, options.recursive);
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
    let processedCount = 0;
    const noTrackFiles: string[] = [];
    const failedFiles: Array<{ file: string; reason: string }> = [];

    for (const gpxFile of files) {
      // Skip already interpolated files (check basename so directory names don't trigger it)
      const base = path.basename(gpxFile);
      if (base.includes("_interpolated.")) {
        if (verbose) {
          console.log(`Skipping already interpolated file: ${gpxFile}`);
        }
        continue;
      }

      try {
        console.log(`\n📍 Processing ${gpxFile}...`);
        console.log("─".repeat(50));

        // Read input file (GPX or KML)
        const isKml = gpxFile.toLowerCase().endsWith('.kml');
        const gpxData = isKml ? kmlRead(gpxFile) : gpxRead(gpxFile);

        if (gpxData.lat.length === 0) {
          console.error(`⚠️  No track points found, skipping ${gpxFile}`);
          noTrackFiles.push(gpxFile);
          continue;
        }

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
          processedCount++;
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

        // Generate output filename — always .gpx (KML inputs are converted)
        const outFile =
          outputFile ||
          (() => {
            const ext = path.extname(gpxFile);
            const base = gpxFile.slice(0, -ext.length);
            return `${base}_interpolated.gpx`;
          })();

        if (dryRun) {
          console.log(
            `\n🔍 Dry run - would save ${gpxDataInterp.lat.length} points to ${outFile}`
          );
        } else {
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

        // Counted last so a file that fails part-way stays out of the summary
        processedCount++;
        totalInputPoints += gpxData.lat.length;
        totalOutputPoints += gpxDataInterp.lat.length;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Error processing ${gpxFile}: ${reason}`);
        failedFiles.push({ file: gpxFile, reason });
      }
    }

    // Summary for multiple files
    if (processedCount > 1 && !statsOnly) {
      console.log("\n" + "═".repeat(50));
      console.log(
        `📈 Summary: ${totalInputPoints} → ${totalOutputPoints} points across ${processedCount} files`
      );
    }

    // A list only adds something when the messages may have scrolled past
    if (files.length > 1 && noTrackFiles.length > 0) {
      console.error(`\n⚠️  Skipped ${noTrackFiles.length} file(s) with no track points:`);
      for (const file of noTrackFiles) {
        console.error(`   ${file}`);
      }
    }
    if (files.length > 1 && failedFiles.length > 0) {
      console.error(`\n❌ Failed to process ${failedFiles.length} file(s):`);
      for (const { file, reason } of failedFiles) {
        console.error(`   ${file}: ${reason}`);
      }
    }

    const nothingUsable = processedCount === 0 && noTrackFiles.length > 0;
    if (failedFiles.length > 0 || nothingUsable) {
      process.exitCode = 1;
    }
  });

program.parse();
