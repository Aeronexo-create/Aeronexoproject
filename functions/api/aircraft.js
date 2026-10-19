export async function onRequestGet({ request }) {
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
      { error: "Coordenadas inválidas", ejemplo: "/api/aircraft?lat=18.736&lon=-70.163" },
      { status: 400 }
    );
  }

  const sourceUrl =
    `https://api.adsb.lol/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/250`;

  let lastError = "La fuente no respondió.";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(sourceUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        lastError = `ADSB.lol respondió HTTP ${response.status}.`;
        if (attempt === 1 && response.status >= 500) continue;

        return Response.json(
          { error: "ADSB.lol no entregó datos.", detalle: lastError },
          { status: 502 }
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.ac)) {
        return Response.json(
          { error: "La respuesta de ADSB.lol no contiene la lista de aeronaves." },
          { status: 502 }
        );
      }

      return Response.json(data, {
        headers: {
          "Cache-Control": "public, max-age=10",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  return Response.json(
    {
      error: "Cloudflare no pudo obtener los datos de vuelos.",
      detalle: lastError,
      coordenadas: { latitud: lat, longitud: lon },
    },
    { status: 503 }
  );
}
