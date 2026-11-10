import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(os.tmpdir(), `tourease-test-${process.pid}-${Date.now()}.db`);
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const env = {
  ...process.env, DB_FILE: DB, PORT: String(PORT),
  ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-test-123',
};
let server;

async function call(method, p, { token, body } = {}) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}

before(async () => {
  execFileSync(process.execPath, ['db/seed.js'], { cwd: ROOT, env, stdio: 'pipe' });
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'pipe' });
  server.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 100; i++) {
    try { await fetch(BASE + '/api/meta'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true });
});

/* ---------- state shared across tests ---------- */
let touristToken, guideToken, adminToken, guideUserId, offerId;
let pendingGuideToken;

test('meta returns countries and languages', async () => {
  const { status, data } = await call('GET', '/api/meta');
  assert.equal(status, 200);
  assert.equal(data.countries.length, 9);
  assert.ok(data.languages.length >= 8);
});

test('catalog listings return demo content in every section', async () => {
  for (const type of ['guides', 'offers', 'hotels', 'tickets', 'cars']) {
    const { status, data } = await call('GET', `/api/listings?type=${type}`);
    assert.equal(status, 200, type);
    assert.ok(data.items.length >= 1, `${type} should have items`);
  }
  const guides = await call('GET', '/api/listings?type=guides');
  assert.ok(guides.data.items.every(g => g.demo === true), 'only demo guides at this point');
});

test('listing filters: country and language', async () => {
  const eg = await call('GET', '/api/listings?type=hotels&country=EG');
  assert.ok(eg.data.items.length >= 2);
  assert.ok(eg.data.items.every(h => h.country.iso === 'EG'));
  const frGuides = await call('GET', '/api/listings?type=guides&lang=fr');
  assert.ok(frGuides.data.items.every(g => g.langs.includes('fr')));
  const none = await call('GET', '/api/listings?type=guides&q=zzzz-no-match');
  assert.equal(none.data.items.length, 0);
});

test('tourist registers, logs in, and sees own profile', async () => {
  const r = await call('POST', '/api/auth/register', { body: {
    role: 'tourist', name: 'Sara Test', email: 'sara@test.local', password: 'secret123', languages: ['en', 'fr'],
  } });
  assert.equal(r.status, 201);
  assert.ok(r.data.token);
  touristToken = r.data.token;

  const me = await call('GET', '/api/me', { token: touristToken });
  assert.equal(me.data.user.role, 'tourist');
  assert.equal(me.data.user.status, 'approved');
  assert.deepEqual(me.data.user.langs, ['en', 'fr']);

  const wrong = await call('POST', '/api/auth/login', { body: { email: 'sara@test.local', password: 'nope-nope' } });
  assert.equal(wrong.status, 401);
  const ok = await call('POST', '/api/auth/login', { body: { email: 'sara@test.local', password: 'secret123' } });
  assert.equal(ok.status, 200);
});

test('guide registers as pending, is hidden, and cannot publish offers', async () => {
  const r = await call('POST', '/api/auth/register', { body: {
    role: 'guide', name: 'Omar Guide', email: 'omar@test.local', password: 'secret123', languages: ['ar', 'en'],
    guide: { country: 'EG', city: 'Cairo', daily_rate: 300, bio: 'Test guide bio', tax_number: 'TAX-1001',
             license_number: 'LIC-1001', license_expiry: '2030-01-01', languages: ['ar', 'en'] },
  } });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.status, 'pending');
  pendingGuideToken = r.data.token;

  const offer = await call('POST', '/api/guide/offers', { token: pendingGuideToken, body: { title: 'x', hours: 2, price: 100 } });
  assert.equal(offer.status, 403);

  const list = await call('GET', '/api/listings?type=guides');
  assert.ok(!list.data.items.some(g => g.name === 'Omar Guide'), 'pending guide must not be public');
});

