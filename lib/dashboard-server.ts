import { dashboardHTML } from './dashboard-html';

export const feeds: Record<string, string> = {
  moneydj: 'https://www.moneydj.com/kmdj/rsscenter.aspx?svc=NW&fno=1&arg=X0000000',
  cnyes: 'https://news.cnyes.com/rss/v1/news/category/tw_stock',
  'cna-finance': 'https://feeds.feedburner.com/rsscna/finance',
  'cna-tech': 'https://feeds.feedburner.com/rsscna/technology',
  udn: 'https://money.udn.com/rssfeed/news/1001/5588/5599?ch=money',
};
const pending = new Map<string, Promise<Response>>();
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control':'no-store'}});
function rssResponse(xml: string, stale = false) {
  return new Response(xml, {headers: {'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store','X-RSS-Stale':stale?'1':'0'}});
}
async function getRSS(id: string, db: D1Database) {
  const cached = await db.prepare('SELECT xml, last_at FROM rss_snapshots WHERE source = ? ORDER BY last_at DESC LIMIT 1').bind(id).first<{xml:string;last_at:number}>();
  if (cached && Date.now()-cached.last_at < 60_000) return rssResponse(cached.xml);
  try {
    const upstream = await fetch(feeds[id], {signal:AbortSignal.timeout(25_000),headers:{Accept:'application/rss+xml, application/xml, text/xml, */*','User-Agent':'MarketPulse/1.0 RSSReader'}});
    if (!upstream.ok) throw new Error('Upstream HTTP '+upstream.status);
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > 8*1024*1024) throw new Error('RSS too large');
    let xml = new TextDecoder().decode(buf);
    const encoding = xml.match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1];
    if (encoding && !/utf-?8/i.test(encoding)) xml = new TextDecoder(encoding).decode(buf);
    if (!/<(?:rss|feed|(?:\w+:)?RDF)[\s>]/i.test(xml) || !/<(?:item|entry)[\s>]/i.test(xml)) throw new Error('Invalid RSS');
    // XML declarations must agree with the normalized UTF-8 response body.
    xml = xml.replace(/(<\?xml[^>]*encoding=["'])[^"']+(["'])/i,'$1UTF-8$2');
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));
    const hash = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const now = Date.now();
    await db.batch([
      db.prepare('INSERT INTO rss_snapshots (key,source,xml,first_at,last_at) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET last_at = excluded.last_at').bind(id+':'+hash,id,xml,now,now),
      db.prepare('DELETE FROM rss_snapshots WHERE last_at < ?').bind(now-7*86400_000),
    ]);
    return rssResponse(xml);
  } catch {
    return cached ? rssResponse(cached.xml,true) : json({error:'新聞來源暫時無法回應，請稍後再試。'},502);
  }
}
export async function serveDashboard(request: Request, env: Cloudflare.Env): Promise<Response | null> {
  const url = new URL(request.url);
  const known = ['/', '/api/health','/api/rss','/api/history'].includes(url.pathname);
  if (!known) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({error:'Method not allowed'},405);
  if (url.pathname === '/') return new Response(request.method==='HEAD'?null:dashboardHTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
  if (url.pathname === '/api/health') return json({app:'market-pulse-sites',feeds:Object.keys(feeds),storage:!!env.DB});
  if (!env.DB) return json({error:'News storage unavailable'},503);
  if (url.pathname === '/api/rss') {
    const id = url.searchParams.get('id') || '';
    if (!Object.hasOwn(feeds,id)) return json({error:'Unknown source'},400);
    let task = pending.get(id);
    if (!task) {task=getRSS(id,env.DB).finally(()=>pending.delete(id));pending.set(id,task);}
    return (await task).clone();
  }
  const result = await env.DB.prepare('SELECT source,xml,first_at,last_at FROM rss_snapshots ORDER BY first_at DESC').all<{source:string;xml:string;first_at:number;last_at:number}>();
  return json({feeds:Object.keys(feeds).map(id=>{
    const rows=result.results.filter(row=>row.source===id);
    return {id,since:rows.length?Math.min(...rows.map(r=>r.first_at)):null,last:rows.length?Math.max(...rows.map(r=>r.last_at)):null,snapshots:rows.map(r=>({at:r.first_at,xml:r.xml}))};
  })});
}
