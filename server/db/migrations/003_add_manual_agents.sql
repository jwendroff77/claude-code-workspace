-- Add 'manual' role type for tracking-only partner agents
ALTER TABLE agents MODIFY COLUMN role ENUM('closer', 'outbound', 'manual') DEFAULT 'outbound';

-- Add partner agents (tracking-only, no automated sending)
INSERT INTO agents (name, title, email, persona_voice, role, status) VALUES
('Jared Bader', 'Enterprise Account Executive — Comcast Business', 'jared_bader@comcast.com',
 'Partner agent. Comcast Business Enterprise Account Executive. Manual outreach only — tracking and visibility purposes. All emails sent manually by Jared.',
 'manual', 'active'),

('Eduard Teisanu', 'Enterprise Account Executive — Comcast Business', 'eduard_teisanu@comcast.com',
 'Partner agent. Comcast Business Enterprise Account Executive. Manual outreach only — tracking and visibility purposes. All emails sent manually by Eduard.',
 'manual', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name);
