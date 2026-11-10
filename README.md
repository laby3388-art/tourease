# TourEase

Tourism booking website for Egypt and the Arab world.
Travelers book licensed guides, company tours, hotels, attraction tickets and cars.
Guides register with tax and license details and are approved by an admin before they appear.

## Requirements
- Node.js 22.13 or newer (uses the built-in `node:sqlite`, no npm packages needed)

## Setup and run
```bash
ADMIN_EMAIL=you@yourdomain.com ADMIN_PASSWORD='a-strong-password' npm run seed
npm start            # http://localhost:3000   (PORT=... to change, DB_FILE=... to change database file)
```
The seed creates reference data (languages, countries, cities), an admin account, and a
**demo catalog** (flagged `is_demo = 1`) so the site is not empty while you test.
Demo guides, companies and offers are placeholders, not real businesses.

## Tests
```bash
npm test
```
Runs end-to-end API tests on a temporary database: registration, login, guide approval/rejection,
catalog filters, booking totals, currency rules, and error handling.

## Project layout
```
server.js            HTTP server: JSON API under /api, static files from public/
lib/db.js            database connection and helpers
lib/service.js       business logic (catalog, auth, bookings, guide offers, admin review)
lib/auth.js          password hashing (scrypt) and session tokens
db/schema.sql        database schema (SQLite)
db/seed.js           reference data, admin account, demo catalog
public/index.html    the website
public/i18n.js       Arabic / English / French translations
public/app.js        frontend logic (calls the API)
test/api.test.mjs    API tests
```

## Notes for going live
- Set a real `ADMIN_PASSWORD` and use HTTPS.
- Guide license and tax documents are not uploaded yet; the admin reviews the submitted numbers only.
- Payments are not connected: bookings are confirmed without a payment gateway.
- Sessions are stored in the database and do not expire yet.
- The `payments` and `reviews` tables exist but have no API routes yet.
