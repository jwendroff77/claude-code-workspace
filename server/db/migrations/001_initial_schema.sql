-- 1Cloud Sales Platform Schema
-- Database: cloudco3_portal (existing DB, new tables only)

CREATE TABLE IF NOT EXISTS agents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  title VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  persona_voice TEXT,
  smtp_host VARCHAR(255),
  smtp_port INT DEFAULT 465,
  smtp_user VARCHAR(255),
  smtp_pass_encrypted TEXT,
  imap_host VARCHAR(255),
  imap_port INT DEFAULT 993,
  imap_user VARCHAR(255),
  imap_pass_encrypted TEXT,
  daily_send_limit INT DEFAULT 50,
  send_window_start TIME DEFAULT '08:00:00',
  send_window_end TIME DEFAULT '17:00:00',
  send_days VARCHAR(20) DEFAULT 'Mon-Fri',
  queue_threshold INT DEFAULT 100,
  max_daily_pull INT DEFAULT 200,
  apollo_query_json JSON,
  status ENUM('active', 'paused') DEFAULT 'active',
  role ENUM('closer', 'outbound', 'manual') DEFAULT 'outbound',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prospects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  title VARCHAR(200),
  company VARCHAR(200),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  linkedin_url VARCHAR(500),
  company_size VARCHAR(50),
  industry VARCHAR(150),
  city VARCHAR(100),
  state VARCHAR(50),
  apollo_id VARCHAR(100),
  assigned_agent_id INT,
  status ENUM('pending_scrub', 'in_sequence', 'replied', 'engaged', 'booked', 'handed_off', 'disqualified', 'unsubscribed', 'scrubbed') DEFAULT 'in_sequence',
  list_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_assigned_agent (assigned_agent_id),
  INDEX idx_status (status),
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sequences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status ENUM('active', 'draft', 'archived') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sequence_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sequence_id INT NOT NULL,
  step_number INT NOT NULL,
  delay_days INT NOT NULL DEFAULT 1,
  subject_line VARCHAR(500),
  body_html TEXT,
  body_text TEXT,
  open_rate DECIMAL(5,2) DEFAULT 0,
  reply_rate DECIMAL(5,2) DEFAULT 0,
  positive_reply_rate DECIMAL(5,2) DEFAULT 0,
  ai_flag ENUM('good', 'warning', 'alert') DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sequence (sequence_id),
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sequence_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sequence_id INT NOT NULL,
  agent_id INT NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_seq_agent (sequence_id, agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prospect_sequence_enrollment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prospect_id INT NOT NULL,
  sequence_id INT NOT NULL,
  agent_id INT NOT NULL,
  current_step INT DEFAULT 1,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('active', 'paused', 'completed', 'cancelled') DEFAULT 'active',
  paused_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  INDEX idx_prospect (prospect_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sent_emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prospect_id INT NOT NULL,
  agent_id INT NOT NULL,
  sequence_step_id INT,
  subject VARCHAR(500),
  body TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  opened_at TIMESTAMP NULL,
  clicked_at TIMESTAMP NULL,
  FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (sequence_step_id) REFERENCES sequence_steps(id) ON DELETE SET NULL,
  INDEX idx_agent_sent (agent_id, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS received_emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prospect_id INT,
  agent_id INT NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  body TEXT,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sentiment ENUM('positive', 'neutral', 'negative') DEFAULT 'neutral',
  actioned TINYINT(1) DEFAULT 0,
  actioned_at TIMESTAMP NULL,
  FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  INDEX idx_agent_received (agent_id, received_at),
  INDEX idx_actioned (actioned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exclusion_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255),
  company VARCHAR(200),
  reason VARCHAR(255),
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS apollo_pulls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id INT NOT NULL,
  query_json JSON,
  prospects_pulled INT DEFAULT 0,
  credits_used INT DEFAULT 0,
  pulled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coaching_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sequence_step_id INT NOT NULL,
  note TEXT NOT NULL,
  added_by VARCHAR(100) DEFAULT 'Jonathan',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sequence_step_id) REFERENCES sequence_steps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pipeline_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prospect_id INT NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  agent_id INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  INDEX idx_prospect_events (prospect_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  source VARCHAR(100) DEFAULT 'apollo',
  prospect_count INT DEFAULT 0,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
