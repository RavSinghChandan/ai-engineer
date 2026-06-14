import { Injectable } from '@angular/core';

// ── Guardrails G1–G5 ──────────────────────────────────────────────────────
const GUARDS = {
  injection: /\bignore\b.{0,30}\b(instructions?|prompt|system)\b|\bjailbreak\b|\bact\s+as\b|\bpretend\s+(you\s+are|to\s+be)\b|\bDAN\b|\bdo\s+anything\s+now\b|\boverride\b|\broleplay\s+as\b/i,
  pii: /\b\d{10,}\b|\b[A-Z]{5}\d{4}[A-Z]\b|\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/,
  toxic: /\b(hate|kill|attack|bomb|exploit|hack\s+your|ddos|phish)\b/i,
  offTopic: /\b(weather|sports|cricket|movie|recipe|game|news|stock\s+price|celebrity)\b/i,
};

// ── Shared HTML helpers ────────────────────────────────────────────────────
const b = (t: string) => `<strong>${t}</strong>`;
const ul = (items: string[]) => `<ul style="margin:0.5rem 0 0 0.5rem;padding:0;list-style:none">${items.map(i => `<li style="margin:0.25rem 0;padding-left:1rem;position:relative"><span style="position:absolute;left:0;color:#a78bfa">→</span>${i}</li>`).join('')}</ul>`;
const pill = (t: string, c = '#a78bfa') => `<span style="display:inline-block;margin:2px;padding:0.15rem 0.5rem;border-radius:100px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.25);font-size:0.72rem;font-weight:700;color:${c}">${t}</span>`;
const link = (label: string, href: string) => `<a href="${href}" target="_blank" style="display:inline-block;margin:0.4rem 0.3rem 0;padding:0.3rem 0.8rem;border-radius:7px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.3);color:#a78bfa;font-size:0.78rem;font-weight:700;text-decoration:none">${label}</a>`;
const bookBtn = () => `<br><br>${link('📅 Book Free Consultation', '#contact')} ${link('📧 Email Us', 'mailto:ravchandan15@gmail.com')}`;

// ── Intent library ────────────────────────────────────────────────────────
interface Intent {
  keys: RegExp[];
  reply: () => string;
  followups?: string[];
}

