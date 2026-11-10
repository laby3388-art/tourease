import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DB_FILE = process.env.DB_FILE || path.join(HERE, '..', 'data', 'tourease.db');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(fs.readFileSync(path.join(HERE, '..', 'db', 'schema.sql'), 'utf8'));

export const q = (sql, ...params) => db.prepare(sql).all(...params);
export const one = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

/** Localized field helper: loc(row, 'name') -> { ar, en, fr } from name_ar / name_en / name_fr */
export const loc = (row, field) => ({
  ar: row[`${field}_ar`] ?? row[`${field}_en`],
  en: row[`${field}_en`],
  fr: row[`${field}_fr`] ?? row[`${field}_en`],
});
