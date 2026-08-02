// lib/timezones.ts
// Region-grouped IANA timezone list for the tenant timezone picker.
// Prefers the runtime's full list via Intl.supportedValuesOf('timeZone')
// (Node 20 / modern browsers); falls back to a curated set otherwise.

export interface TimezoneGroup {
  region: string;
  zones: { value: string; label: string }[];
}

// Curated fallback covering every region, used when Intl.supportedValuesOf
// is unavailable (older runtimes).
const FALLBACK_ZONES: string[] = [
  'UTC',
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Mexico_City', 'America/New_York', 'America/Sao_Paulo', 'America/Toronto',
  'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai',
  'Asia/Singapore', 'Asia/Tehran', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/London', 'Europe/Madrid',
  'Europe/Moscow', 'Europe/Paris', 'Europe/Rome', 'Europe/Warsaw',
  'Pacific/Auckland', 'Pacific/Honolulu',
];

function listZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    if (typeof intl.supportedValuesOf === 'function') {
      const zones = intl.supportedValuesOf('timeZone');
      if (Array.isArray(zones) && zones.length > 0) return zones;
    }
  } catch {
    /* fall through to curated list */
  }
  return FALLBACK_ZONES;
}

/**
 * Returns timezones grouped by region ("Africa", "America", …), each zone
 * labeled with its city (underscores → spaces). Sorted for a grouped <select>.
 */
export function getGroupedTimezones(): TimezoneGroup[] {
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const zone of listZones()) {
    const [region, ...rest] = zone.split('/');
    const city = rest.length > 0 ? rest.join('/').replace(/_/g, ' ') : region;
    const key = rest.length > 0 ? region : 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ value: zone, label: city });
  }
  return Array.from(groups.entries())
    .map(([region, zones]) => ({
      region,
      zones: zones.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.region.localeCompare(b.region));
}
