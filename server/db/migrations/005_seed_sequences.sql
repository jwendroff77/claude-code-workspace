-- 005_seed_sequences.sql
-- Create 4 unique sequences (one per AI SDR agent) with 5-step cadences
-- 1Cloud Communications outbound prospecting for IT directors
-- Value prop: 400+ providers, full lifecycle management, 30 years carrier experience

-- Create sequences
INSERT INTO sequences (name, description, status) VALUES
('Megan - Friendly Discovery', 'Warm, conversational cold outreach for IT leaders. Leads with curiosity about their current telecom setup.', 'active'),
('Lauren - Executive Consultant', 'Polished, peer-level outreach for senior buyers. Consultative approach focused on business outcomes.', 'active'),
('Kate - Direct Value Prop', 'Sharp, efficient outreach respecting buyer time. Data-driven with compelling stats and quick credibility.', 'active'),
('Scott - Enterprise Narrative', 'Enterprise-focused relationship building. Longer-form narrative about telecom transformation.', 'active');

-- Get sequence IDs
SET @megan_seq = (SELECT id FROM sequences WHERE name = 'Megan - Friendly Discovery');
SET @lauren_seq = (SELECT id FROM sequences WHERE name = 'Lauren - Executive Consultant');
SET @kate_seq = (SELECT id FROM sequences WHERE name = 'Kate - Direct Value Prop');
SET @scott_seq = (SELECT id FROM sequences WHERE name = 'Scott - Enterprise Narrative');

-- ================================================
-- MEGAN BARRETT (SDR - Warm, conversational)
-- ================================================
INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject_line, body_html) VALUES
(@megan_seq, 1, 0,
 'Quick question about {{company}}''s telecom setup',
 '<p>Hi {{firstName}},</p><p>I came across your role at {{company}} and had a quick question -- when was the last time someone benchmarked your telecom and connectivity costs against the broader market?</p><p>I ask because we work with IT leaders like you who are managing complex provider relationships, and most are surprised to learn they''re overpaying by 20-40% without realizing it.</p><p>At 1Cloud, we instantly compare pricing across 400+ providers so you can see exactly where you stand. No long RFP process, no switching headaches -- just clarity.</p><p>Would a quick look at what''s available be useful?</p><p>Best,<br>Megan Barrett<br>SDR, 1Cloud Communications</p>'),

(@megan_seq, 2, 3,
 'Re: Quick question about {{company}}''s telecom setup',
 '<p>Hi {{firstName}},</p><p>Just floating this back up -- I know your inbox is probably wild.</p><p>The reason I reached out is that we''ve been helping companies like {{company}} get real-time visibility into what they''re paying vs. what they should be paying for connectivity, SD-WAN, UCaaS -- all of it.</p><p>Our team has 30 years of carrier-side experience, so we know exactly where the pricing gaps hide.</p><p>Even if you''re happy with your current setup, a quick benchmark might surface something interesting. Worth a 10-minute chat?</p><p>Megan</p>'),

(@megan_seq, 3, 7,
 'This might save {{company}} some budget headaches',
 '<p>Hi {{firstName}},</p><p>One thing I keep hearing from IT directors is that managing telecom providers is one of those tasks that never quite makes it to the top of the priority list -- until a contract renews and the bill jumps.</p><p>That''s exactly where we come in. 1Cloud manages everything from discovery to post-implementation, and if a provider isn''t performing, we can move you to a better option fast.</p><p>Would it make sense to compare what {{company}} is paying to what''s available right now?</p><p>Megan</p>'),

(@megan_seq, 4, 14,
 'One more thought for {{company}}',
 '<p>Hi {{firstName}},</p><p>I promise I''m not trying to be a pest -- just genuinely think this could be valuable for you.</p><p>We recently helped an IT director in a similar role save their company over $4K/month just by showing them alternatives they didn''t know existed. Took one call to get started.</p><p>If the timing isn''t right, totally understand. But if you''re curious, I''m here.</p><p>Megan</p>'),

(@megan_seq, 5, 21,
 'Closing the loop -- {{firstName}}',
 '<p>Hi {{firstName}},</p><p>I''ll keep this short -- this is my last note on this thread.</p><p>If you ever want a no-pressure look at what {{company}} could be saving on telecom and connectivity, our door is always open. We price out 400+ providers in minutes and handle everything from there.</p><p>Wishing you a great rest of your week.</p><p>Megan Barrett<br>1Cloud Communications<br>megan@1cloudnow.com</p>');

