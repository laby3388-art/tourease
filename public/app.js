/* TourEase frontend. Uses the server API; translations come from i18n.js (LANG, t, L). */

/* ================= API ================= */
const API = {
  token: null,
  async call(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
    return data;
  },
};
function saveToken(token) {
  API.token = token;
  try { token ? localStorage.setItem('te_token', token) : localStorage.removeItem('te_token'); } catch { /* storage blocked */ }
}

/* ================= STATE ================= */
let META = { countries: [], languages: [] };
let ME = null;
const ITEMS = new Map(); // "kind:id" -> booking target
const EMO = { guides: '🧭', offers: '🗺️', hotels: '🏨', tickets: '🎫', cars: '🚗' };
const UNIT = { guides: 'u_day', offers: 'u_person', hotels: 'u_night', tickets: 'u_ticket', cars: 'u_day' };

/* ================= HELPERS ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n).toLocaleString(LANG === 'ar' ? 'ar-EG' : LANG === 'fr' ? 'fr-FR' : 'en-US');
const open = id => $(id).classList.add('open');
const closeOv = el => el.closest('.overlay').classList.remove('open');
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._h);
  el._h = setTimeout(() => el.classList.remove('show'), 3000);
}
const nameOf = x => (typeof x === 'string' ? x : L(x));
const countryName = c => L(c.name);
const checked = box => [...box.querySelectorAll('input:checked')].map(i => i.value);
const LN = code => { const l = META.languages.find(x => x.code === code); return l ? L(l.name) : code; };

/* ================= STATIC TEXT & SELECTS ================= */
function applyStatic() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  document.body.setAttribute('dir', LANG === 'ar' ? 'rtl' : 'ltr');
  $('#langSel').value = LANG;
  fillSelects();
  updateHeader();
}

function fillSelects() {
  const keep = {};
  $$('select.cSel').forEach(s => { keep[s.dataset.sec] = s.value; });
  const countryOpts = `<option value="">${esc(t('all'))}</option>` +
    META.countries.map(c => `<option value="${c.iso}">${esc(countryName(c))}</option>`).join('');
  $$('select.cSel').forEach(s => { s.innerHTML = countryOpts; s.value = keep[s.dataset.sec] || ''; });

  const hc = $('#hCountry');
  const hv = hc.value;
  hc.innerHTML = countryOpts;
  hc.value = hv;

  $('#rCountry').innerHTML = META.countries.map(c => `<option value="${c.iso}">${esc(countryName(c))}</option>`).join('');

  const gl = $('#gLang');
  const gv = gl.value;
  gl.innerHTML = `<option value="">${esc(t('any_lang'))}</option>` +
    META.languages.map(l => `<option value="${l.code}">${esc(L(l.name))}</option>`).join('');
  gl.value = gv;

  ['#rLangsT', '#rLangsG'].forEach(id => {
    const prev = checked($(id));
    $(id).innerHTML = META.languages.map(l =>
      `<label><input type="checkbox" value="${l.code}" ${prev.includes(l.code) ? 'checked' : ''}>${esc(L(l.name))}</label>`).join('');
  });
}

/* ================= CATALOG ================= */
function registerTarget(sec, it) {
  const map = { offers: ['tour', it.id], hotels: ['hotel_room', it.roomId], tickets: ['ticket', it.id], cars: ['car', it.id] };
  const pair = map[sec];
  if (!pair) return '';
  const [kind, id] = pair;
  const key = kind + ':' + id;
  ITEMS.set(key, {
    kind, id,
    name: sec === 'offers' ? L(it.title) : nameOf(it.name),
    price: it.price, currency: it.currency,
    langs: it.langs && it.langs.length ? it.langs : null,
    nightly: sec === 'hotels',
  });
  return key;
}

