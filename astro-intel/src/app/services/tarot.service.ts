import { Injectable } from '@angular/core';
import { TarotCard, TarotInput, TarotResult } from '../models/astro.models';

@Injectable({ providedIn: 'root' })
export class TarotService {

  private readonly DECK: Omit<TarotCard, 'position' | 'orientation'>[] = [
    { name: 'The Fool', keywords: ['new beginnings','adventure','potential'], meaning: 'A new chapter begins — there is a tendency toward fresh starts and uninhibited exploration.' },
    { name: 'The Magician', keywords: ['willpower','skill','manifestation'], meaning: 'This suggests that the tools and talents needed for success are already present within.' },
    { name: 'The High Priestess', keywords: ['intuition','mystery','inner wisdom'], meaning: 'There is a tendency to trust inner voice over external noise — wisdom lies within.' },
    { name: 'The Empress', keywords: ['abundance','nurturing','creativity'], meaning: 'This suggests a fertile period for creative projects, relationships, and material comfort.' },
    { name: 'The Emperor', keywords: ['authority','structure','stability'], meaning: 'A period of building solid foundations and asserting leadership is indicated.' },
    { name: 'The Hierophant', keywords: ['tradition','guidance','learning'], meaning: 'This suggests growth through structured learning, mentorship, or spiritual practice.' },
    { name: 'The Lovers', keywords: ['choices','partnership','alignment'], meaning: 'An important choice involving values or relationships is approaching.' },
    { name: 'The Chariot', keywords: ['determination','control','victory'], meaning: 'This suggests momentum and success through disciplined, focused effort.' },
    { name: 'Strength', keywords: ['courage','patience','inner strength'], meaning: 'There is a tendency to overcome challenges gently, with compassion rather than force.' },
    { name: 'The Hermit', keywords: ['introspection','solitude','guidance'], meaning: 'A period of reflection and inner seeking brings profound insight.' },
    { name: 'Wheel of Fortune', keywords: ['cycles','change','luck'], meaning: 'This suggests a turning point — positive change is on the horizon.' },
    { name: 'Justice', keywords: ['fairness','truth','balance'], meaning: 'Decisions made with integrity now lead to balanced outcomes.' },
    { name: 'The Star', keywords: ['hope','renewal','inspiration'], meaning: 'This suggests a period of healing, optimism, and renewed faith in the future.' },
    { name: 'The Sun', keywords: ['joy','success','vitality'], meaning: 'Positive energy, success, and clarity surround current endeavors.' },
    { name: 'The World', keywords: ['completion','achievement','wholeness'], meaning: 'A significant cycle is completing — this suggests fulfillment and readiness for the next phase.' },
    { name: 'Ace of Pentacles', keywords: ['opportunity','prosperity','new start'], meaning: 'A new financial or material opportunity is opening.' },
    { name: 'Three of Cups', keywords: ['celebration','community','joy'], meaning: 'There is a tendency toward joyful gatherings and meaningful friendships.' },
    { name: 'Six of Swords', keywords: ['transition','moving forward','calm'], meaning: 'This suggests a peaceful transition away from difficulty toward calmer waters.' },
    { name: 'Ten of Pentacles', keywords: ['legacy','family','abundance'], meaning: 'Long-term stability and family well-being are indicated.' },
    { name: 'Page of Wands', keywords: ['enthusiasm','exploration','messages'], meaning: 'Creative inspiration and exciting news are suggested.' },
  ];

  private readonly POSITIONS_3 = ['Past / Root Cause', 'Present / Current Energy', 'Future / Potential Outcome'];
  private readonly POSITIONS_5 = ['Past', 'Present', 'Hidden Influence', 'Advice', 'Future Potential'];

  compute(input: TarotInput, seed: number): TarotResult {
    const spread = input.spread ?? '3-card';
    const positions = spread === '5-card' ? this.POSITIONS_5 : this.POSITIONS_3;
    const cards = this._draw(positions, seed);

    return {
      spread,
      question: input.question,
      cards,
      overall_theme: this._theme(cards),
      guidance: this._guidance(cards),
    };
  }

  private _draw(positions: string[], seed: number): TarotCard[] {
    const used = new Set<number>();
    return positions.map((position, i) => {
      let idx = (seed + i * 7) % this.DECK.length;
      while (used.has(idx)) idx = (idx + 1) % this.DECK.length;
      used.add(idx);
      const card = this.DECK[idx];
      const orientation: TarotCard['orientation'] = (seed + i) % 5 !== 0 ? 'upright' : 'reversed';
      return {
        ...card,
        position,
        orientation,
        meaning: orientation === 'reversed'
          ? `Reversed — ${(card as any)['meaning'].replace('This suggests','This invites reflection on')}`
          : (card as any)['meaning'] as string,
      };
    });
  }

  private _theme(cards: TarotCard[]): string {
    const keys = cards.flatMap(c => c.keywords);
    const positives = ['success','joy','abundance','hope','strength','clarity'];
    const matches = keys.filter(k => positives.some(p => k.includes(p)));
    if (matches.length >= 2) return 'The overall theme suggests a positive, growth-oriented period with opportunities for expansion.';
    return 'The overall theme suggests a time of reflection, learning, and purposeful transition.';
  }

  private _guidance(cards: TarotCard[]): string[] {
    return [
      `There is a tendency toward ${cards[0]?.keywords[0] ?? 'new beginnings'} shaping current circumstances.`,
      `The present card — ${cards[1]?.name ?? 'The Present'} — suggests ${cards[1]?.keywords[1] ?? 'focus and clarity'} is needed now.`,
      cards.length > 2
        ? `The future card — ${cards[2]?.name} — suggests ${cards[2]?.meaning.split('—')[1]?.trim() ?? 'a positive shift ahead'}.`
        : 'Patience and consistent action will guide you toward the desired outcome.',
      'Trust the process — small, conscious steps create lasting transformation.',
    ];
  }
}
