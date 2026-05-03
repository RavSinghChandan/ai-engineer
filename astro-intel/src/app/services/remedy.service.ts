import { Injectable } from '@angular/core';
import { AgentOutputs, RemedyResult } from '../models/astro.models';

@Injectable({ providedIn: 'root' })
export class RemedyService {

  compute(outputs: AgentOutputs): RemedyResult {
    const colors = this._mergeColors(outputs);
    const lagna = (outputs.astrology as any)?.lagna ?? '';
    const num = outputs.numerology as any;
    const lifePath = Array.isArray(num)
      ? (num[0]?.life_path_number ?? 1)
      : (num?.indian?.core_numbers?.life_path ?? num?.pythagorean?.core_numbers?.life_path ?? 1);
    const dasha = (outputs.astrology as any)?.current_dasha ?? '';

    return {
      daily_habits: this._habits(lagna, dasha),
      mantras: this._mantras(lagna, dasha),
      colors: [...new Set(colors)].slice(0, 5),
      gemstones: this._gemstones(lagna, lifePath),
      fasting: this._fasting(lagna),
      charity: this._charity(lagna),
      behavioral_adjustments: this._behavioral(outputs),
      yoga_meditation: this._yoga(lagna),
    };
  }

  private _mergeColors(o: AgentOutputs): string[] {
    const colors: string[] = [];
    if (o.numerology) {
      const num = o.numerology as any;
      if (Array.isArray(num)) {
        num.forEach((n: any) => colors.push(...(n.lucky_colors ?? [])));
      } else {
        // normalized shape: { indian, chaldean, pythagorean }
        ['indian', 'chaldean', 'pythagorean'].forEach(k => {
          if (num[k]?.lucky_colors) colors.push(...num[k].lucky_colors);
        });
      }
    }
    if (o.vastu) colors.push(...((o.vastu as any).colors_recommended ?? []));
    return colors;
  }

  private _habits(lagna: string, dasha: string): string[] {
    return [
      'Begin each morning with 10 minutes of mindful breathing or meditation.',
      'Spend time in natural sunlight for at least 20 minutes daily.',
      'Keep a gratitude journal — write 3 things you appreciate each evening.',
      `As a ${lagna || 'rising'} individual, grounding practices like walking barefoot on grass can be particularly beneficial.`,
      `During ${dasha || 'this dasha period'}, consistent routine creates stability and clarity.`,
      'Hydrate well — aim for 8 glasses of water daily to support physical vitality.',
      'Avoid heavy meals after sunset — light dinners support better sleep and digestion.',
    ];
  }

  private _mantras(lagna: string, dasha: string): { mantra: string; purpose: string; count: number }[] {
    const planet = dasha.split(' ')[0] ?? 'Sun';
    const planetMantra: Record<string, { mantra: string; purpose: string }> = {
      Sun: { mantra: 'Om Hreem Suryaya Namah', purpose: 'Clarity, confidence, and vitality' },
      Moon: { mantra: 'Om Shreem Chandraya Namah', purpose: 'Emotional balance and peace of mind' },
      Mars: { mantra: 'Om Kraam Kreem Kraum Sah Bhaumaya Namah', purpose: 'Courage and energy' },
      Mercury: { mantra: 'Om Braam Breem Braum Sah Budhaya Namah', purpose: 'Intelligence and communication' },
      Jupiter: { mantra: 'Om Graam Greem Graum Sah Gurave Namah', purpose: 'Wisdom and prosperity' },
      Venus: { mantra: 'Om Draam Dreem Draum Sah Shukraya Namah', purpose: 'Love, beauty, and harmony' },
      Saturn: { mantra: 'Om Praam Preem Praum Sah Shanaischaraya Namah', purpose: 'Discipline and karmic balance' },
      Rahu: { mantra: 'Om Raam Rahave Namah', purpose: 'Clarity of ambition and focus' },
      Ketu: { mantra: 'Om Sraam Sreem Sraum Sah Ketave Namah', purpose: 'Spiritual insight and liberation' },
    };
    const base = [
      { mantra: 'Om Namah Shivaya', purpose: 'Overall well-being and inner peace', count: 108 },
      { mantra: 'Gayatri Mantra — Om Bhur Bhuvaḥ Svaḥ...', purpose: 'Wisdom, light, and divine guidance', count: 21 },
    ];
    const specific = planetMantra[planet];
    if (specific) base.unshift({ ...specific, count: 108 });
    return base;
  }

