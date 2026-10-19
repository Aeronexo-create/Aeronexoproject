import { handleAircraft } from '../../src/server/aircraft.js';
export function onRequest(context) {
  return handleAircraft(context.request, { waitUntil: promise => context.waitUntil(promise) });
}
