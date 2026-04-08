const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat,
        TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
        PageNumber, PageBreak } = require("docx");
const fs = require("fs");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const TABLE_WIDTH = 9360;

function heading(level, text) {
  return new Paragraph({ heading: level, children: [new TextRun({ text, bold: true })] });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, size: 22, ...opts.run })]
  });
}

function boldPara(label, value) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 22 }),
      new TextRun({ text: value, size: 22 }),
    ]
  });
}

function bulletItem(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })]
  });
}

function numberItem(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })]
  });
}

function makeTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => new TableCell({
          borders, width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: "1B3A4B", type: ShadingType.CLEAR },
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, color: "FFFFFF", font: "Arial" })] })]
        }))
      }),
      ...rows.map(row => new TableRow({
        children: row.map((cell, i) => new TableCell({
          borders, width: { size: colWidths[i], type: WidthType.DXA },
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, font: "Arial" })] })]
        }))
      }))
    ]
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1B3A4B" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers1", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // ===== TITLE PAGE =====
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: [
        spacer(), spacer(), spacer(), spacer(), spacer(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: "1Cloud Communications", size: 56, bold: true, font: "Arial", color: "1B3A4B" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: "AI SDR Sales Platform", size: 40, font: "Arial", color: "2E75B6" })] }),
        spacer(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
          border: { top: { style: BorderStyle.SINGLE, size: 3, color: "2E75B6" } },
          children: [] }),
        spacer(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: "Operations Manual & Technical Reference", size: 28, font: "Arial", color: "666666" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: "April 7, 2026", size: 24, font: "Arial", color: "999999" })] }),
        spacer(), spacer(), spacer(), spacer(), spacer(), spacer(), spacer(),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Confidential", size: 20, font: "Arial", color: "999999", italics: true })] }),
      ]
    },
    // ===== TOC =====
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: "1Cloud Communications - AI SDR Sales Platform", size: 16, color: "999999", font: "Arial" })] })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", size: 18, font: "Arial" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Arial" })] })] })
      },
      children: [
        heading(HeadingLevel.HEADING_1, "Table of Contents"),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // ===== PART 1: OPERATIONS MANUAL =====
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 300 },
          children: [new TextRun({ text: "PART 1: OPERATIONS MANUAL", size: 32, bold: true, font: "Arial", color: "1B3A4B" })] }),

        // 1. Getting Started
        heading(HeadingLevel.HEADING_1, "1. Getting Started"),
        heading(HeadingLevel.HEADING_2, "1.1 Starting the Platform"),
        numberItem("Open a terminal/command prompt", "numbers1"),
        numberItem("Navigate to the project folder:  cd C:\\Users\\jwend\\claude-code-workspace", "numbers1"),
        numberItem("Run:  npm run dev", "numbers1"),
        numberItem("This starts both the React frontend (port 5173) and Express API server (port 3001)", "numbers1"),
        numberItem("The automated scheduler starts immediately - handles drip sending and inbox polling", "numbers1"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "1.2 Stopping the Platform"),
        bulletItem("Press Ctrl+C in the terminal", "bullets"),
        bulletItem("Important: The scheduler only sends while the server is running.  If down during business hours, those sends are skipped.", "bullets"),
        bulletItem("Recommendation: Keep running Mon-Fri 8am-5pm CT at minimum.", "bullets"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "1.3 Platform URLs"),
        boldPara("Frontend: ", "http://localhost:5173"),
        boldPara("API: ", "http://localhost:3001"),

        new Paragraph({ children: [new PageBreak()] }),

        // 2. Dashboard
        heading(HeadingLevel.HEADING_1, "2. Dashboard (Command Center)"),
        para("The Command Center is the home page showing real-time fleet status."),
        heading(HeadingLevel.HEADING_2, "2.1 Key Metrics"),
        makeTable(
          ["Metric", "Description"],
          [
            ["Appointments Booked", "Total appointments booked this month across all agents"],
            ["Emails Sent Today", "Number of outbound emails sent today"],
            ["Reply Rate (7-Day)", "Average reply rate across all sequences over the last 7 days"],
            ["Prospects in Sequence", "Total prospects currently enrolled in active sequences"],
          ],
          [3000, 6360]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "2.2 AI Agents Roster"),
        para("Shows each agent card with send progress, reply rate, appointments/week, queue size, and status."),
        heading(HeadingLevel.HEADING_2, "2.3 Attention Feed"),
        para("Alerts requiring action: new positive replies, send failures, low queue warnings, underperforming steps."),

        new Paragraph({ children: [new PageBreak()] }),

        // 3. Agent Management
        heading(HeadingLevel.HEADING_1, "3. Agent Management"),
        heading(HeadingLevel.HEADING_2, "3.1 AI SDR Agents (Automated Outbound)"),
        makeTable(
          ["Agent", "Role", "Public Email", "M365 Login", "Limit"],
          [
            ["Megan Barrett", "SDR", "megan@1cloudnow.com", "mbarrett@1cloudnow.com", "30/day"],
            ["Lauren Mitchell", "Senior AE", "lauren@1cloudnow.com", "lmitchell@1cloudnow.com", "30/day"],
            ["Kate Harmon", "BDR", "kate@1cloudnow.com", "kharmon@1cloudnow.com", "30/day"],
            ["Scott Mercer", "Enterprise AE", "scott@1cloudnow.com", "smercer@1cloudnow.com", "30/day"],
          ],
          [1800, 1400, 2200, 2400, 1560]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "3.2 Other Agents (Not Automated)"),
        makeTable(
          ["Agent", "Role", "Notes"],
          [
            ["Jonathan Wendroff", "Principal Advisor (Closer)", "Handles handed-off prospects, no sequences"],
            ["Jared Bader", "Comcast Business EAE", "Manual/tracking only"],
            ["Eduard Teisanu", "Comcast Business EAE", "Manual/tracking only"],
          ],
          [2500, 2800, 4060]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "3.3 Agent Personas"),
        boldPara("Megan: ", "Warm, conversational, direct.  Midwestern approachability.  Short, friendly sentences."),
        boldPara("Lauren: ", "Polished, consultative.  Peer-level tone with senior buyers.  Business outcomes focused."),
        boldPara("Kate: ", "Sharp, efficient, respects buyer time.  Data-driven with compelling stats.  Gets to the point."),
        boldPara("Scott: ", "Enterprise-focused, relationship-oriented.  Comfortable with technical and business stakeholders."),
        spacer(),
        heading(HeadingLevel.HEADING_2, "3.4 Send Parameters"),
        boldPara("Send Window: ", "8:00 AM - 5:00 PM CT (Monday-Friday)"),
        boldPara("Daily Limit: ", "30 emails per agent per day"),
        boldPara("Drip Spacing: ", "Emails staggered throughout the day with 45-120 second random delays between sends and random offsets between agents.  Mimics natural human behavior to protect domain reputation."),

        new Paragraph({ children: [new PageBreak()] }),

        // 4. Cadence Builder
        heading(HeadingLevel.HEADING_1, "4. Cadence Builder"),
        para("Each agent has a unique 5-step email cadence.  Prospects enrolled in a sequence automatically receive emails on scheduled days."),
        heading(HeadingLevel.HEADING_2, "4.1 Sequence Timing"),
        makeTable(
          ["Step", "Day", "Purpose"],
          [
            ["Step 1", "Day 0", "Initial outreach - cold email"],
            ["Step 2", "Day 3", "First follow-up"],
            ["Step 3", "Day 7", "Different angle / value prop"],
            ["Step 4", "Day 14", "Urgency / last chance"],
            ["Step 5", "Day 21", "Breakup email - final touch"],
          ],
          [1500, 1500, 6360]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "4.2 Current Sequences"),
        makeTable(
          ["Sequence", "Agent", "Style"],
          [
            ["Megan - Friendly Discovery", "Megan Barrett", "Warm, curiosity-driven"],
            ["Lauren - Executive Consultant", "Lauren Mitchell", "Polished, consultative"],
            ["Kate - Direct Value Prop", "Kate Harmon", "Sharp, data-driven, concise"],
            ["Scott - Enterprise Narrative", "Scott Mercer", "Enterprise relationship building"],
          ],
          [3200, 2500, 3660]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "4.3 Template Variables"),
        bulletItem("{{firstName}} - Prospect first name", "bullets"),
        bulletItem("{{lastName}} - Prospect last name", "bullets"),
        bulletItem("{{company}} - Prospect company name", "bullets"),
        bulletItem("{{email}} - Prospect email address", "bullets"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "4.4 Email Style Guidelines"),
        bulletItem("Keep emails SHORT - 5-7 sentences max (Kate style is the benchmark)", "bullets"),
        bulletItem("No em dashes - use single dashes instead", "bullets"),
        bulletItem("Double spaces after sentences", "bullets"),
        bulletItem("Always refer to company as \"1Cloud Communications\" (not just \"1Cloud\")", "bullets"),
        bulletItem("Target ~300-450 characters of body text excluding HTML tags", "bullets"),

        new Paragraph({ children: [new PageBreak()] }),

        // 5. Prospect Management
        heading(HeadingLevel.HEADING_1, "5. Prospect Management"),
        heading(HeadingLevel.HEADING_2, "5.1 Importing from Apollo"),
        numberItem("Go to Lists page", "numbers2"),
        numberItem("Use Apollo search to find prospects by title, industry, location, company size", "numbers2"),
        numberItem("Import selected prospects - deduped against existing records", "numbers2"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "5.2 Prospect Lifecycle"),
        makeTable(
          ["Status", "Description"],
          [
            ["pending_scrub", "Newly imported, awaiting review (partner agents only)"],
            ["in_sequence", "Active in a cadence, receiving automated emails"],
            ["replied", "Prospect replied - sequence auto-paused"],
            ["engaged", "Multi-message conversation underway"],
            ["booked", "Appointment scheduled"],
            ["handed_off", "Moved to Jonathan (closer)"],
            ["disqualified", "Opted out or invalid"],
            ["unsubscribed", "Permanently removed"],
          ],
          [2500, 6860]
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // 6. Sent Emails
        heading(HeadingLevel.HEADING_1, "6. Sent Emails"),
        bulletItem("Navigate to Sent Emails in the sidebar", "bullets"),
        bulletItem("Filter by agent using tabs (All, Kate, Lauren, Megan, Scott)", "bullets"),
        bulletItem("Search by prospect name, company, or subject", "bullets"),
        bulletItem("Click any email to see full rendered body, recipient, timestamp, delivery status", "bullets"),
        para("All emails show \"Delivered via Microsoft Graph API\" - sent through Microsoft servers and saved in each agent's Sent Items."),

        // 7. Inbox
        heading(HeadingLevel.HEADING_1, "7. Inbox"),
        heading(HeadingLevel.HEADING_2, "7.1 How Replies Are Detected"),
        bulletItem("Platform polls each agent's M365 inbox every 5 minutes via Graph API", "bullets"),
        bulletItem("New unread emails matched to known prospects by email address", "bullets"),
        bulletItem("When a known prospect replies, their sequence is automatically paused", "bullets"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "7.2 Managing Replies"),
        numberItem("Click the reply to see the full conversation thread", "numbers3"),
        numberItem("Take action: Book Appointment, Hand off to Jonathan, or Disqualify", "numbers3"),
        numberItem("Optionally write and send a reply directly (sends via Graph API as the agent)", "numbers3"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "7.3 Action Effects"),
        makeTable(
          ["Action", "Effect"],
          [
            ["Book Appointment", "Prospect status -> booked, sequence cancelled, pipeline event logged"],
            ["Hand off to Jonathan", "Prospect status -> handed_off, sequence cancelled"],
            ["Disqualify", "Prospect status -> disqualified, sequence cancelled permanently"],
          ],
          [3000, 6360]
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // 8. Pipeline
        heading(HeadingLevel.HEADING_1, "8. Pipeline"),
        para("Kanban board showing all prospects organized by stage:"),
        makeTable(
          ["Column", "Description"],
          [
            ["In Sequence", "Actively receiving automated emails"],
            ["Replied", "Got 1+ replies, sequence paused"],
            ["Engaged", "Multi-message conversation"],
            ["Appointment Booked", "Meeting scheduled"],
            ["Handed to Jonathan", "Closer is handling"],
            ["Disqualified", "Opted out or invalid"],
          ],
          [3000, 6360]
        ),

        // 9. Daily Ops
        heading(HeadingLevel.HEADING_1, "9. Daily Operations Checklist"),
        heading(HeadingLevel.HEADING_2, "Morning (8:00 AM CT)"),
        numberItem("Start platform:  cd C:\\Users\\jwend\\claude-code-workspace && npm run dev", "numbers4"),
        numberItem("Open http://localhost:5173", "numbers4"),
        numberItem("Check Dashboard for metrics", "numbers4"),
        numberItem("Check Inbox for new replies - action them (book, hand off, or disqualify)", "numbers4"),
        numberItem("Review Sent Emails to confirm sends look correct", "numbers4"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "Throughout the Day"),
        bulletItem("Scheduler handles all automated sending - no manual action needed", "bullets"),
        bulletItem("Check Inbox periodically for new replies (click Refresh)", "bullets"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "Weekly"),
        bulletItem("Review Pipeline for stuck prospects", "bullets"),
        bulletItem("Check agent queue sizes - import more from Apollo if queues are low", "bullets"),
        bulletItem("Review sequence performance in Cadence Builder", "bullets"),

        new Paragraph({ children: [new PageBreak()] }),

        // 10. Troubleshooting
        heading(HeadingLevel.HEADING_1, "10. Troubleshooting"),
        makeTable(
          ["Issue", "Solution"],
          [
            ["Platform won't start", "Check MySQL is running (port 3306).  Check .env file exists."],
            ["Port 5173 in use", "Another instance running.  Kill with Ctrl+C or find/kill node.exe."],
            ["Emails not sending", "Check server is running within send window (8am-5pm Mon-Fri CT).  Check terminal for errors."],
            ["Inbox not showing replies", "Replies polled every 5 min.  Click Refresh.  Check terminal for Graph API errors."],
            ["Agent showing 0 sent", "Verify agent status is active and role is outbound.  Check daily limit isn't 0."],
            ["Database connection error", "Verify MySQL is running.  Check .env: DB_HOST=localhost, DB_USER=root."],
          ],
          [3000, 6360]
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // ===== PART 2: TECHNICAL REFERENCE =====
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 300 },
          children: [new TextRun({ text: "PART 2: TECHNICAL REFERENCE", size: 32, bold: true, font: "Arial", color: "1B3A4B" })] }),

        // 11. Architecture
        heading(HeadingLevel.HEADING_1, "11. Architecture Overview"),
        boldPara("Frontend: ", "React 18 + Vite 5 + React Router + Tailwind CSS + Lucide icons (port 5173)"),
        boldPara("Backend: ", "Express.js (ES modules) + mysql2 + node-cron (port 3001)"),
        boldPara("Database: ", "MySQL 8.4 (local, database: cloudco3_portal)"),
        boldPara("Email: ", "Microsoft Graph API (client credentials OAuth2)"),
        boldPara("AI: ", "Anthropic Claude API (sentiment analysis, email rewriting)"),
        boldPara("Prospect Data: ", "Apollo.io API"),

        // 12. Database Schema
        heading(HeadingLevel.HEADING_1, "12. Database Schema"),
        heading(HeadingLevel.HEADING_2, "12.1 Core Tables"),
        makeTable(
          ["Table", "Purpose"],
          [
            ["agents", "Team members - name, email, role, smtp_user, send limits, persona"],
            ["prospects", "Contact records - name, email, company, title, status, assigned_agent_id"],
            ["sequences", "Email cadence templates - name, description, status"],
            ["sequence_steps", "Individual steps - sequence_id, step_number, delay_days, subject_line, body_html"],
            ["sequence_assignments", "Which agents are assigned to which sequences"],
            ["prospect_sequence_enrollment", "Active enrollments - prospect_id, sequence_id, agent_id, current_step, status"],
          ],
          [3500, 5860]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "12.2 Email Tables"),
        makeTable(
          ["Table", "Purpose"],
          [
            ["sent_emails", "Outbound email log - prospect_id, agent_id, subject, body, sent_at"],
            ["received_emails", "Inbound replies - prospect_id, agent_id, from_email, subject, body, sentiment"],
          ],
          [3500, 5860]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "12.3 Support Tables"),
        makeTable(
          ["Table", "Purpose"],
          [
            ["pipeline_events", "Audit trail of prospect status changes"],
            ["apollo_pulls", "History of Apollo.io imports"],
            ["coaching_notes", "Jonathan's feedback on sequence steps"],
            ["exclusion_list", "Blacklisted emails/companies"],
            ["settings", "Global configuration (API keys, thresholds)"],
          ],
          [3500, 5860]
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // 13. Graph API
        heading(HeadingLevel.HEADING_1, "13. Microsoft Graph API Setup"),
        heading(HeadingLevel.HEADING_2, "13.1 App Registration"),
        boldPara("App Name: ", "1Cloud Sales Platform"),
        boldPara("Client ID: ", "3ad905f6-d1fe-4cdb-b893-4673f7934625"),
        boldPara("Tenant ID: ", "26498387-4392-498a-9836-b77b8cc6cb90"),
        boldPara("Client Secret: ", "Stored in .env as MS_CLIENT_SECRET"),
        boldPara("Authentication: ", "Client Credentials flow (no user login required)"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "13.2 API Permissions"),
        makeTable(
          ["Permission", "Type", "Purpose"],
          [
            ["Mail.Send", "Application", "Send email as any user in tenant"],
            ["Mail.Read", "Application", "Read inbox of any user in tenant"],
            ["User.Read", "Delegated", "Verify user existence"],
          ],
          [2500, 2500, 4360]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "13.3 Shared Mailbox Mapping"),
        para("Each agent has two email addresses.  The smtp_user field in the agents table maps to the M365 login used by Graph API."),
        para("Public (what prospects see): megan@1cloudnow.com"),
        para("M365 login (used by Graph API): mbarrett@1cloudnow.com"),

        new Paragraph({ children: [new PageBreak()] }),

        // 14. Scheduler
        heading(HeadingLevel.HEADING_1, "14. Scheduler - Drip Sending Logic"),
        heading(HeadingLevel.HEADING_2, "14.1 Tick Frequency"),
        boldPara("Send queue: ", "Every 3 minutes"),
        boldPara("Inbox poll: ", "Every 5 minutes"),
        boldPara("Auto-pull check: ", "Every hour"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "14.2 Drip Send Algorithm (per tick, per agent)"),
        numberItem("Check agent is active + outbound role", "numbers1"),
        numberItem("Check today is a sending day (Mon-Fri)", "numbers1"),
        numberItem("Check current time is within send window (8am-5pm CT)", "numbers1"),
        numberItem("Check daily limit not reached", "numbers1"),
        numberItem("Calculate sends-per-tick = remaining emails / remaining ticks in window (max 3)", "numbers1"),
        numberItem("Query enrollments where enrolled_at + cumulative delay_days <= now", "numbers1"),
        numberItem("Send 1-3 emails with 45-120 second random delay between each", "numbers1"),
        numberItem("Random 0-90 second offset between agents", "numbers1"),
        numberItem("Agent order shuffled each tick", "numbers1"),
        spacer(),
        heading(HeadingLevel.HEADING_2, "14.3 Result"),
        para("30 emails spread across 9 hours = ~1 email every 18 minutes per agent.  No two agents send at the same second.  Looks like 4 real people checking email throughout the day."),

        // 15. Inbox Polling
        heading(HeadingLevel.HEADING_1, "15. Inbox Polling - Graph API"),
        numberItem("Every 5 min, scheduler polls each agent inbox via Graph API", "numbers2"),
        numberItem("Filters for unread messages received in last 24 hours", "numbers2"),
        numberItem("Skips noreply/mailer-daemon/postmaster addresses", "numbers2"),
        numberItem("Deduplicates against received_emails table", "numbers2"),
        numberItem("If from known prospect: auto-pauses sequence, updates status to replied, logs pipeline event", "numbers2"),
        numberItem("Marks message as read in Microsoft to avoid reprocessing", "numbers2"),

        new Paragraph({ children: [new PageBreak()] }),

        // 16. Key Files
        heading(HeadingLevel.HEADING_1, "16. Key Files Reference"),
        heading(HeadingLevel.HEADING_2, "16.1 Frontend (client/src/)"),
        makeTable(
          ["File", "Purpose"],
          [
            ["App.jsx", "Routes - Dashboard, Agents, Cadences, Inbox, Sent, Pipeline, Lists, Settings"],
            ["api/client.js", "API client wrapper with all endpoint methods"],
            ["pages/Dashboard.jsx", "Command Center with metrics, agent roster, attention feed"],
            ["pages/AgentManager.jsx", "Agent configuration UI"],
            ["pages/CadenceBuilder.jsx", "Sequence editor with step cards"],
            ["pages/Inbox.jsx", "Unified inbox with thread view and action buttons"],
            ["pages/SentEmails.jsx", "Sent email browser with agent filtering"],
            ["pages/Pipeline.jsx", "Kanban board"],
            ["pages/ListManager.jsx", "Prospect list and Apollo import"],
            ["components/layout/Sidebar.jsx", "Navigation sidebar"],
          ],
          [3500, 5860]
        ),
        spacer(),
        heading(HeadingLevel.HEADING_2, "16.2 Backend (server/)"),
        makeTable(
          ["File", "Purpose"],
          [
            ["index.js", "Express server entry point, starts scheduler"],
            ["services/graph.js", "Microsoft Graph API client - sendMail, testGraphConnection"],
            ["services/smtp.js", "Email sending wrapper - calls Graph API, logs to sent_emails"],
            ["services/imap.js", "Inbox polling via Graph API - checkNewEmails, dedup, auto-pause"],
            ["services/scheduler.js", "Cron scheduler - drip send, inbox poll, auto-pull"],
            ["services/ai.js", "Claude API integration - sentiment analysis, email rewriting"],
            ["db/connection.js", "MySQL connection pool"],
            ["routes/agents.js", "Agent CRUD + Graph test + sent emails endpoint"],
            ["routes/sequences.js", "Sequence CRUD + steps + agent assignment"],
            ["routes/inbox.js", "Inbox listing, thread view, actions, reply sending"],
            ["routes/pipeline.js", "Pipeline grouping + status moves"],
            ["routes/apollo.js", "Apollo.io search + import"],
          ],
          [3500, 5860]
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // 17. Environment Variables
        heading(HeadingLevel.HEADING_1, "17. Environment Variables"),
        para("The .env file at the project root contains all configuration:"),
        makeTable(
          ["Variable", "Purpose"],
          [
            ["DB_HOST", "MySQL host (localhost)"],
            ["DB_USER", "MySQL user"],
            ["DB_PASS", "MySQL password"],
            ["DB_NAME", "Database name (cloudco3_portal)"],
            ["PORT", "Express server port (3001)"],
            ["MS_TENANT_ID", "Microsoft Entra tenant ID"],
            ["MS_CLIENT_ID", "Microsoft app registration client ID"],
            ["MS_CLIENT_SECRET", "Microsoft app registration secret"],
            ["APOLLO_API_KEY", "Apollo.io API key for prospect search"],
            ["ANTHROPIC_API_KEY", "Claude API key for AI features"],
            ["JWT_SECRET", "JWT signing key"],
            ["NOTIFICATION_EMAIL", "Alert recipient email"],
          ],
          [3500, 5860]
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // 18. API Endpoints
        heading(HeadingLevel.HEADING_1, "18. API Endpoints"),
        heading(HeadingLevel.HEADING_2, "18.1 Agents"),
        makeTable(["Method", "Path", "Description"],
          [["GET", "/api/agents", "List all agents"], ["GET", "/api/agents/:id", "Get agent by ID"], ["PUT", "/api/agents/:id", "Update agent"], ["POST", "/api/agents/:id/test-smtp", "Test Graph API connection"], ["GET", "/api/agents/:id/sent", "Get sent emails for agent"]],
          [1200, 3500, 4660]),
        spacer(),
        heading(HeadingLevel.HEADING_2, "18.2 Sequences"),
        makeTable(["Method", "Path", "Description"],
          [["GET", "/api/sequences", "List all sequences"], ["GET", "/api/sequences/:id", "Get sequence with steps"], ["POST", "/api/sequences", "Create sequence"], ["PUT", "/api/sequences/:id", "Update sequence"], ["POST", "/api/sequences/:id/steps", "Add step"], ["PUT", "/api/sequences/steps/:id", "Update step"]],
          [1200, 3500, 4660]),
        spacer(),
        heading(HeadingLevel.HEADING_2, "18.3 Inbox"),
        makeTable(["Method", "Path", "Description"],
          [["GET", "/api/inbox", "List received emails"], ["GET", "/api/inbox/:id", "Get email with thread"], ["PUT", "/api/inbox/:id/action", "Book / Hand off / Disqualify"], ["POST", "/api/inbox/:id/reply", "Send reply as agent"]],
          [1200, 3500, 4660]),
        spacer(),
        heading(HeadingLevel.HEADING_2, "18.4 Pipeline"),
        makeTable(["Method", "Path", "Description"],
          [["GET", "/api/pipeline", "Get prospects by status"], ["GET", "/api/pipeline/stats", "Pipeline statistics"], ["PUT", "/api/pipeline/:id/move", "Move prospect to stage"]],
          [1200, 3500, 4660]),
        spacer(),
        heading(HeadingLevel.HEADING_2, "18.5 Apollo"),
        makeTable(["Method", "Path", "Description"],
          [["POST", "/api/apollo/search", "Search Apollo.io"], ["POST", "/api/apollo/import", "Import prospects"], ["GET", "/api/apollo/pulls", "Import history"]],
          [1200, 3500, 4660]),
        spacer(),
        heading(HeadingLevel.HEADING_2, "18.6 Dashboard & Settings"),
        makeTable(["Method", "Path", "Description"],
          [["GET", "/api/dashboard/metrics", "Key metrics"], ["GET", "/api/dashboard/agents", "Agent roster stats"], ["GET", "/api/dashboard/attention", "Attention feed"], ["GET", "/api/settings", "Get settings"], ["PUT", "/api/settings", "Update settings"]],
          [1200, 3500, 4660]),

        spacer(), spacer(),
        new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 3, color: "2E75B6" } }, children: [] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
          children: [new TextRun({ text: "Document generated April 7, 2026  -  1Cloud Communications  -  Confidential", size: 18, color: "999999", italics: true, font: "Arial" })] }),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("C:/Users/jwend/claude-code-workspace/docs/1Cloud_Sales_Platform_Documentation.docx", buffer);
  console.log("Document created successfully!");
  console.log("Location: C:\\Users\\jwend\\claude-code-workspace\\docs\\1Cloud_Sales_Platform_Documentation.docx");
  console.log("Size: " + (buffer.length / 1024).toFixed(1) + " KB");
});
