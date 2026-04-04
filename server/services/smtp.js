import nodemailer from 'nodemailer';
import pool from '../db/connection.js';

// Create a transporter for a specific agent
export function createTransport(agent) {
  return nodemailer.createTransport({
    host: agent.smtp_host,
    port: agent.smtp_port || 465,
    secure: agent.smtp_port === 465,
    auth: {
      user: agent.smtp_user,
      pass: agent.smtp_pass_encrypted, // TODO: decrypt in production
    },
  });
}

// Test SMTP connection for an agent
export async function testConnection(agent) {
  const transport = createTransport(agent);
  try {
    await transport.verify();
    return { success: true, message: 'SMTP connection successful' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Send an email as a specific agent
export async function sendEmail({ agent, to, subject, html, text, prospectId, stepId }) {
  const transport = createTransport(agent);

  const info = await transport.sendMail({
    from: `${agent.name} <${agent.email}>`,
    to,
    subject,
    html,
    text,
  });

  // Log to sent_emails table
  await pool.execute(
    `INSERT INTO sent_emails (prospect_id, agent_id, sequence_step_id, subject, body, sent_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [prospectId, agent.id, stepId || null, subject, html || text]
  );

  return info;
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
