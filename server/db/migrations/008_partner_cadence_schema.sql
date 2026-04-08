-- 008_partner_cadence_schema.sql
-- Partner Cadence module — completely separate from existing sequences
-- Supports AI agent + partner (e.g. Megan + Jared) collaborative outreach

CREATE TABLE IF NOT EXISTS partner_sequences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  agent_id INT NOT NULL,
  partner_agent_id INT NOT NULL,
  status ENUM('active', 'draft', 'archived') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agent (agent_id),
  INDEX idx_partner (partner_agent_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (partner_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS partner_sequence_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sequence_id INT NOT NULL,
  step_number INT NOT NULL,
  delay_days INT NOT NULL DEFAULT 0,
  step_type ENUM('agent_send_cc', 'partner_reply', 'agent_followup') NOT NULL,
  subject_line VARCHAR(500),
  body_html TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sequence (sequence_id),
  FOREIGN KEY (sequence_id) REFERENCES partner_sequences(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partner_enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prospect_id INT NOT NULL,
  sequence_id INT NOT NULL,
  agent_id INT NOT NULL,
  partner_agent_id INT NOT NULL,
  current_step INT DEFAULT 1,
  status ENUM('active', 'waiting_partner', 'paused', 'completed', 'cancelled') DEFAULT 'active',
  conversation_id VARCHAR(500),
  last_message_id VARCHAR(500),
  partner_replied_at TIMESTAMP NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prospect (prospect_id),
  INDEX idx_agent (agent_id),
  INDEX idx_partner (partner_agent_id),
  INDEX idx_status (status),
  FOREIGN KEY (prospect_id) REFERENCES prospects(id),
  FOREIGN KEY (sequence_id) REFERENCES partner_sequences(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (partner_agent_id) REFERENCES agents(id)
);