function cardHTML(sec, it) {
  const title = sec === 'offers' ? L(it.title) : nameOf(it.name);
  const cityTxt = it.city ? L(it.city) : '';
  const countryTxt = countryName(it.country);
  const tags = [];
  if (it.demo) tags.push(`<span class="tag demo">${esc(t('demo'))}</span>`);
  else if (sec === 'guides') tags.push(`<span class="tag">✓ ${esc(t('verified'))}</span>`);

  const chips = [`<span class="chip">📍 ${esc(cityTxt || countryTxt)}</span>`];
  if (it.langs) it.langs.slice(0, 3).forEach(c => chips.push(`<span class="chip gold">${esc(LN(c))}</span>`));
  if (it.hours) chips.push(`<span class="chip">⏱ ${it.hours} h</span>`);
  else if (it.duration) chips.push(`<span class="chip">⏱ ${esc(it.duration)}</span>`);
  if (sec === 'hotels') chips.push(`<span class="chip gold">${'★'.repeat(it.stars || 0)}</span>`);
  if (sec === 'cars') chips.push(`<span class="chip">${it.seats} ${esc(t('seats'))}</span>`,
    `<span class="chip">${esc(it.driver ? t('driver_yes') : t('driver_no'))}</span>`);

  const desc = sec === 'guides' ? L(it.bio) : L(it.desc);
  const rating = it.reviews ? `<div class="rate">★ ${it.rating} <span class="sub">(${it.reviews} ${esc(t('reviews'))})</span></div>` : '';
  const key = registerTarget(sec, it);
  const bookBtn = sec === 'guides' ? '' :
    `<button class="btn btn-navy btn-sm" data-act="book" data-key="${key}">${esc(t('book'))}</button>`;

  return `<article class="card">
    <div class="cover">${EMO[sec]}${tags.join('')}</div>
    <div class="body">
      <div class="ttl">${esc(title)}</div>
      <div class="sub">${esc(countryTxt)}</div>
      <div class="chips">${chips.join('')}</div>
      <div class="clamp">${esc(desc)}</div>
      ${rating}
      <div class="foot">
        <div class="price">${fmt(it.price)} <small>${esc(it.currency)} ${esc(t(UNIT[sec]))}</small></div>
        <div class="btns">
          <button class="btn btn-line btn-sm" data-act="details" data-sec="${sec}" data-id="${it.id}">${esc(t('details'))}</button>
          ${bookBtn}
        </div>
      </div>
    </div>
  </article>`;
}

