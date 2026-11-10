import { q, one, run, loc, db } from './db.js';
import { hashPassword, verifyPassword, newToken } from './auth.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const languageCodes = () => new Set(q('SELECT code FROM languages').map(r => r.code));

function refs() {
  return {
    countries: new Map(q('SELECT * FROM countries').map(r => [r.id, r])),
    cities: new Map(q('SELECT * FROM cities').map(r => [r.id, r])),
    companies: new Map(q('SELECT * FROM companies').map(r => [r.id, r])),
  };
}

const countryOut = c => ({ iso: c.iso, name: loc(c, 'name'), currency: c.currency });
const langsOf = userId => q('SELECT language_code FROM user_languages WHERE user_id=? ORDER BY language_code', userId).map(r => r.language_code);
const offerLangs = offerId => q('SELECT language_code FROM tour_offer_languages WHERE tour_offer_id=? ORDER BY language_code', offerId).map(r => r.language_code);

function placeOf(R, cityId) {
  const city = R.cities.get(cityId);
  const country = R.countries.get(city.country_id);
  return { city: loc(city, 'name'), country: countryOut(country), currency: country.currency };
}

/* ======================= CATALOG ======================= */

function listGuides(R) {
  return q(`SELECT g.*, u.full_name FROM guide_profiles g JOIN users u ON u.id = g.user_id
            WHERE u.status = 'approved' AND g.is_verified = 1
            ORDER BY g.is_demo, u.full_name`).map(g => {
    const place = placeOf(R, g.city_id);
    const offers = q('SELECT * FROM tour_offers WHERE guide_user_id=? AND is_active=1 ORDER BY id', g.user_id).map(o => ({
      id: o.id, title: loc(o, 'title'), desc: loc(o, 'description'),
      hours: o.duration_hours, price: o.price, currency: place.currency, langs: offerLangs(o.id),
    }));
    return {
      type: 'guides', id: g.user_id, name: g.full_name, ...place,
      langs: langsOf(g.user_id), price: g.daily_rate, rating: g.avg_rating, reviews: g.review_count,
      bio: loc(g, 'bio'), demo: !!g.is_demo, offers,
    };
  });
}

function listCompanyOffers(R) {
  return q('SELECT * FROM tour_offers WHERE is_active=1 AND company_id IS NOT NULL ORDER BY id').map(o => {
    const comp = R.companies.get(o.company_id);
    return {
      type: 'offers', id: o.id, title: loc(o, 'title'), desc: loc(o, 'description'),
      owner: loc(comp, 'name'), ownerKind: comp.kind, hours: o.duration_hours, price: o.price,
      ...placeOf(R, o.city_id), langs: offerLangs(o.id), demo: !!comp.is_demo,
    };
  });
}

function listHotels(R) {
  return q('SELECT * FROM hotels WHERE is_active=1 ORDER BY id').flatMap(h => {
    const rooms = q('SELECT * FROM hotel_rooms WHERE hotel_id=? AND is_active=1 ORDER BY price_per_night', h.id);
    if (!rooms.length) return [];
    const comp = R.companies.get(h.company_id);
    return [{
      type: 'hotels', id: h.id, name: loc(h, 'name'), stars: h.stars, ...placeOf(R, h.city_id),
      price: rooms[0].price_per_night, roomId: rooms[0].id,
      desc: loc(h, 'description'), owner: loc(comp, 'name'), rating: h.avg_rating, reviews: h.review_count,
      demo: !!comp.is_demo,
      rooms: rooms.map(r => ({ id: r.id, type: loc(r, 'room_type'), capacity: r.capacity, price: r.price_per_night })),
    }];
  });
}

function listTickets(R) {
  return q('SELECT * FROM ticket_types WHERE is_active=1 ORDER BY id').map(t => {
    const att = one('SELECT * FROM attractions WHERE id=?', t.attraction_id);
    const comp = t.provider_company_id ? R.companies.get(t.provider_company_id) : null;
    return {
      type: 'tickets', id: t.id, name: loc(t, 'name'), attraction: loc(att, 'name'), desc: loc(att, 'description'),
      ...placeOf(R, att.city_id), price: t.price, duration: t.visit_duration,
      owner: comp ? loc(comp, 'name') : null, demo: comp ? !!comp.is_demo : false,
    };
  });
}

