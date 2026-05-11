// One-time script: send threaded reply to Wendy Smith from Megan's mailbox
//
// Usage:
//   node server/scripts/send-wendy-reply.js --dry-run   <- shows what would be sent, no email goes out
//   node server/scripts/send-wendy-reply.js --test      <- sends to jonathan@1cloudcommunications.com so you can preview it
//   node server/scripts/send-wendy-reply.js --send      <- sends the real reply to Wendy (reply-all, Jared CC'd)

import 'dotenv/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

const FROM_EMAIL = 'mbarrett@1cloudnow.com';
const WENDY_EMAIL = 'wendy.smith@wesleywoods.org';
const TEST_EMAIL  = 'jonathan@1cloudcommunications.com';

const REPLY_BODY = `Hi Wendy,<br><br>Monday May 18th between 3:15 and 4:00pm ET works great.  Both Jonathan Wendroff (Principal Advisor, 1Cloud Communications) and Jared Bader (Enterprise Account Executive, Comcast Business) will be joining - between the two of them you'll have everything you need to evaluate your options.<br><br>Jared - can you send Wendy a calendar invite for Monday May 18th at 3:15pm ET?<br><br>Thanks,<br>Megan Barrett<br>SDR - 1Cloud Communications<br>8530 Eagle Point Blvd, Suite 100, Lake Elmo, MN<br>www.1cloudcommunications.com`;

const mode = process.argv.includes('--send') ? 'send'
           : process.argv.includes('--test') ? 'test'
           : 'dry-run';

const credential = new ClientSecretCredential(
  process.env.MS_TENANT_ID,
  process.env.MS_CLIENT_ID,
  process.env.MS_CLIENT_SECRET
);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});
const client = Client.initWithMiddleware({ authProvider });

async function findMessage() {
  // First: look in Megan's inbox for Wendy's reply
  const inbox = await client
    .api(`/users/${FROM_EMAIL}/mailFolders/Inbox/messages`)
    .filter(`from/emailAddress/address eq '${WENDY_EMAIL}'`)
    .select('id,subject,from,receivedDateTime,conversationId,toRecipients,ccRecipients')
    .top(5)
    .get();
  // Sort client-side — Graph API doesn't allow orderby with filter on inbox
  if (inbox.value) inbox.value.sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime));

  if (inbox.value && inbox.value.length > 0) {
    return { msg: inbox.value[0], source: 'inbox' };
  }

  // Fallback: last sent email to Wendy
  console.log("Wendy's reply not found in inbox — falling back to last sent email to her...");
  const sent = await client
    .api(`/users/${FROM_EMAIL}/mailFolders/SentItems/messages`)
    .select('id,subject,sentDateTime,toRecipients,ccRecipients,conversationId')
    .top(50)
    .orderby('sentDateTime desc')
    .get();

  const match = (sent.value || []).find(m =>
    (m.toRecipients || []).some(r =>
      r.emailAddress?.address?.toLowerCase() === WENDY_EMAIL.toLowerCase()
    )
  );

  if (!match) return null;
  return { msg: match, source: 'sent' };
}

async function main() {
  console.log(`\n=== MODE: ${mode.toUpperCase()} ===\n`);

  const found = await findMessage();

  if (!found) {
    console.error('ERROR: Could not find any email to/from Wendy in Megan\'s mailbox. Aborting.');
    process.exit(1);
  }

  const { msg, source } = found;
  const toList = (msg.toRecipients || []).map(r => r.emailAddress.address).join(', ');
  const ccList = (msg.ccRecipients || []).map(r => r.emailAddress.address).join(', ');

  console.log(`Found message (source: ${source}):`);
  console.log(`  Subject  : ${msg.subject}`);
  console.log(`  To       : ${toList}`);
  console.log(`  CC       : ${ccList || '(none)'}`);
  console.log(`  Date     : ${msg.receivedDateTime || msg.sentDateTime}`);
  console.log(`  MessageID: ${msg.id}`);
  console.log(`\nReply body preview:`);
  console.log(`-------------------------------------------------------`);
  console.log(REPLY_BODY.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''));
  console.log(`-------------------------------------------------------`);

  if (mode === 'dry-run') {
    console.log('\nDRY RUN complete — no email sent. Run with --test or --send when ready.');
    return;
  }

  if (mode === 'test') {
    console.log(`\nTEST MODE: Finding an existing sent email to ${TEST_EMAIL} to test threading...`);

    // Find the most recent email Megan sent to Jonathan so we can replyAll on it
    const sent = await client
      .api(`/users/${FROM_EMAIL}/mailFolders/SentItems/messages`)
      .select('id,subject,sentDateTime,toRecipients,ccRecipients,conversationId')
      .top(50)
      .get();

    const testMsg = (sent.value || []).find(m =>
      (m.toRecipients || []).some(r =>
        r.emailAddress?.address?.toLowerCase() === TEST_EMAIL.toLowerCase()
      )
    );

    if (!testMsg) {
      console.error(`No existing sent email from Megan to ${TEST_EMAIL} found. Cannot test threading.`);
      process.exit(1);
    }

    console.log(`Found existing thread: "${testMsg.subject}" (${testMsg.sentDateTime})`);
    console.log(`Sending threaded replyAll to ${TEST_EMAIL}...`);

    // Create reply draft on that thread
    const draft = await client
      .api(`/users/${FROM_EMAIL}/messages/${testMsg.id}/createReply`)
      .post({});

    await client.api(`/users/${FROM_EMAIL}/messages/${draft.id}`).patch({
      toRecipients: [{ emailAddress: { address: TEST_EMAIL } }],
      ccRecipients: [],
      body: { contentType: 'HTML', content: REPLY_BODY.replace(/<br>/g, '<br>\n') },
    });

    await client.api(`/users/${FROM_EMAIL}/messages/${draft.id}/send`).post({});

    console.log(`Threaded test sent to ${TEST_EMAIL}. Check your inbox — it should appear in an existing thread with Megan.`);
    return;
  }

  // --send: do the real replyAll
  console.log(`\nSending replyAll to Wendy (Jared auto-included as CC)...`);
  await client
    .api(`/users/${FROM_EMAIL}/messages/${msg.id}/replyAll`)
    .post({ comment: REPLY_BODY });

  console.log('\nSUCCESS: Reply sent. Wendy and Jared are both on the thread.');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
