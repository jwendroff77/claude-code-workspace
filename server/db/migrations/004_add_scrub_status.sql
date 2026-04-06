-- Add 'pending_scrub' and 'scrubbed' statuses for partner agent account scrub workflow
ALTER TABLE prospects MODIFY COLUMN status
  ENUM('pending_scrub', 'in_sequence', 'replied', 'engaged', 'booked', 'handed_off', 'disqualified', 'unsubscribed', 'scrubbed')
  DEFAULT 'in_sequence';