-- ================================================
-- LAUREN MITCHELL (Senior AE - Polished, consultative)
-- ================================================
INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject_line, body_html) VALUES
(@lauren_seq, 1, 0,
 'Telecom strategy for {{company}}',
 '<p>{{firstName}},</p><p>As someone leading IT at {{company}}, you''re likely balancing infrastructure decisions that directly impact both operations and budget. One area where we consistently find untapped savings for organizations like yours is telecom and connectivity procurement.</p><p>1Cloud Communications serves as an independent advisor -- we benchmark your current environment against 400+ providers to identify cost reduction and performance improvement opportunities. Our team brings 30 years of carrier-level experience to every engagement.</p><p>We manage the full lifecycle: discovery, provider selection, implementation oversight, and ongoing management. If a provider underperforms, we have the relationships to move quickly.</p><p>Would a brief conversation about {{company}}''s current telecom landscape make sense?</p><p>Lauren Mitchell<br>Senior Account Executive<br>1Cloud Communications</p>'),

(@lauren_seq, 2, 3,
 'Re: Telecom strategy for {{company}}',
 '<p>{{firstName}},</p><p>Following up on my previous note. I wanted to share a bit more context on why this tends to resonate with IT leaders in your position.</p><p>Most organizations we work with haven''t had their telecom contracts independently reviewed in years. Providers don''t proactively offer better rates -- but those rates exist. We find that 80% of the companies we benchmark are overpaying significantly.</p><p>A quick assessment takes very little of your time and gives you a clear picture of where {{company}} stands relative to market pricing.</p><p>Worth exploring?</p><p>Lauren</p>'),

(@lauren_seq, 3, 7,
 'Market intelligence for {{company}}''s connectivity',
 '<p>{{firstName}},</p><p>One trend we''re seeing across mid-market organizations is a shift toward consolidating telecom relationships under an independent advisor rather than managing multiple provider contracts directly.</p><p>The benefit is straightforward: better pricing through competitive leverage, a single point of accountability, and the ability to pivot providers when business needs change -- without starting the procurement process from scratch.</p><p>That''s what we do at 1Cloud. If {{company}} is evaluating any telecom, SD-WAN, or UCaaS decisions in the near future, having our market data in your back pocket could be valuable.</p><p>Happy to share what we''re seeing in your space.</p><p>Lauren</p>'),

(@lauren_seq, 4, 14,
 'Quick thought on {{company}}''s telecom ROI',
 '<p>{{firstName}},</p><p>I understand these emails can feel like noise -- so I''ll be direct.</p><p>If {{company}} is spending more than $5K/month on connectivity, voice, or network services, there is almost certainly an opportunity to reduce that spend without changing anything about your operations.</p><p>We can show you in one conversation. No commitment, no lengthy process.</p><p>If the timing is off, I respect that completely. Just want to make sure you know the option is there.</p><p>Lauren</p>'),

(@lauren_seq, 5, 21,
 'Last note -- {{firstName}}',
 '<p>{{firstName}},</p><p>This will be my final outreach on this thread. I understand priorities shift and timing is everything.</p><p>Should {{company}} ever need an independent telecom assessment, provider benchmarking, or support navigating a contract renewal, 1Cloud is here. We work as an extension of your team -- no cost to you for our advisory services.</p><p>Wishing you and the {{company}} team continued success.</p><p>Lauren Mitchell<br>1Cloud Communications<br>lauren@1cloudnow.com</p>');

-- ================================================
-- KATE HARMON (BDR - Sharp, efficient, data-driven)
-- ================================================
INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject_line, body_html) VALUES
(@kate_seq, 1, 0,
 '{{company}} -- telecom cost check',
 '<p>{{firstName}},</p><p>Quick one for you.</p><p>We benchmark telecom costs across 400+ providers. 80% of the IT orgs we assess are overpaying by 20-40%.</p><p>1Cloud handles the full lifecycle -- discovery, pricing, implementation, ongoing management. 30 years of carrier-side experience. Zero cost for our advisory.</p><p>Worth a 10-minute call to see where {{company}} stands?</p><p>Kate Harmon<br>BDR, 1Cloud Communications</p>'),

(@kate_seq, 2, 3,
 'Re: {{company}} -- telecom cost check',
 '<p>{{firstName}},</p><p>Bumping this up. Two data points:</p><p>1. Average savings we find: 28% on telecom spend<br>2. Time to get your benchmark: one call</p><p>No RFP. No switching unless you want to. Just visibility into what {{company}} could be paying vs. what you are paying.</p><p>Interested?</p><p>Kate</p>'),

(@kate_seq, 3, 7,
 '{{firstName}} -- a different angle',
 '<p>{{firstName}},</p><p>Beyond cost savings, here''s what IT directors tell us matters most:</p><ul><li>One advisor managing all provider relationships</li><li>Ability to switch providers fast when performance drops</li><li>Post-implementation support (not just the sale)</li></ul><p>That''s 1Cloud in a nutshell. If any of those hit home for {{company}}, let''s talk.</p><p>Kate</p>'),

(@kate_seq, 4, 14,
 'Last call -- {{company}} telecom review',
 '<p>{{firstName}},</p><p>I respect your time so I''ll keep following up to a minimum.</p><p>If {{company}} has telecom contracts renewing in the next 6 months, talking to us before that renewal could save you significant budget. We''ve seen it dozens of times.</p><p>One call. Real numbers. No fluff.</p><p>Kate</p>'),

