-- 010: Platform Features - A/B Testing, Click Tracking, Smart Classification,
--      Intent Scoring, Send Time Optimization, Domain Health, Tasks

-- A/B Testing
CREATE TABLE IF NOT EXISTS ab_tests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sequence_step_id INT NOT NULL,
  name VARCHAR(200),
  status ENUM('active','completed','paused') DEFAULT 'active',
  winner_variant_id INT NULL,
  min_sends INT DEFAULT 50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sequence_step_id) REFERENCES sequence_steps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ab_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ab_test_id INT NOT NULL,
  variant_label CHAR(1) NOT NULL,
  subject_line VARCHAR(500),
  body_html TEXT,
  sends INT DEFAULT 0,
  opens INT DEFAULT 0,
  replies INT DEFAULT 0,
  positive_replies INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ab_test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE sent_emails ADD COLUMN ab_variant_id INT NULL AFTER open_count;

-- Click Tracking
CREATE TABLE IF NOT EXISTS click_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sent_email_id INT NOT NULL,
  prospect_id INT,
  url TEXT NOT NULL,
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sent_email_id) REFERENCES sent_emails(id) ON DELETE CASCADE,
  INDEX idx_sent_email (sent_email_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE sent_emails ADD COLUMN click_count INT DEFAULT 0 AFTER ab_variant_id;

-- Smart Reply Classification (expand sentiment enum)
ALTER TABLE received_emails MODIFY COLUMN sentiment
  ENUM('positive','neutral','negative','ooo','referral','question','meeting_request','not_now') DEFAULT 'neutral';

ALTER TABLE received_emails ADD COLUMN classification_details JSON AFTER ai_draft_reply;

-- Prospect Intent Scoring
ALTER TABLE prospects ADD COLUMN intent_score INT DEFAULT 0 AFTER personalized_opener;
ALTER TABLE prospects ADD COLUMN intent_updated_at TIMESTAMP NULL AFTER intent_score;

-- Send Time Optimization
CREATE TABLE IF NOT EXISTS open_time_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prospect_id INT,
  agent_id INT,
  hour_utc TINYINT,
  day_of_week TINYINT,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent (agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Domain Health
CREATE TABLE IF NOT EXISTS domain_health (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  spf_valid TINYINT DEFAULT 0,
  dkim_valid TINYINT DEFAULT 0,
  dmarc_valid TINYINT DEFAULT 0,
  last_checked TIMESTAMP NULL,
  details JSON,
  UNIQUE KEY uniq_domain (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Multi-Channel Task Queue
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prospect_id INT NOT NULL,
  agent_id INT NOT NULL,
  task_type ENUM('linkedin_connect','linkedin_message','linkedin_view','phone_call','custom') NOT NULL,
  title VARCHAR(300),
  description TEXT,
  due_date DATE,
  status ENUM('pending','completed','skipped') DEFAULT 'pending',
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
  INDEX idx_agent_status (agent_id, status, due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
