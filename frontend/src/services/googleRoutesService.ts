// ==============================================================================
// Google Maps Real Road Directions Service
// Uses Google Maps JavaScript API (Route.computeRoutes) & Google Routes API v2
// Never connects endpoints directly with straight lines - calculates road geometry
// ==============================================================================

import { API_BASE } from '../api/client';

export type TravelMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TWO_WHEELER';

export interface LocationPoint {
  lat: number;
  lng: number;
  placeId?: string;
  name?: string;
}

export interface TurnStep {
  instruction: string;
  distanceMeters: number;
  distanceFormatted: string;
  durationSeconds: number;
  durationFormatted: string;
  maneuver?: string;
  path?: [number, number][]; // [lat, lng]
}

export interface RoadRouteResult {
  path: [number, number][]; // [lat, lng] coordinates following real roads
  distanceMeters: number;
  distanceKm: number;
  distanceFormatted: string;
  durationSeconds: number;
  durationMinutes: number;
  durationFormatted: string;
  travelMode: TravelMode;
  steps: TurnStep[];
  viewport?: {
    low: { latitude: number; longitude: number };
    high: { latitude: number; longitude: number };
  };
}

export interface ComputeRoadRouteOptions {
  origin: LocationPoint;
  destination: LocationPoint;
  intermediates?: LocationPoint[];
  travelMode?: TravelMode;
}

// Format meters into human-readable distance
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Format seconds into human-readable duration
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} sec`;
  }
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours} hr ${remainingMins} min`;
}

// Decode Google polyline string
export function decodeGooglePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Computes a real road-following route between origin, optional intermediates, and destination.
 * Validates locations, uses Google Routes API, and returns road geometry with turn-by-turn directions.
 * Never silently substitutes a straight line.
 */
