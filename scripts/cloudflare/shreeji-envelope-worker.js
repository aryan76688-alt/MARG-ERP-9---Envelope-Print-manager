addEventListener('fetch', event => { event.respondWith(handleRequest(event.request)); });

const TARGET_BASE = "https://email-hello-combination-santa.trycloudflare.com";
const GOOGLE_API_KEY = "AIzaSyCqJ08p5J1pYJQvJqrkV5_8AIl6pP8CfXA";

function decodeGooglePolyline(encoded) {
  const points = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: Number((lat / 1e5).toFixed(6)), lng: Number((lng / 1e5).toFixed(6)) });
  }
  return points;
}

async function handleComputeRoute(request) {
  let body = {};
  if (request.method === 'POST') {
    try { body = await request.json(); } catch(e) {}
  } else if (request.method === 'GET') {
    const u = new URL(request.url);
    body = {
      origin: { lat: parseFloat(u.searchParams.get('origin_lat') || '0'), lng: parseFloat(u.searchParams.get('origin_lng') || '0') },
      destination: { lat: parseFloat(u.searchParams.get('dest_lat') || '0'), lng: parseFloat(u.searchParams.get('dest_lng') || '0') },
      travel_mode: u.searchParams.get('travel_mode') || 'DRIVING'
    };
  }

  const origin = body.origin || {};
  const destination = body.destination || {};
  const travelMode = (body.travel_mode || body.travelMode || 'DRIVING').toUpperCase();
  const intermediates = body.intermediates || [];

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*'
  };

  // 1. Try Google Routes API v2
  try {
    const modeMap = { DRIVING: 'DRIVE', WALKING: 'WALK', BICYCLING: 'BICYCLE', TWO_WHEELER: 'TWO_WHEELER' };
    const gMode = modeMap[travelMode] || 'DRIVE';

    const originObj = origin.place_id || origin.placeId
      ? { placeId: origin.place_id || origin.placeId }
      : { location: { latLng: { latitude: Number(origin.lat), longitude: Number(origin.lng) } } };
    const destObj = destination.place_id || destination.placeId
      ? { placeId: destination.place_id || destination.placeId }
      : { location: { latLng: { latitude: Number(destination.lat), longitude: Number(destination.lng) } } };

    const payload = {
      origin: originObj,
      destination: destObj,
      travelMode: gMode,
      languageCode: 'en-US',
      units: 'METRIC'
    };
    if (['DRIVE', 'TWO_WHEELER'].includes(gMode)) {
      payload.routingPreference = 'TRAFFIC_UNAWARE';
    }
    if (intermediates.length > 0) {
      payload.intermediates = intermediates.map(p => 
        (p.place_id || p.placeId) ? { placeId: p.place_id || p.placeId } : { location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } } }
      );
    }

    const gResp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps,routes.legs.distanceMeters,routes.legs.duration,routes.viewport'
      },
      body: JSON.stringify(payload)
    });

    if (gResp.ok) {
      const gData = await gResp.json();
      if (gData.routes && gData.routes.length > 0) {
        const route = gData.routes[0];
        const path = decodeGooglePolyline(route.polyline?.encodedPolyline || '');
        const distM = Number(route.distanceMeters || 0);
        const durSec = parseInt(String(route.duration || '0').replace('s', ''), 10) || 0;

        const allSteps = [];
        (route.legs || []).forEach(leg => {
          (leg.steps || []).forEach(step => {
            const sDist = Number(step.distanceMeters || 0);
            const sDur = parseInt(String(step.staticDuration || step.duration || '0').replace('s', ''), 10) || 0;
            allSteps.push({
              instruction: step.navigationInstruction?.instructions || ('Continue for ' + sDist + 'm'),
              distance_meters: sDist,
              duration_seconds: sDur,
              maneuver: step.navigationInstruction?.maneuver || 'STRAIGHT',
              path: decodeGooglePolyline(step.polyline?.encodedPolyline || '')
            });
          });
        });

        return new Response(JSON.stringify({
          success: true,
          travel_mode: travelMode,
          distance_meters: distM,
          distance_km: Number((distM / 1000).toFixed(2)),
          duration_seconds: durSec,
          duration_minutes: Number((durSec / 60).toFixed(1)),
          viewport: route.viewport,
          path: path,
          path_count: path.length,
          steps: allSteps
        }), { status: 200, headers: corsHeaders });
      }
    }
  } catch(e) {
    // Continue to OSRM fallback
  }

  // 2. Fallback to OSRM Driving Engine
  try {
    const coords = [origin.lng + ',' + origin.lat];
    intermediates.forEach(p => coords.push(p.lng + ',' + p.lat));
    coords.push(destination.lng + ',' + destination.lat);

    const osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + coords.join(';') + '?overview=full&geometries=geojson&steps=true';
    const osrmResp = await fetch(osrmUrl);
    if (osrmResp.ok) {
      const osrmData = await osrmResp.json();
      if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
        const route = osrmData.routes[0];
        const path = (route.geometry?.coordinates || []).map(pt => ({ lat: pt[1], lng: pt[0] }));
        const distM = Math.round(route.distance || 0);
        const durSec = Math.round(route.duration || 0);

        const allSteps = [];
        (route.legs || []).forEach(leg => {
          (leg.steps || []).forEach(step => {
            allSteps.push({
              instruction: step.maneuver?.type ? (step.maneuver.type + ' ' + (step.name || '')).trim() : (step.name || 'Continue'),
              distance_meters: Math.round(step.distance || 0),
              duration_seconds: Math.round(step.duration || 0),
              maneuver: (step.maneuver?.modifier || step.maneuver?.type || 'STRAIGHT').toUpperCase(),
              path: (step.geometry?.coordinates || []).map(pt => ({ lat: pt[1], lng: pt[0] }))
            });
          });
        });

        return new Response(JSON.stringify({
          success: true,
          travel_mode: travelMode,
          distance_meters: distM,
          distance_km: Number((distM / 1000).toFixed(2)),
          duration_seconds: durSec,
          duration_minutes: Number((durSec / 60).toFixed(1)),
          path: path,
          path_count: path.length,
          steps: allSteps
        }), { status: 200, headers: corsHeaders });
      }
    }
  } catch(e) {
    // Continue
  }

  return new Response(JSON.stringify({ detail: 'Failed to compute road route between locations' }), { status: 500, headers: corsHeaders });
}

