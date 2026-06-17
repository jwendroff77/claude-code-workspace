import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/connection.js';

let client = null;

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!client || !key) {
    if (!key) console.error('[AI] WARNING: ANTHROPIC_API_KEY is not set in environment');
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

const BRAND_VOICE = `You are writing for 1Cloud Communications, a telecom and technology advisory firm.
Voice principles:
- Direct and confident — short declarative sentences
- Business outcome language — no technical telecom jargon
- Candor as a trust signal — say what competitors won't
- Reference Jonathan Wendroff's 35+ years of carrier-side executive experience (Comcast Business, Level 3, AT&T) as credibility
- The single goal: earn a 20-minute conversation
- Never pitch products — earn curiosity
- CTA: some version of "would a 20-minute conversation make sense?"
- Tagline: "One Conversation Changes Everything"

Target ICP: CIOs, CFOs, IT Directors, VPs of Infrastructure at healthcare systems, financial institutions, multi-location enterprises spending $10K+/month on telecom.`;

// Generate a rewrite suggestion for a sequence step
export async function generateRewrite({ step, agent, coachingNotes }) {
  const anthropic = getClient();

  const notesContext = coachingNotes.length > 0
    ? `\n\nCoaching notes from Jonathan:\n${coachingNotes.map(n => `- ${n.note}`).join('\n')}`
    : '';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `${BRAND_VOICE}\n\nYou are writing as ${agent.name}, ${agent.title}.\nPersona: ${agent.persona_voice}${notesContext}`,
    messages: [
      {
        role: 'user',
        content: `Rewrite this underperforming email step (Step ${step.step_number}, current reply rate: ${step.reply_rate}%).

Subject: ${step.subject_line}

Body:
${step.body_text || step.body_html}

Generate an improved version that maintains the agent's voice while improving engagement. Return JSON with "subject" and "body" fields.`,
      },
    ],
  });

  return message.content[0].text;
}

// Generate a personalized opening line for a prospect (Step 1 only)
// Retries up to 5 times on Anthropic overload/rate-limit errors with exponential backoff
// If prospect.signal_intel_trigger is set, the opener references the actual news event
export async function generatePersonalizedOpener({ prospect, agent }) {
  const anthropic = getClient();

  // Detect Signal Intel trigger context
  let signalContext = null;
  // Check dedicated columns first (new format)
  if (prospect.signal_trigger_type && prospect.signal_headline) {
    signalContext = { triggerType: prospect.signal_trigger_type, headline: prospect.signal_headline };
  }
  // Fall back to parsing source field (old format)
  else if (prospect.source && prospect.source.includes('SIGNAL INTEL')) {
    const triggerMatch = prospect.source.match(/Trigger:\s*([^|]+)\s*\|\s*([^|]+)/);
    if (triggerMatch) {
      signalContext = { triggerType: triggerMatch[1].trim(), headline: triggerMatch[2].trim() };
    }
  }

  let systemPrompt;
  let userPrompt;

  if (signalContext) {
    // SIGNAL INTEL VERSION - reference the actual news event
    systemPrompt = `${BRAND_VOICE}

You are writing as ${agent.name}, ${agent.title}.
Persona: ${agent.persona_voice || 'Professional and direct.'}

STRICT RULES:
- Write exactly ONE short sentence - 10 to 15 words max.  Be brief.
- Reference the news event quickly - do NOT repeat the full headline
- Never use em dashes - use single dashes instead
- Do not include a greeting - that's handled separately
- Do not include a signature or CTA - just the hook
- Examples of the RIGHT length:
  - "Saw the Vivaldi acquisition - merging networks is where costs hide."
  - "Congrats on the new Phoenix facility - new sites mean new circuits."
  - "Read about your HQ move - great time to renegotiate connectivity."`;

    userPrompt = `Write a personalized opening line for this prospect that references the news event:

Prospect: ${prospect.first_name} ${prospect.last_name}, ${prospect.title || ''} at ${prospect.company || ''}
Industry: ${prospect.industry || 'Unknown'}
Location: ${prospect.city || ''}${prospect.city && prospect.state ? ', ' : ''}${prospect.state || ''}

NEWS EVENT (reference this naturally):
Type: ${signalContext.triggerType}
Headline: ${signalContext.headline}

Return ONLY the opening line text, nothing else.`;
  } else {
    // STANDARD COLD VERSION
    systemPrompt = `${BRAND_VOICE}

You are writing as ${agent.name}, ${agent.title}.
Persona: ${agent.persona_voice || 'Professional and direct.'}

STRICT RULES:
- Write exactly ONE short sentence - 10 to 20 words max
- Reference the prospect's specific company name or industry in a natural way
- Never use em dashes - use single dashes instead
- Do not include a greeting like "Hi {{firstName}}" - that's handled separately
- Do not include a signature or CTA - just the hook
- NO generic lines like "I noticed your company" or "Managing complex communications"
- Think like a real SDR who googled the company for 30 seconds and found one interesting thing
- Examples of good openers: "Falcon Holdings runs 12 properties - that usually means 12 different telecom contracts."  or "Saw PostcardMania is scaling direct mail nationally - telecom costs tend to spike with that kind of growth."`;

    userPrompt = `Write a personalized opening line for this prospect:

Name: ${prospect.first_name} ${prospect.last_name}
Title: ${prospect.title || 'Unknown'}
Company: ${prospect.company || 'Unknown'}
Industry: ${prospect.industry || 'Unknown'}
Company Size: ${prospect.company_size || 'Unknown'}
City/State: ${prospect.city || ''}${prospect.city && prospect.state ? ', ' : ''}${prospect.state || ''}

Return ONLY the opening line text, nothing else.`;
  }

  const MAX_RETRIES = 5;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      return message.content[0].text.trim();
    } catch (err) {
      lastError = err;
      const isRetryable =
        err?.status === 529 || // overloaded
        err?.status === 429 || // rate limit
        err?.status === 500 || // server error
        err?.status === 502 || // bad gateway
        err?.status === 503 || // service unavailable
        err?.status === 504;   // gateway timeout

      if (!isRetryable) throw err;

      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 5s, 15s, 30s, 60s, 120s
        const backoffSec = [5, 15, 30, 60, 120][attempt];
        console.log(`[AI Opener] Anthropic ${err.status} on attempt ${attempt + 1}, retrying in ${backoffSec}s...`);
        await new Promise(r => setTimeout(r, backoffSec * 1000));
      }
    }
  }

  // All retries exhausted — throw so the caller knows (so we can halt sending instead of sending without opener)
  throw new Error(`AI opener failed after ${MAX_RETRIES} retries: ${lastError?.message || 'unknown'}`);
}

