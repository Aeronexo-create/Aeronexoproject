import { defineConfig } from 'astro/config';
import { handleAircraft } from './src/server/aircraft.js';
import { handlePhotos } from './src/server/photos.js';
function installApi(server) {
  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!['/api/aircraft','/api/photos'].includes(url.pathname)) return next();
    try {
      const response = url.pathname==='/api/photos'
        ? await handlePhotos(new Request(url, {method:req.method||'GET'}),null)
        : await handleAircraft(new Request(url, {method:req.method||'GET'}));
      res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(await response.text());
    } catch { res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Fuente temporalmente no disponible'})); }
  });
}
export default defineConfig({output:'static',vite:{plugins:[{name:'aeronexo-api',configureServer:installApi,configurePreviewServer:installApi}]}});
