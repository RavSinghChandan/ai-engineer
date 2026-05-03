import { Injectable } from '@angular/core';
import { AstrologyResult, UserProfile } from '../models/astro.models';

// ── City coordinate lookup (lat, lon, UTC offset in hours) ─────────────────
const CITY_COORDS: Record<string, [number, number, number]> = {
  // India
  'chandigarh':    [30.7333, 76.7794, 5.5],
  'delhi':         [28.6139, 77.2090, 5.5],
  'new delhi':     [28.6139, 77.2090, 5.5],
  'mumbai':        [19.0760, 72.8777, 5.5],
  'bombay':        [19.0760, 72.8777, 5.5],
  'bangalore':     [12.9716, 77.5946, 5.5],
  'bengaluru':     [12.9716, 77.5946, 5.5],
  'hyderabad':     [17.3850, 78.4867, 5.5],
  'ahmedabad':     [23.0225, 72.5714, 5.5],
  'chennai':       [13.0827, 80.2707, 5.5],
  'madras':        [13.0827, 80.2707, 5.5],
  'kolkata':       [22.5726, 88.3639, 5.5],
  'calcutta':      [22.5726, 88.3639, 5.5],
  'pune':          [18.5204, 73.8567, 5.5],
  'jaipur':        [26.9124, 75.7873, 5.5],
  'lucknow':       [26.8467, 80.9462, 5.5],
  'patna':         [25.5941, 85.1376, 5.5],
  'bhopal':        [23.2599, 77.4126, 5.5],
  'nagpur':        [21.1458, 79.0882, 5.5],
  'surat':         [21.1702, 72.8311, 5.5],
  'indore':        [22.7196, 75.8577, 5.5],
  'coimbatore':    [11.0168, 76.9558, 5.5],
  'kochi':         [9.9312,  76.2673, 5.5],
  'cochin':        [9.9312,  76.2673, 5.5],
  'thiruvananthapuram': [8.5241, 76.9366, 5.5],
  'trivandrum':    [8.5241,  76.9366, 5.5],
  'amritsar':      [31.6340, 74.8723, 5.5],
  'varanasi':      [25.3176, 82.9739, 5.5],
  'agra':          [27.1767, 78.0081, 5.5],
  'vadodara':      [22.3072, 73.1812, 5.5],
  'ludhiana':      [30.9010, 75.8573, 5.5],
  'guwahati':      [26.1445, 91.7362, 5.5],
  'bhubaneswar':   [20.2961, 85.8245, 5.5],
  'ranchi':        [23.3441, 85.3096, 5.5],
  'dehradun':      [30.3165, 78.0322, 5.5],
  'shimla':        [31.1048, 77.1734, 5.5],
  'jammu':         [32.7266, 74.8570, 5.5],
  'srinagar':      [34.0837, 74.7973, 5.5],
  'mysuru':        [12.2958, 76.6394, 5.5],
  'mysore':        [12.2958, 76.6394, 5.5],
  // International
  'london':        [51.5074, -0.1278,  0],
  'new york':      [40.7128, -74.0060, -5],
  'los angeles':   [34.0522, -118.2437,-8],
  'toronto':       [43.6532, -79.3832, -5],
  'sydney':        [-33.8688, 151.2093, 10],
  'dubai':         [25.2048, 55.2708,  4],
  'singapore':     [1.3521,  103.8198, 8],
  'kuala lumpur':  [3.1390,  101.6869, 8],
  'bangkok':       [13.7563, 100.5018, 7],
  'tokyo':         [35.6762, 139.6503, 9],
  'beijing':       [39.9042, 116.4074, 8],
  'shanghai':      [31.2304, 121.4737, 8],
  'karachi':       [24.8607, 67.0011,  5],
  'lahore':        [31.5204, 74.3587,  5],
  'islamabad':     [33.6844, 73.0479,  5],
  'dhaka':         [23.8103, 90.4125,  6],
  'colombo':       [6.9271,  79.8612,  5.5],
  'kathmandu':     [27.7172, 85.3240,  5.75],
  'nairobi':       [-1.2921, 36.8219,  3],
  'johannesburg':  [-26.2041, 28.0473, 2],
  'paris':         [48.8566, 2.3522,   1],
  'berlin':        [52.5200, 13.4050,  1],
  'moscow':        [55.7558, 37.6173,  3],
};

