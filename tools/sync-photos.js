// Sync new photos from the "Apartment Build" Google Drive folder into photos/_incoming/.
// Mechanical half of the pipeline — a Claude session then inspects each photo, assigns
// zone + caption, resizes into photos/YYYY-MM-DD/, updates photos/manifest.json, commits.
//
// Usage:
//   node tools/sync-photos.js list   → show folder contents vs manifest (what's new)
//   node tools/sync-photos.js pull   → download new photos to photos/_incoming/
//
// Credentials: ~/.mc/api-keys.json → google {clientId, clientSecret, refreshToken}
const fs = require('fs');
const path = require('path');
const os = require('os');

const FOLDER_ID = '10mRqSdMGJ7BglHg_t_7O8xljKxp9dpB6'; // "Apartment Build"
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'photos', 'manifest.json');
const INCOMING = path.join(ROOT, 'photos', '_incoming');

async function token() {
  const g = require(path.join(os.homedir(), '.mc', 'api-keys.json')).google;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: g.clientId, client_secret: g.clientSecret,
      refresh_token: g.refreshToken, grant_type: 'refresh_token',
    }),
  });
  const tok = await r.json();
  if (!tok.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(tok));
  return tok.access_token;
}

function knownBasenames() {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return new Set(m.photos.map(p => path.basename(p.file).toLowerCase().replace(/\.[^.]+$/, '')));
}

async function listFolder(t) {
  const files = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,size,createdTime,imageMediaMetadata(time))&pageSize=200${pageToken ? '&pageToken=' + pageToken : ''}`;
    const res = await (await fetch(url, { headers: { authorization: `Bearer ${t}` } })).json();
    files.push(...(res.files || []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return files;
}

(async () => {
  const cmd = process.argv[2] || 'list';
  const t = await token();
  const known = knownBasenames();
  const files = await listFolder(t);
  const fresh = files.filter(f => !known.has(f.name.toLowerCase().replace(/\.[^.]+$/, '')));

  console.log(`Drive folder: ${files.length} photos · manifest: ${known.size} · NEW: ${fresh.length}`);
  for (const f of fresh) console.log(`  NEW  ${f.name}  (${(f.size / 1048576).toFixed(1)} MB, taken ${f.imageMediaMetadata?.time || f.createdTime})`);

  if (cmd === 'pull' && fresh.length) {
    fs.mkdirSync(INCOMING, { recursive: true });
    for (const f of fresh) {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {
        headers: { authorization: `Bearer ${t}` },
      });
      if (!r.ok) { console.error(`FAIL ${f.name}: ${r.status}`); continue; }
      fs.writeFileSync(path.join(INCOMING, path.basename(f.name)), Buffer.from(await r.arrayBuffer()));
      console.log(`PULLED ${f.name}`);
    }
    console.log(`\nStaged in photos/_incoming/ — now inspect, tag, resize, update manifest.`);
  }
})();