const INTENTS: Intent[] = [

  // ── Greetings ──────────────────────────────────────────────────────────
  {
    keys: [/^(hi|hello|hey|namaste|howdy|good\s*(morning|afternoon|evening))\b/i],
    reply: () => `Hi there! 👋 I'm ${b('Rav AI Assistant')} — your AI business guide.<br><br>I'm here to help you understand how ${b('AI with Rav')} can transform your business operations, reduce costs, and accelerate growth.<br><br>What can I help you with today?`,
    followups: ['🤖 What AI services do you offer?', '📞 Book a free consultation', '💰 How much does it cost?'],
  },

  // ── What is AI with Rav ─────────────────────────────────────────────────
  {
    keys: [/what\s+is\s+(ai\s+with\s+rav|this\s+company|your\s+company|you\s+do|your\s+business)/i, /tell\s+me\s+about\s+(ai\s+with\s+rav|yourself|the\s+company)/i, /who\s+are\s+you/i],
    reply: () => `${b('AI with Rav')} is a specialist AI consulting firm that helps businesses become AI-first organisations.<br><br>We build and deploy production-grade AI solutions — not slides, not prototypes. Real systems that deliver measurable ROI within weeks.<br><br>${b('What we deliver:')}<br>${ul(['AI Automation — eliminate repetitive manual work', 'AI Agents — 24/7 autonomous customer & ops support', 'RAG Systems — your company knowledge, AI-powered', 'LLM Applications — custom AI tools for your team', 'AI Transformation — end-to-end strategy & execution'])}<br>${b('Founded by:')} Chandan Kumar (Senior AI Engineer) and a Head of Operations with enterprise client management experience.${bookBtn()}`,
    followups: ['🎯 What problems do you solve?', '👥 Who is behind AI with Rav?', '💰 How much does it cost?'],
  },

  // ── Services ─────────────────────────────────────────────────────────────
  {
    keys: [/what\s+(services?|do\s+you\s+offer|can\s+you\s+do|you\s+provide)/i, /services?\b/i, /offerings?\b/i],
    reply: () => `We offer ${b('6 core AI services')} — all production-proven:<br><br>${pill('🔍 AI Audit')} ${pill('⚡ AI Automation')} ${pill('🤖 AI Agents')} ${pill('🗄️ RAG Systems')} ${pill('🛡️ AI Transformation')} ${pill('📱 LLM Applications')}<br><br>${b('AI Audit & Roadmap')} — We map your processes, identify top automation opportunities, and give you a prioritised ROI roadmap.<br><br>${b('AI Automation')} — We eliminate repetitive manual tasks: document processing, email automation, data extraction, reporting.<br><br>${b('AI Agents')} — 24/7 autonomous agents for lead qualification, customer support, internal HR & IT queries.<br><br>${b('RAG Systems')} — Company knowledge assistants trained on your own docs, SOPs, and data.<br><br>${b('LLM Applications')} — Custom AI-powered apps: proposal generators, intelligent search, dashboards.<br><br>${b('AI Transformation')} — Full end-to-end AI adoption: strategy, implementation, team training, governance.${bookBtn()}`,
    followups: ['🎯 Which service is right for me?', '🤖 Tell me more about AI Agents', '🗄️ What is a RAG system?', '💰 Pricing?'],
  },

  // ── AI Agents ────────────────────────────────────────────────────────────
  {
    keys: [/ai\s+agent/i, /chatbot/i, /customer\s+support\s+ai/i, /lead\s+qualif/i, /24.?7\s+support/i],
    reply: () => `${b('AI Agents')} are autonomous AI workers that run 24/7 without human intervention.<br><br>${b('What our agents can do for you:')}<br>${ul(['Lead qualification — engage every inbound lead instantly, score by fit, route hot leads to sales', 'Customer support — answer FAQs, resolve tickets, escalate edge cases to humans', 'Internal HR assistant — answer policy questions, onboarding queries, leave requests', 'IT helpdesk — diagnose common issues, raise tickets, send instructions', 'Sales automation — follow-up sequences, meeting scheduling, CRM updates'])}<br><br>${b('Client result:')} One client reduced unqualified lead handling by ${b('80%')} and increased sales pipeline velocity ${b('3×')} within 6 weeks of deployment.<br><br>${b('Tech stack:')} LangGraph · FastAPI · GPT-4 / Claude API · CRM integrations${bookBtn()}`,
    followups: ['🗄️ What about RAG systems?', '⚡ How fast can you deploy?', '💰 What does an agent cost?'],
  },

  // ── RAG Systems ──────────────────────────────────────────────────────────
  {
    keys: [/rag\s*system/i, /knowledge\s+(base|assistant|ai)/i, /document\s+(ai|search|chat)/i, /company\s+(knowledge|data|docs)/i, /retrieval/i],
    reply: () => `A ${b('RAG System')} (Retrieval-Augmented Generation) is an AI assistant trained on your own company data — not generic internet knowledge.<br><br>${b('Example use cases:')}<br>${ul(['Internal knowledge base — staff ask questions, AI answers from your SOPs & policies', 'Client portal assistant — clients get instant answers from your product docs', 'Compliance Q&A — precise answers from your compliance documents, with source citations', 'Technical support — AI diagnoses issues from your knowledge base'])}<br><br>${b('How we build it:')}<br>${pill('Document Ingestion')} ${pill('FAISS + BM25 Hybrid Search')} ${pill('Cross-Encoder Reranking')} ${pill('G1–G5 Guardrails')}<br><br>${b('Key guarantee:')} Zero hallucinations. Every answer is grounded in your documents and includes source citations.<br><br>${b('Client result:')} ${b('60%')} reduction in internal support queries after deploying a company knowledge assistant.${bookBtn()}`,
    followups: ['🤖 What about AI Agents?', '🛡️ How do you prevent hallucinations?', '⚡ How long does it take to deploy?'],
  },

  // ── AI Automation ────────────────────────────────────────────────────────
  {
    keys: [/automat/i, /manual\s+(process|work|task)/i, /document\s+process/i, /invoice/i, /workflow/i, /repetitive/i],
    reply: () => `${b('AI Automation')} turns your most time-consuming manual tasks into automated workflows — running in milliseconds, without errors.<br><br>${b('What we automate most often:')}<br>${ul(['Invoice & document processing — extract data, validate, push to systems automatically', 'Email classification & routing — AI reads incoming emails, categorises, routes or replies', 'Report generation — daily/weekly reports compiled and sent automatically', 'Data extraction — pull structured data from PDFs, forms, spreadsheets at scale', 'Proposal generation — client brief in, full proposal out in 90 seconds'])}<br><br>${b('Client result:')} Proposal creation time reduced from ${b('6 hours to 35 minutes')} using AI generation + RAG pulling relevant case studies automatically.<br><br>Most automation projects deliver full ROI within ${b('30–60 days')} of deployment.${bookBtn()}`,
    followups: ['📊 What results can I expect?', '⚡ How fast can you build this?', '💰 What does automation cost?'],
  },

  // ── Pricing / Cost ───────────────────────────────────────────────────────
  {
    keys: [/pric/i, /cost/i, /how\s+much/i, /fee/i, /budget/i, /invest/i, /charge/i, /rate/i, /quote/i],
    reply: () => `Every engagement is scoped to the business problem — we don't publish fixed prices because no two automation challenges are identical.<br><br>${b('What determines the price:')}<br>${ul(['Complexity of the AI solution (agent vs. RAG vs. full pipeline)', 'Volume of processes to automate', 'Number of integrations (CRM, ERP, Slack, email, etc.)', 'Ongoing support & maintenance requirements'])}<br><br>${b('What we can say:')}<br>${ul(['AI Audit & Roadmap: typically a flat-fee engagement — fast, focused, high-value', 'Most automation projects pay back full cost within 30–60 days', 'Ongoing agent hosting is a low monthly retainer', 'We\'ll give you a detailed estimate on our discovery call — free, no obligation'])}<br><br>The fastest way to get a number: ${b('book a free 30-minute call')}. We\'ll scope it on the call.${bookBtn()}`,
    followups: ['📅 Book a free consultation', '⚡ How fast can you deliver?', '🎯 What ROI can I expect?'],
  },

  // ── ROI / Results ─────────────────────────────────────────────────────────
  {
    keys: [/roi/i, /result/i, /outcome/i, /benefit/i, /impact/i, /return/i, /value/i, /what\s+do\s+i\s+get/i, /worth\s+it/i],
    reply: () => `${b('Real client outcomes')} from AI with Rav deployments:<br><br>${ul(['90% reduction in proposal creation time (6 hours → 35 minutes)', '80% of lead qualification automated — sales team only handles hot leads', '60% reduction in internal support queries with knowledge AI', '95% faster document processing, near-zero errors', '3× faster client onboarding using AI knowledge assistant', '24/7 customer & operations coverage — zero additional headcount'])}<br><br>${b('How we measure ROI:')}<br>${ul(['Time saved × hourly cost = direct cost savings', 'Error reduction → downstream cost avoidance', 'Speed improvement → revenue acceleration', 'Capacity freed → growth without hiring'])}<br><br>On our free consultation call we\'ll model the ROI specific to your processes before you commit to anything.${bookBtn()}`,
    followups: ['📅 Book a free consultation', '⚡ How fast can I see results?', '🎯 Which solution delivers fastest ROI?'],
  },

  // ── Timeline / How fast ───────────────────────────────────────────────────
  {
    keys: [/how\s+(fast|long|quickly|soon)/i, /timeline/i, /delivery/i, /when\s+can\s+you/i, /time\s+to\s+deploy/i, /turnaround/i],
    reply: () => `${b('Typical delivery timelines:')}<br><br>${ul(['AI Audit & Roadmap — 1 week', 'AI Automation (single workflow) — 2–3 weeks', 'AI Agent deployment — 3–4 weeks', 'RAG System (knowledge assistant) — 3–5 weeks', 'Full AI Transformation programme — 8–16 weeks'])}<br><br>We move fast because we use proven architecture patterns rather than building everything from scratch. Most clients see ${b('first results within 2 weeks')} of project start.<br><br>${b('What speeds things up:')}<br>${ul(['Clear problem definition (we help with this on discovery call)', 'Access to your documents / data for RAG projects', 'API credentials for your existing systems'])}<br><br>The fastest path is to ${b('book a free call')} — we can often scope and start within the same week.${bookBtn()}`,
    followups: ['📅 Book a free consultation', '💰 What does this cost?', '📊 What results can I expect?'],
  },

  // ── Team / Who we are ─────────────────────────────────────────────────────
  {
    keys: [/who\s+(are\s+you|is\s+behind|built\s+this|is\s+rav|is\s+chandan)/i, /team\b/i, /founder/i, /chandan/i, /rav\b/i],
    reply: () => `${b('AI with Rav')} was founded by two people who complement each other completely:<br><br>${b('Chandan Kumar (Rav) — Founder & AI Engineer')}<br>Senior AI Engineer with 4+ years building production LLM systems. Has deployed LangGraph multi-agent systems, Hybrid RAG (FAISS + BM25 + reranking), FastAPI backends, and G1–G5 guardrail frameworks across multiple enterprise projects.<br><br>${b('Co-Founder — Head of Operations')}<br>Leads HR, client management, and business operations. Ensures every engagement runs smoothly from discovery to delivery — the bridge between business needs and technical solutions.<br><br>${b('Together:')} Technical depth to build anything + Business expertise to make it work inside your organisation.${link('💼 Chandan on LinkedIn', 'https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/')} ${link('💻 GitHub', 'https://github.com/RavSinghChandan')}`,
    followups: ['🎯 What AI systems have you built?', '📅 Book a free consultation', '💰 What do your services cost?'],
  },

  // ── Process / How it works ────────────────────────────────────────────────
  {
    keys: [/how\s+does?\s+it\s+work/i, /process/i, /what\s+happens\s+(next|after)/i, /steps?\b/i, /get\s+started/i, /start\s+(working|with\s+you)/i],
    reply: () => `${b('How we work:')} simple, fast, and low-risk.<br><br><b>Step 1 — Free Discovery Call (30 min)</b><br>We learn about your business, current processes, and where AI can have the most impact. No cost. No obligation. You get a clear diagnosis.<br><br><b>Step 2 — Scoping & Proposal (48h)</b><br>We send you a detailed scope: what we'll build, timeline, cost, and expected ROI.<br><br><b>Step 3 — Build & Deploy (2–8 weeks)</b><br>We build the AI solution, test it against your data, and deploy it into your environment. We work alongside your team — not in a black box.<br><br><b>Step 4 — Handover & Support</b><br>We train your team, document everything, and provide ongoing support. You own the system.<br><br>${b('Our promise:')} If we don't think AI can help your specific situation, we\'ll tell you on the discovery call — before you spend anything.${bookBtn()}`,
    followups: ['📅 Book a free consultation', '💰 What does it cost?', '⚡ How fast can you deliver?'],
  },

  // ── Tech stack ────────────────────────────────────────────────────────────
  {
    keys: [/tech\s+stack/i, /technology/i, /langgraph/i, /langchain/i, /faiss/i, /fastapi/i, /openai/i, /claude/i, /llm/i, /built\s+with/i],
    reply: () => `${b('Technology we use:')} always the right tool for the job, never hype-driven.<br><br>${b('AI Orchestration:')}<br>${pill('LangGraph')} ${pill('LangChain')} ${pill('ReAct Agents')}<br><br>${b('Retrieval & Search:')}<br>${pill('FAISS')} ${pill('BM25')} ${pill('HyDE')} ${pill('CRAG')} ${pill('Cross-Encoder Reranking')}<br><br>${b('LLM Providers:')}<br>${pill('Claude API')} ${pill('OpenAI GPT-4')} ${pill('DeepSeek')} ${pill('Gemini')} ${pill('Ollama (on-prem)')}<br><br>${b('Backend:')}<br>${pill('FastAPI')} ${pill('Python')} ${pill('SQLite WAL')} ${pill('Redis Cache')} ${pill('Kafka')}<br><br>${b('Frontend:')}<br>${pill('Angular 21')} ${pill('TypeScript')} ${pill('SSE Streaming')}<br><br>${b('Guardrails:')} G1 Rate Limiting · G2 Injection Detection · G3 PII Filter · G4 Faithfulness Gate · G5 Output Validation<br><br>We don't lock you into any single provider — if you need on-premise LLMs, we use Ollama.${bookBtn()}`,
    followups: ['🛡️ How do you prevent hallucinations?', '🔒 Is my data safe?', '📅 Book a free consultation'],
  },

  // ── Guardrails / Hallucinations ───────────────────────────────────────────
  {
    keys: [/hallucin/i, /guardrail/i, /accuracy/i, /reliable/i, /trustworthy/i, /safe\s+ai/i, /wrong\s+answer/i, /ai\s+(safety|risk)/i],
    reply: () => `${b('Zero tolerance for AI hallucinations')} — every system we build has G1–G5 guardrails baked in:<br><br>${ul(['G1 Rate Limiting — prevent abuse, ensure availability', 'G2 Injection Detection — block prompt injection attacks before they reach the LLM', 'G3 PII Filter — personal data is stripped before LLM processing', 'G4 Faithfulness Gate — AI answers are validated against source documents; unfounded claims are blocked', 'G5 Output Validation — structured outputs are schema-validated before reaching the user'])}<br><br>For RAG systems, we use a ${b('RAGless SQL approach')} where possible — critical data (like commands, prices, procedures) is stored in SQL and returned verbatim, never generated by the LLM.<br><br>${b('Result:')} Clients running our systems report zero hallucination incidents in production. That's the standard we hold ourselves to.${bookBtn()}`,
    followups: ['🗄️ Tell me more about RAG systems', '🔒 Is my data safe with you?', '📅 Book a free consultation'],
  },

  // ── Data privacy / Security ────────────────────────────────────────────────
  {
    keys: [/data\s+(safe|security|privacy|protection)/i, /confidential/i, /privacy/i, /gdpr/i, /pii\b/i, /where\s+is\s+my\s+data/i, /data\s+leak/i],
    reply: () => `${b('Data privacy is a first principle')}, not an afterthought:<br><br>${ul(['PII is stripped before any data reaches an LLM (G3 guardrail)', 'You can choose on-premise LLMs (Ollama) — your data never leaves your infrastructure', 'For cloud LLMs, we use API-level data processing agreements with providers', 'RAG documents are embedded and stored in your own vector database, not shared', 'We don\'t store your company data — it lives in your environment', 'All API keys and credentials are environment-variable managed, never hardcoded'])}<br><br>${b('GDPR compliance:')} Our RAG pipelines include PII detection and redaction by default for European clients.<br><br>If data sovereignty is critical, we build fully on-premise with open-source LLMs — same quality, zero cloud dependency.${bookBtn()}`,
    followups: ['🛡️ How do guardrails work?', '📅 Book a free consultation', '💰 What does on-premise cost more?'],
  },

  // ── Consultation / Contact ────────────────────────────────────────────────
  {
    keys: [/book\s+(a\s+)?(call|consultation|meeting|demo|session)/i, /contact/i, /reach\s+out/i, /talk\s+to\s+(you|someone)/i, /get\s+in\s+touch/i, /schedule/i, /free\s+consult/i],
    reply: () => `Great! Let's talk. Here's how to reach us:<br><br>${b('Option 1 — Fill in the consultation form:')} Scroll down to the ${b('Contact section')} on this page. Tell us your biggest AI challenge and we'll respond within 4 business hours.<br><br>${b('Option 2 — Email directly:')}<br>${link('📧 ravchandan15@gmail.com', 'mailto:ravchandan15@gmail.com')}<br><br>${b('Option 3 — Connect on LinkedIn:')}<br>${link('💼 Chandan Kumar on LinkedIn', 'https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/')}<br><br>${b('What happens on the call:')}<br>${ul(['We map your current processes (30 min)', 'Identify your top 3 AI opportunities', 'Give you a rough ROI estimate on the spot', 'Scope what a solution would look like'])}<br><br>No sales pitch. No commitment. Just a clear diagnosis of where AI can help your business.`,
    followups: ['💰 What does it cost?', '⚡ How fast can you start?', '🎯 What ROI can I expect?'],
  },

  // ── Industries ────────────────────────────────────────────────────────────
  {
    keys: [/industr/i, /sector/i, /do\s+you\s+work\s+with/i, /startup/i, /enterprise/i, /sme/i, /small\s+business/i, /what\s+type\s+of\s+company/i],
    reply: () => `We work with businesses of all sizes where AI can create measurable ROI:<br><br>${b('Industries we\'ve worked in:')}<br>${pill('Professional Services')} ${pill('Recruitment & HR')} ${pill('Financial Services')} ${pill('Healthcare Admin')} ${pill('E-commerce')} ${pill('SaaS & Tech')} ${pill('Aviation & Logistics')} ${pill('Consulting Firms')}<br><br>${b('Ideal client profile:')}<br>${ul(['10–500 person teams with manual bottlenecks', 'Businesses processing high volumes of documents, emails, or customer queries', 'Companies where repetitive tasks are burning expensive human time', 'Teams that have tried AI tools but not achieved systematic results'])}<br><br>${b('Not a fit if:')} You're looking for a one-size-fits-all SaaS tool rather than a solution built for your specific processes.<br><br>If you're not sure whether we're right for you, ${b('book a free call')} — we'll tell you honestly.${bookBtn()}`,
    followups: ['📅 Book a free consultation', '🎯 What problems do you solve best?', '💰 Pricing?'],
  },

  // ── Comparison / Competitors ──────────────────────────────────────────────
  {
    keys: [/vs\b/i, /better\s+than/i, /compar/i, /alternative/i, /different\s+from/i, /why\s+(choose|you|ai\s+with\s+rav)/i],
    reply: () => `${b('Why AI with Rav vs. other options:')}<br><br>${b('vs. Big consulting firms (Accenture, Deloitte)')}<br>We're 10× faster and a fraction of the cost. No 6-month strategy decks — we deploy and measure within weeks.<br><br>${b('vs. Off-the-shelf AI SaaS tools')}<br>Generic tools give generic results. We build to your exact processes, data, and integrations.<br><br>${b('vs. Freelance AI developers')}<br>We deliver a complete system — not just code. Architecture, deployment, guardrails, training, and ongoing support are all included.<br><br>${b('What makes us different:')}<br>${ul(['Production-proven stack: LangGraph, Hybrid RAG, G1–G5 guardrails — built in real enterprise environments', 'Business + technical: we understand your problem before we write a line of code', 'We measure in outcomes, not deliverables: 90% time saved beats "AI system delivered"', 'Fast: most clients see results in 2–4 weeks, not quarters'])}<br><br>If you want proof, ask about our specific client outcomes.${bookBtn()}`,
    followups: ['📊 What results have you delivered?', '📅 Book a free consultation', '💰 What does it cost?'],
  },

  // ── Fallback ──────────────────────────────────────────────────────────────
];