function lookupCity(place: string): [number, number, number] | null {
  if (!place) return null;
  const lower = place.toLowerCase();
  for (const [key, val] of Object.entries(CITY_COORDS)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// ── Julian Day Number ───────────────────────────────────────────────────────
function julianDay(year: number, month: number, day: number, utHour: number): number {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) +
         Math.floor(30.6001 * (month + 1)) +
         day + B - 1524.5 + utHour / 24;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ── Sun longitude (tropical, degrees) — VSOP87 simplified ──────────────────
function sunLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525;  // Julian centuries from J2000

  // Mean longitude
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  // Mean anomaly
  let M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  // Equation of centre
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * DEG)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * M * DEG)
          + 0.000289 * Math.sin(3 * M * DEG);

  let sun = L0 + C;
  // Apparent longitude (correct for aberration & nutation ~20")
  const omega = 125.04 - 1934.136 * T;
  sun = sun - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  return ((sun % 360) + 360) % 360;
}

// ── Moon longitude (tropical, degrees) — simplified ELP2000 ────────────────
function moonLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525;

  // Fundamental arguments
  const Lm = 218.3164477 + 481267.88123421 * T;     // Moon mean longitude
  const D  = 297.8501921 + 445267.1114034  * T;     // Mean elongation
  const M  = 357.5291092 + 35999.0502909  * T;      // Sun mean anomaly
  const Mm = 134.9633964 + 477198.8675055  * T;     // Moon mean anomaly
  const F  = 93.2720950  + 483202.0175233  * T;     // Arg of latitude

  // Leading periodic terms (degrees)
  const dLon =
      6.288774 * Math.sin(Mm * DEG)
    + 1.274027 * Math.sin((2*D - Mm) * DEG)
    + 0.658314 * Math.sin(2*D * DEG)
    + 0.213618 * Math.sin(2*Mm * DEG)
    - 0.185116 * Math.sin(M * DEG)
    - 0.114332 * Math.sin(2*F * DEG)
    + 0.058793 * Math.sin((2*D - 2*Mm) * DEG)
    + 0.057066 * Math.sin((2*D - M - Mm) * DEG)
    + 0.053322 * Math.sin((2*D + Mm) * DEG)
    + 0.045758 * Math.sin((2*D - M) * DEG)
    - 0.040923 * Math.sin((M - Mm) * DEG)
    - 0.034720 * Math.sin(D * DEG)
    - 0.030383 * Math.sin((M + Mm) * DEG)
    + 0.015327 * Math.sin((2*D - 2*F) * DEG)
    - 0.012528 * Math.sin(Mm + 2*F) * DEG
    + 0.010980 * Math.sin((Mm - 2*F) * DEG);

  return (((Lm + dLon) % 360) + 360) % 360;
}

// ── Obliquity of ecliptic (degrees) ────────────────────────────────────────
function obliquity(T: number): number {
  return 23.439291111 - 0.013004167 * T - 1.638889e-7 * T * T + 5.036111e-7 * T * T * T;
}

// ── Local Sidereal Time (degrees) ──────────────────────────────────────────
function localSiderealTime(jd: number, lonDeg: number): number {
  const T  = (jd - 2451545.0) / 36525;
  // Greenwich Mean Sidereal Time in degrees
  const GMST = 280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T;
  const LST = ((GMST + lonDeg) % 360 + 360) % 360;
  return LST;
}

// ── Ascendant from LST, latitude, obliquity ─────────────────────────────────
function ascendant(lst: number, latDeg: number, eps: number): number {
  const lstR = lst * DEG;
  const latR = latDeg * DEG;
  const epsR = eps * DEG;
  // Standard ascendant formula
  const y = -Math.cos(lstR);
  const x = Math.sin(lstR) * Math.cos(epsR) + Math.tan(latR) * Math.sin(epsR);
  let asc = Math.atan2(y, x) * RAD;
  if (asc < 0) asc += 360;
  return asc;
}