async function handleRequest(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }

  // Intercept road route computation directly on Cloudflare edge
  if (url.pathname.includes('/routes/compute-route') || url.pathname.includes('/routes/directions')) {
    return handleComputeRoute(request);
  }

  // Proxy to TARGET_BASE
  const targetUrl = new URL(url.pathname + url.search, TARGET_BASE);
  const headers = new Headers(request.headers);
  headers.set('host', new URL(TARGET_BASE).host);
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');
  try {
    const res = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual'
    });
    const newHeaders = new Headers(res.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    const loc = newHeaders.get('location');
    if (loc) {
      try {
        const locUrl = new URL(loc, TARGET_BASE);
        if (locUrl.host === new URL(TARGET_BASE).host) {
          newHeaders.set('location', locUrl.pathname + locUrl.search);
        }
      } catch (e) {}
    }
    return new Response(res.body, { status: res.status, headers: newHeaders });
  } catch(e) {
    return new Response('<html><head><title>Connecting to Mobile Server</title><meta http-equiv="refresh" content="3"></head><body style="font-family:system-ui;text-align:center;padding:50px;background:#0f172a;color:#f8fafc;"><div style="max-width:500px;margin:0 auto;background:#1e293b;padding:30px;border-radius:16px;"><h2>Connecting to Shreeji Healthcare Server...</h2><p style="color:#94a3b8;font-size:14px;">Phone server is establishing connection. Refreshing in 3 seconds...</p></div></body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
  }
}
