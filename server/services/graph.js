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
export async function sendMail({ fromEmail, to, cc, subject, html, text, unsubscribeUrl }) {
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

  // List-Unsubscribe headers — required by Gmail/Microsoft for bulk senders
  if (unsubscribeUrl) {
    message.internetMessageHeaders = [
      { name: 'List-Unsubscribe', value: `<${unsubscribeUrl}>` },
      { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
    ];
  }

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

  let filterStr = `conversationId eq '${conversationId}'`;
  if (fromEmail) {
    filterStr += ` and from/emailAddress/address eq '${fromEmail}'`;
  }

  const messages = await client
    .api(`/users/${email}/mailFolders/Inbox/messages`)
    .filter(filterStr)
    .select('id,subject,from,receivedDateTime,conversationId')
    .top(5)
    .orderby('receivedDateTime desc')
    .get();

  return messages.value;
}

// Get the most recent sent message to find its conversationId and messageId
export async function getLastSentTo({ fromEmail, toEmail }) {
  const client = getClient();

  const messages = await client
    .api(`/users/${fromEmail}/mailFolders/SentItems/messages`)
    .filter(`toRecipients/any(r: r/emailAddress/address eq '${toEmail}')`)
    .select('id,subject,conversationId,sentDateTime')
    .top(1)
    .orderby('sentDateTime desc')
    .get();

  return messages.value.length > 0 ? messages.value[0] : null;
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