// ── Tropical longitude → Vedic rashi (Lahiri ayanamsa) ─────────────────────
const LAHIRI_J2000 = 23.853; // Lahiri ayanamsa at J2000 (23.853°)
const AYANAMSA_RATE = 50.2388 / 3600; // degrees per year

function lahiriAyanamsa(jd: number): number {
  const T = (jd - 2451545.0) / 365.25;
  return LAHIRI_J2000 + AYANAMSA_RATE * T;
}

function tropicalToSidereal(tropicalDeg: number, ayanamsa: number): number {
  return ((tropicalDeg - ayanamsa) % 360 + 360) % 360;
}

// ── Longitude in degrees → rashi name ──────────────────────────────────────
const RASHIS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces',
];

function longToRashi(deg: number): string {
  return RASHIS[Math.floor(((deg % 360) + 360) % 360 / 30)];
}

// ── Nakshatra from sidereal moon longitude ──────────────────────────────────
const NAKSHATRAS = [
  'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra',
  'Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni',
  'Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
  'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha',
  'Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati',
];

function longToNakshatra(siderealDeg: number): string {
  const idx = Math.floor(((siderealDeg % 360) + 360) % 360 / (360 / 27));
  return NAKSHATRAS[idx % 27];
}

// ── Vimshottari Dasha lord from nakshatra index ─────────────────────────────
const DASHA_LORDS  = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
const DASHA_YEARS  = [7, 20, 6, 10, 7, 18, 16, 19, 17];

function vimshottariDasha(siderealMoonDeg: number): string {
  const nakIdx = Math.floor(((siderealMoonDeg % 360) + 360) % 360 / (360 / 27));
  return `${DASHA_LORDS[nakIdx % 9]} Mahadasha`;
}

// ── Planetary positions using orbital periods (JD-based) ────────────────────
function planetaryPositions(jd: number, ayanamsa: number,
                             sunSiderealDeg: number, moonSiderealDeg: number): Record<string, string> {
  const T = (jd - 2451545.0) / 365.25; // years from J2000

  const sunIdx  = Math.floor(sunSiderealDeg  / 30);
  const moonIdx = Math.floor(moonSiderealDeg / 30);

  // Mercury stays within ~28° of Sun (1 rashi ≈ 30°)
  const mercuryOffset = Math.round(Math.sin(T * 4.15 * 2 * Math.PI) * 0.9);
  const mercuryIdx = ((sunIdx + mercuryOffset) + 12) % 12;

  // Venus within ~48° of Sun (~1-2 rashis)
  const venusOffset = Math.round(Math.sin(T * 1.625 * 2 * Math.PI) * 1.5);
  const venusIdx = ((sunIdx + venusOffset) + 12) % 12;

  // Mars: sidereal period 686.971 days = 1.881 years
  const marsLon = tropicalToSidereal(
    ((28.0 + 0.5240207766 * (jd - 2451545.0)) % 360 + 360) % 360, ayanamsa);
  const marsIdx = Math.floor(marsLon / 30);

  // Jupiter: sidereal period 4332.589 days = 11.862 years
  const jupiterLon = tropicalToSidereal(
    ((34.35 + 0.08308529 * (jd - 2451545.0)) % 360 + 360) % 360, ayanamsa);
  const jupiterIdx = Math.floor(jupiterLon / 30);

  // Saturn: sidereal period 10759.22 days = 29.457 years
  const saturnLon = tropicalToSidereal(
    ((50.08 + 0.03344 * (jd - 2451545.0)) % 360 + 360) % 360, ayanamsa);
  const saturnIdx = Math.floor(saturnLon / 30);

  // Rahu (mean north node): retrograde period ~6793.5 days = 18.612 years
  const rahuLon = tropicalToSidereal(
    ((125.044 - 0.052953922 * (jd - 2451545.0)) % 360 + 360) % 360, ayanamsa);
  const rahuIdx = Math.floor(rahuLon / 30);
  const ketuIdx = (rahuIdx + 6) % 12;

  return {
    Sun:     RASHIS[sunIdx],
    Moon:    RASHIS[moonIdx],
    Mercury: RASHIS[mercuryIdx],
    Venus:   RASHIS[venusIdx],
    Mars:    RASHIS[marsIdx],
    Jupiter: RASHIS[jupiterIdx],
    Saturn:  RASHIS[saturnIdx],
    Rahu:    RASHIS[rahuIdx],
    Ketu:    RASHIS[ketuIdx],
  };
}

