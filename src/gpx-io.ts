import * as fs from 'fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { GPXData, GPXPoint } from './types';
import { gpxCalculateSpeed } from './gpx-utils';

/**
 * Read GPX file and extract track data
 */
export function gpxRead(gpxFile: string): GPXData {
  const gpxData: GPXData = {
    lat: [],
    lon: [],
    ele: [],
    tstamp: [],
    tzinfo: null,
  };

  const content = fs.readFileSync(gpxFile, 'utf-8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const tracks = doc.getElementsByTagName('trk');
  const iLatlon: number[] = [];
  const iTstamp: number[] = [];
  let i = 0;

  for (let t = 0; t < tracks.length; t++) {
    const segments = tracks[t].getElementsByTagName('trkseg');

    for (let s = 0; s < segments.length; s++) {
      const points = segments[s].getElementsByTagName('trkpt');

      for (let p = 0; p < points.length; p++) {
        const point = points[p];

        const lat = parseFloat(point.getAttribute('lat') || '0');
        const lon = parseFloat(point.getAttribute('lon') || '0');

        gpxData.lat.push(lat);
        gpxData.lon.push(lon);
        iLatlon.push(i);

        // Elevation
        const eleNodes = point.getElementsByTagName('ele');
        if (eleNodes.length > 0) {
          const ele = parseFloat(eleNodes[0].textContent || '0');
          gpxData.ele!.push(ele);
        }

        // Time
        const timeNodes = point.getElementsByTagName('time');
        if (timeNodes.length > 0) {
          const timeStr = timeNodes[0].textContent;
          if (timeStr) {
            const date = new Date(timeStr);
            gpxData.tstamp!.push(date.getTime() / 1000); // Convert to seconds

            // Store timezone info from first timestamp
            if (!gpxData.tzinfo) {
              // Extract timezone offset
              const match = timeStr.match(/([+-]\d{2}:\d{2}|Z)$/);
              gpxData.tzinfo = match ? match[0] : 'Z';
            }

            iTstamp.push(i);
          }
        }

        i++;
      }
    }
  }

  // Remove trackpoints without timestamp if some have timestamps
  if (iTstamp.length > 0 && iLatlon.length !== iTstamp.length) {
    gpxData.lat = iTstamp.map((idx) => gpxData.lat[idx]);
    gpxData.lon = iTstamp.map((idx) => gpxData.lon[idx]);
    gpxData.ele = gpxData.ele!.length > 0
      ? iTstamp.map((idx) => gpxData.ele![idx])
      : null;
    gpxData.tstamp = iTstamp.map((idx) => gpxData.tstamp![idx]);
  }

  // Convert empty arrays to null
  if (gpxData.ele!.length === 0) gpxData.ele = null;
  if (gpxData.tstamp!.length === 0) gpxData.tstamp = null;

  return gpxData;
}

/**
 * Write GPX file from track data
 */
export function gpxWrite(
  gpxFile: string,
  gpxData: GPXData,
  writeSpeed: boolean = false
): void {
  let gpxSpeed: number[] | null = null;

  if (writeSpeed) {
    if (!gpxData.tstamp) {
      throw new Error('Timestamp data is missing from gpxData');
    }
    gpxSpeed = gpxCalculateSpeed(gpxData);
  }

  // Create GPX XML structure
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    '<?xml version="1.0" encoding="UTF-8"?><gpx></gpx>',
    'text/xml'
  );
  const gpxElement = doc.documentElement;

  gpxElement.setAttribute('version', writeSpeed ? '1.0' : '1.1');
  gpxElement.setAttribute('creator', 'gpx-interpolate-ts');
  gpxElement.setAttribute('xmlns', 'http://www.topografix.com/GPX/1/1');
  if (!writeSpeed) {
    gpxElement.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
    gpxElement.setAttribute(
      'xsi:schemaLocation',
      'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd'
    );
  }

  const track = doc.createElement('trk');
  const segment = doc.createElement('trkseg');

  for (let i = 0; i < gpxData.lat.length; i++) {
    const trkpt = doc.createElement('trkpt');
    trkpt.setAttribute('lat', gpxData.lat[i].toString());
    trkpt.setAttribute('lon', gpxData.lon[i].toString());

    // Elevation
    if (gpxData.ele) {
      const ele = doc.createElement('ele');
      ele.textContent = gpxData.ele[i].toString();
      trkpt.appendChild(ele);
    }

    // Time
    if (gpxData.tstamp) {
      const time = doc.createElement('time');
      const date = new Date(gpxData.tstamp[i] * 1000);

      // Format ISO string with timezone
      let timeStr = date.toISOString();
      if (gpxData.tzinfo && gpxData.tzinfo !== 'Z') {
        timeStr = timeStr.replace('Z', gpxData.tzinfo);
      }

      time.textContent = timeStr;
      trkpt.appendChild(time);
    }

    // Speed (for GPX 1.0)
    if (writeSpeed && gpxSpeed) {
      const speed = doc.createElement('speed');
      speed.textContent = gpxSpeed[i].toString();
      trkpt.appendChild(speed);
    }

    segment.appendChild(trkpt);
  }

  track.appendChild(segment);
  gpxElement.appendChild(track);

  // Serialize and write to file
  const serializer = new XMLSerializer();
  const xmlStr = serializer.serializeToString(doc);

  try {
    fs.writeFileSync(gpxFile, xmlStr, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save ${gpxFile}: ${error}`);
  }
}
