-- 006_enroll_prospects.sql
-- Approve all 19 prospects, assign evenly to 4 agents, enroll in sequences

-- Assign prospects to agents in round-robin (5-5-5-4 split)
-- Megan (id=2) gets prospects 1-5
-- Lauren (id=3) gets prospects 6-10
-- Kate (id=4) gets prospects 11-15
-- Scott (id=5) gets prospects 16-19

UPDATE prospects SET status = 'in_sequence', assigned_agent_id = 2 WHERE id IN (1,2,3,4,5);
UPDATE prospects SET status = 'in_sequence', assigned_agent_id = 3 WHERE id IN (6,7,8,9,10);
UPDATE prospects SET status = 'in_sequence', assigned_agent_id = 4 WHERE id IN (11,12,13,14,15);
UPDATE prospects SET status = 'in_sequence', assigned_agent_id = 5 WHERE id IN (16,17,18,19);

-- Get sequence IDs for enrollment
SET @megan_seq = (SELECT id FROM sequences WHERE name = 'Megan - Friendly Discovery');
SET @lauren_seq = (SELECT id FROM sequences WHERE name = 'Lauren - Executive Consultant');
SET @kate_seq = (SELECT id FROM sequences WHERE name = 'Kate - Direct Value Prop');
SET @scott_seq = (SELECT id FROM sequences WHERE name = 'Scott - Enterprise Narrative');

-- Enroll each prospect in their agent's sequence
-- current_step=1, status=active, enrolled_at=NOW()
INSERT INTO prospect_sequence_enrollment (prospect_id, sequence_id, agent_id, current_step, status) VALUES
-- Megan's prospects
(1, @megan_seq, 2, 1, 'active'),
(2, @megan_seq, 2, 1, 'active'),
(3, @megan_seq, 2, 1, 'active'),
(4, @megan_seq, 2, 1, 'active'),
(5, @megan_seq, 2, 1, 'active'),
-- Lauren's prospects
(6, @lauren_seq, 3, 1, 'active'),
(7, @lauren_seq, 3, 1, 'active'),
(8, @lauren_seq, 3, 1, 'active'),
(9, @lauren_seq, 3, 1, 'active'),
(10, @lauren_seq, 3, 1, 'active'),
-- Kate's prospects
(11, @kate_seq, 4, 1, 'active'),
(12, @kate_seq, 4, 1, 'active'),
(13, @kate_seq, 4, 1, 'active'),
(14, @kate_seq, 4, 1, 'active'),
(15, @kate_seq, 4, 1, 'active'),
-- Scott's prospects
(16, @scott_seq, 5, 1, 'active'),
(17, @scott_seq, 5, 1, 'active'),
(18, @scott_seq, 5, 1, 'active'),
(19, @scott_seq, 5, 1, 'active');

-- Log pipeline events for the status change
INSERT INTO pipeline_events (prospect_id, old_status, new_status, changed_by, created_at)
SELECT id, 'pending_scrub', 'in_sequence', 'system', NOW() FROM prospects WHERE id BETWEEN 1 AND 19;