export interface ResolvedCoords {
  lat:      number;
  lon:      number;
  timezone: string;  // e.g. "Asia/Kolkata"
}

@Injectable({ providedIn: 'root' })
export class AstrologyService {

  // resolvedCoords: pass in from GeocodeService when available; falls back to built-in table
  compute(profile: UserProfile, resolvedCoords?: ResolvedCoords | null): any {
    const dob  = profile.date_of_birth;   // YYYY-MM-DD
    const tob  = profile.time_of_birth;   // HH:MM (24h) or ''
    const place = profile.place_of_birth ?? '';

    if (!dob || isNaN(new Date(dob).getTime())) {
      return this._fallback(profile);
    }

    const [yr, mo, dy] = dob.split('-').map(Number);
    // Use caller-supplied coords first, then built-in table
    const cityCoords: [number, number, number] | null = resolvedCoords
      ? [resolvedCoords.lat, resolvedCoords.lon, this._tzToOffset(resolvedCoords.timezone)]
      : lookupCity(place);

    // Parse birth time
    let utHour = 12; // default to noon when no time given
    let hasBirthTime = false;
    let tzOffset = cityCoords ? cityCoords[2] : 5.5; // default IST

    if (tob && /^\d{1,2}:\d{2}$/.test(tob)) {
      const [hh, mm] = tob.split(':').map(Number);
      const localHour = hh + mm / 60;
      utHour = localHour - tzOffset;
      hasBirthTime = true;
    }

    const jd = julianDay(yr, mo, dy, utHour);
    const ayan = lahiriAyanamsa(jd);
    const T = (jd - 2451545.0) / 36525;

    // Sun
    const sunTropical  = sunLongitude(jd);
    const sunSidereal  = tropicalToSidereal(sunTropical, ayan);
    const sunSign      = longToRashi(sunTropical);   // western tropical
    const vedicSun     = longToRashi(sunSidereal);

    // Moon
    const moonTropical  = moonLongitude(jd);
    const moonSidereal  = tropicalToSidereal(moonTropical, ayan);
    const moonSign      = longToRashi(moonSidereal);

    // Ascendant/Lagna
    let lagna = '';
    let approximate = false;
    if (hasBirthTime && cityCoords) {
      const [lat, lon] = cityCoords;
      const lst = localSiderealTime(jd, lon);
      const eps = obliquity(T);
      const ascTropical = ascendant(lst, lat, eps);
      const ascSidereal = tropicalToSidereal(ascTropical, ayan);
      lagna = longToRashi(ascSidereal);
    } else if (hasBirthTime) {
      // Have time but unknown city — use sun-based approximation
      const sunIdx = RASHIS.indexOf(vedicSun);
      lagna = RASHIS[(sunIdx + Math.round(utHour / 2)) % 12];
      approximate = true;
    } else {
      // No birth time — cannot compute lagna
      lagna = vedicSun; // best guess: same rashi as Vedic sun
      approximate = true;
    }

    const nakshatra     = longToNakshatra(moonSidereal);
    const currentDasha  = vimshottariDasha(moonSidereal);
    const planets       = planetaryPositions(jd, ayan, sunSidereal, moonSidereal);

    const seed = this._seed(profile);

    return {
      lagna,
      moon_sign:           moonSign,
      sun_sign:            sunSign,
      vedic_sun_sign:      vedicSun,
      ayanamsa_degrees:    +ayan.toFixed(4),
      computation_method:  'VSOP87-simplified + ELP2000-simplified, Lahiri ayanamsa, Vimshottari Dasha',
      planetary_positions: planets,
      house_analysis:      this._houseAnalysis(seed, lagna),
      doshas:              this._doshas(seed),
      current_dasha:       currentDasha,
      dasha_periods:       this._dashaPeriods(seed),
      yogas:               this._yogas(seed),
      strengths:           this._strengths(lagna),
      challenges:          this._challenges(moonSign),
      predictions:         this._predictions(lagna, sunSign, seed),
      vedic: {
        chart: {
          lagna,
          sun_sign:  vedicSun,
          moon_sign: moonSign,
          nakshatra,
          planets,
          approximate,
          ayanamsa:            `Lahiri ${ayan.toFixed(2)}°`,
          method:              hasBirthTime && cityCoords
            ? 'Computed from birth time & place (Lahiri ayanamsa)'
            : hasBirthTime
            ? 'Birth time given — place coordinates not found; approximate lagna'
            : 'No birth time — lagna is approximate (provide birth time for accuracy)',
        },
        current_dasha:  currentDasha,
        yogas:          this._yogas(seed),
        doshas:         this._doshas(seed),
      },
    };
  }

