PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS countries (
  id        INTEGER PRIMARY KEY,
  iso       TEXT NOT NULL UNIQUE,
  name_ar   TEXT NOT NULL,
  name_en   TEXT NOT NULL,
  name_fr   TEXT NOT NULL,
  currency  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
  id          INTEGER PRIMARY KEY,
  country_id  INTEGER NOT NULL REFERENCES countries(id),
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  name_fr     TEXT NOT NULL,
  UNIQUE (country_id, name_en)
);

CREATE TABLE IF NOT EXISTS languages (
  code     TEXT PRIMARY KEY,
  name_ar  TEXT NOT NULL,
  name_en  TEXT NOT NULL,
  name_fr  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  role            TEXT NOT NULL CHECK (role IN ('tourist','guide','company','admin')),
  status          TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected','suspended')),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash   TEXT NOT NULL,
  phone           TEXT,
  preferred_lang  TEXT NOT NULL DEFAULT 'ar' REFERENCES languages(code),
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_languages (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_code  TEXT NOT NULL REFERENCES languages(code),
  PRIMARY KEY (user_id, language_code)
);

CREATE TABLE IF NOT EXISTS guide_profiles (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  country_id      INTEGER NOT NULL REFERENCES countries(id),
  city_id         INTEGER REFERENCES cities(id),
  daily_rate      REAL NOT NULL CHECK (daily_rate >= 0),
  bio_ar          TEXT,
  bio_en          TEXT,
  bio_fr          TEXT,
  tax_number      TEXT NOT NULL UNIQUE,
  license_number  TEXT NOT NULL UNIQUE,
  license_expiry  TEXT NOT NULL,
  is_verified     INTEGER NOT NULL DEFAULT 0,
  verified_at     TEXT,
  verified_by     INTEGER REFERENCES users(id),
  avg_rating      REAL NOT NULL DEFAULT 0,
  review_count    INTEGER NOT NULL DEFAULT 0,
  is_demo         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS verification_documents (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL CHECK (doc_type IN ('license','tax_certificate','national_id','other')),
  file_url     TEXT NOT NULL,
  uploaded_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
  id              INTEGER PRIMARY KEY,
  owner_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL DEFAULT 'company' CHECK (kind IN ('company','individual')),
  name_ar         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  name_fr         TEXT NOT NULL,
  country_id      INTEGER NOT NULL REFERENCES countries(id),
  tax_number      TEXT UNIQUE,
  contact_email   TEXT,
  contact_phone   TEXT,
  is_verified     INTEGER NOT NULL DEFAULT 0,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  avg_rating      REAL NOT NULL DEFAULT 0,
  review_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tour_offers (
  id              INTEGER PRIMARY KEY,
  guide_user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  city_id         INTEGER NOT NULL REFERENCES cities(id),
  title_ar        TEXT,
  title_en        TEXT NOT NULL,
  title_fr        TEXT,
  description_ar  TEXT,
  description_en  TEXT,
  description_fr  TEXT,
  duration_hours  REAL NOT NULL CHECK (duration_hours > 0),
  price           REAL NOT NULL CHECK (price >= 0),
  max_guests      INTEGER NOT NULL DEFAULT 10 CHECK (max_guests > 0),
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((guide_user_id IS NULL) <> (company_id IS NULL))
);

CREATE TABLE IF NOT EXISTS tour_offer_languages (
  tour_offer_id  INTEGER NOT NULL REFERENCES tour_offers(id) ON DELETE CASCADE,
  language_code  TEXT NOT NULL REFERENCES languages(code),
  PRIMARY KEY (tour_offer_id, language_code)
);

CREATE TABLE IF NOT EXISTS hotels (
  id              INTEGER PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  city_id         INTEGER NOT NULL REFERENCES cities(id),
  name_ar         TEXT,
  name_en         TEXT NOT NULL,
  name_fr         TEXT,
  stars           INTEGER CHECK (stars BETWEEN 1 AND 5),
  description_ar  TEXT,
  description_en  TEXT,
  description_fr  TEXT,
  address         TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  avg_rating      REAL NOT NULL DEFAULT 0,
  review_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hotel_rooms (
  id               INTEGER PRIMARY KEY,
  hotel_id         INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_ar     TEXT,
  room_type_en     TEXT NOT NULL,
  room_type_fr     TEXT,
  capacity         INTEGER NOT NULL CHECK (capacity > 0),
  price_per_night  REAL NOT NULL CHECK (price_per_night >= 0),
  is_active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS attractions (
  id              INTEGER PRIMARY KEY,
  city_id         INTEGER NOT NULL REFERENCES cities(id),
  name_ar         TEXT,
  name_en         TEXT NOT NULL,
  name_fr         TEXT,
  description_ar  TEXT,
  description_en  TEXT,
  description_fr  TEXT
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id                   INTEGER PRIMARY KEY,
  attraction_id        INTEGER NOT NULL REFERENCES attractions(id) ON DELETE CASCADE,
  provider_company_id  INTEGER REFERENCES companies(id),
  name_ar              TEXT,
  name_en              TEXT NOT NULL,
  name_fr              TEXT,
  price                REAL NOT NULL CHECK (price >= 0),
  visit_duration       TEXT,
  is_active            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cars (
  id             INTEGER PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  city_id        INTEGER NOT NULL REFERENCES cities(id),
  model_ar       TEXT,
  model_en       TEXT NOT NULL,
  model_fr       TEXT,
  seats          INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 20),
  price_per_day  REAL NOT NULL CHECK (price_per_day >= 0),
  with_driver    INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT UNIQUE,
  tourist_user_id   INTEGER NOT NULL REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','cancelled','completed','refunded')),
  currency          TEXT NOT NULL,
  total_amount      REAL NOT NULL CHECK (total_amount >= 0),
  customer_name     TEXT NOT NULL,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id      INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_kind       TEXT NOT NULL CHECK (item_kind IN ('tour','hotel_room','ticket','car')),
  item_name       TEXT NOT NULL,
  tour_offer_id   INTEGER REFERENCES tour_offers(id),
  hotel_room_id   INTEGER REFERENCES hotel_rooms(id),
  ticket_type_id  INTEGER REFERENCES ticket_types(id),
  car_id          INTEGER REFERENCES cars(id),
  service_date    TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  nights          INTEGER CHECK (nights IS NULL OR nights > 0),
  language_code   TEXT REFERENCES languages(code),
  unit_price      REAL NOT NULL CHECK (unit_price >= 0),
  line_total      REAL NOT NULL CHECK (line_total >= 0),
  CHECK (
    (item_kind = 'tour'       AND tour_offer_id IS NOT NULL AND hotel_room_id IS NULL AND ticket_type_id IS NULL AND car_id IS NULL) OR
    (item_kind = 'hotel_room' AND hotel_room_id IS NOT NULL AND tour_offer_id IS NULL AND ticket_type_id IS NULL AND car_id IS NULL) OR
    (item_kind = 'ticket'     AND ticket_type_id IS NOT NULL AND tour_offer_id IS NULL AND hotel_room_id IS NULL AND car_id IS NULL) OR
    (item_kind = 'car'        AND car_id IS NOT NULL AND tour_offer_id IS NULL AND hotel_room_id IS NULL AND ticket_type_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY,
  booking_id    INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount        REAL NOT NULL CHECK (amount >= 0),
  currency      TEXT NOT NULL,
  method        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','paid','failed','refunded')),
  provider_ref  TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id                INTEGER PRIMARY KEY,
  booking_item_id   INTEGER NOT NULL UNIQUE REFERENCES booking_items(id) ON DELETE CASCADE,
  tourist_user_id   INTEGER NOT NULL REFERENCES users(id),
  rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment           TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id   INTEGER NOT NULL REFERENCES users(id),
  target_user_id  INTEGER NOT NULL REFERENCES users(id),
  action          TEXT NOT NULL CHECK (action IN ('approve','reject','suspend')),
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cities_country       ON cities(country_id);
CREATE INDEX IF NOT EXISTS idx_tour_offers_company  ON tour_offers(company_id);
CREATE INDEX IF NOT EXISTS idx_tour_offers_guide    ON tour_offers(guide_user_id);
CREATE INDEX IF NOT EXISTS idx_hotels_city          ON hotels(city_id);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_hotel    ON hotel_rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_attr    ON ticket_types(attraction_id);
CREATE INDEX IF NOT EXISTS idx_cars_city            ON cars(city_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tourist     ON bookings(tourist_user_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_book   ON booking_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_users_role_status    ON users(role, status);