test('duplicate email and duplicate tax/license numbers are rejected', async () => {
  const dupEmail = await call('POST', '/api/auth/register', { body: {
    role: 'tourist', name: 'Dup', email: 'sara@test.local', password: 'secret123', languages: ['en'] } });
  assert.equal(dupEmail.status, 409);

  const dupTax = await call('POST', '/api/auth/register', { body: {
    role: 'guide', name: 'Other', email: 'other@test.local', password: 'secret123', languages: ['en'],
    guide: { country: 'EG', city: 'Luxor', daily_rate: 200, tax_number: 'TAX-1001', license_number: 'LIC-2002',
             license_expiry: '2030-01-01', languages: ['en'] } } });
  assert.equal(dupTax.status, 409);
});

test('admin-only endpoints reject tourists and anonymous users', async () => {
  const anon = await call('GET', '/api/admin/guides?status=pending');
  assert.equal(anon.status, 401);
  const admin = await call('POST', '/api/auth/login', { body: { email: 'admin@test.local', password: 'admin-test-123' } });
  assert.equal(admin.status, 200);
  assert.equal(admin.data.user.role, 'admin');
  adminToken = admin.data.token;
  const tourist = await call('GET', '/api/admin/guides?status=pending', { token: touristToken });
  assert.equal(tourist.status, 403);
});

