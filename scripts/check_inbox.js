import 'dotenv/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

const credential = new ClientSecretCredential(
  process.env.MS_TENANT_ID,
  process.env.MS_CLIENT_ID,
  process.env.MS_CLIENT_SECRET
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const client = Client.initWithMiddleware({ authProvider });

const agents = [
  { name: 'Megan Barrett', email: 'mbarrett@1cloudnow.com' },
  { name: 'Lauren Mitchell', email: 'lmitchell@1cloudnow.com' },
  { name: 'Kate Harmon', email: 'kharmon@1cloudnow.com' },
  { name: 'Scott Mercer', email: 'smercer@1cloudnow.com' },
];

for (const agent of agents) {
  try {
    console.log(`\n=== ${agent.name} (${agent.email}) ===`);

    const inbox = await client
      .api(`/users/${agent.email}/mailFolders/Inbox`)
      .select('displayName,totalItemCount,unreadItemCount')
      .get();

    console.log(`  Total: ${inbox.totalItemCount}, Unread: ${inbox.unreadItemCount}`);

    // Show recent messages
    const messages = await client
      .api(`/users/${agent.email}/mailFolders/Inbox/messages`)
      .select('subject,from,receivedDateTime,isRead')
      .top(5)
      .orderby('receivedDateTime desc')
      .get();

    if (messages.value.length === 0) {
      console.log('  No messages in inbox');
    } else {
      for (const msg of messages.value) {
        const from = msg.from?.emailAddress?.address || 'unknown';
        const read = msg.isRead ? 'read' : 'UNREAD';
        console.log(`  [${read}] From: ${from} - "${msg.subject}" (${msg.receivedDateTime})`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
}
