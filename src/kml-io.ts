import * as fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import { GPXData } from './types';
import { formatTimestamp } from './gpx-utils';

const GX_NS = 'http://www.google.com/kml/ext/2.2';

interface KmlPoint {
  lat: number;
  lon: number;
  ele: number | null;
  tstamp: number | null;
  track: number;
}

function getByNS(parent: Element | Document, ns: string, local: string): HTMLCollectionOf<Element> {
  const byNS = parent.getElementsByTagNameNS(ns, local);
  if (byNS && byNS.length > 0) return byNS;
  return parent.getElementsByTagName(`gx:${local}`);
}

/** Parse [lon, lat, ele?] strings, or return null if the position is unusable. */
function parseCoord(parts: string[], tstamp: number | null, track: number): KmlPoint | null {
  const lon = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  const ele = parts.length >= 3 ? parseFloat(parts[2]) : NaN;
  return { lat, lon, ele: Number.isFinite(ele) ? ele : null, tstamp, track };
}

/**
 * Read KML file and extract track data.
 * Supports gx:Track (with timestamps) and plain LineString formats.
 *
 * Each track becomes its own segment (see GPXData.segmentStarts). As in gpxRead,
 * points without a timestamp are dropped if other points have one. Elevation is
 * null unless every remaining point has it, so missing values are never invented.
 *
 * @throws if a gx:Track has a different number of <when> and <gx:coord> elements,
 *         because its timestamps can't be matched to positions reliably.
 */
export function kmlRead(kmlFile: string): GPXData {
  const content = fs.readFileSync(kmlFile, 'utf-8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const points: KmlPoint[] = [];
  let tzinfo: string | null = null;

  const gxTracks = getByNS(doc, GX_NS, 'Track');

  if (gxTracks.length > 0) {
    for (let t = 0; t < gxTracks.length; t++) {
      const track = gxTracks[t];
      const whenEls = track.getElementsByTagName('when');
      const coordEls = getByNS(track, GX_NS, 'coord');

      if (whenEls.length > 0 && whenEls.length !== coordEls.length) {
        throw new Error(
          `gx:Track #${t + 1} in ${kmlFile} has ${whenEls.length} <when> but ${coordEls.length} <gx:coord> elements`
        );
      }

      for (let i = 0; i < coordEls.length; i++) {
        let tstamp: number | null = null;
        if (whenEls.length > 0) {
          const timeStr = (whenEls[i].textContent || '').trim();
          const ms = new Date(timeStr).getTime();
          if (timeStr && Number.isFinite(ms)) {
            tstamp = ms / 1000;
            if (!tzinfo) {
              const m = timeStr.match(/([+-]\d{2}:\d{2}|Z)$/);
              tzinfo = m ? m[0] : 'Z';
            }
          }
        }

        const parts = (coordEls[i].textContent || '').trim().split(/\s+/);
        const point = parseCoord(parts, tstamp, t);
        if (point) points.push(point);
      }
    }
  } else {
    // Fallback: plain <LineString><coordinates> format
    const lineStrings = doc.getElementsByTagName('LineString');
    for (let l = 0; l < lineStrings.length; l++) {
      const coordEls = lineStrings[l].getElementsByTagName('coordinates');
      if (coordEls.length === 0) continue;
      const raw = (coordEls[0].textContent || '').trim();
      for (const token of raw.split(/\s+/)) {
        const point = parseCoord(token.split(','), null, l);
        if (point) points.push(point);
      }
    }
  }

  const hasTime = points.some((p) => p.tstamp !== null);
  const kept = hasTime ? points.filter((p) => p.tstamp !== null) : points;
  const hasEle = kept.length > 0 && kept.every((p) => p.ele !== null);

  const gpxData: GPXData = {
    lat: kept.map((p) => p.lat),
    lon: kept.map((p) => p.lon),
    ele: hasEle ? kept.map((p) => p.ele!) : null,
    tstamp: hasTime ? kept.map((p) => p.tstamp!) : null,
    tzinfo,
  };

  const segmentStarts: number[] = [];
  for (let i = 1; i < kept.length; i++) {
    if (kept[i].track !== kept[i - 1].track) segmentStarts.push(i);
  }
  if (segmentStarts.length > 0) gpxData.segmentStarts = segmentStarts;

  return gpxData;
}

/**
 * Write KML file from track data using gx:Track format, one per segment.
 */
export function kmlWrite(kmlFile: string, gpxData: GPXData): void {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">',
    '<Document>',
    '    <Placemark>',
  ];

  const boundaries = [0, ...(gpxData.segmentStarts ?? []), gpxData.lat.length];

  for (let s = 0; s < boundaries.length - 1; s++) {
    const start = boundaries[s];
    const end = boundaries[s + 1];

    lines.push('        <gx:Track>');

    if (gpxData.tstamp) {
      for (let i = start; i < end; i++) {
        lines.push(`            <when>${formatTimestamp(gpxData.tstamp[i], gpxData.tzinfo)}</when>`);
      }
    }

    for (let i = start; i < end; i++) {
      // gx:coord requires all three values, so unknown elevation is written as 0
      const ele = gpxData.ele ? gpxData.ele[i] : 0;
      lines.push(`            <gx:coord>${gpxData.lon[i]} ${gpxData.lat[i]} ${ele}</gx:coord>`);
    }

    lines.push('        </gx:Track>');
  }

  lines.push(
    '    </Placemark>',
    '</Document>',
    '</kml>'
  );

  try {
    fs.writeFileSync(kmlFile, lines.join('\n'), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save ${kmlFile}: ${error}`);
  }
}
