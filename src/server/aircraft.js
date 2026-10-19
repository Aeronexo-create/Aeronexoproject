/** Shared ADS-B proxy for development, Cloudflare Pages and the hosted preview. */
export async function handleAircraft(request, context = {}) {
  if (request.method !== 'GET') return Response.json({ error: 'Método no permitido' }, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(request.url);
  const rawLat = url.searchParams.get('lat');
  const rawLon = url.searchParams.get('lon');
  const lat = Number(rawLat), lon = Number(rawLon);
  if (!rawLat?.trim() || !rawLon?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return Response.json({ error: 'Coordenadas inválidas' }, { status: 400 });
  }
  const upstream = `https://api.adsb.lol/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/250`;
  try {
    const cache = globalThis.caches?.default;
    const key = new Request(upstream);
    const cached = cache ? await cache.match(key) : null;
    if (cached) return cached;
    const result = await fetch(upstream, { signal: AbortSignal.timeout(12000) });
    if (!result.ok) return Response.json({ error: 'Fuente temporalmente no disponible' }, { status: 502 });
    const data = await result.json();
    if (!Array.isArray(data.ac)) throw new Error('Respuesta inválida');
    const response = Response.json(data, { headers: { 'Cache-Control': 'public, max-age=15' } });
    if (cache && context.waitUntil) context.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    return Response.json({ error: 'Fuente temporalmente no disponible' }, { status: 503 });
  }
}
