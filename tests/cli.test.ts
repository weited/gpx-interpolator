import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI = path.join(__dirname, '..', 'src', 'cli.ts');

const GPX = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
<trkpt lat="20" lon="10"><ele>1</ele></trkpt>
<trkpt lat="20" lon="10.01"><ele>2</ele></trkpt>
</trkseg></trk></gpx>`;

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
<LineString><coordinates>10,20,0 10.01,20,0</coordinates></LineString>
</Placemark></Document></kml>`;

function runCli(cwd: string, ...args: string[]) {
  // Resolved here because the CLI runs with a temp folder as its working directory
  const tsNode = require.resolve('ts-node/register/transpile-only');
  return spawnSync(process.execPath, ['-r', tsNode, CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, TS_NODE_PROJECT: path.join(__dirname, '..', 'tsconfig.json') },
  });
}

/** tracks/{a.gpx, b.KML, notes.txt, done_interpolated.gpx, nested/c.gpx} */
function makeTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  const tracks = path.join(root, 'tracks');
  fs.mkdirSync(path.join(tracks, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(tracks, 'a.gpx'), GPX);
  fs.writeFileSync(path.join(tracks, 'b.KML'), KML);
  fs.writeFileSync(path.join(tracks, 'notes.txt'), 'not a track');
  fs.writeFileSync(path.join(tracks, 'done_interpolated.gpx'), GPX);
  fs.writeFileSync(path.join(tracks, 'nested', 'c.gpx'), GPX);
  return root;
}

function exists(root: string, relative: string): boolean {
  return fs.existsSync(path.join(root, relative));
}

test('a folder is scanned for GPX and KML files only, without subfolders', () => {
  const root = makeTree();
  const result = runCli(root, '-r', '100', 'tracks');

  assert.equal(result.status, 0, result.stderr);
  assert.ok(exists(root, 'tracks/a_interpolated.gpx'));
  assert.ok(exists(root, 'tracks/b_interpolated.gpx'), 'KML input is converted to .gpx');
  assert.ok(!exists(root, 'tracks/notes_interpolated.gpx'));
  assert.ok(!exists(root, 'tracks/nested/c_interpolated.gpx'));
  assert.ok(!exists(root, 'tracks/done_interpolated_interpolated.gpx'));
  assert.match(result.stdout, /across 2 files/);
});

test('--recursive also scans subfolders', () => {
  const root = makeTree();
  const result = runCli(root, '-r', '100', '-R', 'tracks');

  assert.equal(result.status, 0, result.stderr);
  assert.ok(exists(root, 'tracks/nested/c_interpolated.gpx'));
  assert.match(result.stdout, /across 3 files/);
});

test('a directory name containing _interpolated does not cause files to be skipped', () => {
  const root = makeTree();
  const dir = path.join(root, 'old_interpolated.d');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'd.gpx'), GPX);

  const result = runCli(root, '-r', '100', 'old_interpolated.d');

  assert.equal(result.status, 0, result.stderr);
  assert.ok(exists(root, 'old_interpolated.d/d_interpolated.gpx'));
});

const POINT_ONLY_KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
<Point><coordinates>10,20,0</coordinates></Point>
</Placemark></Document></kml>`;

const MISMATCHED_KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark>
<gx:Track><when>2024-01-01T00:00:00Z</when><gx:coord>10 20 0</gx:coord><gx:coord>11 21 0</gx:coord></gx:Track>
</Placemark></Document></kml>`;

test('a file with no tracks is skipped and the rest of the folder still succeeds', () => {
  const root = makeTree();
  // Sorts before a.gpx, so it would stop the batch before any output if it were fatal
  fs.writeFileSync(path.join(root, 'tracks', '0-points.kml'), POINT_ONLY_KML);

  const result = runCli(root, '-r', '100', 'tracks');

  assert.equal(result.status, 0, result.stderr);
  assert.ok(exists(root, 'tracks/a_interpolated.gpx'));
  assert.ok(!exists(root, 'tracks/0-points_interpolated.gpx'));
  assert.match(result.stderr, /Skipped 1 file\(s\) with no track points/);
  assert.match(result.stdout, /across 2 files/);
});

test('a broken file is reported, the rest still run, and the exit code is 1', () => {
  const root = makeTree();
  fs.writeFileSync(path.join(root, 'tracks', '0-broken.kml'), MISMATCHED_KML);

  const result = runCli(root, '-r', '100', 'tracks');

  assert.equal(result.status, 1);
  assert.ok(exists(root, 'tracks/a_interpolated.gpx'));
  assert.ok(exists(root, 'tracks/b_interpolated.gpx'));
  assert.match(result.stderr, /Failed to process 1 file\(s\)/);
  assert.match(result.stderr, /0-broken\.kml: .*1 <when> but 2 <gx:coord>/);
  assert.match(result.stdout, /across 2 files/);
});

test('corrupt files count as failures with a clear reason, not as files with no tracks', () => {
  const root = makeTree();
  fs.writeFileSync(path.join(root, 'tracks', '0-garbage.gpx'), 'this is not xml');
  fs.writeFileSync(path.join(root, 'tracks', '1-empty.kml'), '');

  const result = runCli(root, '-r', '100', 'tracks');

  assert.equal(result.status, 1);
  assert.ok(exists(root, 'tracks/a_interpolated.gpx'));
  assert.match(result.stderr, /Failed to process 2 file\(s\)/);
  assert.match(result.stderr, /0-garbage\.gpx: not a valid XML file/);
  assert.match(result.stderr, /1-empty\.kml: file is empty/);
  assert.doesNotMatch(result.stderr, /no track points/);
});

test('a single file with no tracks writes nothing and exits 1', () => {
  const root = makeTree();
  fs.writeFileSync(path.join(root, 'points.kml'), POINT_ONLY_KML);

  const result = runCli(root, 'points.kml');

  assert.equal(result.status, 1);
  assert.ok(!exists(root, 'points_interpolated.gpx'));
  assert.match(result.stderr, /No track points found/);
});

test('--stats-only skips a file with no tracks without printing bogus statistics', () => {
  const root = makeTree();
  fs.writeFileSync(path.join(root, 'tracks', '0-points.kml'), POINT_ONLY_KML);

  const result = runCli(root, '--stats-only', 'tracks');

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Infinity/);
  assert.match(result.stderr, /Skipped 1 file/);
});

test('a missing path fails with a clear error', () => {
  const root = makeTree();
  const result = runCli(root, 'no-such-folder');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /path not found: no-such-folder/);
});
