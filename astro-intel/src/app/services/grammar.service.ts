/**
 * GrammarService — client-side deterministic grammar correction.
 * Mirrors the Pass 1 rules from the Python grammar_agent.py so that
 * the locally-built PDF report has the same grammar corrections as the
 * backend-processed one, with zero API calls.
 */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GrammarService {

  /** Correct a single string — all deterministic rules, no network. */
  correct(text: string): string {
    if (!text || text.trim().length < 3) return text;

    let t = text;

    // 1. Lowercase "i" pronoun → "I"
    t = t.replace(/\bi\b(?!\w)/g, 'I');

    // 2. Article: "a" before vowel-sound word → "an"
    t = t.replace(/\b(a)\s+([aeiouAEIOU][a-zA-Z])/g, (_m, _a, rest) => `an ${rest}`);

    // 3. Article: "an" before consonant-sound word → "a"
    t = t.replace(/\b(an)\s+([b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z][a-zA-Z])/g, (_m, _an, rest) => `a ${rest}`);

    // 4. Repeated word: "the the" → "the"
    t = t.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // 5. Missing space after period: "word.Next" → "word. Next"
    t = t.replace(/([a-zA-Z])\.([A-Z])/g, '$1. $2');

    // 6. Comma before conjunction spacing: "word ,and" → "word, and"
    t = t.replace(/\s+,\s*(and|but|or|yet|so)\b/gi, ', $1');

    // 7. Double punctuation: "!!" → "!"
    t = t.replace(/([.!?])\1+/g, '$1');

    // 8. Multiple spaces → single space
    t = t.replace(/ {2,}/g, ' ');

    // 9. Trailing whitespace per line
    t = t.replace(/[ \t]+$/gm, '');

    // 10. Capitalise first letter of each sentence
    t = t.replace(/(^|(?<=[.!?])\s+)([a-z])/g, (m) => m.toUpperCase());

    // 11. Add period if bare sentence (single line, no period at end)
    const stripped = t.trim();
    if (stripped && !stripped.endsWith('.') && !stripped.endsWith('!') &&
        !stripped.endsWith('?') && !stripped.endsWith(':') && !stripped.endsWith(';') &&
        !stripped.includes('\n') && /[a-zA-Z\d)]$/.test(stripped)) {
      t = stripped + '.';
    }

    return t.trim();
  }

  /** Grammar-correct every insight content in an AdminReview object (in-place). */
  correctAdminReview(review: any): any {
    if (!review?.questions) return review;
    for (const q of review.questions) {
      for (const insight of (q.insights ?? [])) {
        if (insight.content) {
          insight.content = this.correct(insight.content);
        }
      }
    }
    return review;
  }

  /** Grammar-correct key prose fields of a FinalReport (returns corrected copy). */
  correctReport(report: any): any {
    if (!report) return report;
    const r = { ...report };

    const proseKeys = [
      'narrative', 'simple_narrative', 'disclaimer', 'closing_note',
      'letter_para1', 'letter_para2', 'letter_para3', 'letter_para4',
      'letter_sign', 'cover_sub', 'cover_footer',
      'closing_consult', 'closing_confidential',
    ];

    for (const key of proseKeys) {
      if (typeof r[key] === 'string') r[key] = this.correct(r[key]);
    }

    if (Array.isArray(r.sections)) {
      r.sections = r.sections.map((s: any) => {
        const sec = { ...s };
        if (typeof sec.narrative === 'string')        sec.narrative        = this.correct(sec.narrative);
        if (typeof sec.simple_narrative === 'string') sec.simple_narrative = this.correct(sec.simple_narrative);
        if (sec.structured_summary) {
          const ss = { ...sec.structured_summary };
          for (const k of ['who', 'what', 'when', 'where', 'how']) {
            if (typeof ss[k] === 'string') ss[k] = this.correct(ss[k]);
          }
          sec.structured_summary = ss;
        }
        if (Array.isArray(sec.insights)) {
          sec.insights = sec.insights.map((ins: any) => ({
            ...ins,
            content: ins.content ? this.correct(ins.content) : ins.content,
          }));
        }
        return sec;
      });
    }

    if (Array.isArray(r.remedies?.daily_habits)) {
      r.remedies = {
        ...r.remedies,
        daily_habits: r.remedies.daily_habits.map((h: string) =>
          typeof h === 'string' ? this.correct(h) : h
        ),
      };
    }

    return r;
  }
}