function listCars(R) {
  return q('SELECT * FROM cars WHERE is_active=1 ORDER BY id').map(c => {
    const comp = R.companies.get(c.company_id);
    return {
      type: 'cars', id: c.id, name: loc(c, 'model'), seats: c.seats, driver: !!c.with_driver,
      ...placeOf(R, c.city_id), price: c.price_per_day, owner: loc(comp, 'name'), demo: !!comp.is_demo,
    };
  });
}

const LISTERS = { guides: listGuides, offers: listCompanyOffers, hotels: listHotels, tickets: listTickets, cars: listCars };

export function listings(params) {
  const type = params.get('type') || 'guides';
  if (!LISTERS[type]) fail(400, 'unknown listing type');
  let items = LISTERS[type](refs());

  const country = (params.get('country') || '').toUpperCase();
  if (country) items = items.filter(i => i.country.iso === country);

  const lang = params.get('lang');
  if (lang) items = items.filter(i => !i.langs || i.langs.includes(lang));

  const term = (params.get('q') || '').trim().toLowerCase();
  if (term) {
    items = items.filter(i => JSON.stringify([i.name, i.title, i.city, i.attraction, i.owner])
      .toLowerCase().includes(term));
  }
  return items;
}

export function meta() {
  const R = refs();
  return {
    countries: [...R.countries.values()].map(c => ({
      iso: c.iso, name: loc(c, 'name'), currency: c.currency,
      cities: [...R.cities.values()].filter(x => x.country_id === c.id).map(x => ({ id: x.id, name: loc(x, 'name') })),
    })),
    languages: q('SELECT * FROM languages ORDER BY code').map(l => ({ code: l.code, name: loc(l, 'name') })),
  };
}

/* ======================= AUTH ======================= */

export function publicUser(u) {
  const g = u.role === 'guide' ? one('SELECT is_verified FROM guide_profiles WHERE user_id=?', u.id) : null;
  return {
    id: u.id, role: u.role, status: u.status, name: u.full_name, email: u.email,
    langs: langsOf(u.id), guide: g ? { verified: !!g.is_verified } : null,
  };
}

function createSession(userId) {
  const token = newToken();
  run('INSERT INTO sessions(token, user_id) VALUES(?,?)', token, userId);
  return token;
}

export function login(body) {
  const email = str(body.email, 255).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const u = one('SELECT * FROM users WHERE email=?', email);
  if (!u || !verifyPassword(password, u.password_hash)) fail(401, 'wrong email or password');
  return { token: createSession(u.id), user: publicUser(u) };
}

export function logout(token) {
  run('DELETE FROM sessions WHERE token=?', token);
}

function ensureCity(countryId, name) {
  const found = one('SELECT id FROM cities WHERE country_id=? AND name_en=?', countryId, name);
  if (found) return found.id;
  return Number(run('INSERT INTO cities(country_id,name_ar,name_en,name_fr) VALUES(?,?,?,?)',
    countryId, name, name, name).lastInsertRowid);
}

