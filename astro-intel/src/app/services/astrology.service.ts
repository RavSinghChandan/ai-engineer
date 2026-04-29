import { Injectable } from '@angular/core';
import { AstrologyResult, UserProfile } from '../models/astro.models';

@Injectable({ providedIn: 'root' })
export class AstrologyService {

  private readonly RASHIS = [
    'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'
  ];

  private readonly PLANETS = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn','Rahu','Ketu'];

  private readonly NAKSHATRA = [
    'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra',
    'Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni',
    'Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
    'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha',
    'Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'
  ];

  compute(profile: UserProfile): AstrologyResult {
    const seed = this._seed(profile);
    const lagna = this.RASHIS[seed % 12];
    const moonSign = this.RASHIS[(seed + 4) % 12];
    const sunSign = this._sunSign(profile.date_of_birth);

    return {
      lagna,
      moon_sign: moonSign,
      sun_sign: sunSign,
      planetary_positions: this._planetaryPositions(seed),
      house_analysis: this._houseAnalysis(seed, lagna),
      doshas: this._doshas(seed),
      current_dasha: this._currentDasha(seed),
      dasha_periods: this._dashaPeriods(seed),
      yogas: this._yogas(seed),
      strengths: this._strengths(lagna),
      challenges: this._challenges(moonSign),
      predictions: this._predictions(lagna, sunSign, seed),
    };
  }

  private _seed(p: UserProfile): number {
    const str = p.full_name + p.date_of_birth + p.place_of_birth;
    return Array.from(str).reduce((a, c) => a + c.charCodeAt(0), 0);
  }

  private _sunSign(dob: string): string {
    const [, mm, dd] = (dob || '2000-01-01').split('-').map(Number);
    const ranges: [number, number, string][] = [
      [3,21,'Aries'],[4,20,'Taurus'],[5,21,'Gemini'],[6,21,'Cancer'],
      [7,23,'Leo'],[8,23,'Virgo'],[9,23,'Libra'],[10,23,'Scorpio'],
      [11,22,'Sagittarius'],[12,22,'Capricorn'],[1,20,'Aquarius'],[2,19,'Pisces'],
    ];
    for (const [m, d, sign] of ranges) {
      if (mm === m && dd >= d) return sign;
      if (mm === m + 1 && dd < d) return sign;
    }
    return 'Capricorn';
  }

  private _planetaryPositions(seed: number): Record<string, string> {
    const result: Record<string, string> = {};
    this.PLANETS.forEach((p, i) => {
      result[p] = this.RASHIS[(seed + i * 3) % 12];
    });
    return result;
  }

  private _houseAnalysis(seed: number, lagna: string): Record<string, string> {
    const themes = [
      'Self & identity','Wealth & values','Communication & siblings',
      'Home & mother','Creativity & children','Health & service',
      'Partnership & marriage','Transformation & inheritance',
      'Higher learning & travel','Career & status',
      'Gains & social network','Spirituality & liberation'
    ];
    const result: Record<string, string> = {};
    themes.forEach((t, i) => {
      const rashi = this.RASHIS[(this.RASHIS.indexOf(lagna) + i) % 12];
      result[`House ${i + 1} (${t})`] = `${rashi} — ${this._houseNote(seed, i)}`;
    });
    return result;
  }

  private _houseNote(seed: number, house: number): string {
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

  private _currentDasha(seed: number): string {
    const planets = ['Moon','Mars','Rahu','Jupiter','Saturn','Mercury','Ketu','Venus','Sun'];
    return `${planets[seed % 9]} Mahadasha`;
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