export async function computeRoadRoute(options: ComputeRoadRouteOptions): Promise<RoadRouteResult> {
  const { origin, destination, intermediates = [], travelMode = 'DRIVING' } = options;

  // 1. Validate inputs
  if (!origin || (!origin.placeId && (isNaN(origin.lat) || isNaN(origin.lng) || (origin.lat === 0 && origin.lng === 0)))) {
    throw new Error('Invalid origin location. Please select a valid starting place or GPS coordinate.');
  }
  if (!destination || (!destination.placeId && (isNaN(destination.lat) || isNaN(destination.lng) || (destination.lat === 0 && destination.lng === 0)))) {
    throw new Error('Invalid destination location. Please select a valid destination place or GPS coordinate.');
  }

  // 2. Try Client-side Google Maps JavaScript API (if available and loaded)
  if (typeof window !== 'undefined' && (window as any).google?.maps?.importLibrary) {
    try {
      const { Route } = await (window as any).google.maps.importLibrary('routes');
      if (Route && typeof Route.computeRoutes === 'function') {
        const modeMap: Record<TravelMode, any> = {
          DRIVING: (window as any).google.maps.TravelMode?.DRIVING || 'DRIVING',
          WALKING: (window as any).google.maps.TravelMode?.WALKING || 'WALKING',
          BICYCLING: (window as any).google.maps.TravelMode?.BICYCLING || 'BICYCLING',
          TWO_WHEELER: (window as any).google.maps.TravelMode?.TWO_WHEELER || 'TWO_WHEELER',
        };

        const gRequest: any = {
          origin: origin.placeId ? { placeId: origin.placeId } : { lat: origin.lat, lng: origin.lng },
          destination: destination.placeId ? { placeId: destination.placeId } : { lat: destination.lat, lng: destination.lng },
          travelMode: modeMap[travelMode] || 'DRIVING',
          fields: ['path', 'legs', 'distanceMeters', 'duration', 'viewport'],
        };

        if (intermediates.length > 0) {
          gRequest.intermediates = intermediates.map((p) =>
            p.placeId ? { placeId: p.placeId } : { lat: p.lat, lng: p.lng }
          );
        }

        const resp = await Route.computeRoutes(gRequest);
        if (resp && resp.routes && resp.routes.length > 0) {
          const r = resp.routes[0];
          const rawPath: any[] = r.path || [];
          const pathPoints: [number, number][] = rawPath.map((pt) => [
            typeof pt.lat === 'function' ? pt.lat() : pt.lat,
            typeof pt.lng === 'function' ? pt.lng() : pt.lng,
          ]);

          const distMeters = Number(r.distanceMeters || 0);
          const durSeconds = typeof r.duration === 'string' ? parseInt(r.duration.replace('s', ''), 10) : Number(r.duration || 0);

          const stepsList: TurnStep[] = [];
          if (Array.isArray(r.legs)) {
            r.legs.forEach((leg: any) => {
              if (Array.isArray(leg.steps)) {
                leg.steps.forEach((s: any) => {
                  const sDist = Number(s.distanceMeters || 0);
                  const sDur = typeof s.staticDuration === 'string' ? parseInt(s.staticDuration.replace('s', ''), 10) : Number(s.duration || 0);
                  const stepPath: [number, number][] = Array.isArray(s.path)
                    ? s.path.map((pt: any) => [
                        typeof pt.lat === 'function' ? pt.lat() : pt.lat,
                        typeof pt.lng === 'function' ? pt.lng() : pt.lng,
                      ])
                    : [];

                  stepsList.push({
                    instruction: s.navigationInstruction?.instructions || s.instructions || `Continue for ${formatDistance(sDist)}`,
                    distanceMeters: sDist,
                    distanceFormatted: formatDistance(sDist),
                    durationSeconds: sDur,
                    durationFormatted: formatDuration(sDur),
                    maneuver: s.navigationInstruction?.maneuver || 'STRAIGHT',
                    path: stepPath,
                  });
                });
              }
            });
          }

          if (pathPoints.length > 0) {
            return {
              path: pathPoints,
              distanceMeters: distMeters,
              distanceKm: Number((distMeters / 1000).toFixed(2)),
              distanceFormatted: formatDistance(distMeters),
              durationSeconds: durSeconds,
              durationMinutes: Number((durSeconds / 60).toFixed(1)),
              durationFormatted: formatDuration(durSeconds),
              travelMode,
              steps: stepsList,
              viewport: r.viewport,
            };
          }
        }
      }
    } catch (clientErr) {
      console.warn('Client-side Route.computeRoutes failed, falling back to backend proxy:', clientErr);
    }
  }

  // 3. Robust Backend Google Routes Proxy (/api/routes/compute-route)
  const res = await fetch(`${API_BASE}/routes/compute-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: {
        lat: origin.lat,
        lng: origin.lng,
        place_id: origin.placeId,
        name: origin.name,
      },
      destination: {
        lat: destination.lat,
        lng: destination.lng,
        place_id: destination.placeId,
        name: destination.name,
      },
      intermediates: intermediates.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        place_id: p.placeId,
        name: p.name,
      })),
      travel_mode: travelMode,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to compute road route' }));
    throw new Error(err.detail || 'Failed to calculate real road directions from Google Routes API.');
  }

  const data = await res.json();
  const path: [number, number][] = (data.path || []).map((pt: any) => [Number(pt.lat), Number(pt.lng)]);

  if (path.length === 0) {
    throw new Error('Google Routes API returned no road path points between these locations.');
  }

  const formattedSteps: TurnStep[] = (data.steps || []).map((s: any) => ({
    instruction: s.instruction,
    distanceMeters: s.distance_meters,
    distanceFormatted: formatDistance(s.distance_meters),
    durationSeconds: s.duration_seconds,
    durationFormatted: formatDuration(s.duration_seconds),
    maneuver: s.maneuver,
    path: (s.path || []).map((pt: any) => [Number(pt.lat), Number(pt.lng)]),
  }));

  return {
    path,
    distanceMeters: data.distance_meters,
    distanceKm: data.distance_km,
    distanceFormatted: formatDistance(data.distance_meters),
    durationSeconds: data.duration_seconds,
    durationMinutes: data.duration_minutes,
    durationFormatted: formatDuration(data.duration_seconds),
    travelMode,
    steps: formattedSteps,
    viewport: data.viewport,
  };
}
