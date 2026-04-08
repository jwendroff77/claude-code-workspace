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

    // Check sent items from today
    const today = new Date().toISOString().split('T')[0];
    const messages = await client
      .api(`/users/${agent.email}/mailFolders/SentItems/messages`)
      .filter(`sentDateTime ge ${today}T00:00:00Z`)
      .select('subject,sentDateTime,toRecipients')
      .top(10)
      .orderby('sentDateTime desc')
      .get();

    if (messages.value.length === 0) {
      console.log('  NO SENT EMAILS FOUND IN MICROSOFT');
    } else {
      console.log(`  Found ${messages.value.length} sent emails today:`);
      for (const msg of messages.value) {
        const to = msg.toRecipients?.[0]?.emailAddress?.address || 'unknown';
        console.log(`  - "${msg.subject}" -> ${to} at ${msg.sentDateTime}`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message || err.code}`);
  }
}