  private _fallback(profile: UserProfile): any {
    const seed    = this._seed(profile);
    const lagna   = RASHIS[seed % 12];
    const moonSign = RASHIS[(seed + 3) % 12];
    const sunSign = RASHIS[(seed + 6) % 12];
    return {
      lagna, moon_sign: moonSign, sun_sign: sunSign,
      approximate: true,
      vedic: {
        chart: { lagna, sun_sign: sunSign, moon_sign: moonSign, nakshatra: NAKSHATRAS[seed % 27],
                 planets: {}, approximate: true, method: 'Fallback: invalid DOB' },
        current_dasha: 'Unknown', yogas: [], doshas: [],
      },
      planetary_positions: {}, house_analysis: {},
      doshas: [], current_dasha: 'Unknown', dasha_periods: [],
      yogas: [], strengths: [], challenges: [], predictions: [],
    };
  }

  private _seed(p: UserProfile): number {
    const str = p.full_name + p.date_of_birth + p.place_of_birth;
    return Array.from(str).reduce((a, c) => a + c.charCodeAt(0), 0);
  }

  // Convert IANA timezone string to UTC offset hours (handles common zones)
  private _tzToOffset(tz: string): number {
    const map: Record<string, number> = {
      'Asia/Kolkata': 5.5, 'Asia/Colombo': 5.5, 'Asia/Kathmandu': 5.75,
      'Asia/Karachi': 5, 'Asia/Dhaka': 6, 'Asia/Dubai': 4,
      'Asia/Singapore': 8, 'Asia/Kuala_Lumpur': 8, 'Asia/Bangkok': 7,
      'Asia/Tokyo': 9, 'Asia/Shanghai': 8, 'Asia/Seoul': 9,
      'Asia/Riyadh': 3, 'Asia/Tehran': 3.5, 'Asia/Kabul': 4.5,
      'Asia/Tashkent': 5, 'Asia/Almaty': 6, 'Asia/Yangon': 6.5,
      'Asia/Jakarta': 7, 'Asia/Manila': 8, 'Asia/Taipei': 8,
      'Europe/London': 0, 'Europe/Paris': 1, 'Europe/Berlin': 1,
      'Europe/Moscow': 3, 'Europe/Istanbul': 3, 'Europe/Athens': 2,
      'Europe/Rome': 1, 'Europe/Madrid': 1, 'Europe/Zurich': 1,
      'Africa/Nairobi': 3, 'Africa/Lagos': 1, 'Africa/Cairo': 2,
      'Africa/Johannesburg': 2, 'Africa/Casablanca': 0,
      'America/New_York': -5, 'America/Chicago': -6, 'America/Denver': -7,
      'America/Los_Angeles': -8, 'America/Toronto': -5,
      'America/Sao_Paulo': -3, 'America/Argentina/Buenos_Aires': -3,
      'America/Mexico_City': -6, 'America/Bogota': -5,
      'Australia/Sydney': 10, 'Australia/Melbourne': 10, 'Australia/Perth': 8,
      'Pacific/Auckland': 12, 'Pacific/Honolulu': -10,
    };
    if (map[tz] !== undefined) return map[tz];
    // Fallback: parse Etc/GMT±N
    const m = tz.match(/Etc\/GMT([+-]\d+)/);
    if (m) return -parseInt(m[1]); // Etc/GMT sign is inverted
    return 0;
  }

