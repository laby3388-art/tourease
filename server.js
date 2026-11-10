import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one } from './lib/db.js';
import * as S from './lib/service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1_000_000) S.fail(413, 'payload too large');
  }
  if (!data) return {};
  try { return JSON.parse(data); } catch { S.fail(400, 'invalid JSON'); }
}

function authUser(req) {
  const m = /^Bearer\s+([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  return one('SELECT u.*, s.token FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token=?', m[1]) || null;
}

const need = user => { if (!user) S.fail(401, 'please log in first'); return user; };
const requireAdmin = user => { if (need(user).role !== 'admin') S.fail(403, 'admins only'); return user; };

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const user = authUser(req);

  if (m === 'GET' && p === '/api/meta') return send(res, 200, S.meta());
  if (m === 'GET' && p === '/api/listings') return send(res, 200, { items: S.listings(url.searchParams) });

  if (m === 'POST' && p === '/api/auth/register') return send(res, 201, S.register(await readJson(req)));
  if (m === 'POST' && p === '/api/auth/login') return send(res, 200, S.login(await readJson(req)));
  if (m === 'POST' && p === '/api/auth/logout') {
    if (user) S.logout(user.token);
    return send(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/api/me') return send(res, 200, { user: S.publicUser(need(user)) });

  if (m === 'POST' && p === '/api/bookings') return send(res, 201, S.createBooking(need(user), await readJson(req)));
  if (m === 'GET' && p === '/api/bookings') return send(res, 200, { items: S.myBookings(need(user)) });

  if (m === 'POST' && p === '/api/guide/offers') return send(res, 201, S.createGuideOffer(need(user), await readJson(req)));

  if (m === 'GET' && p === '/api/admin/guides') {
    requireAdmin(user);
    return send(res, 200, { items: S.adminGuides(url.searchParams.get('status')) });
  }
  const decision = /^\/api\/admin\/guides\/(\d+)\/decision$/.exec(p);
  if (m === 'POST' && decision) {
    requireAdmin(user);
    return send(res, 200, S.decideGuide(user, Number(decision[1]), await readJson(req)));
  }

  S.fail(404, 'not found');
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(url.pathname, res);
  } catch (e) {
    if (e instanceof S.HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => console.log(`TourEase running on http://localhost:${PORT}`));
