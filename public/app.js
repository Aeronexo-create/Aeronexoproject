'use strict';
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? '—').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
const REGIONS = {
  caribe: [20, -70, 5, 'Caribe y Atlántico'],
  norte: [39, -95, 5, 'Norteamérica'],
  europa: [49, 8, 5, 'Europa'],
  sur: [-22, -47, 5, 'Sudamérica'],
  asia: [35, 139, 6, 'Asia oriental'],
};
const AIRPORTS = [
  ['SDQ', 'Santo Domingo · Las Américas', 18.4297, -69.6689],
  ['JBQ', 'Santo Domingo · La Isabela', 18.5725, -69.9856],
  ['STI', 'Santiago · Cibao', 19.4061, -70.6047],
  ['PUJ', 'Punta Cana', 18.5674, -68.3634],
  ['POP', 'Puerto Plata', 19.7579, -70.57],
  ['LRM', 'La Romana', 18.4507, -68.9118],
  ['AZS', 'Samaná · El Catey', 19.267, -69.742],
  ['SXM', 'Sint Maarten', 18.041, -63.108],
  ['SJU', 'San Juan', 18.439, -66.002],
  ['MIA', 'Miami', 25.7959, -80.287],
  ['JFK', 'Nueva York · JFK', 40.6413, -73.7781],
  ['ATL', 'Atlanta', 33.6407, -84.4277],
  ['HAV', 'La Habana', 22.9892, -82.4091],
  ['NAS', 'Nassau', 25.039, -77.466],
  ['MBJ', 'Montego Bay', 18.5037, -77.9134],
  ['KIN', 'Kingston', 17.9357, -76.7875],
  ['PTY', 'Ciudad de Panamá', 9.0714, -79.3835],
  ['BOG', 'Bogotá', 4.7016, -74.1469],
  ['MEX', 'Ciudad de México', 19.4363, -99.0721],
  ['LHR', 'Londres · Heathrow', 51.47, -0.4543],
  ['MAD', 'Madrid', 40.4983, -3.5676],
  ['CDG', 'París · Charles de Gaulle', 49.0097, 2.5479],
  ['GRU', 'São Paulo', -23.4356, -46.4731],
  ['LAX', 'Los Ángeles', 33.9416, -118.4085],
];
const $num = (n, unit = '') =>
  Number.isFinite(Number(n)) && n !== null && n !== undefined
    ? Math.round(Number(n)).toLocaleString('es-DO') + unit
    : '—';
const altitude = (a) => (a.alt_baro === 'ground' ? 0 : Number(a.alt_baro) || 0);
const color = (a) =>
  altitude(a) < 10000
    ? '#efc575'
    : altitude(a) < 23000
    ? '#62dfb2'
    : altitude(a) < 35000
    ? '#61c6ef'
    : '#bc9af3';
const flight = (a) => (a.flight || '').trim() || a.r || a.hex;
const HISTORY_KEY = 'aeronexo-history-v1';
let rememberedTheme = 'dark';
try {
  rememberedTheme = localStorage.getItem('aeronexo-theme') || 'dark';
} catch {}
let map,
  base,
  aircraft = [],
  selected = null,
  markers = new Map(),
  favoriteOnly = false,
  demoMode = false,
  busy = false,
  lastUpdate = null,
  requestSeq = 0,
  theme = rememberedTheme === 'light' ? 'light' : 'dark',
  tracks = new Map(),
  trace = null,
  moveTimer,
  historyRecordTimer = 0,
  detailTab = 'details',
  photoFetchSeq = 0;
let favorites = [];
try {
  favorites = JSON.parse(localStorage.getItem('aeronexo-favorites') || '[]');
  if (!Array.isArray(favorites)) favorites = [];
} catch {}
let savedHistory = {};
try {
  savedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  if (!savedHistory || typeof savedHistory !== 'object') savedHistory = {};
} catch {}
for (const [hex, rec] of Object.entries(savedHistory))
  if (Array.isArray(rec.points))
    tracks.set(
      hex,
      rec.points.map((p) => [p[1], p[2]])
    );
