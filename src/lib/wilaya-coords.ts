/**
 * Approximate centroid (chief-town) coordinates for every Algerian wilaya in
 * `arab-cities.ts`'s `PROVINCES_BY_COUNTRY.DZ` (all 69 — the original 58 plus
 * the 11 created by the 2026 reorganization), keyed by the exact same `en`
 * string `provinceOfCity()` returns so a `LiveBusiness.state` value looks
 * this up directly.
 *
 * `businesses.latitude/longitude` isn't geocoded for the seed/demo dataset
 * (confirmed against production — every row currently has `null` for both),
 * so the results map had nothing to place a pin at. This table exists for
 * exactly one purpose: giving `ResultsMap` an honest approximate location —
 * "somewhere in this business's own wilaya", not a fabricated precise
 * address — for businesses with no real geocode yet. It is deliberately
 * NOT merged into `LiveBusiness.lat/lng` anywhere else (distance sorting,
 * travel-time, "X km away" text all still require a real coordinate and
 * simply omit those businesses) — only the map's own pin-placement code
 * should ever call `approximateLocationFor()`.
 */
export const WILAYA_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  Adrar: { lat: 27.87, lng: -0.29 },
  "Aïn Defla": { lat: 36.26, lng: 1.97 },
  "Aïn Témouchent": { lat: 35.3, lng: -1.14 },
  Algiers: { lat: 36.75, lng: 3.06 },
  Annaba: { lat: 36.9, lng: 7.77 },
  Batna: { lat: 35.56, lng: 6.17 },
  Béchar: { lat: 31.62, lng: -2.22 },
  Béjaïa: { lat: 36.75, lng: 5.08 },
  "Béni Abbès": { lat: 30.13, lng: -2.17 },
  Biskra: { lat: 34.85, lng: 5.73 },
  Blida: { lat: 36.47, lng: 2.83 },
  "Bordj Baji Mokhtar": { lat: 21.33, lng: 0.95 },
  "Bordj Bou Arréridj": { lat: 36.07, lng: 4.76 },
  Bouïra: { lat: 36.38, lng: 3.9 },
  Boumerdès: { lat: 36.77, lng: 3.48 },
  Chlef: { lat: 36.16, lng: 1.33 },
  Constantine: { lat: 36.365, lng: 6.61 },
  Djanet: { lat: 24.55, lng: 9.48 },
  Djelfa: { lat: 34.67, lng: 3.25 },
  "El Bayadh": { lat: 33.68, lng: 1.02 },
  "El M'ghair": { lat: 33.95, lng: 5.92 },
  "El Menia": { lat: 30.58, lng: 2.88 },
  "El Oued": { lat: 33.35, lng: 6.87 },
  "El Tarf": { lat: 36.77, lng: 8.31 },
  Ghardaïa: { lat: 32.49, lng: 3.67 },
  Guelma: { lat: 36.46, lng: 7.43 },
  Illizi: { lat: 26.48, lng: 8.47 },
  "In Guezzam": { lat: 19.57, lng: 5.77 },
  "In Salah": { lat: 27.19, lng: 2.48 },
  Jijel: { lat: 36.82, lng: 5.77 },
  Khenchela: { lat: 35.44, lng: 7.14 },
  Laghouat: { lat: 33.8, lng: 2.86 },
  "M'Sila": { lat: 35.71, lng: 4.54 },
  Mascara: { lat: 35.4, lng: 0.14 },
  Médéa: { lat: 36.26, lng: 2.75 },
  Mila: { lat: 36.45, lng: 6.26 },
  Mostaganem: { lat: 35.93, lng: 0.09 },
  Naama: { lat: 33.27, lng: -0.31 },
  Oran: { lat: 35.69, lng: -0.63 },
  Ouargla: { lat: 31.95, lng: 5.32 },
  "Ouled Djellal": { lat: 34.42, lng: 5.07 },
  "Oum El Bouaghi": { lat: 35.87, lng: 7.11 },
  Relizane: { lat: 35.74, lng: 0.56 },
  Saïda: { lat: 34.83, lng: 0.15 },
  Sétif: { lat: 36.19, lng: 5.41 },
  "Sidi Bel Abbès": { lat: 35.19, lng: -0.63 },
  Skikda: { lat: 36.88, lng: 6.91 },
  "Souk Ahras": { lat: 36.29, lng: 7.95 },
  Tamanghasset: { lat: 22.79, lng: 5.53 },
  Tébessa: { lat: 35.4, lng: 8.12 },
  Tiaret: { lat: 35.37, lng: 1.32 },
  Timimoun: { lat: 29.26, lng: 0.24 },
  Tindouf: { lat: 27.67, lng: -8.15 },
  Tipasa: { lat: 36.59, lng: 2.45 },
  Tissemsilt: { lat: 35.61, lng: 1.81 },
  "Tizi Ouzou": { lat: 36.72, lng: 4.05 },
  Tlemcen: { lat: 34.88, lng: -1.32 },
  Touggourt: { lat: 33.1, lng: 6.06 },
  Aflou: { lat: 34.11, lng: 2.1 },
  Barika: { lat: 35.38, lng: 5.37 },
  "El Kantara": { lat: 35.22, lng: 5.68 },
  "Bir El Ater": { lat: 35.02, lng: 8.06 },
  "El Aricha": { lat: 34.3, lng: -1.28 },
  "Ksar Chellala": { lat: 35.2, lng: 2.31 },
  "Aïn Oussara": { lat: 35.45, lng: 2.9 },
  Messaad: { lat: 34.15, lng: 3.5 },
  "Ksar El Boukhari": { lat: 35.87, lng: 2.78 },
  "Bou Saâda": { lat: 35.21, lng: 4.19 },
  "El Abiodh Sidi Cheikh": { lat: 32.9, lng: 0.53 },
};

/** Deterministic [0,1) pseudo-random value from a string — same business id
 *  always lands in the same spot (not re-scattered on every render/reload),
 *  without pulling in a random-number-generator dependency. djb2 hash. */
function seededUnit(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) hash = (hash * 33) ^ seed.charCodeAt(i);
  return ((hash >>> 0) % 100000) / 100000;
}

/**
 * A stable approximate point "somewhere in" the given wilaya, jittered up to
 * ~0.12° (roughly a 10-15km radius at these latitudes — commune-scale, not
 * a specific address) around its centroid, seeded by `businessId` so it's
 * consistent across reloads. Returns `null` when the wilaya name isn't in
 * the table (e.g. free-text `district` values not seeded above) — callers
 * should simply omit that business's pin rather than guess further.
 */
export function approximateLocationFor(
  wilaya: string,
  businessId: string,
): { lat: number; lng: number } | null {
  const centroid = WILAYA_CENTROIDS[wilaya];
  if (!centroid) return null;
  const jitter = 0.12;
  const dLat = (seededUnit(`${businessId}:lat`) * 2 - 1) * jitter;
  const dLng = (seededUnit(`${businessId}:lng`) * 2 - 1) * jitter;
  return { lat: centroid.lat + dLat, lng: centroid.lng + dLng };
}
