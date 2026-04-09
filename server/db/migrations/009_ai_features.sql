-- 009: AI Features - Personalization, Bounce Detection, Open Tracking, Auto-Reply Drafting

-- AI Personalization: cache generated opener on prospect
ALTER TABLE prospects ADD COLUMN personalized_opener TEXT AFTER industry;

-- Sent emails: track AI opener, delivery status, open count
ALTER TABLE sent_emails ADD COLUMN ai_opener TEXT AFTER body;
ALTER TABLE sent_emails ADD COLUMN status ENUM('sent','bounced','failed') NOT NULL DEFAULT 'sent' AFTER clicked_at;
ALTER TABLE sent_emails ADD COLUMN open_count INT NOT NULL DEFAULT 0 AFTER status;

-- Bounce detection: add bounced to prospect status enum
ALTER TABLE prospects MODIFY COLUMN status ENUM('pending_scrub','in_sequence','replied','engaged','booked','handed_off','disqualified','unsubscribed','scrubbed','bounced') DEFAULT 'in_sequence';

-- AI Auto-Reply Drafting: store AI-generated draft on received emails
ALTER TABLE received_emails ADD COLUMN ai_draft_reply TEXT AFTER actioned_at;