(@kate_seq, 5, 21,
 '{{firstName}} -- door is open',
 '<p>{{firstName}},</p><p>Final note from me. If you ever need:</p><ul><li>A fast telecom cost benchmark (400+ providers)</li><li>Help navigating a contract renewal</li><li>An independent second opinion on a provider proposal</li></ul><p>We''re here. No cost for the advisory.</p><p>Kate Harmon<br>1Cloud Communications<br>kate@1cloudnow.com</p>');

-- ================================================
-- SCOTT MERCER (Enterprise AE - Relationship, narrative)
-- ================================================
INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject_line, body_html) VALUES
(@scott_seq, 1, 0,
 'Rethinking telecom procurement at {{company}}',
 '<p>{{firstName}},</p><p>I wanted to reach out because I think there''s a conversation worth having about how {{company}} approaches telecom and connectivity procurement.</p><p>Most organizations we speak with are managing 3-5 provider relationships independently -- negotiating renewals reactively, lacking visibility into competitive pricing, and spending internal cycles on vendor management that could be better allocated elsewhere.</p><p>1Cloud Communications exists to change that equation. We serve as an independent telecom advisor, giving organizations like {{company}} instant access to competitive pricing across 400+ providers. Our team spent 30 years on the carrier side at executive levels, so we understand how providers price, where margins are hidden, and how to negotiate effectively on your behalf.</p><p>But we go beyond procurement. We manage the full lifecycle -- from initial discovery and provider selection through implementation and ongoing performance management. If a provider isn''t delivering, we can move you to an alternative quickly because we maintain those relationships continuously.</p><p>Would you be open to a conversation about how this model might benefit {{company}}?</p><p>Scott Mercer<br>Enterprise Account Executive<br>1Cloud Communications</p>'),

(@scott_seq, 2, 3,
 'Re: Rethinking telecom procurement at {{company}}',
 '<p>{{firstName}},</p><p>I wanted to add some context to my previous message.</p><p>The organizations that get the most value from working with 1Cloud tend to share a few characteristics: they''re spending $10K+ monthly on connectivity and voice services, they have contracts with multiple providers, and their IT leadership would rather focus on strategic initiatives than telecom vendor management.</p><p>If that sounds like {{company}}, the ROI conversation is straightforward. We consistently deliver 20-40% cost reductions while actually improving the service experience.</p><p>I''d welcome the chance to share some specifics. Even a 15-minute call would give me enough context to tell you whether there''s an opportunity worth pursuing.</p><p>Scott</p>'),

(@scott_seq, 3, 7,
 'The hidden cost of telecom status quo -- {{company}}',
 '<p>{{firstName}},</p><p>One pattern we see repeatedly: organizations renew telecom contracts on autopilot because the switching cost feels high and the existing provider relationship is "fine."</p><p>The reality is that telecom pricing has shifted dramatically. What was competitive 2-3 years ago often isn''t today, and providers rarely volunteer better rates. They count on renewal inertia.</p><p>Having an independent advisor benchmark your environment costs you nothing and takes minimal time. If we find savings, we manage the transition. If your pricing is already competitive, you''ll have that validation -- which has its own value.</p><p>Happy to walk you through how we''d approach this for {{company}}.</p><p>Scott</p>'),

(@scott_seq, 4, 14,
 'Thinking about {{company}}''s next contract cycle',
 '<p>{{firstName}},</p><p>If {{company}} has any telecom or connectivity contracts coming up for renewal in the next 6-12 months, engaging an independent advisor before that window opens is the highest-leverage move you can make.</p><p>It ensures you''re negotiating from a position of market intelligence rather than relying solely on what your current provider presents.</p><p>We handle this regularly for organizations of {{company}}''s scale. I''d be glad to share how we''d approach it specifically for your environment.</p><p>Scott</p>'),

(@scott_seq, 5, 21,
 'Wrapping up -- {{firstName}}',
 '<p>{{firstName}},</p><p>I recognize that timing drives most of these conversations, and right now may not be the right moment for {{company}}.</p><p>I''ll leave you with this: 1Cloud Communications works as an extension of your IT team. Independent telecom advisory, 400+ provider network, full lifecycle management -- at no cost to you.</p><p>When the timing is right -- whether that''s a contract renewal, a new location, or simply wanting a second opinion -- we''re here.</p><p>Wishing you and the {{company}} team all the best.</p><p>Scott Mercer<br>1Cloud Communications<br>scott@1cloudnow.com</p>');

-- Assign each agent to their sequence
INSERT INTO sequence_assignments (sequence_id, agent_id, active) VALUES
(@megan_seq, 2, 1),
(@lauren_seq, 3, 1),
(@kate_seq, 4, 1),
(@scott_seq, 5, 1);
