// Run once after install: `npm run seed`
// Safe to re-run: reference data uses INSERT OR IGNORE, demo catalog is only added once.
import crypto from 'node:crypto';
import { db, one, run } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';

const ins = (sql, ...p) => Number(run(sql, ...p).lastInsertRowid);
const countryId = iso => one('SELECT id FROM countries WHERE iso=?', iso).id;
const cityId = en => one('SELECT id FROM cities WHERE name_en=?', en).id;

const LANGS = [
  ['ar', 'العربية', 'Arabic', 'Arabe'],
  ['en', 'الإنجليزية', 'English', 'Anglais'],
  ['fr', 'الفرنسية', 'French', 'Français'],
  ['de', 'الألمانية', 'German', 'Allemand'],
  ['es', 'الإسبانية', 'Spanish', 'Espagnol'],
  ['it', 'الإيطالية', 'Italian', 'Italien'],
  ['ru', 'الروسية', 'Russian', 'Russe'],
  ['zh', 'الصينية', 'Chinese', 'Chinois'],
];
const COUNTRIES = [
  ['EG', 'مصر', 'Egypt', 'Égypte', 'EGP'],
  ['SA', 'السعودية', 'Saudi Arabia', 'Arabie saoudite', 'SAR'],
  ['AE', 'الإمارات', 'United Arab Emirates', 'Émirats arabes unis', 'AED'],
  ['JO', 'الأردن', 'Jordan', 'Jordanie', 'JOD'],
  ['MA', 'المغرب', 'Morocco', 'Maroc', 'MAD'],
  ['TN', 'تونس', 'Tunisia', 'Tunisie', 'TND'],
  ['LB', 'لبنان', 'Lebanon', 'Liban', 'USD'],
  ['QA', 'قطر', 'Qatar', 'Qatar', 'QAR'],
  ['OM', 'عُمان', 'Oman', 'Oman', 'OMR'],
];
const CITIES = [
  ['EG', 'Cairo', 'القاهرة', 'Le Caire'], ['EG', 'Giza', 'الجيزة', 'Gizeh'],
  ['EG', 'Luxor', 'الأقصر', 'Louxor'], ['EG', 'Aswan', 'أسوان', 'Assouan'],
  ['SA', 'Riyadh', 'الرياض', 'Riyad'], ['SA', 'AlUla', 'العلا', 'AlUla'],
  ['AE', 'Dubai', 'دبي', 'Dubaï'], ['JO', 'Petra', 'البتراء', 'Pétra'],
  ['MA', 'Marrakech', 'مراكش', 'Marrakech'], ['TN', 'Tunis', 'تونس', 'Tunis'],
  ['LB', 'Beirut', 'بيروت', 'Beyrouth'], ['QA', 'Doha', 'الدوحة', 'Doha'],
  ['OM', 'Muscat', 'مسقط', 'Mascate'],
];