test('admin approves the guide; guide becomes public and can publish an offer', async () => {
  const pending = await call('GET', '/api/admin/guides?status=pending', { token: adminToken });
  const row = pending.data.items.find(x => x.email === 'omar@test.local');
  assert.ok(row, 'pending guide should be in the admin queue');
  guideUserId = row.id;

  const ok = await call('POST', `/api/admin/guides/${guideUserId}/decision`, { token: adminToken, body: { action: 'approve' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status, 'approved');

  const list = await call('GET', '/api/listings?type=guides&q=omar');
  assert.equal(list.data.items.length, 1);

  const relog = await call('POST', '/api/auth/login', { body: { email: 'omar@test.local', password: 'secret123' } });
  guideToken = relog.data.token;
  assert.equal(relog.data.user.guide.verified, true);

  const offer = await call('POST', '/api/guide/offers', { token: guideToken, body: {
    title: 'Cairo old town walk', hours: 3, price: 400, desc: 'Walking tour' } });
  assert.equal(offer.status, 201);
  offerId = offer.data.id;

  const after2 = await call('GET', '/api/listings?type=guides&q=omar');
  assert.ok(after2.data.items[0].offers.some(o => o.id === offerId));
});

test('a rejected guide stays hidden and cannot publish', async () => {
  const r = await call('POST', '/api/auth/register', { body: {
    role: 'guide', name: 'Rejected Guide', email: 'rej@test.local', password: 'secret123', languages: ['en'],
    guide: { country: 'EG', city: 'Aswan', daily_rate: 150, tax_number: 'TAX-3003', license_number: 'LIC-3003',
             license_expiry: '2030-01-01', languages: ['en'] } } });
  assert.equal(r.status, 201);
  const id = (await call('GET', '/api/admin/guides?status=pending', { token: adminToken }))
    .data.items.find(x => x.email === 'rej@test.local').id;
  const rej = await call('POST', `/api/admin/guides/${id}/decision`, { token: adminToken, body: { action: 'reject' } });
  assert.equal(rej.data.status, 'rejected');

  const list = await call('GET', '/api/listings?type=guides&q=rejected');
  assert.equal(list.data.items.length, 0);
  const login = await call('POST', '/api/auth/login', { body: { email: 'rej@test.local', password: 'secret123' } });
  assert.equal(login.data.user.status, 'rejected');
  const offer = await call('POST', '/api/guide/offers', { token: login.data.token, body: { title: 'x', hours: 1, price: 1 } });
  assert.equal(offer.status, 403);
});

test('tourist books a hotel room and a company tour; server computes the total', async () => {
  const hotels = await call('GET', '/api/listings?type=hotels&country=EG');
  const nile = hotels.data.items.find(h => h.name.en.includes('Nile View'));
  assert.ok(nile);
  const tours = await call('GET', '/api/listings?type=offers&country=EG&lang=en');
  const tour = tours.data.items.find(t => t.title.en.includes('Desert'));
  assert.ok(tour, 'company tour in Egypt');

  const r = await call('POST', '/api/bookings', { token: touristToken, body: {
    customer_name: 'Sara Test', notes: 'late arrival',
    items: [
      { kind: 'hotel_room', id: nile.roomId, date: '2027-01-10', nights: 2, quantity: 1 },
      { kind: 'tour', id: tour.id, date: '2027-01-11', quantity: 2, language: 'en' },
    ],
  } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.total, nile.price * 1 * 2 + tour.price * 2);
  assert.equal(r.data.currency, 'EGP');
  assert.match(r.data.reference, /^TE\d+$/);

  const mine = await call('GET', '/api/bookings', { token: touristToken });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.items[0].reference, r.data.reference);
  assert.equal(mine.data.items[0].items.length, 2);
});

test('a tourist can book an offer published by a guide', async () => {
  const booking = await call('POST', '/api/bookings', { token: touristToken, body: {
    items: [{ kind: 'tour', id: offerId, date: '2027-02-01', quantity: 3, language: 'en' }] } });
  assert.equal(booking.status, 201);
  assert.equal(booking.data.total, 400 * 3);
});

test('ticket booking across two currencies is refused', async () => {
  const tickets = await call('GET', '/api/listings?type=tickets');
  const pyr = tickets.data.items.find(t => t.attraction.en.includes('Pyramids'));
  const burj = tickets.data.items.find(t => t.attraction.en.includes('Burj'));
  const r = await call('POST', '/api/bookings', { token: touristToken, body: { items: [
    { kind: 'ticket', id: pyr.id, date: '2027-03-01', quantity: 1 },
    { kind: 'ticket', id: burj.id, date: '2027-03-01', quantity: 1 } ] } });
  assert.equal(r.status, 400);
});

test('booking guard rails: anonymous, guide, bad date, unsupported language', async () => {
  const body = { items: [{ kind: 'tour', id: offerId, date: '2027-02-01', quantity: 1, language: 'en' }] };
  assert.equal((await call('POST', '/api/bookings', { body })).status, 401);
  assert.equal((await call('POST', '/api/bookings', { token: guideToken, body })).status, 403);
  const badDate = await call('POST', '/api/bookings', { token: touristToken, body: {
    items: [{ kind: 'tour', id: offerId, date: '31/12/2027', quantity: 1, language: 'en' }] } });
  assert.equal(badDate.status, 400);
  const badLang = await call('POST', '/api/bookings', { token: touristToken, body: {
    items: [{ kind: 'tour', id: offerId, date: '2027-02-01', quantity: 1, language: 'zh' }] } });
  assert.equal(badLang.status, 400);
});

test('car rental can be booked with a day count', async () => {
  const cars = await call('GET', '/api/listings?type=cars&country=EG');
  const car = cars.data.items[0];
  const r = await call('POST', '/api/bookings', { token: touristToken, body: {
    items: [{ kind: 'car', id: car.id, date: '2027-04-01', quantity: 3 }] } });
  assert.equal(r.status, 201);
  assert.equal(r.data.total, car.price * 3);
});

test('logout invalidates the session', async () => {
  const out = await call('POST', '/api/auth/logout', { token: touristToken });
  assert.equal(out.status, 200);
  const me = await call('GET', '/api/me', { token: touristToken });
  assert.equal(me.status, 401);
});

test('unknown routes return 404 JSON', async () => {
  const r = await call('GET', '/api/does-not-exist');
  assert.equal(r.status, 404);
  assert.ok(r.data.error);
});