  private _gemstones(lagna: string, lifePath: number): { stone: string; finger: string; purpose: string }[] {
    const lagnaStones: Record<string, { stone: string; finger: string; purpose: string }> = {
      Aries: { stone: 'Red Coral', finger: 'Ring finger, right hand', purpose: 'Energy, courage, and Mars strength' },
      Taurus: { stone: 'Diamond or White Sapphire', finger: 'Ring finger', purpose: 'Beauty, harmony, and Venus energy' },
      Gemini: { stone: 'Emerald', finger: 'Little finger', purpose: 'Intellect, communication, and Mercury strength' },
      Cancer: { stone: 'Pearl or Moonstone', finger: 'Little finger', purpose: 'Emotional balance and Moon energy' },
      Leo: { stone: 'Ruby', finger: 'Ring finger, right hand', purpose: 'Confidence, vitality, and Sun strength' },
      Virgo: { stone: 'Emerald', finger: 'Little finger', purpose: 'Clarity, health, and Mercury energy' },
      Libra: { stone: 'Diamond or Opal', finger: 'Ring finger', purpose: 'Harmony, relationships, and Venus strength' },
      Scorpio: { stone: 'Red Coral', finger: 'Ring finger', purpose: 'Transformation and Mars energy' },
      Sagittarius: { stone: 'Yellow Sapphire', finger: 'Index finger', purpose: 'Wisdom, prosperity, and Jupiter energy' },
      Capricorn: { stone: 'Blue Sapphire (after trial)', finger: 'Middle finger', purpose: 'Discipline and Saturn strength' },
      Aquarius: { stone: 'Blue Sapphire or Amethyst', finger: 'Middle finger', purpose: 'Innovation and Saturn energy' },
      Pisces: { stone: 'Yellow Sapphire', finger: 'Index finger', purpose: 'Spirituality and Jupiter energy' },
    };
    const result = [];
    if (lagnaStones[lagna]) result.push(lagnaStones[lagna]);
    if (lifePath === 7 || lifePath === 2) result.push({ stone: 'Moonstone', finger: 'Little finger', purpose: 'Intuition and emotional clarity' });
    result.push({ stone: 'Clear Quartz', finger: 'Any finger or worn as pendant', purpose: 'General amplification and clarity of intention' });
    return result;
  }

  private _fasting(lagna: string): string[] {
    const map: Record<string, string> = {
      Aries: 'Tuesday fasting honors Mars — light sattvic meals are suggested.',
      Taurus: 'Friday fasting honors Venus — supports love and prosperity.',
      Gemini: 'Wednesday fasting honors Mercury — enhances communication.',
      Cancer: 'Monday fasting honors Moon — supports emotional peace.',
      Leo: 'Sunday fasting honors Sun — boosts vitality and leadership.',
      Virgo: 'Wednesday fasting is suggested for Mercury energy.',
      Libra: 'Friday fasting honors Venus — supports harmony.',
      Scorpio: 'Tuesday fasting honors Mars — supports strength and courage.',
      Sagittarius: 'Thursday fasting honors Jupiter — supports wisdom and growth.',
      Capricorn: 'Saturday fasting honors Saturn — supports discipline.',
      Aquarius: 'Saturday fasting is suggested for Saturn alignment.',
      Pisces: 'Thursday fasting honors Jupiter — deepens spirituality.',
    };
    return [
      map[lagna] ?? 'Weekly fasting on a day meaningful to you is beneficial for discipline and gratitude.',
      'Even a single meal fast or fruit day is sufficient — severity is not required for benefit.',
    ];
  }

  private _charity(lagna: string): string[] {
    return [
      'Donate food, clothing, or essentials to those in need on the ruling planet\'s day.',
      'Offer water to a plant or tree each morning as an act of gratitude.',
      'Support a cause related to education or children — this strengthens Jupiter\'s blessings.',
      'Acts of anonymous charity (without expectation of recognition) carry the greatest karmic benefit.',
    ];
  }

  private _behavioral(outputs: AgentOutputs): string[] {
    const adjustments = [
      'There is a tendency toward overwork — scheduling intentional rest is as important as productivity.',
      'Practice active listening in relationships — this strengthens bonds and reduces conflict.',
      'Avoid reactive decisions during emotional highs or lows — wait 24 hours before responding to conflicts.',
      'This suggests that speaking with gratitude and kindness daily improves relationships and personal energy.',
    ];
    if ((outputs.astrology as any)?.doshas?.some((d: string) => d.includes('Mangal'))) {
      adjustments.push('As a Mangal Dosha indicator is present, practicing patience in romantic partnerships is especially recommended.');
    }
    return adjustments;
  }

  private _yoga(lagna: string): string[] {
    return [
      'Sun Salutation (Surya Namaskar) — 12 rounds each morning aligns body and mind with solar energy.',
      'Pranayama — Anulom Vilom (alternate nostril breathing) for 10 minutes balances left and right brain.',
      'Shavasana (Corpse Pose) — 5 minutes of full body relaxation after practice restores the nervous system.',
      `For ${lagna || 'your'} rising, grounding practices like Tree Pose (Vrikshasana) and Mountain Pose (Tadasana) are particularly beneficial.`,
      'Mindfulness meditation for 10 minutes before bed improves sleep quality and reduces anxiety.',
    ];
  }
}
