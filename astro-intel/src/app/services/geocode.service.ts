import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export interface GeoResult {
  lat:          number;
  lon:          number;
  display_name: string;
  timezone:     string;
  source:       string;
}

// Built-in fallback table — used instantly when backend is offline
const FALLBACK: Record<string, GeoResult> = {
  'chandigarh':    { lat:30.7333, lon:76.7794, timezone:'Asia/Kolkata',       display_name:'Chandigarh, India',       source:'builtin' },
  'delhi':         { lat:28.6139, lon:77.2090, timezone:'Asia/Kolkata',       display_name:'New Delhi, India',        source:'builtin' },
  'new delhi':     { lat:28.6139, lon:77.2090, timezone:'Asia/Kolkata',       display_name:'New Delhi, India',        source:'builtin' },
  'mumbai':        { lat:19.0760, lon:72.8777, timezone:'Asia/Kolkata',       display_name:'Mumbai, India',           source:'builtin' },
  'bangalore':     { lat:12.9716, lon:77.5946, timezone:'Asia/Kolkata',       display_name:'Bengaluru, India',        source:'builtin' },
  'bengaluru':     { lat:12.9716, lon:77.5946, timezone:'Asia/Kolkata',       display_name:'Bengaluru, India',        source:'builtin' },
  'hyderabad':     { lat:17.3850, lon:78.4867, timezone:'Asia/Kolkata',       display_name:'Hyderabad, India',        source:'builtin' },
  'ahmedabad':     { lat:23.0225, lon:72.5714, timezone:'Asia/Kolkata',       display_name:'Ahmedabad, India',        source:'builtin' },
  'chennai':       { lat:13.0827, lon:80.2707, timezone:'Asia/Kolkata',       display_name:'Chennai, India',          source:'builtin' },
  'kolkata':       { lat:22.5726, lon:88.3639, timezone:'Asia/Kolkata',       display_name:'Kolkata, India',          source:'builtin' },
  'pune':          { lat:18.5204, lon:73.8567, timezone:'Asia/Kolkata',       display_name:'Pune, India',             source:'builtin' },
  'jaipur':        { lat:26.9124, lon:75.7873, timezone:'Asia/Kolkata',       display_name:'Jaipur, India',           source:'builtin' },
  'lucknow':       { lat:26.8467, lon:80.9462, timezone:'Asia/Kolkata',       display_name:'Lucknow, India',          source:'builtin' },
  'patna':         { lat:25.5941, lon:85.1376, timezone:'Asia/Kolkata',       display_name:'Patna, India',            source:'builtin' },
  'surat':         { lat:21.1702, lon:72.8311, timezone:'Asia/Kolkata',       display_name:'Surat, India',            source:'builtin' },
  'indore':        { lat:22.7196, lon:75.8577, timezone:'Asia/Kolkata',       display_name:'Indore, India',           source:'builtin' },
  'coimbatore':    { lat:11.0168, lon:76.9558, timezone:'Asia/Kolkata',       display_name:'Coimbatore, India',       source:'builtin' },
  'kochi':         { lat:9.9312,  lon:76.2673, timezone:'Asia/Kolkata',       display_name:'Kochi, India',            source:'builtin' },
  'amritsar':      { lat:31.6340, lon:74.8723, timezone:'Asia/Kolkata',       display_name:'Amritsar, India',         source:'builtin' },
  'varanasi':      { lat:25.3176, lon:82.9739, timezone:'Asia/Kolkata',       display_name:'Varanasi, India',         source:'builtin' },
  'london':        { lat:51.5074, lon:-0.1278, timezone:'Europe/London',      display_name:'London, United Kingdom',  source:'builtin' },
  'new york':      { lat:40.7128, lon:-74.006, timezone:'America/New_York',   display_name:'New York, USA',           source:'builtin' },
  'dubai':         { lat:25.2048, lon:55.2708, timezone:'Asia/Dubai',         display_name:'Dubai, UAE',              source:'builtin' },
  'singapore':     { lat:1.3521,  lon:103.819, timezone:'Asia/Singapore',     display_name:'Singapore',               source:'builtin' },
  'toronto':       { lat:43.6532, lon:-79.383, timezone:'America/Toronto',    display_name:'Toronto, Canada',         source:'builtin' },
  'sydney':        { lat:-33.868, lon:151.209, timezone:'Australia/Sydney',   display_name:'Sydney, Australia',       source:'builtin' },
  'tokyo':         { lat:35.6762, lon:139.650, timezone:'Asia/Tokyo',         display_name:'Tokyo, Japan',            source:'builtin' },
  'karachi':       { lat:24.8607, lon:67.0011, timezone:'Asia/Karachi',       display_name:'Karachi, Pakistan',       source:'builtin' },
  'lahore':        { lat:31.5204, lon:74.3587, timezone:'Asia/Karachi',       display_name:'Lahore, Pakistan',        source:'builtin' },
  'dhaka':         { lat:23.8103, lon:90.4125, timezone:'Asia/Dhaka',         display_name:'Dhaka, Bangladesh',       source:'builtin' },
  'colombo':       { lat:6.9271,  lon:79.8612, timezone:'Asia/Colombo',       display_name:'Colombo, Sri Lanka',      source:'builtin' },
  'kathmandu':     { lat:27.7172, lon:85.3240, timezone:'Asia/Kathmandu',     display_name:'Kathmandu, Nepal',        source:'builtin' },
  'nairobi':       { lat:-1.2921, lon:36.8219, timezone:'Africa/Nairobi',     display_name:'Nairobi, Kenya',          source:'builtin' },
  'paris':         { lat:48.8566, lon:2.3522,  timezone:'Europe/Paris',       display_name:'Paris, France',           source:'builtin' },
  'berlin':        { lat:52.5200, lon:13.4050, timezone:'Europe/Berlin',      display_name:'Berlin, Germany',         source:'builtin' },
  'moscow':        { lat:55.7558, lon:37.6173, timezone:'Europe/Moscow',      display_name:'Moscow, Russia',          source:'builtin' },
};

// Session-level memory cache: city → result (cleared on page refresh)
const _sessionCache = new Map<string, GeoResult>();

@Injectable({ providedIn: 'root' })
export class GeocodeService {
  private http = inject(HttpClient);

  async resolve(city: string): Promise<GeoResult | null> {
    if (!city?.trim()) return null;
    const key = city.trim().toLowerCase();

    // 1. Session cache (instant)
    if (_sessionCache.has(key)) return _sessionCache.get(key)!;

    // 2. Built-in table (instant fallback)
    const builtin = this._builtinLookup(key);

    // 3. Backend (Nominatim via server, cached 30 days)
    try {
      const result = await firstValueFrom(
        this.http.get<GeoResult>(`/api/v1/geocode?city=${encodeURIComponent(city.trim())}`)
          .pipe(timeout(5000), catchError(() => of(null)))
      );
      if (result?.lat) {
        _sessionCache.set(key, result);
        return result;
      }
    } catch { /* backend offline — fall through */ }

    // 4. Builtin fallback when backend unreachable
    if (builtin) {
      _sessionCache.set(key, builtin);
      return builtin;
    }

    return null;
  }

  private _builtinLookup(lower: string): GeoResult | null {
    for (const [k, v] of Object.entries(FALLBACK)) {
      if (lower.includes(k) || k.includes(lower)) return v;
    }
    return null;
  }
}