// Generate an AI draft reply for a prospect who replied
export async function generateReplyDraft({ prospect, agent, incomingEmail, thread }) {
  const anthropic = getClient();

  // Build thread context from last 3 sent emails + the incoming reply
  let threadContext = '';
  if (thread && thread.length > 0) {
    const recent = thread.slice(-4);
    threadContext = recent.map(msg => {
      const dir = msg.direction === 'sent' ? `${agent.name} sent` : `${prospect.first_name} replied`;
      const body = (msg.body_text || msg.body_html || msg.body || '').replace(/<[^>]*>/g, '').slice(0, 500);
      return `[${dir}]: ${body}`;
    }).join('\n\n');
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: `${BRAND_VOICE}

You are drafting a reply as ${agent.name}, ${agent.title}.
Persona: ${agent.persona_voice || 'Professional and direct.'}

STRICT RULES:
- 5-7 sentences max.  Short and punchy.
- Never use em dashes - use single dashes instead
- Use double spaces after sentences
- The goal: earn a 20-minute conversation
- If they asked a question, answer it briefly then pivot to booking a call
- If they expressed interest, acknowledge and suggest a specific time window
- If they're neutral/vague, be direct about next steps
- Do NOT include a subject line.  Do NOT include a greeting - just the body text.
- Do NOT include a signature block - that's added automatically
- Write in HTML with <p> tags.  Use &nbsp; after periods for double spacing.`,
    messages: [
      {
        role: 'user',
        content: `Draft a reply for this conversation:

Prospect: ${prospect.first_name} ${prospect.last_name}, ${prospect.title || ''} at ${prospect.company || ''}
Industry: ${prospect.industry || 'Unknown'}

Conversation thread:
${threadContext}

Their latest reply:
${incomingEmail}

Write the reply body in HTML. Return ONLY the HTML, nothing else.`,
      },
    ],
  });

  return message.content[0].text.trim();
}

// Smart reply classification - expanded beyond basic sentiment
export async function classifyReply(text) {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Classify this email reply into exactly ONE category and return JSON.

Categories:
- positive: interested in a call, wants to learn more, agrees to meeting
- neutral: vague response, general acknowledgment
- negative: not interested, unsubscribe request, do not contact
- ooo: out of office auto-reply, vacation notice
- referral: redirects to a colleague ("talk to my colleague", "CC'ing our IT director")
- question: asks a specific question about services/pricing
- meeting_request: explicitly requests or confirms a meeting/call time
- not_now: interested but bad timing ("reach out next quarter", "not in budget cycle")

Reply text:
${text}

Return JSON only: {"classification": "category", "confidence": 0.0-1.0, "action_suggestion": "brief recommended action"}`,
      },
    ],
  });

  try {
    const raw = message.content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const valid = ['positive', 'neutral', 'negative', 'ooo', 'referral', 'question', 'meeting_request', 'not_now'];
      if (valid.includes(parsed.classification)) {
        return parsed;
      }
    }
  } catch (e) {
    // Parse failed
  }

  return { classification: 'neutral', confidence: 0.5, action_suggestion: 'Review manually' };
}

// Backwards-compatible wrapper
export async function analyzeSentiment(text) {
  const result = await classifyReply(text);
  return result.classification;
}

// Generate a full sequence with AI
export async function generateSequence({ vertical, agent, numSteps }) {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: `${BRAND_VOICE}

You are writing a ${numSteps}-step cold email sequence as ${agent.name}, ${agent.title}.
Persona: ${agent.persona_voice || 'Professional and direct.'}

STRICT RULES:
- Each email: 5-7 sentences max.  Short and punchy.
- Never use em dashes - use single dashes instead
- Use double spaces after sentences (in HTML use &nbsp; after periods)
- Step 1: personalized opener + value prop + soft CTA
- Middle steps: new angle each time, reference prior email briefly
- Final step: breakup email, last chance to connect
- Timing: Day 0, Day 3, Day 7, Day 14, Day 21 (adjust for ${numSteps} steps)
- Subject lines: short, lowercase feel, no spam words
- Write body in HTML with <p> tags`,
    messages: [
      {
        role: 'user',
        content: `Generate a ${numSteps}-step cold email sequence targeting: ${vertical}

Return JSON array:
[
  {
    "step_number": 1,
    "delay_days": 0,
    "subject_line": "subject here",
    "body_html": "<p>HTML body here</p>"
  },
  ...
]

Return ONLY the JSON array, nothing else.`,
      },
    ],
  });

  try {
    const raw = message.content[0].text.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Parse failed
  }

  return null;
}
