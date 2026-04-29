import { Injectable } from '@angular/core';
import { NumerologyResult, UserProfile } from '../models/astro.models';

@Injectable({ providedIn: 'root' })
export class NumerologyService {

  compute(profile: UserProfile): NumerologyResult[] {
    const dob = profile.date_of_birth;
    const name = (profile.full_name || '').toUpperCase();
    const digits = dob.replace(/\D/g, '').split('').map(Number);

    return [
      this._indian(name, digits, dob),
      this._chaldean(name, digits, dob),
      this._pythagorean(name, digits, dob),
    ];
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private _reduce(n: number): number {
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
      n = String(n).split('').reduce((a, b) => a + +b, 0);
    }
    return n;
  }

  private _sumDigits(digits: number[]): number {
    return this._reduce(digits.reduce((a, b) => a + b, 0));
  }

  private _letterValueIndian(c: string): number {
    const map: Record<string, number> = {
      A:1,I:1,J:1,Q:1,Y:1, B:2,K:2,R:2, C:3,G:3,L:3,S:3,
      D:4,M:4,T:4, E:5,H:5,N:5,X:5, U:6,V:6,W:6, O:7,Z:7,
      F:8,P:8
    };
    return map[c] ?? 0;
  }

  private _letterValueChaldean(c: string): number {
    const map: Record<string, number> = {
      A:1,I:1,J:1,Q:1,Y:1, B:2,K:2,R:2, C:3,G:3,L:3,S:3,
      D:4,M:4,T:4, E:5,H:5,N:5,X:5, U:6,V:6,W:6, O:7,Z:7,
      F:8,P:8
    };
    return map[c] ?? 0;
  }

  private _letterValuePythagorean(c: string): number {
    return ((c.charCodeAt(0) - 64 - 1) % 9) + 1;
  }

  private _nameNumber(name: string, fn: (c: string) => number): number {
    return this._reduce(name.replace(/[^A-Z]/g, '').split('').reduce((a, c) => a + fn(c), 0));
  }

  private _vowels = new Set(['A','E','I','O','U']);

  private _soulNumber(name: string, fn: (c: string) => number): number {
    return this._reduce(name.replace(/[^A-Z]/g, '').split('').filter(c => this._vowels.has(c)).reduce((a, c) => a + fn(c), 0));
  }

  private _personalityNumber(name: string, fn: (c: string) => number): number {
    return this._reduce(name.replace(/[^A-Z]/g, '').split('').filter(c => !this._vowels.has(c)).reduce((a, c) => a + fn(c), 0));
  }

  private _destinyFromDob(dob: string): number {
    return this._sumDigits(dob.replace(/\D/g, '').split('').map(Number));
  }

  private _traitsForNumber(n: number): string[] {
    const map: Record<number, string[]> = {
      1: ['Natural leader', 'Independent', 'Ambitious', 'Determined'],
      2: ['Diplomatic', 'Cooperative', 'Sensitive', 'Supportive'],
      3: ['Creative', 'Expressive', 'Sociable', 'Optimistic'],
      4: ['Practical', 'Disciplined', 'Reliable', 'Hard-working'],
      5: ['Adventurous', 'Freedom-loving', 'Versatile', 'Energetic'],
      6: ['Nurturing', 'Responsible', 'Harmonious', 'Caring'],
      7: ['Analytical', 'Introspective', 'Spiritual', 'Wise'],
      8: ['Authoritative', 'Business-minded', 'Powerful', 'Resilient'],
      9: ['Humanitarian', 'Compassionate', 'Generous', 'Idealistic'],
      11: ['Intuitive', 'Inspirational', 'Visionary', 'Sensitive'],
      22: ['Master builder', 'Practical visionary', 'Disciplined', 'Ambitious'],
    };
    return map[n] ?? map[n % 9 || 9] ?? [];
  }

  private _predictionsForNumber(n: number, tradition: string): string[] {
    return [
      `There is a tendency toward ${this._traitsForNumber(n)[0]?.toLowerCase() ?? 'growth'} in personal endeavors.`,
      `This suggests a phase of ${n % 2 === 0 ? 'collaboration and balance' : 'independence and leadership'} in the near term.`,
      `The ${tradition} tradition indicates potential growth in career around key number ${n} cycles.`,
    ];
  }

  // ── Indian ────────────────────────────────────────────────────────────────
  private _indian(name: string, digits: number[], dob: string): NumerologyResult {
    const fn = this._letterValueIndian.bind(this);
    const lp = this._sumDigits(digits);
    const dest = this._destinyFromDob(dob);
    const nm = this._nameNumber(name, fn);
    return {
      tradition: 'Indian',
      life_path_number: lp,
      destiny_number: dest,
      name_number: nm,
      soul_urge_number: this._soulNumber(name, fn),
      personality_number: this._personalityNumber(name, fn),
      traits: this._traitsForNumber(lp),
      strengths: this._traitsForNumber(lp).slice(0, 2),
      weaknesses: ['Tendency to overthink', 'May resist change at times'],
      lucky_numbers: [lp, nm, (lp + nm) % 9 || 9],
      lucky_colors: ['Gold', 'Cream', 'Green'],
      predictions: this._predictionsForNumber(lp, 'Indian'),
    };
  }

  // ── Chaldean ──────────────────────────────────────────────────────────────
  private _chaldean(name: string, digits: number[], dob: string): NumerologyResult {
    const fn = this._letterValueChaldean.bind(this);
    const lp = this._sumDigits(digits);
    const dest = this._destinyFromDob(dob);
    const nm = this._nameNumber(name, fn);
    return {
      tradition: 'Chaldean',
      life_path_number: lp,
      destiny_number: dest,
      name_number: nm,
      soul_urge_number: this._soulNumber(name, fn),
      personality_number: this._personalityNumber(name, fn),
      traits: this._traitsForNumber(nm),
      strengths: this._traitsForNumber(nm).slice(0, 2),
      weaknesses: ['May be overly idealistic', 'Needs grounding practices'],
      lucky_numbers: [nm, dest, (nm + dest) % 9 || 9],
      lucky_colors: ['Blue', 'White', 'Purple'],
      predictions: this._predictionsForNumber(nm, 'Chaldean'),
    };
  }

  // ── Pythagorean ────────────────────────────────────────────────────────────
  private _pythagorean(name: string, digits: number[], dob: string): NumerologyResult {
    const fn = this._letterValuePythagorean.bind(this);
    const lp = this._sumDigits(digits);
    const dest = this._destinyFromDob(dob);
    const nm = this._nameNumber(name, fn);
    return {
      tradition: 'Pythagorean',
      life_path_number: lp,
      destiny_number: dest,
      name_number: nm,
      soul_urge_number: this._soulNumber(name, fn),
      personality_number: this._personalityNumber(name, fn),
      traits: [...this._traitsForNumber(lp), ...this._traitsForNumber(nm)].slice(0, 4),
      strengths: this._traitsForNumber(dest).slice(0, 2),
      weaknesses: ['Prone to self-doubt under pressure', 'May scatter energy'],
      lucky_numbers: [lp, nm, dest],
      lucky_colors: ['Orange', 'Yellow', 'Silver'],
      predictions: this._predictionsForNumber(dest, 'Pythagorean'),
    };
  }
}
