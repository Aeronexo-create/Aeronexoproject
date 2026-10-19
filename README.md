# AeroNexo · Astro

Web de seguimiento aéreo en español, creada con Astro 7.3.8, JavaScript y Leaflet. Diseño oscuro, mapa navegable, fichas de aeronaves, filtros, favoritos locales y demo separada de los datos reales.

## Abrir el proyecto

Necesitas Node.js 22.12 o superior. En esta carpeta:

```bash
npm install && npm run dev
```

Abre la dirección que indique la terminal. También puedes importar esta carpeta como un proyecto independiente en StackBlitz con una versión compatible de Node. No requiere claves de API actualmente.

## Publicar en Cloudflare Pages desde GitHub

Sube el contenido del proyecto a un repositorio nuevo y conéctalo en Cloudflare Pages:

- Framework: Astro
- Comando de compilación: `npm run build`
- Directorio de salida: `dist`
- Versión de Node: `22`

Conserva la carpeta `functions` en la raíz del repositorio: proporciona `/api/aircraft`. La subida manual de solo los archivos estáticos no incluye esa función. No hace falta un adaptador de Astro porque las páginas se generan como HTML estático y la API se ejecuta mediante Pages Functions.

## Archivos principales

- `src/pages/index.astro`: página del mapa.
- `src/components/`: cabecera, explorador, pie y ventana de información.
- `src/layouts/Layout.astro`: documento y metadatos.
- `src/styles/global.css`: apariencia y diseño móvil.
- `public/app.js`: mapa, búsqueda, filtros, favoritos y actualización.
- `src/server/aircraft.js`: consulta de posiciones y validación.
- `functions/api/aircraft.js`: conexión de la API en Cloudflare Pages.
- `astro.config.mjs`: configuración de Astro y API local.

`npm run build` genera la web; `npm run preview` permite revisar la compilación. `npm run build:site` empaqueta además la vista alojada de esta conversación; no es necesario para tu Cloudflare Pages.

## Datos y límites

ADSB.lol aporta las posiciones. La web consulta cada 30 segundos y cubre hasta 250 millas náuticas alrededor del centro del mapa. La cobertura y disponibilidad dependen del proveedor. La demostración usa datos ficticios; los fallos de conexión se indican, sin sustituir silenciosamente datos reales por ficticios. No se incluyen rutas comerciales, horarios ni cobertura mundial garantizada.

La API pública puede cambiar o aplicar límites. Antes de un lanzamiento comercial, contacta con ADSB.lol para acordar el uso en producción: https://api.adsb.lol/docs. Datos bajo ODbL. Mapas: OpenStreetMap y CARTO. Favoritos guardados solo en el navegador. No utilizar para navegación aérea.

Leaflet 1.9.4: https://leafletjs.com/ (licencia BSD-2-Clause). Los archivos distribuidos conservan su aviso de licencia.

## Historial y ficha por matrícula

Al seleccionar una aeronave, su ficha muestra **Datos**, **Historial** y **Fotos**. Los puntos recibidos se agrupan por identificador ICAO, se registran localmente en el dispositivo y se conservan hasta 30 días (con límite de almacenamiento). La tabla incluye fecha, origen/destino cuando el punto observado está junto a un aeropuerto conocido, indicativo, duración del tramo observado, ATD observada, STD/STA como no disponibles y estado parcial. El historial solo empieza después de abrir AeroNexo en ese navegador; no importa días anteriores, no se sincroniza entre visitantes y no representa un registro completo de la operación de la aeronave. Un vuelo planificado, retrasos oficiales, STD y STA requieren una fuente de horarios autorizada que no está incluida en la fuente ADS-B abierta.

La galería consulta Planespotters por matrícula (y, si falta, por ICAO), muestra las miniaturas enlazadas a sus páginas originales con autor/crédito y no copia ni aloja sus fotografías. Si no encuentra una coincidencia, lo indica sin sustituirla por otra aeronave. Revisa los términos del proveedor antes de darle un uso comercial.

## Tema visual

El control de la cabecera cambia entre modo claro y oscuro. La preferencia se guarda localmente y ajusta la cartografía junto con los paneles.