function notify(msg) {
  $('toast').textContent = msg;
  $('toast').style.display = 'block';
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($('toast').style.display = 'none'), 4000);
}
function formatTime(ts) {
  return (
    new Intl.DateTimeFormat('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }).format(new Date(ts)) + ' UTC'
  );
}
function formatDate(ts) {
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ts));
}
function airportAt(point) {
  if (!point || point[3] > 2500) return null;
  const [, lat, lon] = point;
  let best = null,
    dist = Infinity;
  for (const a of AIRPORTS) {
    const d = Math.hypot(
      (a[2] - lat) * 111,
      (a[3] - lon) * 111 * Math.cos((lat * Math.PI) / 180)
    );
    if (d < dist) {
      best = a;
      dist = d;
    }
  }
  return dist < 35 ? best : null;
}
function endpointLabel(point) {
  if (!point) return '—';
  const ap = airportAt(point);
  return ap
    ? `${ap[0]} · ${ap[1].split(' · ').at(-1)}`
    : `${point[1].toFixed(2)}°, ${point[2].toFixed(2)}°`;
}
function recordLivePositions(list) {
  const now = Date.now();
  if (now - historyRecordTimer < 55000) return;
  historyRecordTimer = now;
  let changed = false;
  for (const a of list) {
    if (!a.hex || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
    let rec = savedHistory[a.hex] || {
      hex: a.hex,
      registration: a.r || '',
      flight: a.flight || '',
      type: a.t || '',
      points: [],
    };
    rec.registration = a.r || rec.registration;
    rec.flight = a.flight || rec.flight;
    rec.type = a.t || rec.type;
    const last = rec.points.at(-1);
    if (last && now - last[0] < 50000) continue;
    rec.points.push([
      now,
      a.lat,
      a.lon,
      altitude(a),
      Number(a.gs) || 0,
      Number(a.track) || 0,
    ]);
    rec.points = rec.points
      .filter((p) => now - p[0] <= 30 * 24 * 60 * 60 * 1000)
      .slice(-400);
    rec.lastSeen = now;
    savedHistory[a.hex] = rec;
    tracks.set(
      a.hex,
      rec.points.map((p) => [p[1], p[2]])
    );
    changed = true;
  }
  if (Object.keys(savedHistory).length > 100) {
    const oldest = Object.entries(savedHistory).sort(
      (a, b) => (a[1].lastSeen || 0) - (b[1].lastSeen || 0)
    );
    for (const [hex] of oldest.slice(0, Object.keys(savedHistory).length - 100))
      delete savedHistory[hex];
  }
  if (changed) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(savedHistory));
    } catch {
      notify('El navegador se quedó sin espacio para guardar más historial.');
      savedHistory = {};
    }
  }
}
function sessionsFor(hex) {
  const rec = savedHistory[hex];
  if (!rec?.points?.length) return [];
  const points = [...rec.points].sort((a, b) => a[0] - b[0]);
  const groups = [];
  for (const p of points) {
    let g = groups.at(-1);
    if (!g || p[0] - g.at(-1)[0] > 45 * 60 * 1000) groups.push((g = []));
    g.push(p);
  }
  return groups
    .filter((g) => g.length > 1 && g.some((p) => p[3] > 1000))
    .map((g, i) => ({
      id: `${hex}-${g[0][0]}`,
      hex,
      number: i + 1,
      from: g[0],
      to: g.at(-1),
      points: g,
      flight: rec.flight?.trim() || '—',
      registration: rec.registration || hex,
      type: rec.type || '—',
      duration: Math.max(0, g.at(-1)[0] - g[0][0]),
      altitude: Math.max(...g.map((p) => p[3])),
    }));
}
function allSessions() {
  return Object.keys(savedHistory)
    .flatMap(sessionsFor)
    .sort((a, b) => b.to[0] - a.to[0]);
}
function icon(a) {
  return L.divIcon({
    className: 'plane-icon' + (selected === a.hex ? ' chosen' : ''),
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<svg aria-hidden="true" viewBox="0 0 24 24" style="transform:rotate(${
      Number(a.track) || 0
    }deg)" fill="${color(
      a
    )}"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>`,
  });
}
function matching() {
  const q = $('search').value.trim().toLowerCase(),
    min = Number($('alt').value);
  return aircraft
    .filter(
      (a) =>
        (!favoriteOnly || favorites.includes(a.hex)) &&
        altitude(a) >= min &&
        (!$('ground').checked || a.alt_baro !== 'ground') &&
        [a.flight, a.r, a.t, a.hex].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(q)
        )
    )
    .sort((a, b) => flight(a).localeCompare(flight(b)));
}
function render() {
  const shown = matching();
  $('count').textContent = shown.length;
  $('favCount').textContent = favorites.length;
  $('listTitle').textContent = favoriteOnly
    ? 'Aeronaves favoritas'
    : 'Aeronaves en la zona';
  $('flightList').innerHTML = shown.length
    ? shown
        .map(
          (a) =>
            `<button class="flight-row ${
              a.hex === selected ? 'selected' : ''
            }" data-hex="${esc(
              a.hex
            )}"><span class="flight-symbol" style="color:${color(
              a
            )}">✈</span><span class="flight-copy"><b>${esc(
              flight(a)
            )}</b><small>${esc(a.r || a.hex)} · ${esc(
              a.t || 'Modelo no disponible'
            )}</small></span><span class="row-data">${
              a.alt_baro === 'ground' ? 'En tierra' : $num(a.alt_baro)
            }<small>${a.alt_baro === 'ground' ? '' : 'ft · '}${$num(
              a.gs,
              ' kt'
            )}</small></span></button>`
        )
        .join('')
    : `<div class="empty">${
        favoriteOnly
          ? 'No hay favoritos detectados en esta zona. Selecciona un avión y pulsa Guardar.'
          : aircraft.length
          ? 'No hay aeronaves con estos filtros.'
          : 'No hay posiciones disponibles aquí. Mueve el mapa, actualiza o explora la demo.'
      }</div>`;
  $('flightList')
    .querySelectorAll('[data-hex]')
    .forEach((b) => (b.onclick = () => selectFlight(b.dataset.hex, true)));
  if (!map) return;
  const ids = new Set(shown.map((a) => a.hex));
  for (const [id, m] of markers)
    if (!ids.has(id)) {
      map.removeLayer(m);
      markers.delete(id);
    }
  for (const a of shown) {
    let m = markers.get(a.hex);
    if (!m) {
      m = L.marker([a.lat, a.lon], {
        icon: icon(a),
        keyboard: true,
        title: flight(a),
      })
        .addTo(map)
        .bindTooltip(esc(flight(a)), { direction: 'top', offset: [0, -10] });
      m.on('click', () => selectFlight(a.hex, false));
      markers.set(a.hex, m);
    } else m.setLatLng([a.lat, a.lon]).setIcon(icon(a));
  }
  if (selected) renderDetail();
}
function selectFlight(hex, center = false) {
  selected = hex;
  detailTab = 'details';
  $('detail').hidden = false;
  document.querySelector('.sidebar').classList.remove('mobile-open');
  $('mobileToggle').textContent = '☷  Ver aeronaves';
  const a = aircraft.find((x) => x.hex === hex);
  if (center && a) map.panTo([a.lat, a.lon]);
  render();
  drawTrace();
}
function photoPane(a) {
  if (!a.r)
    return `<div class="photo-empty"><span>▧</span><b>No hay matrícula confirmada para buscar fotos.</b><small>Esta aeronave no transmitió una matrícula en la señal recibida.</small></div>`;
  return `<div class="gallery-head"><div><b>Fotos de ${esc(
    a.r
  )}</b><small>Las imágenes se enlazan desde su fuente original y conservan el crédito.</small></div><button class="subtle-button" id="reloadPhotos">↻ Actualizar</button></div><div id="photoGrid" class="photo-grid"><div class="empty">Buscando fotografías de la matrícula ${esc(
    a.r
  )}…</div></div>`;
}
function historyPane(a) {
  const rec = savedHistory[a.hex],
    sessions = sessionsFor(a.hex),
    rows = sessions
      .map(
        (s) =>
          `<tr><td>${formatDate(s.from[0])}</td><td>${esc(
            endpointLabel(s.from)
          )}</td><td>${esc(endpointLabel(s.to))}</td><td>${esc(
            s.flight
          )}</td><td>${Math.floor(
            s.duration / 60000
          )} min</td><td>—</td><td>${formatTime(
            s.from[0]
          )}</td><td>—</td><td><span class="status-pill partial">Tramo observado</span></td><td><button class="table-action" data-play="${esc(
            s.id
          )}">Ver mapa</button></td></tr>`
      )
      .join('');
  return `<div class="history-heading"><div><b>Registro de vuelos · ${esc(
    a.r || a.hex
  )}</b><small>Hasta 30 días guardados en este navegador · ${
    sessions.length
  } tramo(s) observados</small></div><button class="subtle-button" id="exportHistory">Descargar CSV</button></div>${
    sessions.length
      ? `<div class="history-table-wrap"><table class="history-table"><thead><tr><th>FECHA</th><th>FROM</th><th>TO</th><th>FLIGHT</th><th>FLIGHT TIME</th><th>STD</th><th>ATD*</th><th>STA</th><th>STATUS</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="history-note">* ATD indica la hora en que el navegador empezó a observar el tramo, no la hora oficial de despegue. STD y STA requieren horarios publicados por una aerolínea. Ruta y duración pueden ser parciales si el navegador perdió la señal o estaba cerrado.</p>`
      : `<div class="history-empty"><div>◷</div><b>Aún no hay vuelos registrados para esta matrícula</b><p>Al abrir esta página, guardará durante un máximo de 30 días los puntos ADS-B que observe este navegador. Un tramo aparecerá cuando se hayan recibido varias posiciones.</p><small>Este historial es local. No contiene vuelos anteriores a la primera observación ni horarios oficiales.</small></div>`
  }`;
}
function renderDetail() {
  const live = aircraft.find((a) => a.hex === selected),
    rec = savedHistory[selected];
  if (!live && !rec) {
    $('detail').hidden = true;
    selected = null;
    return;
  }
  const a = live || {
    hex: selected,
    r: rec?.registration,
    t: rec?.type,
    flight: rec?.flight,
    alt_baro: null,
    gs: null,
    track: null,
    baro_rate: null,
    lat: null,
    lon: null,
    seen_pos: null,
  };
  const saved = favorites.includes(a.hex);
  const content =
    detailTab === 'history'
      ? historyPane(a)
      : detailTab === 'photos'
      ? photoPane(a)
      : `<div class="detail-data"><div class="metric"><span>ALTITUD BAROMÉTRICA</span><b>${
          a.alt_baro === 'ground'
            ? 'En tierra'
            : a.alt_baro != null
            ? $num(a.alt_baro)
            : '—'
        }</b> <small>${
          a.alt_baro === 'ground' ? '' : 'ft'
        }</small></div><div class="metric"><span>VELOCIDAD</span><b>${
          a.gs != null ? $num(a.gs) : '—'
        }</b> <small>kt</small></div><div class="metric"><span>RUMBO</span><b>${
          a.track != null ? $num(a.track, '°') : '—'
        }</b></div><div class="metric"><span>VELOCIDAD VERTICAL</span><b>${
          a.baro_rate != null ? $num(a.baro_rate) : '—'
        }</b> <small>ft/min</small></div><div class="metric"><span>IDENTIFICADOR ICAO</span><b>${esc(
          a.hex.toUpperCase()
        )}</b></div><div class="metric"><span>POSICIÓN RECIBIDA</span><b>${
          a.seen_pos != null ? $num(a.seen_pos) : '—'
        }</b> <small>${
          a.seen_pos != null ? 's antes de consulta' : ''
        }</small></div></div><div class="detail-actions"><button id="saveFlight">${
          saved ? '★ Guardado' : '☆ Guardar'
        }</button><button id="centerFlight">⌖ Centrar</button></div><div class="detail-note">${
          Number.isFinite(a.lat)
            ? `${Number(a.lat).toFixed(4)}°, ${Number(a.lon).toFixed(4)}°<br>`
            : ''
        }${
          demoMode
            ? 'Ejemplo ficticio para explorar la interfaz.'
            : live
            ? 'Datos recibidos por ADS-B. Horarios de salida y llegada no incluidos en la señal.'
            : 'Aeronave guardada en el historial de este navegador.'
        }</div>`;
  $(
    'detail'
  ).innerHTML = `<div class="detail-top"><button class="icon-button close" id="closeDetail" aria-label="Cerrar ficha">×</button><div class="detail-badge">${
    demoMode
      ? 'DEMOSTRACIÓN · DATOS FICTICIOS'
      : live
      ? 'POSICIÓN ADS-B'
      : 'AERONAVE EN HISTORIAL'
  }</div><h2>${esc(flight(a))}</h2><p>${esc(
    a.t || 'Modelo no disponible'
  )} <span class="footer-divider">/</span> ${esc(
    a.r || a.hex
  )}</p></div><div class="detail-tabs" role="tablist"><button data-tab="details" class="${
    detailTab === 'details' ? 'selected' : ''
  }">Datos</button><button data-tab="history" class="${
    detailTab === 'history' ? 'selected' : ''
  }">Historial <span>${
    sessionsFor(a.hex).length
  }</span></button><button data-tab="photos" class="${
    detailTab === 'photos' ? 'selected' : ''
  }">Fotos</button></div><div class="detail-content">${content}</div>`;
  $('closeDetail').onclick = () => {
    $('detail').hidden = true;
    selected = null;
    if (trace) {
      map.removeLayer(trace);
      trace = null;
    }
    render();
  };
  document.querySelectorAll('[data-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        detailTab = b.dataset.tab;
        renderDetail();
        if (detailTab === 'photos') loadPhotos(a);
        if (detailTab === 'history') wireHistory();
      })
  );
  if (detailTab === 'photos') loadPhotos(a);
  if (detailTab === 'history') wireHistory();
  $('saveFlight')?.addEventListener('click', () => {
    favorites = saved
      ? favorites.filter((x) => x !== a.hex)
      : [...favorites, a.hex];
    try {
      localStorage.setItem('aeronexo-favorites', JSON.stringify(favorites));
    } catch {}
    render();
    notify(
      saved
        ? 'Aeronave eliminada de favoritos'
        : 'Aeronave guardada en este navegador'
    );
  });
  $('centerFlight')?.addEventListener('click', () => {
    if (Number.isFinite(a.lat)) map?.setView([a.lat, a.lon], 8);
    else {
      const pts = tracks.get(a.hex);
      if (pts?.length) map?.fitBounds(pts, { padding: [40, 40] });
    }
  });
}
async function loadPhotos(a) {
  const grid = $('photoGrid');
  if (!grid) return;
  const seq = ++photoFetchSeq;
  const param = a.r
    ? `registration=${encodeURIComponent(a.r)}`
    : `hex=${encodeURIComponent(a.hex)}`;
  try {
    const response = await fetch(`/api/photos?${param}`, {
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (seq !== photoFetchSeq || !$('photoGrid')) return;
    if (!response.ok)
      throw Error(data.error || 'No se pudo consultar la galería');
    grid.innerHTML = data.photos?.length
      ? data.photos
          .map(
            (p, i) =>
              `<a class="photo-card" href="${esc(
                p.page
              )}" target="_blank" rel="noopener noreferrer"><img src="${esc(
                p.thumbnail
              )}" alt="${esc(a.r || a.hex)} · foto ${
                i + 1
              }" loading="lazy"><span class="photo-credit">© ${esc(
                p.photographer
              )}<small>Ver foto original ↗</small></span></a>`
          )
          .join('')
      : `<div class="photo-empty"><span>▧</span><b>No encontramos fotos para ${esc(
          a.r || a.hex
        )}.</b><small>La galería solo muestra imágenes asociadas a esta matrícula o identificador. No se sustituye por una foto de otro avión del mismo modelo.</small></div>`;
    $('reloadPhotos')?.addEventListener('click', () => loadPhotos(a));
  } catch (e) {
    if (seq !== photoFetchSeq) return;
    const el = $('photoGrid');
    if (el)
      el.innerHTML = `<div class="photo-empty"><span>▧</span><b>La galería no está disponible ahora.</b><small>${esc(
        e.message || 'Intenta actualizar en unos minutos.'
      )}</small></div>`;
    $('reloadPhotos')?.addEventListener('click', () => loadPhotos(a));
  }
}
function wireHistory() {
  const btn = $('exportHistory');
  if (btn) btn.onclick = () => downloadCsv(selected);
  document.querySelectorAll('[data-play]').forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.play;
        const row = sessionsFor(selected).find((s) => s.id === id);
        if (!row) return;
        detailTab = 'details';
        $('detail').hidden = true;
        if (trace) {
          map.removeLayer(trace);
          trace = null;
        }
        trace = L.polyline(
          row.points.map((p) => [p[1], p[2]]),
          { color: '#53e1c0', weight: 3, opacity: 0.9 }
        ).addTo(map);
        map.fitBounds(trace.getBounds(), { padding: [60, 60] });
        document.querySelector('.sidebar').classList.remove('mobile-open');
        notify('Mostrando el tramo ADS-B guardado en este navegador.');
      })
  );
}
function downloadCsv(hex) {
  const data = sessionsFor(hex);
  const head = [
    'DATE',
    'FROM',
    'TO',
    'FLIGHT',
    'FLIGHT TIME',
    'STD',
    'ATD',
    'STA',
    'STATUS',
  ];
  const lines = [
    head,
    ...data.map((s) => [
      formatDate(s.from[0]),
      endpointLabel(s.from),
      endpointLabel(s.to),
      s.flight,
      `${Math.floor(s.duration / 60000)} min`,
      '',
      formatTime(s.from[0]),
      '',
      'Observed segment',
    ]),
  ];
  const csv =
    '\ufeff' +
    lines
      .map((row) =>
        row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(',')
      )
      .join('\r\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `aeronexo-${hex}-historial.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
function drawTrace() {
  if (!map) return;
  if (trace) map.removeLayer(trace);
  const points = tracks.get(selected);
  trace =
    points?.length > 1
      ? L.polyline(points, {
          color: '#53e1c0',
          weight: 2,
          opacity: 0.7,
          dashArray: '5 5',
        }).addTo(map)
      : null;
}
function setStatus(label, detail, connected = false) {
  $('modeLabel').textContent = label;
  $('sourceState').textContent = detail;
  $('liveIndicator').classList.toggle('connected', connected);
}
async function refresh() {
  if (demoMode || busy || !map || document.hidden) return;
  busy = true;
  const seq = ++requestSeq,
    c = map.getCenter();
  setStatus('ACTUALIZANDO', 'Consultando ADSB.lol');
  $('refresh').disabled = true;
  try {
    const response = await fetch(
      `/api/aircraft?lat=${c.lat.toFixed(3)}&lon=${(
        ((((c.lng + 180) % 360) + 360) % 360) -
        180
      ).toFixed(3)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!response.ok) throw Error('HTTP ' + response.status);
    const data = await response.json();
    if (seq !== requestSeq || demoMode) return;
    if (!Array.isArray(data.ac)) throw Error('Respuesta inválida');
    aircraft = data.ac.filter(
      (a) =>
        typeof a.hex === 'string' &&
        Number.isFinite(a.lat) &&
        Number.isFinite(a.lon) &&
        (!Number.isFinite(a.seen_pos) || a.seen_pos < 180)
    );
    lastUpdate = new Date();
    recordLivePositions(aircraft);
    setStatus('DATOS REALES', 'Conectado a ADSB.lol', true);
    $('updated').textContent =
      'Actualizado ' +
      lastUpdate.toLocaleTimeString('es-DO', { hour12: false });
    render();
    drawTrace();
  } catch (e) {
    if (seq !== requestSeq || demoMode) return;
    setStatus(
      'SIN CONEXIÓN',
      lastUpdate
        ? 'Posiciones anteriores · sin actualizar'
        : 'Fuente no disponible'
    );
    $('updated').textContent = lastUpdate
      ? 'Última consulta ' +
        lastUpdate.toLocaleTimeString('es-DO', { hour12: false })
      : 'Reintenta o explora la demostración';
    if (!aircraft.length) render();
  } finally {
    busy = false;
    $('refresh').disabled = false;
  }
}
function demo() {
  requestSeq++;
  demoMode = !demoMode;
  selected = null;
  $('detail').hidden = true;
  aircraft = [];
  tracks.clear();
  if (trace) {
    map.removeLayer(trace);
    trace = null;
  }
  if (demoMode) {
    map.setView([20, -70], 5);
    const samples = [
      ['NX102', 'NX-A102', 'A320', 19.4, -69.2, 31000, 441, 320],
      ['NX248', 'NX-A248', 'B738', 21.3, -73.1, 35000, 458, 125],
      ['NX071', 'NX-A071', 'E190', 18.6, -67.9, 19000, 350, 275],
      ['NX830', 'NX-A830', 'B789', 23, -66, 39000, 492, 55],
      ['NX406', 'NX-A406', 'A321', 19.8, -72.1, 29000, 412, 145],
      ['NX559', 'NX-A559', 'B752', 22, -69.7, 37000, 469, 300],
      ['NX212', 'NX-A212', 'AT76', 18.5, -70.4, 7000, 241, 87],
      ['NX663', 'NX-A663', 'A359', 24, -71, 41000, 501, 191],
      ['NX190', 'NX-A190', 'C172', 18.8, -68.6, 2500, 110, 10],
      ['NX325', 'NX-A325', 'B737', 20.9, -67.5, 28000, 417, 201],
      ['NX918', 'NX-A918', 'A333', 21.8, -65.6, 36000, 480, 80],
      ['NX444', 'NX-A444', 'E175', 17.8, -71.1, 23000, 376, 341],
    ];
    aircraft = samples.map((s, i) => ({
      flight: s[0],
      r: s[1],
      t: s[2],
      lat: s[3],
      lon: s[4],
      alt_baro: s[5],
      gs: s[6],
      track: s[7],
      hex: 'de' + String(i).padStart(4, '0'),
      baro_rate: 0,
      seen_pos: 0,
    }));
    setStatus('DEMOSTRACIÓN', 'Datos ficticios · modo exploración');
    $('updated').textContent = 'Estos aviones no representan vuelos reales';
    $('demo').textContent = 'Volver a datos reales';
  } else {
    $('demo').textContent = 'Explorar demo';
    setStatus('CONECTANDO', 'Consultando posiciones reales');
  }
  render();
  if (!demoMode) refresh();
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const light = theme === 'light';
  $('themeIcon').textContent = light ? '☾' : '☼';
  $('themeToggle').setAttribute(
    'aria-label',
    light ? 'Cambiar al modo oscuro' : 'Cambiar al modo claro'
  );
  $('themeToggle').title = light
    ? 'Cambiar al modo oscuro'
    : 'Cambiar al modo claro';
  try {
    localStorage.setItem('aeronexo-theme', theme);
  } catch {}
}
try {
  map = L.map('map', {
    zoomControl: false,
    minZoom: 3,
    maxZoom: 13,
    worldCopyJump: true,
  }).setView([20, -70], 5);
  base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
   
    maxZoom: 19,
  }).addTo(map);
  applyTheme();
  let tileFailures = 0;
  base.on('tileerror', () => {
    if (++tileFailures === 8)
      notify('El fondo del mapa no está disponible. Revisa tu conexión.');
  });
  map.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(refresh, 1000);
  });
  refresh();
  setInterval(refresh, 30000);
} catch (e) {
  $('mapError').hidden = false;
  setStatus('MAPA NO DISPONIBLE', 'Comprueba tu conexión');
}
$('search').oninput = render;
$('filtersToggle').onclick = () => ($('filters').hidden = !$('filters').hidden);
$('alt').oninput = () => {
  $('altLabel').textContent = $num($('alt').value, ' ft');
  $('filterDot').textContent = Number($('alt').value) > 0 ? '•' : '';
  render();
};
$('ground').onchange = render;
$('resetFilters').onclick = () => {
  $('alt').value = 0;
  $('ground').checked = false;
  $('altLabel').textContent = '0 ft';
  $('filterDot').textContent = '';
  render();
};
$('region').onchange = () => {
  const r = REGIONS[$('region').value];
  $('areaLabel').textContent = r[3];
  map?.setView([r[0], r[1]], r[2]);
  if (demoMode) notify('La demo solo contiene ejemplos ficticios del Caribe.');
};
$('refresh').onclick = () =>
  demoMode
    ? notify('Estás viendo ejemplos ficticios. Pulsa Volver a datos reales.')
    : refresh();
$('demo').onclick = demo;
$('zoomIn').onclick = () => map?.zoomIn();
$('zoomOut').onclick = () => map?.zoomOut();
$('home').onclick = () => {
  $('region').value = 'caribe';
  $('areaLabel').textContent = 'Caribe y Atlántico';
  map?.setView([20, -70], 5);
};
$('layers').onclick = () => {
  theme = theme === 'light' ? 'dark' : 'light';
  applyTheme();
};
$('themeToggle').onclick = () => {
  theme = theme === 'light' ? 'dark' : 'light';
  applyTheme();
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    map?.invalidateSize();
  } catch {
    notify('La pantalla completa no está disponible en este navegador.');
  }
};
$('info').onclick = () => $('about').showModal();
$('closeAbout').onclick = $('acceptAbout').onclick = () => $('about').close();
$('favTab').onclick = () => {
  favoriteOnly = !favoriteOnly;
  $('favTab').classList.toggle('active', favoriteOnly);
  $('mapTab').classList.toggle('active', !favoriteOnly);
  document.querySelector('.sidebar').classList.add('mobile-open');
  render();
};
$('mapTab').onclick = () => {
  favoriteOnly = false;
  $('mapTab').classList.add('active');
  $('favTab').classList.remove('active');
  $('historyTab').classList.remove('active');
  render();
};
$('historyTab').onclick = () => {
  const sessions = allSessions();
  $('historyTab').classList.add('active');
  $('mapTab').classList.remove('active');
  $('favTab').classList.remove('active');
  if (!sessions.length) {
    $('historyTab').classList.remove('active');
    $('mapTab').classList.add('active');
    notify(
      'Aún no hay tramos observados. Deja la página abierta mientras haya vuelos para comenzar a guardar registros.'
    );
    return;
  }
  const hex = sessions[0].hex;
  selected = hex;
  detailTab = 'history';
  $('detail').hidden = false;
  renderDetail();
};
document.addEventListener('keydown', (e) => {
  if (
    e.key === '/' &&
    !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    document.querySelector('.sidebar').classList.add('mobile-open');
    $('search').focus();
  }
  if (e.key === 'Escape' && selected) {
    selected = null;
    $('detail').hidden = true;
    drawTrace();
    render();
  }
});
function tick() {
  $('clock').textContent = new Date().toISOString().slice(11, 19) + ' UTC';
}
tick();
setInterval(tick, 1000);
$('favCount').textContent = favorites.length;
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: 'search_aircraft',
        title: 'Buscar aeronaves',
        description:
          'Filtra las aeronaves de la zona actual por indicativo, matrícula, modelo o ICAO.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', maxLength: 80 } },
          required: ['query'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          if (
            !input ||
            typeof input.query !== 'string' ||
            input.query.length > 80
          )
            throw Error('Se requiere una búsqueda de hasta 80 caracteres.');
          $('search').value = input.query;
          render();
          return {
            mode: demoMode ? 'demo' : 'real',
            aircraft: matching()
              .slice(0, 30)
              .map((a) => ({
                hex: a.hex,
                flight: flight(a),
                altitude: a.alt_baro,
              })),
          };
        },
      })
    ).catch(() => {});
  } catch {}
}