const GUARDRAIL_REPLY = (reason: string) =>
  `I'm here to help with questions about ${b('AI consulting, AI agents, RAG systems, and business automation')}.<br><br>I can't help with: ${reason}.<br><br>Got a question about how AI can grow your business? Ask away! Or ${link('📅 book a free consultation', '#contact')}.`;

@Injectable({ providedIn: 'root' })
export class ChatService {

  normalize(q: string): string {
    return q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  getTopic(q: string): string {
    const n = this.normalize(q);
    for (const intent of INTENTS) {
      if (intent.keys.some(k => k.test(n))) return intent.keys[0].source.slice(0, 30);
    }
    return n.slice(0, 40);
  }

  match(raw: string): string {
    const q = raw.trim();
    const n = this.normalize(q);

    // G2 injection
    if (GUARDS.injection.test(q)) return GUARDRAIL_REPLY('prompt injection attempts');
    // G3 PII
    if (GUARDS.pii.test(q)) return GUARDRAIL_REPLY('personal identification numbers or sensitive data');
    // G4 toxic
    if (GUARDS.toxic.test(q)) return GUARDRAIL_REPLY('harmful or toxic content');
    // G5 off-topic
    if (GUARDS.offTopic.test(n)) return GUARDRAIL_REPLY('off-topic queries unrelated to AI consulting or business automation');

    for (const intent of INTENTS) {
      if (intent.keys.some(k => k.test(n) || k.test(q))) {
        return intent.reply();
      }
    }

    // Contextual fallback — acknowledge the question and bridge to the offering
    return `Thanks for your question! 🤖 I want to make sure I give you the most useful answer about how AI with Rav can help your business.<br><br>I specialise in answering questions about:<br>${ul(['Our AI services and solutions', 'How AI can automate your business processes', 'ROI and results from AI implementation', 'How to get started with AI consulting', 'Our team and tech approach'])}<br>Could you rephrase or ask about one of those areas? Or if you'd prefer to speak directly with Chandan, ${link('📅 book a free 30-minute call', '#contact')} — no strings attached.`;
  }

  followups(raw: string): string[] {
    const n = this.normalize(raw);
    for (const intent of INTENTS) {
      if (intent.keys.some(k => k.test(n) || k.test(raw))) {
        return intent.followups ?? [];
      }
    }
    return ['🤖 What AI services do you offer?', '📅 Book a free consultation', '💰 How much does it cost?'];
  }
}
