import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.resolve(root, '../.cache/rss');
const port = 4188;
const feeds = {
  moneydj: 'https://www.moneydj.com/kmdj/rsscenter.aspx?svc=NW&fno=1&arg=X0000000',
  cnyes: 'https://news.cnyes.com/rss/v1/news/category/tw_stock',
  'cna-finance': 'https://feeds.feedburner.com/rsscna/finance',
  'cna-tech': 'https://feeds.feedburner.com/rsscna/technology',
  udn: 'https://money.udn.com/rssfeed/news/1001/5588/5599?ch=money'
};
const inflight = new Map();
await mkdir(cacheDir, { recursive: true });
const history = new Map();
for (const id of Object.keys(feeds)) {
  try { history.set(id, JSON.parse(await readFile(path.join(cacheDir, id + '-history.json'), 'utf8'))); }
  catch { history.set(id, { checks: [], snapshots: [] }); }
}
async function archiveFeed(id, result) {
  const record = history.get(id), cutoff = Date.now() - 7 * 86400000;
  record.checks = record.checks.filter(at => at >= cutoff);
  record.checks.push(result.at);
  record.snapshots = record.snapshots.filter(s => s.at >= cutoff);
  const hash = createHash('sha256').update(result.body).digest('hex');
  if (record.snapshots.at(-1)?.hash !== hash) record.snapshots.push({ ...result, hash });
  const filename = path.join(cacheDir, id + '-history.json');
  await writeFile(filename + '.tmp', JSON.stringify(record));
  await rename(filename + '.tmp', filename);
}
function historyPayload() {
  return { feeds: [...history].map(([id, record]) => {
    let since = record.checks[0] ?? null;
    for (let i = 1; i < record.checks.length; i++) if (record.checks[i] - record.checks[i-1] > 15 * 60000) since = record.checks[i];
    return { id, since, last: record.checks.at(-1) ?? null,
      snapshots: record.snapshots.filter(s => s.at >= Date.now() - 48 * 3600000).map(s => {
        const buf = Buffer.from(s.body, 'base64');
        let xml = new TextDecoder().decode(buf);
        const encoding = xml.match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1];
        if (encoding && !/utf-?8/i.test(encoding)) { try { xml = new TextDecoder(encoding).decode(buf); } catch {} }
        return { at: s.at, xml };
      }) };
  }) };
}

async function fetchFeed(id) {
  if (inflight.has(id)) return inflight.get(id);
  const task = (async () => {
    const filename = path.join(cacheDir, id + '.json');
    let cached;
    try { cached = JSON.parse(await readFile(filename, 'utf8')); } catch {}
    if (cached && Date.now() - cached.at < 60000) return { ...cached, stale: false };
    try {
      const response = await fetch(feeds[id], {
        signal: AbortSignal.timeout(25000),
        headers: { 'User-Agent': 'MarketPulseLocal/1.0 RSSReader', Accept: 'application/rss+xml, application/xml, text/xml, */*' }
      });
      if (!response.ok) throw new Error('來源回應 HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) throw new Error('RSS 超出大小限制');
      const content = bytes.toString('utf8');
      if (!/<(?:rss|feed|rdf:RDF)\b/i.test(content)) throw new Error('來源未回傳 RSS');
      const result = { at: Date.now(), body: bytes.toString('base64') };
      await writeFile(filename, JSON.stringify(result));
      await archiveFeed(id, result);
      return { ...result, stale: false };
    } catch (error) {
      if (cached) return { ...cached, stale: true };
      throw error;
    }
  })();
  inflight.set(id, task);
  try { return await task; } finally { inflight.delete(id); }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) {
    res.writeHead(403); return res.end('Forbidden host');
  }
  if (req.method !== 'GET') { res.writeHead(405); return res.end('GET only'); }
  const url = new URL(req.url, 'http://127.0.0.1:' + port);
  try {
    if (url.pathname === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ app: 'market-pulse-local', port, feeds: Object.keys(feeds) }));
    }
    if (url.pathname === '/api/history') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(historyPayload()));
    }
    if (url.pathname === '/api/rss') {
      const id = url.searchParams.get('id');
      if (!Object.hasOwn(feeds, id)) { res.writeHead(400); return res.end('Unknown feed'); }
      const result = await fetchFeed(id);
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('X-RSS-Stale', result.stale ? '1' : '0');
      res.setHeader('X-RSS-Fetched-At', new Date(result.at).toISOString());
      return res.end(Buffer.from(result.body, 'base64'));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(await readFile(path.join(root, 'index.html')));
    }
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.name === 'TimeoutError' ? '來源讀取逾時，請稍後重試' : error.message }));
  }
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log('Market Pulse: http://127.0.0.1:' + port));
// Keep collecting while this local server is running, even with the browser closed.
const collect = () => Promise.allSettled(Object.keys(feeds).map(fetchFeed));
collect();
setInterval(collect, 5 * 60000);
