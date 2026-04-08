import { sendMail } from './graph.js';
import pool from '../db/connection.js';
import { generateUnsubToken } from '../routes/unsubscribe.js';

// Base URL for unsubscribe links — update this when deployed to production
const UNSUB_BASE_URL = process.env.UNSUB_URL || 'http://localhost:3001/api/unsubscribe';

function buildUnsubFooter(prospectId, email) {
  if (!prospectId || !email) return '';
  const token = generateUnsubToken(prospectId, email);
  const url = `${UNSUB_BASE_URL}/${token}`;
  return `<div style="margin-top:30px;padding-top:15px;border-top:1px solid #e0e0e0;font-size:11px;color:#999;font-family:Arial,sans-serif;">` +
    `<p style="margin:0;">1Cloud Communications &middot; 8530 Eagle Point Blvd, Suite 100, Lake Elmo, MN 55042</p>` +
    `<p style="margin:4px 0 0 0;"><a href="${url}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>` +
    `</div>`;
}

// Send an email as a specific agent via Microsoft Graph API
export async function sendEmail({ agent, to, subject, html, text, prospectId, stepId }) {
  // Use the agent's smtp_user (M365 login) as the from address for Graph API
  const fromEmail = agent.smtp_user || agent.email;

  // Append CAN-SPAM compliant unsubscribe footer
  const footer = buildUnsubFooter(prospectId, to);
  const htmlWithFooter = html ? html + footer : undefined;
  const textWithFooter = text ? text + '\n\n---\n1Cloud Communications | 8530 Eagle Point Blvd, Suite 100, Lake Elmo, MN 55042\nUnsubscribe: ' + (prospectId && to ? `${UNSUB_BASE_URL}/${generateUnsubToken(prospectId, to)}` : '') : undefined;

  await sendMail({ fromEmail, to, subject, html: htmlWithFooter || html, text: textWithFooter || text });

  // Log to sent_emails table
  await pool.execute(
    `INSERT INTO sent_emails (prospect_id, agent_id, to_email, sequence_step_id, subject, body, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [prospectId || null, agent.id, to, stepId || null, subject, html || text]
  );

  return { messageId: `graph-${Date.now()}`, accepted: [to] };
}

// Get today's send count for an agent
export async function getTodaySendCount(agentId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as count FROM sent_emails
     WHERE agent_id = ? AND DATE(sent_at) = CURDATE()`,
    [agentId]
  );
  return rows[0].count;
}