export function register(b) {
  const role = b.role;
  if (role !== 'tourist' && role !== 'guide') fail(400, 'role must be tourist or guide');
  const name = str(b.name, 120);
  const email = str(b.email, 255).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  if (!name) fail(400, 'name is required');
  if (!isEmail(email)) fail(400, 'invalid email');
  if (password.length < 6) fail(400, 'password must be at least 6 characters');

  const codes = languageCodes();
  const langs = (Array.isArray(b.languages) ? b.languages : []).filter(c => codes.has(c));
  if (!langs.length) fail(400, 'choose at least one language');
  if (one('SELECT id FROM users WHERE email=?', email)) fail(409, 'email already registered');

  let g = null;
  if (role === 'guide') {
    const x = b.guide || {};
    const country = one('SELECT * FROM countries WHERE iso=?', str(x.country, 2).toUpperCase());
    if (!country) fail(400, 'choose a valid country');
    const city = str(x.city, 100);
    const tax = str(x.tax_number, 50);
    const lic = str(x.license_number, 50);
    const exp = str(x.license_expiry, 10);
    const rate = Number(x.daily_rate);
    const glangs = (Array.isArray(x.languages) ? x.languages : []).filter(c => codes.has(c));
    if (!city || !(rate >= 0) || !tax || !lic || !isDate(exp) || !glangs.length) fail(400, 'complete all guide fields');
    if (new Date(exp) <= new Date()) fail(400, 'the guide license has expired');
    if (one('SELECT 1 FROM guide_profiles WHERE tax_number=?', tax)) fail(409, 'tax number already registered');
    if (one('SELECT 1 FROM guide_profiles WHERE license_number=?', lic)) fail(409, 'license number already registered');
    g = { country, city, tax, lic, exp, rate, glangs, bio: str(x.bio, 1000) };
  }

  db.exec('BEGIN');
  try {
    const uid = Number(run('INSERT INTO users(role,status,full_name,email,password_hash) VALUES(?,?,?,?,?)',
      role, role === 'guide' ? 'pending' : 'approved', name, email, hashPassword(password)).lastInsertRowid);
    for (const c of new Set([...langs, ...(g ? g.glangs : [])])) {
      run('INSERT INTO user_languages(user_id, language_code) VALUES(?,?)', uid, c);
    }
    if (g) {
      const cityId = ensureCity(g.country.id, g.city);
      run(`INSERT INTO guide_profiles(user_id,country_id,city_id,daily_rate,bio_ar,bio_en,bio_fr,tax_number,license_number,license_expiry)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
        uid, g.country.id, cityId, g.rate, g.bio, g.bio, g.bio, g.tax, g.lic, g.exp);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return login({ email, password });
}

/* ======================= BOOKINGS ======================= */

function priceItem(it, quantity, R) {
  const id = Number(it.id);
  if (!Number.isInteger(id)) fail(400, 'invalid item id');

  if (it.kind === 'tour') {
    const o = one('SELECT * FROM tour_offers WHERE id=? AND is_active=1', id);
    if (!o) fail(400, 'tour is not available');
    const langs = offerLangs(id);
    if (langs.length && !langs.includes(it.language)) fail(400, 'this tour is not offered in the chosen language');
    return {
      name: o.title_en, unit: o.price, quantity, nights: null, language: it.language || null,
      line: o.price * quantity, currency: placeOf(R, o.city_id).currency,
    };
  }
  if (it.kind === 'hotel_room') {
    const r = one(`SELECT r.*, h.name_en AS hotel_name, h.city_id FROM hotel_rooms r
                   JOIN hotels h ON h.id = r.hotel_id WHERE r.id=? AND r.is_active=1 AND h.is_active=1`, id);
    if (!r) fail(400, 'room is not available');
    const nights = Math.max(1, Math.floor(Number(it.nights || 1)));
    return {
      name: `${r.hotel_name} — ${r.room_type_en}`, unit: r.price_per_night, quantity, nights, language: null,
      line: r.price_per_night * quantity * nights, currency: placeOf(R, r.city_id).currency,
    };
  }
  if (it.kind === 'ticket') {
    const t = one(`SELECT t.*, a.city_id, a.name_en AS attraction FROM ticket_types t
                   JOIN attractions a ON a.id = t.attraction_id WHERE t.id=? AND t.is_active=1`, id);
    if (!t) fail(400, 'ticket is not available');
    return {
      name: `${t.attraction} — ${t.name_en}`, unit: t.price, quantity, nights: null, language: null,
      line: t.price * quantity, currency: placeOf(R, t.city_id).currency,
    };
  }
  if (it.kind === 'car') {
    const c = one('SELECT * FROM cars WHERE id=? AND is_active=1', id);
    if (!c) fail(400, 'car is not available');
    return {
      name: c.model_en, unit: c.price_per_day, quantity, nights: null, language: null,
      line: c.price_per_day * quantity, currency: placeOf(R, c.city_id).currency,
    };
  }
  fail(400, 'unknown item kind');
}

export function createBooking(user, b) {
  if (user.role !== 'tourist') fail(403, 'only traveler accounts can book');
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 20) fail(400, 'add between 1 and 20 items');

  const R = refs();
  const priced = items.map(it => {
    if (!isDate(String(it.date || ''))) fail(400, 'each item needs a valid date (YYYY-MM-DD)');
    const quantity = Math.floor(Number(it.quantity || 1));
    if (!(quantity >= 1 && quantity <= 50)) fail(400, 'quantity must be between 1 and 50');
    const base = priceItem(it, quantity, R);
    return { kind: it.kind, id: Number(it.id), date: it.date, ...base };
  });

  const currencies = [...new Set(priced.map(p => p.currency))];
  if (currencies.length > 1) fail(400, 'all items in one booking must use the same currency');
  const total = priced.reduce((sum, p) => sum + p.line, 0);

  db.exec('BEGIN');
  try {
    const bid = Number(run(`INSERT INTO bookings(tourist_user_id,currency,total_amount,customer_name,notes)
                            VALUES(?,?,?,?,?)`,
      user.id, currencies[0], total, str(b.customer_name, 120) || user.full_name, str(b.notes, 500)).lastInsertRowid);
    const reference = `TE${2000 + bid}`;
    run('UPDATE bookings SET reference=? WHERE id=?', reference, bid);
    for (const p of priced) {
      run(`INSERT INTO booking_items(booking_id,item_kind,item_name,tour_offer_id,hotel_room_id,ticket_type_id,car_id,
                                     service_date,quantity,nights,language_code,unit_price,line_total)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        bid, p.kind, p.name,
        p.kind === 'tour' ? p.id : null,
        p.kind === 'hotel_room' ? p.id : null,
        p.kind === 'ticket' ? p.id : null,
        p.kind === 'car' ? p.id : null,
        p.date, p.quantity, p.nights, p.language, p.unit, p.line);
    }
    db.exec('COMMIT');
    return { id: bid, reference, total, currency: currencies[0] };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function myBookings(user) {
  return q('SELECT * FROM bookings WHERE tourist_user_id=? ORDER BY id DESC', user.id).map(b => ({
    id: b.id, reference: b.reference, status: b.status, currency: b.currency, total: b.total_amount,
    createdAt: b.created_at,
    items: q(`SELECT item_kind AS kind, item_name AS name, service_date AS date, quantity, nights,
                     language_code AS language, unit_price AS unit, line_total AS line
              FROM booking_items WHERE booking_id=? ORDER BY id`, b.id),
  }));
}

/* ======================= GUIDE OFFERS ======================= */

export function createGuideOffer(user, b) {
  if (user.role !== 'guide') fail(403, 'guide accounts only');
  const g = one('SELECT * FROM guide_profiles WHERE user_id=?', user.id);
  if (!g || !g.is_verified || user.status !== 'approved') fail(403, 'your account must be approved before publishing offers');
  const title = str(b.title, 200);
  const desc = str(b.desc, 2000);
  const hours = Number(b.hours);
  const price = Number(b.price);
  if (!title || !(hours > 0) || !(price >= 0)) fail(400, 'title, duration and price are required');

  db.exec('BEGIN');
  try {
    const id = Number(run(`INSERT INTO tour_offers(guide_user_id,city_id,title_ar,title_en,title_fr,
                           description_ar,description_en,description_fr,duration_hours,price)
                           VALUES(?,?,?,?,?,?,?,?,?,?)`,
      user.id, g.city_id, title, title, title, desc, desc, desc, hours, price).lastInsertRowid);
    for (const c of langsOf(user.id)) {
      run('INSERT INTO tour_offer_languages(tour_offer_id, language_code) VALUES(?,?)', id, c);
    }
    db.exec('COMMIT');
    return { id };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* ======================= ADMIN REVIEW ======================= */

export function adminGuides(status) {
  const st = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
  const R = refs();
  return q(`SELECT u.id, u.full_name, u.email, u.status, g.daily_rate, g.tax_number, g.license_number,
                   g.license_expiry, g.city_id
            FROM users u JOIN guide_profiles g ON g.user_id = u.id
            WHERE u.role='guide' AND u.status=? ORDER BY u.id`, st).map(r => ({
    id: r.id, name: r.full_name, email: r.email, status: r.status,
    tax: r.tax_number, license: r.license_number, licenseExpiry: r.license_expiry,
    dailyRate: r.daily_rate, ...placeOf(R, r.city_id), langs: langsOf(r.id),
  }));
}

export function decideGuide(admin, userId, b) {
  const action = b.action;
  if (action !== 'approve' && action !== 'reject') fail(400, 'action must be approve or reject');
  const target = one("SELECT * FROM users WHERE id=? AND role='guide'", userId);
  if (!target) fail(404, 'guide not found');

  db.exec('BEGIN');
  try {
    if (action === 'approve') {
      run("UPDATE users SET status='approved' WHERE id=?", userId);
      run('UPDATE guide_profiles SET is_verified=1, verified_at=CURRENT_TIMESTAMP, verified_by=? WHERE user_id=?', admin.id, userId);
    } else {
      run("UPDATE users SET status='rejected' WHERE id=?", userId);
      run('UPDATE guide_profiles SET is_verified=0, verified_at=NULL, verified_by=NULL WHERE user_id=?', userId);
    }
    run('INSERT INTO admin_actions(admin_user_id,target_user_id,action,note) VALUES(?,?,?,?)',
      admin.id, userId, action, str(b.note, 500));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { id: userId, status: action === 'approve' ? 'approved' : 'rejected' };
}
