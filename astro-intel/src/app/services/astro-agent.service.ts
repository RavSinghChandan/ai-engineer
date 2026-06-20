/**
 * AstroIntel AI Assistant Service
 * Powered by Universal Agent (DeepSeek + LangGraph)
 * Agent URL: http://localhost:8001/agent
 *
 * Voice: browser Web Speech API (SpeechRecognition + SpeechSynthesis).
 * No extra API key needed. Whisper backend fallback available via
 * POST /agent/voice/stt for browsers without Web Speech support.
 */
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// Browser SpeechRecognition — vendor-prefixed in some browsers
declare const webkitSpeechRecognition: any;
declare const SpeechRecognition: any;
type SpeechRecognitionType = any;

export interface AstroMessage {
  role: 'user' | 'agent';
  content: string;
  streaming?: boolean;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class AstroAgentService {

  private readonly agentUrl = 'http://localhost:8010/agent';

  // Rate limit — 10 questions per session
  private readonly QUESTION_LIMIT = 10;
  readonly qCount   = signal(0);
  readonly isLimited = computed(() => this.qCount() >= this.QUESTION_LIMIT);
  readonly qRemaining = computed(() => Math.max(0, this.QUESTION_LIMIT - this.qCount()));

  readonly messages      = signal<AstroMessage[]>([]);
  readonly isLoading     = signal(false);
  readonly isStreaming   = signal(false);
  readonly isThinking    = signal(false);   // true while waiting for the first token
  readonly error         = signal<string | null>(null);
  readonly isOpen        = signal(false);

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly lastMessage = computed(() => {
    const msgs = this.messages();
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  });

  // ── Voice state ───────────────────────────────────────────────────────────
  readonly isListening   = signal(false);   // mic is recording
  readonly isSpeaking    = signal(false);   // TTS is playing back
  readonly voiceError    = signal('');      // last voice error
  readonly voiceSupported = signal(        // Web Speech API available?
    typeof globalThis !== 'undefined' &&
    ('SpeechRecognition' in globalThis || 'webkitSpeechRecognition' in globalThis)
  );

  private _recognition: any = null;
  private _synth: SpeechSynthesis | null =
    typeof globalThis !== 'undefined' ? (globalThis as any).speechSynthesis ?? null : null;
  private _femaleVoice: SpeechSynthesisVoice | null = null;

  // TTS delivery params — loaded from /agent/voice/config on init
  private _ttsRate   = 0.78;
  private _ttsPitch  = 1.2;
  private _ttsVolume = 0.88;
  private _stripEmojis = true;

  private _pickFemaleVoice(): void {
    if (!this._synth) return;
    const voices = this._synth.getVoices();
    if (!voices.length) return;

    // Priority list — most natural female voices across macOS / Windows / Android / iOS
    const PRIORITY = [
      // macOS — best quality
      'Samantha', 'Karen', 'Moira', 'Tessa', 'Veena',
      // iOS
      'Siri Female', 'Nicky',
      // Windows / Edge neural voices
      'Microsoft Zira', 'Microsoft Jenny', 'Microsoft Aria', 'Microsoft Emma',
      // Google (Chrome / Android)
      'Google UK English Female', 'Google US English Female', 'Google हिन्दी',
      // Generic fallback — any English female
    ];

    // 1. Try priority names (case-insensitive)
    for (const name of PRIORITY) {
      const v = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (v) { this._femaleVoice = v; return; }
    }

    // 2. Any voice with "female" in the name
    const byLabel = voices.find(v => v.name.toLowerCase().includes('female'));
    if (byLabel) { this._femaleVoice = byLabel; return; }

    // 3. Any English voice — avoid picking a male-named voice
    const MALE_NAMES = ['daniel','alex','fred','ralph','bruce','albert','junior','bad','whisper','bubbles','deranged','hysterical','zarvox'];
    const engFemale = voices.find(v =>
      v.lang.startsWith('en') && !MALE_NAMES.some(m => v.name.toLowerCase().includes(m))
    );
    if (engFemale) { this._femaleVoice = engFemale; return; }

    // 4. Any voice at all (last resort)
    this._femaleVoice = voices[0] ?? null;
  }

  readonly quickPrompts = [
    '🪐 What does HIGH confidence mean in my report?',
    '🔢 Explain my Life Path number',
    '✋ What is the Heart Line on my palm?',
    '🃏 How do I read a 3-card tarot spread?',
    '🏠 What is Vastu Shastra?',
    '💊 What remedies does the platform recommend?',
  ];

  private sessionId: string | null = null;

  constructor(private http: HttpClient) {
    this.sessionId = sessionStorage.getItem('astrointel_agent_session');
    const saved = sessionStorage.getItem('astrointel_agent_qcount');
    if (saved) this.qCount.set(Number.parseInt(saved, 10) || 0);

    // Voices load asynchronously — pick female voice as soon as they're ready
    if (this._synth) {
      this._pickFemaleVoice();
      this._synth.onvoiceschanged = () => this._pickFemaleVoice();
    }

    // Load TTS delivery params from backend config
    this._loadVoiceConfig();
  }

  private _loadVoiceConfig(): void {
    this.http.get<any>(`${this.agentUrl}/voice/config`).subscribe({
      next: (cfg) => {
        if (typeof cfg.tts_rate   === 'number') this._ttsRate   = cfg.tts_rate;
        if (typeof cfg.tts_pitch  === 'number') this._ttsPitch  = cfg.tts_pitch;
        if (typeof cfg.tts_volume === 'number') this._ttsVolume = cfg.tts_volume;
        if (typeof cfg.strip_emojis === 'boolean') this._stripEmojis = cfg.strip_emojis;
      },
      error: () => { /* keep defaults if backend unreachable */ }
    });
  }

  toggle() { this.isOpen.update(v => !v); }
  open()   { this.isOpen.set(true); }
  close()  { this.isOpen.set(false); }

  // ── Full response (simple) ─────────────────────────────────────────────────

  async chat(userMessage: string): Promise<string> {
    if (!userMessage.trim()) return '';
    this._addMessage({ role: 'user', content: userMessage });
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const res = await firstValueFrom(
        this.http.post<{ session_id: string; message: string }>(
          `${this.agentUrl}/chat`,
          { message: userMessage, session_id: this.sessionId }
        )
      );
      this._saveSession(res.session_id);
      this._addMessage({ role: 'agent', content: res.message });
      return res.message;
    } catch (err: any) {
      const msg = err?.error?.detail || err?.message || 'AstroAI is unavailable';
      this.error.set(msg);
      return '';
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Streaming response (tokens appear live) ────────────────────────────────

  async chatStream(userMessage: string): Promise<void> {
    if (!userMessage.trim()) return;

    // Rate limit check
    if (this.isLimited()) {
      const limitMsg = `🔒 You've used all ${this.QUESTION_LIMIT} questions for this session.\n\nTo continue, start a new session or log out and log back in.`;
      this._addMessage({ role: 'user', content: userMessage });
      this._addMessage({ role: 'agent', content: limitMsg });
      return;
    }

    this._addMessage({ role: 'user', content: userMessage });
    this.isStreaming.set(true);
    this.isThinking.set(true);
    this.error.set(null);

    const agentMsgIndex = this.messages().length;
    this._addMessage({ role: 'agent', content: '', streaming: true });

    try {
      await this._readStream(userMessage, agentMsgIndex);
      // Only count after a successful stream — failed requests do not burn quota
      const newCount = this.qCount() + 1;
      this.qCount.set(newCount);
      sessionStorage.setItem('astrointel_agent_qcount', String(newCount));
    } catch (err: any) {
      this.error.set(err?.message || 'Streaming failed');
      this.messages.update(msgs => msgs.filter((_, i) => i !== agentMsgIndex));
    } finally {
      this.isStreaming.set(false);
      this.isThinking.set(false);
    }
  }

  private async _readStream(userMessage: string, agentMsgIndex: number): Promise<void> {
    const params = new URLSearchParams({
      message: userMessage,
      ...(this.sessionId ? { session_id: this.sessionId } : {}),
    });

    const response = await fetch(`${this.agentUrl}/stream?${params}`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Agent HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        this._handleSseLine(line, agentMsgIndex);
      }
    }
  }

  private _handleSseLine(line: string, idx: number): void {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') return;
    try {
      const ev = JSON.parse(raw);
      if (ev.type === 'session') {
        this._saveSession(ev.session_id);
      } else if (ev.type === 'token') {
        this.isThinking.set(false);   // first token arrived — hide thinking bubble
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[idx] = { ...updated[idx], content: updated[idx].content + ev.token };
          return updated;
        });
      } else if (ev.type === 'done') {
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[idx] = { ...updated[idx], streaming: false };
          return updated;
        });
      } else if (ev.type === 'error') {
        this.error.set(ev.message || 'Stream error');
      }
    } catch { /* ignore malformed lines */ }
  }

  // ── Voice: STT (browser SpeechRecognition) ────────────────────────────────

  // Accumulates interim words so the user can speak as long as they want
  readonly interimTranscript = signal('');

  /**
   * Start continuous microphone recording.
   * Interim words appear live in interimTranscript.
   * Call stopListening() when done — resolves with the full transcript.
   */
  startListening(): Promise<string> {
    return new Promise((resolve, reject) => {
      const SR: SpeechRecognitionType =
        (globalThis as any).SpeechRecognition ??
        (globalThis as any).webkitSpeechRecognition;

      if (!SR) {
        this.voiceError.set('Voice not supported in this browser. Try Chrome or Edge.');
        reject('unsupported');
        return;
      }

      this.voiceError.set('');
      this.interimTranscript.set('');

      const rec = new SR();
      rec.lang             = 'en-IN';
      rec.interimResults   = true;   // show words as user speaks
      rec.maxAlternatives  = 1;
      rec.continuous       = true;   // keep mic open — user taps Done to stop

      this.isListening.set(true);
      this._recognition = rec;

      let finalParts: string[] = [];

      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript as string;
          if (event.results[i].isFinal) {
            finalParts.push(t.trim());
          } else {
            interim += t;
          }
        }
        // Show live preview in the input box
        this.interimTranscript.set([...finalParts, interim].join(' ').trim());
      };

      rec.onerror = (event: any) => {
        if (event.error === 'no-speech') return; // silence — keep listening
        const msg = event.error === 'not-allowed'
          ? 'Microphone access denied. Please allow mic in browser settings.'
          : `Voice error: ${event.error}`;
        this.voiceError.set(msg);
        this.isListening.set(false);
        reject(msg);
      };

      rec.onend = () => {
        // Called after stopListening() — resolve with everything collected
        this.isListening.set(false);
        this._recognition = null;
        const full = finalParts.join(' ').trim() || this.interimTranscript().trim();
        this.interimTranscript.set('');
        resolve(full);
      };

      rec.start();
    });
  }

  /** User taps Done — stops recording and triggers resolve() via onend */
  stopListening(): void {
    try { this._recognition?.stop(); } catch { /* already stopped */ }
    // onend will fire and resolve the promise
  }

  // ── Voice: TTS (browser SpeechSynthesis) ──────────────────────────────────

  // All Unicode emoji ranges — non-overlapping alternation
  private static readonly EMOJI_RE =
    /[\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{1F000}-\u{1F02F}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FE0F}]|[\u{E0000}-\u{E007F}]/gu;

  private _clean(text: string): string {
    let s = text
      .replace(/<[^>]+>/g, '')          // strip HTML tags
      .replace(/#{1,6}\s/g, '')         // strip markdown headings
      .replace(/[*_`~]/g, '')           // strip bold/italic/code markers
      .replace(/\n{2,}/g, '. ')         // paragraph breaks → sentence pause
      .replace(/\n/g, ' ');             // single newlines → space

    if (this._stripEmojis) {
      s = s.replace(AstroAgentService.EMOJI_RE, '');
    }

    return s.replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Speak text naturally by splitting into sentence chunks.
   * Each chunk is queued as a separate utterance — the browser engine
   * inserts micro-pauses between them, making it sound like natural speech
   * rather than one flat robotic monologue.
   */
  speak(text: string): void {
    if (!this._synth) return;
    this._synth.cancel();

    const clean = this._clean(text);
    if (!clean) return;

    // Split on sentence boundaries — keeps the delimiter attached
    const sentences = clean
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 1);

    // Cap total spoken length to ~3 sentences to keep responses concise
    const chunks = sentences.slice(0, 4);

    chunks.forEach((chunk, i) => {
      const utt = new SpeechSynthesisUtterance(chunk);

      if (this._femaleVoice) {
        utt.voice = this._femaleVoice;
        utt.lang  = this._femaleVoice.lang;
      } else {
        utt.lang = 'en-IN';
      }

      utt.rate   = this._ttsRate;
      utt.pitch  = this._ttsPitch;
      utt.volume = this._ttsVolume;

      if (i === 0)              utt.onstart = () => this.isSpeaking.set(true);
      if (i === chunks.length - 1) {
        utt.onend   = () => this.isSpeaking.set(false);
        utt.onerror = () => this.isSpeaking.set(false);
      }

      this._synth!.speak(utt);
    });
  }

  stopSpeaking(): void {
    this._synth?.cancel();
    this.isSpeaking.set(false);
  }

  // ── Clear ──────────────────────────────────────────────────────────────────

  async clearSession(): Promise<void> {
    if (this.sessionId) {
      try {
        await firstValueFrom(
          this.http.post(`${this.agentUrl}/clear`, { session_id: this.sessionId })
        );
      } catch { /* ignore */ }
    }
    this.sessionId = null;
    sessionStorage.removeItem('astrointel_agent_session');
    sessionStorage.removeItem('astrointel_agent_qcount');
    this.qCount.set(0);
    this.messages.set([]);
    this.error.set(null);
  }

  private _addMessage(msg: Omit<AstroMessage, 'timestamp'>): void {
    this.messages.update(msgs => [...msgs, { ...msg, timestamp: new Date() }]);
  }

  private _saveSession(id: string): void {
    this.sessionId = id;
    sessionStorage.setItem('astrointel_agent_session', id);
  }
}