async function loadSection(sec, query = '') {
  const grid = $('#' + sec + 'Grid');
  const params = new URLSearchParams({ type: sec });
  const country = $(`select.cSel[data-sec="${sec}"]`)?.value || '';
  if (country) params.set('country', country);
  if (sec === 'guides' && $('#gLang').value) params.set('lang', $('#gLang').value);
  if (query) params.set('q', query);
  try {
    const { items } = await API.call('GET', '/api/listings?' + params.toString());
    grid.innerHTML = items.length ? items.map(it => cardHTML(sec, it)).join('')
      : `<div class="empty">${esc(t('no_offers'))}</div>`;
  } catch (e) {
    grid.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}
const loadAll = () => ['guides', 'offers', 'hotels', 'tickets', 'cars'].forEach(s => loadSection(s));

/* ================= DETAILS ================= */
async function showDetails(sec, id) {
  let it;
  try {
    const { items } = await API.call('GET', '/api/listings?type=' + sec);
    it = items.find(x => String(x.id) === String(id));
  } catch (e) { toast(e.message); return; }
  if (!it) return;

  const title = sec === 'offers' ? L(it.title) : nameOf(it.name);
  const body = sec === 'guides' ? L(it.bio) : L(it.desc);
  const rows = [
    [t('country'), countryName(it.country)],
    [t('city'), it.city ? L(it.city) : '—'],
    [t('price'), `${fmt(it.price)} ${it.currency} ${t(UNIT[sec])}`],
  ];
  if (it.reviews) rows.push([t('rating'), `★ ${it.rating} (${it.reviews})`]);
  if (sec === 'guides') rows.push([t('langs'), it.langs.map(LN).join('، ')]);
  if (sec === 'hotels') rows.push([t('stars'), '★'.repeat(it.stars || 0)]);
  if (sec === 'cars') rows.push([t('seats'), it.seats],
    [{ ar: 'السواق', en: 'Driver', fr: 'Chauffeur' }[LANG], it.driver ? t('driver_yes') : t('driver_no')]);
  if (it.hours) rows.push([t('duration'), `${it.hours} h`]);
  if (it.duration) rows.push([t('duration'), it.duration]);

  let extra = '';
  let footer = '';
  if (sec === 'guides') {
    extra = `<div class="section-title">${esc(t('offers_h'))}</div>` + (it.offers.length
      ? it.offers.map(o => {
        const key = registerTarget('offers', { id: o.id, title: o.title, price: o.price, currency: it.currency, langs: o.langs.length ? o.langs : it.langs });
        return `<div class="offer">
          <h5>${esc(L(o.title))}</h5>
          <div class="sub">⏱ ${o.hours} h · ${fmt(o.price)} ${esc(it.currency)}</div>
          <p>${esc(L(o.desc))}</p>
          <div style="text-align:end;margin-top:8px"><button class="btn btn-navy btn-sm" data-act="book" data-key="${key}">${esc(t('book'))}</button></div>
        </div>`;
      }).join('')
      : `<p class="sub">${esc(t('no_offers'))}</p>`);
  } else if (sec === 'hotels') {
    extra = `<div class="section-title">${esc({ ar: 'الغرف', en: 'Rooms', fr: 'Chambres' }[LANG])}</div>` + it.rooms.map(r => {
      const key = registerTarget('hotels', { roomId: r.id, name: `${title} — ${L(r.type)}`, price: r.price, currency: it.currency, langs: null });
      return `<div class="offer">
        <h5>${esc(L(r.type))}</h5>
        <div class="sub">👥 ${r.capacity} · ${fmt(r.price)} ${esc(it.currency)} ${esc(t('u_night'))}</div>
        <div style="text-align:end;margin-top:8px"><button class="btn btn-navy btn-sm" data-act="book" data-key="${key}">${esc(t('book'))}</button></div>
      </div>`;
    }).join('');
  } else {
    const key = registerTarget(sec, it);
    footer = `<button class="btn btn-navy btn-block" style="margin-top:18px" data-act="book" data-key="${key}">${esc(t('book_now'))}</button>`;
  }

  $('#boxDetail').innerHTML = `
    <button class="x" data-close>✕</button>
    <div class="hero-ico">${EMO[sec]}</div>
    <h3>${esc(title)}</h3>
    <p class="lead">${esc(body)}</p>
    <div class="kv">${rows.map(([k, v]) => `<div><small>${esc(k)}</small>${esc(v)}</div>`).join('')}</div>
    ${extra}${footer}`;
  open('#ovDetail');
}

/* ================= BOOKING ================= */
function startBook(key) {
  if (!ME) { toast(t('need_login')); openAuth('login'); return; }
  if (ME.role !== 'tourist') { toast(t('guide_nobook')); return; }
  const it = ITEMS.get(key);
  if (!it) return;

  const qtyLabel = { tour: 'q_guests', hotel_room: 'q_rooms', ticket: 'q_tickets', car: 'q_days' }[it.kind];
  const langField = it.kind === 'tour' && it.langs
    ? `<div><label>${esc(t('langs'))}</label><select id="bLang">${it.langs.map(c => `<option value="${c}">${esc(LN(c))}</option>`).join('')}</select></div>`
    : '';
  const nightField = it.nightly
    ? `<div><label>${esc(t('nights'))}</label><input id="bNights" type="number" min="1" value="2"></div>` : '';

  $('#boxBook').innerHTML = `
    <button class="x" data-close>✕</button>
    <h3>${esc(t('book_h'))}</h3>
    <p class="lead">${esc(it.name)}</p>
    <div class="fm">
      <div class="two">
        <div><label>${esc(t('date'))}</label><input type="date" id="bDate"></div>
        <div><label>${esc(t(qtyLabel))}</label><input type="number" id="bQty" min="1" value="1"></div>
      </div>
      ${nightField}${langField}
      <div><label>${esc(t('name_bk'))}</label><input id="bName" value="${esc(ME.name)}"></div>
      <div><label>${esc(t('notes'))}</label><textarea id="bNotes"></textarea></div>
    </div>
    <div class="total"><span>${esc(t('total'))}</span><b id="bTotal"></b></div>
    <button class="btn btn-gold btn-block" style="margin-top:14px" id="doBook" data-key="${key}">${esc(t('confirm'))}</button>`;

  const recalc = () => {
    const q = Math.max(1, +$('#bQty').value || 1);
    const n = it.nightly ? Math.max(1, +$('#bNights').value || 1) : 1;
    $('#bTotal').textContent = `${fmt(it.price * q * n)} ${it.currency}`;
  };
  $('#boxBook').oninput = recalc;
  recalc();
  $('#ovDetail').classList.remove('open');
  open('#ovBook');
}

async function submitBooking(key) {
  const it = ITEMS.get(key);
  const date = $('#bDate').value;
  if (!date) { toast(t('pick_date')); return; }
  const item = { kind: it.kind, id: it.id, date, quantity: Math.max(1, +$('#bQty').value || 1) };
  if (it.nightly) item.nights = Math.max(1, +$('#bNights').value || 1);
  if ($('#bLang')) item.language = $('#bLang').value;
  try {
    const r = await API.call('POST', '/api/bookings', { customer_name: $('#bName').value, notes: $('#bNotes').value, items: [item] });
    closeOv($('#boxBook'));
    toast(t('booked') + r.reference);
  } catch (e) {
    toast(e.message);
  }
}

/* ================= AUTH ================= */
function openAuth(mode = 'register') {
  $('#pReg').classList.toggle('hidden', mode !== 'register');
  $('#pLog').classList.toggle('hidden', mode !== 'login');
  $('#regErr').textContent = '';
  $('#logErr').textContent = '';
  open('#ovAuth');
}

async function signedIn(r) {
  saveToken(r.token);
  ME = r.user;
  $('#ovAuth').classList.remove('open');
  updateHeader();
  loadAll();
  refreshAdminBadge();
  if (ME.role === 'guide' && ME.status === 'pending') toast(t('adm_pending_note'));
  else if (ME.status === 'rejected') toast(t('adm_no'));
  else toast(t('welcome') + ME.name);
}

async function doRegister() {
  const role = document.querySelector('input[name=role]:checked').value;
  const body = {
    role,
    name: $('#rName').value,
    email: $('#rEmail').value,
    password: $('#rPass').value,
    languages: checked($('#rLangsT')),
  };
  if (role === 'guide') {
    body.guide = {
      country: $('#rCountry').value,
      city: $('#rCity').value,
      daily_rate: $('#rPrice').value,
      bio: $('#rBio').value,
      tax_number: $('#rTax').value,
      license_number: $('#rLic').value,
      license_expiry: $('#rLicExp').value,
      languages: checked($('#rLangsG')),
    };
  }
  try {
    await signedIn(await API.call('POST', '/api/auth/register', body));
  } catch (e) {
    $('#regErr').textContent = e.message;
  }
}

async function doLogin() {
  try {
    await signedIn(await API.call('POST', '/api/auth/login', { email: $('#lEmail').value, password: $('#lPass').value }));
  } catch (e) {
    $('#logErr').textContent = e.message;
  }
}

async function doLogout() {
  try { await API.call('POST', '/api/auth/logout'); } catch { /* already gone */ }
  saveToken(null);
  ME = null;
  updateHeader();
  loadAll();
  toast(t('bye'));
}

function updateHeader() {
  const on = !!ME;
  $('#btnLogin').classList.toggle('hidden', on);
  $('#btnRegister').classList.toggle('hidden', on);
  $('#btnLogout').classList.toggle('hidden', !on);
  $('#who').textContent = on ? ((ME.role === 'guide' ? '🧭 ' : ME.role === 'admin' ? '🛡️ ' : '🧳 ') + ME.name) : '';
  $('#who').classList.toggle('hidden', !on);
  $('#btnOffer').classList.toggle('hidden', !(on && ME.role === 'guide' && ME.guide && ME.guide.verified));
  $('#btnAdmin').classList.toggle('hidden', !(on && ME.role === 'admin'));
}

/* ================= GUIDE OFFERS ================= */
async function doOffer() {
  try {
    await API.call('POST', '/api/guide/offers', {
      title: $('#oTitle').value, hours: $('#oHours').value, price: $('#oPrice').value, desc: $('#oDesc').value,
    });
    $('#ovOffer').classList.remove('open');
    toast('✓');
    loadSection('guides');
  } catch (e) {
    $('#offErr').textContent = e.message;
  }
}

/* ================= ADMIN ================= */
async function refreshAdminBadge() {
  if (!ME || ME.role !== 'admin') return;
  try {
    const r = await API.call('GET', '/api/admin/guides?status=pending');
    $('#btnAdmin').textContent = t('admin_btn') + (r.items.length ? ` (${r.items.length})` : '');
  } catch { /* ignore */ }
}

async function renderAdmin() {
  const body = $('#admBody');
  try {
    const [pend, appr] = await Promise.all([
      API.call('GET', '/api/admin/guides?status=pending'),
      API.call('GET', '/api/admin/guides?status=approved'),
    ]);
    body.innerHTML = `<div class="section-title">${esc(t('adm_pending'))} (${pend.items.length})</div>` +
      (pend.items.length ? pend.items.map(g => `<div class="offer">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <h5>${esc(g.name)}</h5><span class="chip gold">${esc(t('pending'))}</span>
          </div>
          <div class="kv" style="margin:12px 0">
            <div><small>${esc(t('adm_email'))}</small>${esc(g.email)}</div>
            <div><small>${esc(t('country'))} · ${esc(t('city'))}</small>${esc(countryName(g.country))} · ${esc(L(g.city))}</div>
            <div><small>${esc(t('adm_tax'))}</small>${esc(g.tax)}</div>
            <div><small>${esc(t('adm_lic'))}</small>${esc(g.license)}</div>
            <div><small>${esc(t('adm_exp'))}</small>${esc(g.licenseExpiry)}</div>
            <div><small>${esc(t('g_price'))}</small>${fmt(g.dailyRate)} ${esc(g.currency)}</div>
            <div style="grid-column:1/-1"><small>${esc(t('langs'))}</small>${g.langs.map(LN).join('، ')}</div>
          </div>
          <div class="btns" style="justify-content:flex-end">
            <button class="btn btn-line btn-sm" data-adm="reject" data-gid="${g.id}">${esc(t('adm_reject'))}</button>
            <button class="btn btn-teal btn-sm" data-adm="approve" data-gid="${g.id}">${esc(t('adm_approve'))}</button>
          </div>
        </div>`).join('')
        : `<div class="empty" style="padding:24px">${esc(t('adm_empty'))}</div>`) +
      `<div class="section-title" style="margin-top:20px">${esc(t('verified'))} (${appr.items.length})</div>` +
      appr.items.map(g => `<div class="sub" style="padding:6px 0">✓ ${esc(g.name)} · ${esc(L(g.city))}</div>`).join('');
  } catch (e) {
    body.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

async function adminDecide(gid, action) {
  try {
    await API.call('POST', `/api/admin/guides/${gid}/decision`, { action });
    toast(action === 'approve' ? t('adm_ok') : t('adm_no'));
    renderAdmin();
    refreshAdminBadge();
  } catch (e) {
    toast(e.message);
  }
}

/* ================= EVENTS ================= */
$('#langSel').onchange = e => { LANG = e.target.value; applyStatic(); loadAll(); };
$('#btnLogin').onclick = () => openAuth('login');
$('#btnRegister').onclick = () => openAuth('register');
$('#btnLogout').onclick = doLogout;
$$('[data-goto]').forEach(a => { a.onclick = () => openAuth(a.dataset.goto); });
$$('input[name=role]').forEach(r => {
  r.onchange = () => $('#gFields').classList.toggle('hidden', document.querySelector('input[name=role]:checked').value !== 'guide');
});
$('#doReg').onclick = doRegister;
$('#doLog').onclick = doLogin;

$('#btnOffer').onclick = () => {
  ['#oTitle', '#oHours', '#oPrice', '#oDesc'].forEach(s => { $(s).value = ''; });
  $('#offErr').textContent = '';
  open('#ovOffer');
};
$('#doOffer').onclick = doOffer;
$('#btnAdmin').onclick = () => { renderAdmin(); open('#ovAdmin'); };

$$('select.cSel').forEach(s => s.addEventListener('change', () => loadSection(s.dataset.sec)));
$('#gLang').addEventListener('change', () => loadSection('guides'));

$('#hSearch').onclick = () => {
  const type = $('#hType').value;
  const sel = $(`select.cSel[data-sec="${type}"]`);
  if (sel) sel.value = $('#hCountry').value;
  $('#' + type).scrollIntoView({ behavior: 'smooth' });
  loadSection(type, $('#hCity').value.trim());
};

document.addEventListener('click', e => {
  const x = e.target.closest('[data-close]');
  if (x) { closeOv(x); return; }

  const a = e.target.closest('[data-act]');
  if (a) {
    if (a.dataset.act === 'details') showDetails(a.dataset.sec, a.dataset.id);
    if (a.dataset.act === 'book') startBook(a.dataset.key);
    return;
  }

  if (e.target.id === 'doBook') { submitBooking(e.target.dataset.key); return; }

  const adm = e.target.closest('[data-adm]');
  if (adm) { adminDecide(adm.dataset.gid, adm.dataset.adm); return; }

  if (e.target.classList && e.target.classList.contains('overlay')) e.target.classList.remove('open');
});

/* ================= INIT ================= */
(async function init() {
  try { META = await API.call('GET', '/api/meta'); } catch (e) { toast(e.message); }
  applyStatic();
  loadAll();

  let saved = null;
  try { saved = localStorage.getItem('te_token'); } catch { /* storage blocked */ }
  if (saved) {
    API.token = saved;
    try {
      ME = (await API.call('GET', '/api/me')).user;
      updateHeader();
      refreshAdminBadge();
    } catch {
      saveToken(null);
      ME = null;
      updateHeader();
    }
  }
})();
