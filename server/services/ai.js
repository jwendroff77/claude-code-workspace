import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/connection.js';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    model: 'claude-sonnet-4-20250514',
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

// Analyze sentiment of a reply
export async function analyzeSentiment(text) {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: `Classify this email reply sentiment as exactly one of: positive, neutral, negative.

Positive = interested in a call, asking questions, wants to learn more
Neutral = vague response, auto-reply, asking to be contacted later
Negative = not interested, unsubscribe request, do not contact

Reply text:
${text}

Respond with only the sentiment word.`,
      },
    ],
  });

  const sentiment = message.content[0].text.trim().toLowerCase();
  return ['positive', 'neutral', 'negative'].includes(sentiment) ? sentiment : 'neutral';
}
