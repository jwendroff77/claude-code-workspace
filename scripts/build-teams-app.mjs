// Builds the Teams app package for Daniel: teams-app/daniel-teams-app.zip
// Usage: node scripts/build-teams-app.mjs <bot-id>
// Then in Teams: Apps > Manage your apps > Upload an app > Upload a custom app.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

const botId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(botId || '')) { console.error('Give the bot id (a GUID) from the Teams Developer Portal.'); process.exit(1); }

// --- tiny PNG writer (solid shapes, no dependencies) ---
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const inCircle = (x, y, s, r) => (x - s / 2 + 0.5) ** 2 + (y - s / 2 + 0.5) ** 2 <= r * r;
// Color icon: 1Cloud teal background with a white circle.  Outline icon: white ring on transparent.
const color = png(192, (x, y) => (inCircle(x, y, 192, 52) ? [255, 255, 255, 255] : [8, 145, 178, 255]));
const outline = png(32, (x, y) => (inCircle(x, y, 32, 14) && !inCircle(x, y, 32, 10) ? [255, 255, 255, 255] : [0, 0, 0, 0]));

const manifest = {
  $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json',
  manifestVersion: '1.17',
  version: '1.0.0',
  id: crypto.randomUUID(),
  developer: { name: '1Cloud Communications', websiteUrl: 'https://www.1cloudcommunications.com', privacyUrl: 'https://www.1cloudcommunications.com', termsOfUseUrl: 'https://www.1cloudcommunications.com' },
  name: { short: 'Daniel Reyes', full: 'Daniel Reyes, Operations Manager' },
  description: { short: '1Cloud AI operations manager', full: "Chat with Daniel, 1Cloud's AI operations manager.  He looks things up, keeps your list, and drafts emails you send with one tap." },
  icons: { color: 'color.png', outline: 'outline.png' },
  accentColor: '#0891B2',
  bots: [{ botId, scopes: ['personal'], supportsFiles: false, isNotificationOnly: false }],
  permissions: ['identity', 'messageTeamMembers'],
  validDomains: [],
};

// --- tiny ZIP writer (stored, no compression) ---
function zip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, data] of files) {
    const n = Buffer.from(name); const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n); offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const out = path.join(process.cwd(), 'teams-app');
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'daniel-teams-app.zip');
fs.writeFileSync(file, zip([['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2))], ['color.png', color], ['outline.png', outline]]));
console.log('Built', file);
