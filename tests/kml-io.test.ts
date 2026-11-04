import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  gpxCalculateSpeed,
  gpxCalculateStatistics,
  gpxInterpolate,
  gpxRead,
  gpxRemoveDuplicates,
  gpxWrite,
  kmlRead,
  kmlWrite,
  GPXData,
} from '../src';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kml-io-test-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

let fileCount = 0;

function kmlFile(body: string): string {
  const file = path.join(dir, `input-${fileCount++}.kml`);
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document><Placemark>${body}</Placemark></Document></kml>`
  );
  return file;
}

function gxTrack(rows: Array<[string | null, string]>): string {
  const whens = rows.filter(([w]) => w !== null).map(([w]) => `<when>${w}</when>`);
  const coords = rows.map(([, c]) => `<gx:coord>${c}</gx:coord>`);
  return `<gx:Track>${whens.join('')}${coords.join('')}</gx:Track>`;
}

test('gx:Track pairs each timestamp with its coordinate', () => {
  const data = kmlRead(
    kmlFile(
      gxTrack([
        ['2024-01-01T00:00:00Z', '10 20 100'],
        ['2024-01-01T00:01:00Z', '10.1 20.1 110'],
      ])
    )
  );
  assert.deepEqual(data.lon, [10, 10.1]);
  assert.deepEqual(data.lat, [20, 20.1]);
  assert.deepEqual(data.ele, [100, 110]);
  assert.equal(data.tstamp![1] - data.tstamp![0], 60);
  assert.equal(data.tzinfo, 'Z');
  assert.equal(data.segmentStarts, undefined);
});

test('an empty <when> drops its own point without shifting later timestamps', () => {
  const data = kmlRead(
    kmlFile(
      gxTrack([
        ['2024-01-01T00:00:00Z', '10 20 0'],
        ['', '11 21 0'],
        ['2024-01-01T00:02:00Z', '12 22 0'],
      ])
    )
  );
  assert.deepEqual(data.lon, [10, 12]);
  assert.equal(data.tstamp!.length, data.lat.length);
  assert.equal(data.tstamp![1] - data.tstamp![0], 120);
});

test('mismatched <when> and <gx:coord> counts are rejected', () => {
  const file = kmlFile(
    `<gx:Track><when>2024-01-01T00:00:00Z</when><gx:coord>10 20 0</gx:coord><gx:coord>11 21 0</gx:coord></gx:Track>`
  );
  assert.throws(() => kmlRead(file), /1 <when> but 2 <gx:coord>/);
});

test('a gx:Track without timestamps is read with tstamp null', () => {
  const data = kmlRead(kmlFile(gxTrack([[null, '10 20 5'], [null, '11 21 6']])));
  assert.equal(data.lat.length, 2);
  assert.equal(data.tstamp, null);
  assert.equal(data.tzinfo, null);
});

test('missing elevation becomes null instead of 0', () => {
  const none = kmlRead(
    kmlFile('<LineString><coordinates>10,20 11,21</coordinates></LineString>')
  );
  assert.equal(none.ele, null);

  const partial = kmlRead(
    kmlFile('<LineString><coordinates>10,20,50 11,21</coordinates></LineString>')
  );
  assert.equal(partial.ele, null);
  assert.equal(partial.lat.length, 2);

  const seaLevel = kmlRead(
    kmlFile('<LineString><coordinates>10,20,0 11,21,0</coordinates></LineString>')
  );
  assert.deepEqual(seaLevel.ele, [0, 0]);
});

test('coordinates that are not numbers are skipped', () => {
  const data = kmlRead(
    kmlFile('<LineString><coordinates>10,20,1 oops,bad,2 11,21,3</coordinates></LineString>')
  );
  assert.deepEqual(data.lon, [10, 11]);
  assert.deepEqual(data.ele, [1, 3]);
});

const TWO_LINES = `
  <LineString><coordinates>10,20,0 10.01,20,0</coordinates></LineString>
  <LineString><coordinates>50,-30,0 50.01,-30,0</coordinates></LineString>`;

test('multiple tracks stay separate through interpolation', () => {
  const data = kmlRead(kmlFile(TWO_LINES));
  assert.deepEqual(data.segmentStarts, [2]);

  const result = gpxInterpolate(data, { resolution: 100 });
  const start = result.segmentStarts![0];
  assert.deepEqual(result.segmentStarts, [start]);

  // Every point is on its own track's line: nothing was drawn between them
  assert.ok(result.lon.slice(0, start).every((lon) => lon >= 10 && lon <= 10.01));
  assert.ok(result.lon.slice(start).every((lon) => lon >= 50 && lon <= 50.01));
  assert.ok(start > 2);
});

test('multiple tracks are written as separate segments and survive a KML round trip', () => {
  const data = gpxInterpolate(kmlRead(kmlFile(TWO_LINES)), { resolution: 100 });

  const gpxFile = path.join(dir, 'segments.gpx');
  gpxWrite(gpxFile, data);
  assert.equal(fs.readFileSync(gpxFile, 'utf-8').match(/<trkseg>/g)!.length, 2);

  const kmlOut = path.join(dir, 'segments-out.kml');
  kmlWrite(kmlOut, data);
  const reread = kmlRead(kmlOut);
  assert.deepEqual(reread.segmentStarts, data.segmentStarts);
  assert.deepEqual(reread.lat, data.lat);
});

test('removing duplicates keeps segment boundaries on the right points', () => {
  const data: GPXData = {
    lat: [0, 0, 1, 1, 2],
    lon: [0, 1, 1, 1, 1],
    ele: null,
    tstamp: null,
    tzinfo: null,
    segmentStarts: [3],
  };
  // Index 3 repeats index 2, so the second segment now starts at the old index 4
  const result = gpxRemoveDuplicates(data);
  assert.deepEqual(result.lat, [0, 0, 1, 2]);
  assert.deepEqual(result.segmentStarts, [3]);
});

test('removing duplicates from empty data stays empty', () => {
  const data: GPXData = { lat: [], lon: [], ele: null, tstamp: null, tzinfo: null };
  assert.deepEqual(gpxRemoveDuplicates(data).lat, []);
});

test('statistics and speed ignore the jump between segments', () => {
  const data: GPXData = {
    lat: [0, 0, 40, 40],
    lon: [0, 0.001, 0, 0.001],
    ele: [0, 10, 1000, 1010],
    tstamp: [0, 10, 20, 30],
    tzinfo: 'Z',
    segmentStarts: [2],
  };
  const stats = gpxCalculateStatistics(data);
  assert.ok(stats.totalDistance < 1000);
  assert.equal(stats.elevationGain, 20);
  assert.equal(stats.segmentCount, 2);
  assert.equal(gpxCalculateSpeed(data)[2], 0);
});

for (const [name, write, read] of [
  ['KML', kmlWrite, kmlRead],
  ['GPX', gpxWrite, gpxRead],
] as const) {
  test(`${name} output with a timezone keeps the same instant`, () => {
    const tstamp = Date.parse('2024-01-01T12:00:00Z') / 1000;
    const file = path.join(dir, `tz.${name.toLowerCase()}`);
    write(file, {
      lat: [20, 21],
      lon: [10, 11],
      ele: [0, 0],
      tstamp: [tstamp, tstamp + 60],
      tzinfo: '+08:00',
    });

    const content = fs.readFileSync(file, 'utf-8');
    assert.ok(content.includes('2024-01-01T20:00:00.000+08:00'), content);

    const reread = read(file);
    assert.deepEqual(reread.tstamp, [tstamp, tstamp + 60]);
    assert.equal(reread.tzinfo, '+08:00');
  });
}

test('negative timezone offsets shift the other way', () => {
  const tstamp = Date.parse('2024-01-01T02:00:00Z') / 1000;
  const file = path.join(dir, 'negative-tz.kml');
  kmlWrite(file, {
    lat: [20],
    lon: [10],
    ele: null,
    tstamp: [tstamp],
    tzinfo: '-05:30',
  });
  assert.ok(fs.readFileSync(file, 'utf-8').includes('2023-12-31T20:30:00.000-05:30'));
});
