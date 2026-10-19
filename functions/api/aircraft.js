export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const rawLat = url.searchParams.get("lat");
  const rawLon = url.searchParams.get("lon");
  const lat = Number(rawLat);
  const lon = Number(rawLon);

  if (
    !rawLat ||
    !rawLon ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return Response.json(
      { error: "Coordenadas inválidas." },
      { status: 400 }
    );
  }

  const upstreamUrl =
    `https://api.adsb.lol/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/250`;

  try {
    const cache = globalThis.caches?.default;
    const cacheKey = new Request(upstreamUrl);

    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }

    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      const detalle = await upstream.text();
    
      return Response.json(
        {
          error: "ADSB.lol rechazó la consulta.",
          detalle: `HTTP ${upstream.status}: ${detalle.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }

    const data = await upstream.json();

    if (!Array.isArray(data.ac)) {
      return Response.json(
        { error: "La respuesta de ADSB.lol no contiene aeronaves." },
        { status: 502 }
      );
    }

    const response = Response.json(data, {
      headers: { "Cache-Control": "public, max-age=15" },
    });

    if (cache && context.waitUntil) {
      context.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (error) {
    return Response.json(
      {
        error: "Cloudflare no pudo consultar ADSB.lol.",
        detalle: error?.message || String(error),
      },
      { status: 503 }
    );
  }
}