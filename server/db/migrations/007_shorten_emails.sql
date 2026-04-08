-- 007_shorten_emails.sql
-- Rewrite all sequence steps to be short and punchy
-- Target: ~5-7 sentences max, matching Kate's concise style
-- No em dashes, double spaces after sentences

-- ================================================
-- MEGAN BARRETT (SDR - Warm, friendly, brief)
-- ================================================

UPDATE sequence_steps SET body_html = '<p>Hi {{firstName}},</p><p>Quick question - when was the last time someone benchmarked {{company}}''s telecom costs against the broader market?</p><p>We compare pricing across 400+ providers instantly.&nbsp; Most IT leaders we work with are overpaying by 20-40% without realizing it.</p><p>Worth a 10-minute chat to see where {{company}} stands?</p><p>Megan Barrett<br>SDR, 1Cloud Communications</p>'
WHERE id = 1;

UPDATE sequence_steps SET body_html = '<p>Hi {{firstName}},</p><p>Floating this back up.&nbsp; We''ve been helping companies like {{company}} get visibility into what they''re paying vs.&nbsp; what they should be paying for connectivity.</p><p>Our team has 30 years of carrier-side experience.&nbsp; We know where the pricing gaps hide.</p><p>Even a quick benchmark might surface something interesting.&nbsp; Open to a brief call?</p><p>Megan</p>'
WHERE id = 2;

UPDATE sequence_steps SET body_html = '<p>Hi {{firstName}},</p><p>Managing telecom providers never quite makes it to the top of the priority list - until a contract renews and the bill jumps.</p><p>1Cloud manages everything from discovery to post-implementation.&nbsp; If a provider isn''t performing, we move you fast.</p><p>Would it make sense to compare what {{company}} is paying to what''s available?</p><p>Megan</p>'
WHERE id = 3;

UPDATE sequence_steps SET body_html = '<p>Hi {{firstName}},</p><p>Not trying to be a pest - just think this could be valuable.</p><p>We recently helped an IT director save over $4K/month by showing them alternatives they didn''t know existed.&nbsp; Took one call.</p><p>If the timing isn''t right, totally understand.&nbsp; But if you''re curious, I''m here.</p><p>Megan</p>'
WHERE id = 4;

UPDATE sequence_steps SET body_html = '<p>Hi {{firstName}},</p><p>Last note from me.</p><p>If you ever want a no-pressure look at what {{company}} could save on telecom, we price out 400+ providers in minutes and handle everything from there.</p><p>Megan Barrett<br>1Cloud Communications<br>megan@1cloudnow.com</p>'
WHERE id = 5;

-- ================================================
-- LAUREN MITCHELL (Senior AE - Polished, brief)
-- ================================================

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>1Cloud serves as an independent telecom advisor.&nbsp; We benchmark your current environment against 400+ providers to find cost reduction opportunities.</p><p>30 years of carrier-level experience.&nbsp; Full lifecycle management from discovery through implementation.&nbsp; Zero cost for our advisory.</p><p>Would a brief conversation about {{company}}''s telecom landscape make sense?</p><p>Lauren Mitchell<br>Senior Account Executive<br>1Cloud Communications</p>'
WHERE id = 6;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>Following up.&nbsp; Most organizations we work with haven''t had their telecom contracts independently reviewed in years.</p><p>Providers don''t proactively offer better rates - but those rates exist.&nbsp; 80% of the companies we benchmark are overpaying significantly.</p><p>A quick assessment gives you a clear picture of where {{company}} stands.&nbsp; Worth exploring?</p><p>Lauren</p>'
WHERE id = 7;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>More mid-market orgs are consolidating telecom under an independent advisor.&nbsp; Better pricing, single point of accountability, ability to pivot providers when needs change.</p><p>If {{company}} is evaluating any telecom or connectivity decisions soon, having our market data could be valuable.</p><p>Happy to share what we''re seeing.</p><p>Lauren</p>'
WHERE id = 8;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>I''ll be direct.&nbsp; If {{company}} is spending more than $5K/month on connectivity or voice, there is almost certainly an opportunity to reduce that spend.</p><p>One conversation.&nbsp; No commitment.&nbsp; If the timing is off, I respect that completely.</p><p>Lauren</p>'
WHERE id = 9;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>Final note.&nbsp; Should {{company}} ever need an independent telecom assessment or help navigating a renewal, 1Cloud is here.</p><p>We work as an extension of your team - no cost for our advisory.</p><p>Lauren Mitchell<br>1Cloud Communications<br>lauren@1cloudnow.com</p>'
WHERE id = 10;

-- ================================================
-- KATE HARMON (BDR - Already good, minor tweaks)
-- Kate's style IS the target, minimal changes needed
-- ================================================

-- Kate step 1 is already perfect, no change needed
-- Kate step 2 is already perfect, no change needed
-- Kate step 3 is already perfect, no change needed
-- Kate step 4 is already perfect, no change needed
-- Kate step 5 is already perfect, no change needed

-- ================================================
-- SCOTT MERCER (Enterprise AE - Confident, brief)
-- ================================================

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>1Cloud is an independent telecom advisor.&nbsp; We give organizations like {{company}} instant access to competitive pricing across 400+ providers.</p><p>30 years on the carrier side at executive levels.&nbsp; We manage the full lifecycle - discovery through ongoing performance management.&nbsp; If a provider isn''t delivering, we move fast.</p><p>Open to a conversation about how this could benefit {{company}}?</p><p>Scott Mercer<br>Enterprise Account Executive<br>1Cloud Communications</p>'
WHERE id = 16;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>Companies that get the most value from 1Cloud are spending $10K+ monthly on connectivity, managing multiple providers, and would rather focus on strategic initiatives than vendor management.</p><p>If that sounds like {{company}}, the ROI conversation is straightforward.&nbsp; We consistently deliver 20-40% cost reductions.</p><p>Worth 15 minutes?</p><p>Scott</p>'
WHERE id = 17;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>Most organizations renew telecom contracts on autopilot.&nbsp; What was competitive 2-3 years ago often isn''t today, and providers rarely volunteer better rates.</p><p>An independent benchmark costs nothing and takes minimal time.&nbsp; If we find savings, we manage the transition.</p><p>Happy to walk you through how we''d approach this for {{company}}.</p><p>Scott</p>'
WHERE id = 18;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>If {{company}} has telecom contracts renewing in the next 6-12 months, engaging an independent advisor before that window opens is the highest-leverage move.</p><p>Ensures you''re negotiating from market intelligence, not just what your current provider presents.</p><p>Glad to share how we''d approach it.</p><p>Scott</p>'
WHERE id = 19;

UPDATE sequence_steps SET body_html = '<p>{{firstName}},</p><p>Last note.&nbsp; 1Cloud works as an extension of your IT team.&nbsp; Independent advisory, 400+ provider network, full lifecycle management - no cost to you.</p><p>When the timing is right, we''re here.</p><p>Scott Mercer<br>1Cloud Communications<br>scott@1cloudnow.com</p>'
WHERE id = 20;
