-- 009_seed_partner_cadence.sql
-- Seed Megan Barrett + Jared Bader partner cadence
-- 6 steps: Agent sends CC partner, partner replies, agent continues thread

INSERT INTO partner_sequences (name, description, agent_id, partner_agent_id, status) VALUES
('Megan + Jared - Partner Intro', 'Megan sends initial outreach CC''ing Jared (Comcast Business EAE).  Jared replies-all with endorsement.  Megan continues the thread.', 2, 6, 'active');

SET @seq_id = LAST_INSERT_ID();

INSERT INTO partner_sequence_steps (sequence_id, step_number, delay_days, step_type, subject_line, body_html) VALUES

-- Step 1: Day 0 - Megan sends to prospect, CCs Jared
(@seq_id, 1, 0, 'agent_send_cc',
 'Connecting you with {{company}}''s Comcast Business team',
 '<p>Hi {{firstName}},</p><p>I wanted to make a quick introduction.&nbsp; I''m CC''ing my colleague Jared Bader from Comcast Business - he works directly with organizations like {{company}} on connectivity and network solutions.</p><p>At 1Cloud Communications, we benchmark telecom costs across 400+ providers and manage the full lifecycle.&nbsp; Jared and I have been partnering to help companies get better pricing and performance.</p><p>Would it make sense to set up a quick call to see where {{company}} stands?</p><p>Megan Barrett<br>SDR, 1Cloud Communications</p>'),

-- Step 2: Day 2 - Jared replies-all (auto-detected, no template needed)
(@seq_id, 2, 2, 'partner_reply',
 NULL,
 NULL),

-- Step 3: Day 5 - Megan continues over Jared's reply
(@seq_id, 3, 5, 'agent_followup',
 NULL,
 '<p>Hi {{firstName}},</p><p>Following up on Jared''s note below.&nbsp; He''s been great to work with on the Comcast Business side, and together we can give {{company}} a full picture of what''s available.</p><p>We typically find 20-40% savings just by benchmarking current contracts.&nbsp; Takes one call to get started.</p><p>Worth 10 minutes?</p><p>Megan</p>'),

-- Step 4: Day 10 - Megan follow-up
(@seq_id, 4, 10, 'agent_followup',
 NULL,
 '<p>Hi {{firstName}},</p><p>Wanted to float this back up.&nbsp; Between 1Cloud Communications and Comcast Business, we cover the full spectrum - from benchmarking your current spend to delivering enterprise-grade solutions.</p><p>If {{company}} has any contracts renewing in the next 6 months, talking to us before that window could save significant budget.</p><p>Megan</p>'),

-- Step 5: Day 17 - Different angle
(@seq_id, 5, 17, 'agent_followup',
 NULL,
 '<p>Hi {{firstName}},</p><p>One thing IT directors tell us - managing multiple telecom providers is one of those tasks that never makes it to the top of the list until something breaks or a bill jumps.</p><p>That''s where we come in.&nbsp; 1Cloud Communications handles everything from discovery to post-implementation, and Jared can speak directly to what Comcast Business offers for organizations like {{company}}.</p><p>Open to a brief conversation?</p><p>Megan</p>'),

-- Step 6: Day 24 - Breakup
(@seq_id, 6, 24, 'agent_followup',
 NULL,
 '<p>Hi {{firstName}},</p><p>Last note from me on this thread.&nbsp; If the timing isn''t right, completely understand.</p><p>If {{company}} ever needs a telecom benchmark or wants to explore what Comcast Business has available, Jared and I are both here.</p><p>Megan Barrett<br>1Cloud Communications<br>megan@1cloudnow.com</p>');
