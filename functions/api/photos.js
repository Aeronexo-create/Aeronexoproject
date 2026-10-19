import { handlePhotos } from '../../src/server/photos.js';
export function onRequestGet({ request, caches }) { return handlePhotos(request,caches.default); }
