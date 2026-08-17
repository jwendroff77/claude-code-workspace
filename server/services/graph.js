import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

let graphClient = null;

function getClient() {
  if (graphClient) return graphClient;

  const credential = new ClientSecretCredential(
    process.env.MS_TENANT_ID,
    process.env.MS_CLIENT_ID,
    process.env.MS_CLIENT_SECRET
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  graphClient = Client.initWithMiddleware({ authProvider });
  return graphClient;
}

// Send email via Microsoft Graph API as a specific agent
// cc is optional — existing calls don't pass it and behavior is unchanged
export async function sendMail({ fromEmail, to, cc, bcc, subject, html, text, unsubscribeUrl }) {
  // ABSOLUTE LAST DEFENSE: never send merge tags to a real person
  if (html && html.includes('{{')) {
    html = html.replace(/\{\{[^}]+\}\}/g, '');
    console.log('[SAFETY] graph.js stripped merge tags before send to ' + to);
  }
  if (subject && subject.includes('{{')) {
    subject = subject.replace(/\{\{[^}]+\}\}/g, '');
  }

  const client = getClient();

  const message = {
    subject,
    body: {
      contentType: html ? 'HTML' : 'Text',
      content: html || text,
    },
    toRecipients: [
      {
        emailAddress: { address: to },
      },
    ],
  };

  // Partner cadence support: add CC recipients if provided
  if (cc) {
    const ccList = Array.isArray(cc) ? cc : [cc];
    message.ccRecipients = ccList.map((addr) => ({
      emailAddress: { address: addr },
    }));
  }

  // BCC support (for monitoring sends)
  if (bcc) {
    const bccList = Array.isArray(bcc) ? bcc : [bcc];
    message.bccRecipients = bccList.map((addr) => ({
      emailAddress: { address: addr },
    }));
  }

  // List-Unsubscribe headers — required by Gmail/Microsoft for bulk senders
  // Graph API requires custom headers to start with 'x-' BUT List-Unsubscribe is an RFC standard header
  // Graph API sendMail doesn't support setting standard headers via internetMessageHeaders
  // These headers are automatically added by Exchange when the unsubscribe link is in the body
  // So we skip setting them here - the unsubscribe link in the email footer handles compliance

  const response = await client
    .api(`/users/${fromEmail}/sendMail`)
    .post({ message, saveToSentItems: true });

  return response;
}

// Reply-all in an existing thread (for partner cadence follow-ups + inbox replies)
// Uses replyAll with comment field - ONLY approach that threads correctly in Outlook desktop
// The comment field supports <br> tags for line breaks
export async function replyToMessage({ fromEmail, messageId, html, text }) {
  const client = getClient();

  // Convert HTML to comment-friendly format: strip <p> tags, convert to <br> breaks
  let comment = html || text || '';
  comment = comment
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '<br><br>')
    .replace(/<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>/gi, '<br><br><br>')  // preserve triple breaks
    .replace(/^\s*<br>/i, '')  // remove leading break
    .replace(/<br>\s*$/i, '')  // remove trailing break
    .trim();

  await client
    .api(`/users/${fromEmail}/messages/${messageId}/replyAll`)
    .post({ comment });

  return { messageId };
}

// Check an agent's INBOX for replies from a specific sender on a conversation thread
// Used to detect partner reply-all (since partner is external, we check agent's inbox instead)
export async function getInboxByConversation({ email, conversationId, fromEmail }) {
  const client = getClient();

  // Filter by conversationId ONLY. Graph rejects $filter on conversationId combined
  // with $orderby on receivedDateTime ("restriction or sort order is too complex"),
  // and $filter on from/emailAddress/address is unreliable on this tenant — both
  // made this call throw on every scheduler tick, so partner replies were never
  // detected. Match sender and sort client-side instead.
  const messages = await client
    .api(`/users/${email}/mailFolders/Inbox/messages`)
    .filter(`conversationId eq '${conversationId}'`)
    .select('id,subject,from,receivedDateTime,conversationId')
    .top(20)
    .get();

  let results = messages.value || [];
  if (fromEmail) {
    results = results.filter(m =>
      m.from?.emailAddress?.address?.toLowerCase() === fromEmail.toLowerCase()
    );
  }
  results.sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime));
  return results;
}

// Recent inbox messages from a specific sender. Filters by receivedDateTime only
// ($filter+$orderby on the same property is the one combination Graph accepts here)
// and matches the sender client-side — from/emailAddress/address filters are
// unreliable on this tenant.
export async function getRecentInboxFrom({ email, fromEmail, sinceDays = 14 }) {
  const client = getClient();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const messages = await client
    .api(`/users/${email}/mailFolders/Inbox/messages`)
    .filter(`receivedDateTime ge ${since.toISOString()}`)
    .select('id,subject,from,receivedDateTime,conversationId')
    .top(100)
    .orderby('receivedDateTime desc')
    .get();

  return (messages.value || []).filter(m =>
    m.from?.emailAddress?.address?.toLowerCase() === fromEmail.toLowerCase()
  );
}

// Get the most recent sent message to find its conversationId and messageId
export async function getLastSentTo({ fromEmail, toEmail }) {
  const client = getClient();

  // Fetch recent sent items and filter client-side — Graph API lambda filters
  // on toRecipients are not supported on all tenants.
  const messages = await client
    .api(`/users/${fromEmail}/mailFolders/SentItems/messages`)
    .select('id,subject,conversationId,sentDateTime,toRecipients')
    .top(50)
    .orderby('sentDateTime desc')
    .get();

  const match = (messages.value || []).find(m =>
    (m.toRecipients || []).some(r =>
      r.emailAddress?.address?.toLowerCase() === toEmail.toLowerCase()
    )
  );

  return match || null;
}

// Test Graph API connection for a specific agent email
export async function testGraphConnection(fromEmail) {
  const client = getClient();
  try {
    // Verify we can access this user via Graph API
    await client.api(`/users/${fromEmail}`).select('displayName,mail').get();
    return { success: true, message: `Graph API connected for ${fromEmail}` };
  } catch (err) {
    return { success: false, message: err.message || err.code || 'Unknown error' };
  }
}
