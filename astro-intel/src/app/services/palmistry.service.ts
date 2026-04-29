import { Injectable } from '@angular/core';
import { PalmistryInput, PalmistryResult } from '../models/astro.models';

@Injectable({ providedIn: 'root' })
export class PalmistryService {

  compute(input: PalmistryInput): PalmistryResult[] {
    return [
      this._indian(input),
      this._chinese(input),
      this._western(input),
    ];
  }

  private _indian(input: PalmistryInput): PalmistryResult {
    return {
      tradition: 'Indian',
      life_line: 'The life line appears strong and curved — this suggests good vitality and a long, active life. There is a tendency toward robust physical energy.',
      head_line: 'A clear, long head line suggests analytical thinking and good decision-making ability in professional matters.',
      heart_line: 'The heart line curves upward — this suggests warmth, emotional expressiveness, and meaningful relationships.',
      fate_line: 'A fate line rising from the base suggests a self-made path carved through personal determination.',
      hand_shape: input.hand_shape ?? 'Square palm with medium fingers — indicates practicality and reliability.',
      mounts: {
        'Mount of Jupiter': 'Well-developed — leadership and ambition are present.',
        'Mount of Saturn': 'Average — balanced sense of responsibility.',
        'Mount of Sun': 'Prominent — creativity and desire for recognition.',
        'Mount of Mercury': 'Well-formed — strong communication and business sense.',
        'Mount of Venus': 'Soft and developed — warmth, love for beauty and family.',
        'Mount of Moon': 'Developed — imagination and intuition are indicated.',
        'Mount of Mars': 'Moderate — courage balanced with caution.',
      },
      traits: ['Determined', 'Creative', 'Emotionally expressive', 'Practical'],
      health_notes: ['Good constitution is indicated.', 'There is a tendency to accumulate stress — mindfulness is recommended.'],
      career_notes: ['Strong Jupiter mount suggests leadership roles suit well.', 'Mercury mount indicates aptitude for communication-heavy fields.'],
      relationship_notes: ['The heart line suggests deep emotional bonds.', 'There is a tendency toward loyalty and commitment in relationships.'],
    };
  }

  private _chinese(input: PalmistryInput): PalmistryResult {
    return {
      tradition: 'Chinese',
      life_line: 'The life line in Chinese tradition indicates life force (Qi) — a strong arc suggests abundant energy and good fortune in health.',
      head_line: 'A straight, clear head line indicates clear thinking and practical intelligence aligned with Chinese palmistry ideals.',
      heart_line: 'The heart line rising toward the index finger suggests noble emotions and idealistic love.',
      fate_line: 'The fate line (Career line) is present — this suggests a structured, goal-oriented career path.',
      hand_shape: 'Wood hand type — tall fingers, rectangular palm — suggests creativity, idealism, and sensitivity.',
      mounts: {
        'First Finger Mount (Jupiter)': 'Full — ambition and confidence.',
        'Second Finger Mount (Saturn)': 'Balanced — responsibility with wisdom.',
        'Third Finger Mount (Sun)': 'Raised — artistic and social talent.',
        'Fourth Finger Mount (Mercury)': 'Good — communication, trade, and intelligence.',
        'Lower Mars': 'Developed — active courage and energy.',
        'Upper Mars': 'Present — persistence under pressure.',
        'Plain of Mars': 'Clear — balanced temperament.',
      },
      traits: ['Intuitive', 'Goal-oriented', 'Creative', 'Socially adept'],
      health_notes: ['Good Qi flow is indicated — regular exercise maintains balance.', 'Attention to emotional health is advised.'],
      career_notes: ['Wood hand type thrives in creative and educational fields.', 'Leadership in artistic or communicative domains is favored.'],
      relationship_notes: ['Noble heart line suggests idealistic but sincere partnerships.', 'Loyalty and depth in emotional connections.'],
    };
  }

  private _western(input: PalmistryInput): PalmistryResult {
    return {
      tradition: 'Western',
      life_line: 'In Western tradition, the life line represents quality of life and vitality. A wide arc suggests enthusiasm and zest for living.',
      head_line: 'A sloping head line toward the Mount of Moon suggests creativity and imaginative thinking — typical in writers and artists.',
      heart_line: 'A long heart line indicates emotional depth and the capacity for long-term, committed relationships.',
      fate_line: 'A strong fate line from wrist to middle finger indicates a strong sense of purpose and direction in career.',
      hand_shape: 'Earth hand — square palm with short fingers — practical, reliable, and grounded.',
      mounts: {
        'Jupiter Mount': 'Firm — self-confidence and natural leadership.',
        'Saturn Mount': 'Normal — structured and responsible approach.',
        'Apollo Mount': 'Good — warmth, creativity, and appreciation for beauty.',
        'Mercury Mount': 'Present — quick thinking and communication flair.',
        'Venus Mount': 'Soft — affectionate, romantic, and family-oriented.',
        'Luna Mount': 'Developed — strong intuition and love of nature.',
        'Mars Positive': 'Balanced — assertive without aggression.',
        'Mars Negative': 'Moderate — resilience under challenge.',
      },
      traits: ['Grounded', 'Resilient', 'Creative thinker', 'Emotionally deep'],
      health_notes: ['Earth hand types tend toward physical robustness.', 'Attention to cardiovascular health and stress levels is advisable.'],
      career_notes: ['Practical and reliable in execution — suited for management and structured roles.', 'Creative head line opens doors to artistic careers.'],
      relationship_notes: ['Long heart line suggests desire for committed, stable relationships.', 'Venus mount indicates warmth and affection in partnerships.'],
    };
  }
}