  private _houseAnalysis(seed: number, lagna: string): Record<string, string> {
    const themes = [
      'Self & identity','Wealth & values','Communication & siblings',
      'Home & mother','Creativity & children','Health & service',
      'Partnership & marriage','Transformation & inheritance',
      'Higher learning & travel','Career & status',
      'Gains & social network','Spirituality & liberation',
    ];
    const lagnaIdx = RASHIS.indexOf(lagna);
    const result: Record<string, string> = {};
    themes.forEach((t, i) => {
      const rashi = RASHIS[(lagnaIdx + i) % 12];
      result[`House ${i + 1} (${t})`] = `${rashi} — ${this._houseNote(i)}`;
    });
    return result;
  }

  private _houseNote(house: number): string {
    const notes = [
      'Strong placement suggesting natural leadership.',
      'Indicates material comfort with steady effort.',
      'Good communication skills and sibling bonds.',
      'Nurturing home environment is indicated.',
      'Creative expression brings fulfillment.',
      'Service-oriented approach to wellness.',
      'Partnerships bring growth and learning.',
      'Deep transformation through introspection.',
      'Wisdom through travel or higher education.',
      'Career achievements through consistent effort.',
      'Social connections open new opportunities.',
      'Spiritual practices deepen over time.',
    ];
    return notes[house % notes.length];
  }

  private _doshas(seed: number): string[] {
    const all = ['Mangal Dosha (mild)','Kaal Sarp Dosha (partial)','Pitru Dosha (minor)','No significant dosha'];
    const idx = seed % 4;
    if (idx === 3) return ['No significant dosha detected.'];
    return [all[idx]];
  }

  private _dashaPeriods(seed: number): { period: string; planet: string; from: string; to: string }[] {
    const planets = ['Moon','Mars','Rahu','Jupiter','Saturn','Mercury','Ketu','Venus','Sun'];
    const durations = [10,7,18,16,19,17,7,20,6];
    let year = 2020;
    return planets.map((p, i) => {
      const from = `${year}`;
      year += durations[i];
      return { period: `${durations[i]} years`, planet: p, from, to: `${year}` };
    });
  }

  private _yogas(seed: number): string[] {
    const all = [
      'Gaja Kesari Yoga — Jupiter and Moon well-placed, suggesting wisdom and prosperity.',
      'Raj Yoga — Strong 9th and 10th house combination, suggesting career success.',
      'Dhana Yoga — 2nd and 11th house lords connect, suggesting financial growth.',
      'Saraswati Yoga — Venus, Jupiter, and Mercury in kendras, suggesting artistic talent.',
    ];
    return [all[seed % 4], all[(seed + 1) % 4]];
  }

  private _strengths(lagna: string): string[] {
    return [
      `Natural ${lagna} qualities bring resilience and adaptability.`,
      'Strong intuitive intelligence is indicated.',
      'Capacity for deep, lasting relationships.',
    ];
  }

  private _challenges(moonSign: string): string[] {
    return [
      `The ${moonSign} Moon may bring emotional sensitivity that needs management.`,
      'There is a tendency toward overwork — balance is recommended.',
    ];
  }

  private _predictions(lagna: string, sun: string, seed: number): string[] {
    return [
      `This suggests a favorable period for ${lagna} rising individuals between 2025–2027.`,
      `There is a tendency toward career advancement tied to ${sun} qualities.`,
      'Financial stability is indicated with disciplined savings habits.',
      'This suggests meaningful relationship growth in the coming 2 years.',
      'Health is generally indicated as stable with attention to digestion and stress.',
    ];
  }
}
