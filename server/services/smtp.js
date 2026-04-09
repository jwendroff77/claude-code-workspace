import { sendMail } from './graph.js';
import pool from '../db/connection.js';
import { generateUnsubToken } from '../routes/unsubscribe.js';

// Base URL for unsubscribe links — update this when deployed to production
const UNSUB_BASE_URL = process.env.UNSUB_URL || 'http://localhost:3001/api/unsubscribe';
const TRACKING_BASE_URL = process.env.TRACKING_URL || 'http://localhost:3001/api/track';

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

  // Build CAN-SPAM compliant unsubscribe footer
  const footer = buildUnsubFooter(prospectId, to);
  const textFooter = text ? '\n\n---\n1Cloud Communications | 8530 Eagle Point Blvd, Suite 100, Lake Elmo, MN 55042\nUnsubscribe: ' + (prospectId && to ? `${UNSUB_BASE_URL}/${generateUnsubToken(prospectId, to)}` : '') : '';

  // Log to sent_emails FIRST to get the ID for the tracking pixel
  const [insertResult] = await pool.execute(
    `INSERT INTO sent_emails (prospect_id, agent_id, to_email, sequence_step_id, subject, body, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [prospectId || null, agent.id, to, stepId || null, subject, html || text]
  );

  const sentEmailId = insertResult.insertId;

  // Build open tracking pixel
  const trackingPixel = sentEmailId
    ? `<img src="${TRACKING_BASE_URL}/open/${sentEmailId}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`
    : '';

  // Wrap links for click tracking (skip mailto: and unsubscribe links)
  let htmlTracked = html;
  if (html && sentEmailId) {
    try {
      htmlTracked = html.replace(
        /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
        (match, pre, url, post) => {
          if (url.startsWith('mailto:') || url.includes('/unsubscribe') || url.includes('/track/')) {
            return match; // Don't wrap these
          }
          const encodedUrl = Buffer.from(url).toString('base64url');
          const trackUrl = `${TRACKING_BASE_URL}/click/${sentEmailId}?url=${encodedUrl}`;
          return `<a ${pre}href="${trackUrl}"${post}>`;
        }
      );
    } catch (e) {
      htmlTracked = html; // Fall back to original if parsing fails
    }
  }

  // Assemble: body + tracking pixel + unsub footer
  const htmlFinal = htmlTracked ? htmlTracked + trackingPixel + footer : undefined;
  const textFinal = text ? text + textFooter : undefined;

  // SAFETY NET: never send an email with unfilled merge tags
  if (html && html.includes('{{')) {
    html = html.replace(/\{\{[^}]+\}\}/g, '');
    console.log('[SAFETY] Stripped unfilled merge tags from outbound email to ' + to);
  }

  // Build List-Unsubscribe URL for email headers
  const unsubscribeUrl = prospectId && to ? `${UNSUB_BASE_URL}/${generateUnsubToken(prospectId, to)}` : undefined;

  await sendMail({ fromEmail, to, subject, html: htmlFinal || html, text: textFinal, unsubscribeUrl });

  return { messageId: `graph-${Date.now()}`, sentEmailId, accepted: [to] };
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
