import { Injectable } from '@angular/core';
import { VastuInput, VastuResult } from '../models/astro.models';

@Injectable({ providedIn: 'root' })
export class VastuService {

  compute(input: VastuInput): VastuResult {
    const facing = (input.facing_direction ?? 'North').toLowerCase();

    return {
      overall_energy: this._overallEnergy(facing),
      zone_analysis: this._zoneAnalysis(facing),
      imbalances: this._imbalances(facing, input),
      corrections: this._corrections(facing),
      favorable_directions: this._favorableDirections(facing),
      colors_recommended: this._colors(facing),
    };
  }

  private _overallEnergy(facing: string): string {
    const map: Record<string, string> = {
      north: 'North-facing properties carry the energy of prosperity and career growth — this is generally a very favorable direction.',
      northeast: 'Northeast (Eeshaan) is the most auspicious direction — this suggests strong spiritual and financial energy.',
      east: 'East-facing brings positive solar energy — this suggests good health, vitality, and new beginnings.',
      southeast: 'Southeast (Agni corner) carries fire energy — this suggests creativity and ambition, though balance is needed.',
      south: 'South-facing requires careful Vastu planning — with correct remedies, stability and strength are achievable.',
      southwest: 'Southwest (Nairuti) is the direction of stability — good for master bedrooms, may need energy correction.',
      west: 'West-facing carries the energy of gains and water element — suitable for financial growth with proper layout.',
      northwest: 'Northwest (Vayu) carries air energy — this suggests movement, change, and social connections.',
    };
    return map[facing] ?? map['north'];
  }

  private _zoneAnalysis(facing: string): Record<string, string> {
    return {
      'North Zone (Kubera — Wealth)': 'Keep this zone clutter-free and light — place a small water feature or blue items here.',
      'Northeast Zone (Eeshaan — Spirituality)': 'Ideal for prayer room or meditation corner — keep clean and light.',
      'East Zone (Indra — Health)': 'Ensure good windows here for morning sunlight — promotes vitality.',
      'Southeast Zone (Agni — Fire)': 'Kitchen belongs here — avoid bedroom in this zone.',
      'South Zone (Yama — Discipline)': 'Suitable for storage and heavy items — avoid main entrance.',
      'Southwest Zone (Nairuti — Stability)': 'Ideal for master bedroom — keeps the head of family grounded.',
      'West Zone (Varuna — Gains)': 'Suitable for living room and children\'s study.',
      'Northwest Zone (Vayu — Movement)': 'Good for guest room or garage — supports movement energy.',
      'Centre (Brahmasthan)': 'Keep completely open and clutter-free — this is the energy heart of the home.',
    };
  }

  private _imbalances(facing: string, input: VastuInput): string[] {
    const imbalances = [
      'There may be a tendency toward energy blockage in the Northeast if heavy items are placed there.',
      'Clutter in the North zone may restrict the flow of prosperity energy.',
      'A toilet or kitchen in the Northeast or North may create imbalance — consider remedies.',
    ];
    if (facing === 'south' || facing === 'southwest') {
      imbalances.push('South-facing entrance may need a Vastu correction mirror or pyramid remedy at the entrance.');
    }
    return imbalances;
  }

  private _corrections(facing: string): string[] {
    return [
      'Place a small indoor plant (money plant or tulsi) in the North or Northeast zone.',
      'Hang a Vastu pyramid or crystal in the Brahmasthan area to enhance central energy flow.',
      'Use a wind chime in the Northwest to activate air element and support movement.',
      'Ensure the main entrance is well-lit and welcoming — place a welcome mat and a small lamp.',
      'Avoid placing mirrors facing the main door — redirect them to the North or East wall.',
      facing === 'south' ? 'Place a red-colored object or Hanuman image at the South entrance to balance the energy.' : 'Maintain clear, unobstructed pathways throughout the home.',
      'Keep the kitchen in the Southeast zone with the cook facing East while cooking.',
    ];
  }

  private _favorableDirections(facing: string): string[] {
    const map: Record<string, string[]> = {
      north: ['North', 'Northeast', 'East'],
      northeast: ['Northeast', 'North', 'East'],
      east: ['East', 'Northeast', 'North'],
      southeast: ['Southeast', 'East', 'South'],
      south: ['Southwest', 'South', 'West'],
      southwest: ['Southwest', 'West', 'South'],
      west: ['West', 'Northwest', 'North'],
      northwest: ['Northwest', 'North', 'West'],
    };
    return map[facing] ?? ['North', 'Northeast', 'East'];
  }

  private _colors(facing: string): string[] {
    const map: Record<string, string[]> = {
      north: ['Blue', 'Green', 'White'],
      northeast: ['White', 'Light Yellow', 'Cream'],
      east: ['Green', 'White', 'Light Blue'],
      southeast: ['Orange', 'Red (accent)', 'Yellow'],
      south: ['Red', 'Pink', 'Coral'],
      southwest: ['Yellow', 'Earthy Brown', 'Peach'],
      west: ['White', 'Grey', 'Blue'],
      northwest: ['Grey', 'White', 'Silver'],
    };
    return map[facing] ?? ['White', 'Green', 'Blue'];
  }
}