db.exec('BEGIN');
try {
  for (const l of LANGS) run('INSERT OR IGNORE INTO languages(code,name_ar,name_en,name_fr) VALUES(?,?,?,?)', ...l);
  for (const c of COUNTRIES) run('INSERT OR IGNORE INTO countries(iso,name_ar,name_en,name_fr,currency) VALUES(?,?,?,?,?)', ...c);
  for (const [iso, en, ar, fr] of CITIES) {
    run('INSERT OR IGNORE INTO cities(country_id,name_ar,name_en,name_fr) VALUES(?,?,?,?)', countryId(iso), ar, en, fr);
  }

  // ---- Admin account (password from env; change it in production) ----
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@tourease.local').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'ChangeMe-2026';
  let admin = one('SELECT id FROM users WHERE email=?', adminEmail);
  if (!admin) admin = { id: ins(`INSERT INTO users(role,status,full_name,email,password_hash)
                                 VALUES('admin','approved','TourEase Admin',?,?)`, adminEmail, hashPassword(adminPass)) };
  if (!process.env.ADMIN_PASSWORD) console.warn('⚠  ADMIN_PASSWORD not set: default admin password is in use. Change it.');

  // ---- Demo catalog (clearly marked is_demo = 1; delete with: DELETE FROM companies WHERE is_demo=1 ...) ----
  if (one('SELECT id FROM companies WHERE is_demo=1')) {
    console.log('Demo catalog already present, skipping.');
  } else {
    const company = (kind, en, ar, iso) => ins(`INSERT INTO companies(kind,name_ar,name_en,name_fr,country_id,is_verified,is_demo)
                                               VALUES(?,?,?,?,?,1,1)`, kind, ar, en, en, countryId(iso));
    const hospEG = company('company', 'Demo Hospitality Egypt', 'ضيافة تجريبية - مصر', 'EG');
    const hospSA = company('company', 'Demo Hotels Saudi', 'فنادق تجريبية - السعودية', 'SA');
    const hospMA = company('company', 'Demo Riads Morocco', 'رياضات تجريبية - المغرب', 'MA');
    const desert = company('company', 'Demo Desert Tours', 'جولات صحراوية تجريبية', 'EG');
    const ticketsCo = company('company', 'Demo Attraction Tickets', 'تذاكر تجريبية', 'AE');
    const carsEG = company('company', 'Demo Cars Egypt', 'سيارات تجريبية - مصر', 'EG');
    const carsGulf = company('company', 'Demo Cars Gulf', 'سيارات تجريبية - الخليج', 'AE');

    const hotel = (co, city, en, ar, stars, desc) => ins(`INSERT INTO hotels(company_id,city_id,name_ar,name_en,name_fr,stars,description_ar,description_en,description_fr)
                                                         VALUES(?,?,?,?,?,?,?,?,?)`, co, cityId(city), ar, en, en, stars, desc, desc, desc);
    const room = (hid, en, ar, cap, price) => ins(`INSERT INTO hotel_rooms(hotel_id,room_type_en,room_type_ar,room_type_fr,capacity,price_per_night)
                                                   VALUES(?,?,?,?,?,?)`, hid, en, ar, en, cap, price);
    const nile = hotel(hospEG, 'Cairo', 'Demo Nile View Hotel', 'فندق نايل فيو التجريبي', 5, 'Hotel overlooking the Nile, near the Egyptian Museum.');
    room(nile, 'Standard', 'ستاندرد', 2, 1500);
    room(nile, 'Deluxe Nile View', 'ديلوكس إطلالة على النيل', 2, 2200);
    const riverside = hotel(hospEG, 'Luxor', 'Demo Riverside Luxor', 'ريفرسايد الأقصر التجريبي', 4, 'Nile views, close to Karnak.');
    room(riverside, 'Double', 'دبل', 2, 1400);
    const desertHouse = hotel(hospSA, 'AlUla', 'Demo Desert House', 'دار الصحراء التجريبية', 4, 'Stay in the heart of the desert.');
    room(desertHouse, 'Suite', 'جناح', 3, 1100);
    const riad = hotel(hospMA, 'Marrakech', 'Demo Atlas Riad', 'رياض الأطلس التجريبي', 5, 'Traditional riad inside the medina.');
    room(riad, 'Riad Room', 'غرفة رياض', 2, 2600);

    const attraction = (city, en, ar, desc) => ins(`INSERT INTO attractions(city_id,name_ar,name_en,name_fr,description_ar,description_en,description_fr)
                                                    VALUES(?,?,?,?,?,?,?)`, cityId(city), ar, en, en, desc, desc, desc);
    const ticket = (att, en, ar, price, dur, provider) => ins(`INSERT INTO ticket_types(attraction_id,provider_company_id,name_ar,name_en,name_fr,price,visit_duration)
                                                               VALUES(?,?,?,?,?,?,?)`, att, provider, ar, en, en, price, dur);
    const pyr = attraction('Giza', 'Giza Pyramids & Sphinx', 'أهرامات الجيزة والسفينكس', 'Entry to the pyramids plateau and the Sphinx.');
    ticket(pyr, 'Standard entry', 'دخول عادي', 450, '3 hours', ticketsCo);
    const gem = attraction('Giza', 'Grand Egyptian Museum', 'المتحف المصري الكبير', 'Museum entry.');
    ticket(gem, 'General admission', 'دخول عام', 700, '2-3 hours', ticketsCo);
    const petra = attraction('Petra', 'Petra', 'البتراء', 'Ancient rock-cut city.');
    ticket(petra, 'Day entry', 'دخول يومي', 50, 'Full day', ticketsCo);
    const burj = attraction('Dubai', 'Burj Khalifa', 'برج خليفة', 'Observation deck.');
    ticket(burj, 'Level 148', 'المستوى 148', 250, '1 hour', ticketsCo);

    const car = (co, city, en, ar, seats, price, driver) => ins(`INSERT INTO cars(company_id,city_id,model_en,model_ar,model_fr,seats,price_per_day,with_driver)
                                                                 VALUES(?,?,?,?,?,?,?,?)`, co, cityId(city), en, ar, en, seats, price, driver);
    car(carsEG, 'Cairo', 'Toyota Corolla 2024', 'تويوتا كورولا 2024', 5, 1200, 1);
    car(carsGulf, 'Riyadh', 'Hyundai Tucson', 'هيونداي توسان', 5, 900, 0);
    car(carsGulf, 'Dubai', 'Mercedes Vito VIP', 'مرسيدس فيانو VIP', 8, 2800, 1);

    // Demo guides (approved + verified, not real people)
    const demoGuide = (name, email, iso, city, rate, langs, bio) => {
      const uid = ins(`INSERT INTO users(role,status,full_name,email,password_hash) VALUES('guide','approved',?,?,?)`,
        name, email, hashPassword(crypto.randomUUID()));
      for (const l of langs) run('INSERT INTO user_languages(user_id,language_code) VALUES(?,?)', uid, l);
      run(`INSERT INTO guide_profiles(user_id,country_id,city_id,daily_rate,bio_ar,bio_en,bio_fr,tax_number,license_number,
                                      license_expiry,is_verified,verified_at,verified_by,is_demo)
           VALUES(?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,?,1)`,
        uid, countryId(iso), cityId(city), rate, bio, bio, bio, `DEMO-TAX-${uid}`, `DEMO-LIC-${uid}`, '2030-12-31', admin.id);
      return uid;
    };
    const ahmed = demoGuide('Demo Guide Ahmed', 'demo.ahmed@tourease.local', 'EG', 'Cairo', 350, ['ar', 'en', 'fr'], 'Demo guide profile: pyramids and museums.');
    demoGuide('Demo Guide Nada', 'demo.nada@tourease.local', 'EG', 'Luxor', 400, ['ar', 'en'], 'Demo guide profile: Pharaonic history.');
    demoGuide('Demo Guide Khaled', 'demo.khaled@tourease.local', 'SA', 'AlUla', 300, ['ar', 'en', 'de'], 'Demo guide profile: desert trips.');
    demoGuide('Demo Guide Leila', 'demo.leila@tourease.local', 'MA', 'Marrakech', 280, ['ar', 'fr', 'en', 'es'], 'Demo guide profile: medina and souks.');

    // Tour offers
    const offer = ({ company = null, guide = null, city, title, hours, price, desc, langs }) => {
      const id = ins(`INSERT INTO tour_offers(company_id,guide_user_id,city_id,title_ar,title_en,title_fr,
                                              description_ar,description_en,description_fr,duration_hours,price)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, company, guide, cityId(city), title, title, title, desc, desc, desc, hours, price);
      for (const l of langs) run('INSERT INTO tour_offer_languages(tour_offer_id,language_code) VALUES(?,?)', id, l);
      return id;
    };
    offer({ guide: ahmed, city: 'Giza', title: 'Pyramids & Sphinx guided tour', hours: 6, price: 500,
            desc: 'Demo offer: guided visit with historical commentary.', langs: ['ar', 'en', 'fr'] });
    offer({ company: desert, city: 'Giza', title: 'Desert & Pyramids day trip', hours: 8, price: 1500,
            desc: 'Demo offer: full-day trip with lunch and camel ride.', langs: ['ar', 'en'] });
    offer({ company: desert, city: 'Dubai', title: 'Sunset desert safari', hours: 4, price: 350,
            desc: 'Demo offer: safari with dinner and show.', langs: ['en', 'ar', 'ru'] });
  }

  db.exec('COMMIT');
  console.log('Seed complete. Database:', process.env.DB_FILE || 'data/tourease.db');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Seed failed:', e);
  process.exit(1);
}
