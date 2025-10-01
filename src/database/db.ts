import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

// Abre conexão com SQLite
export async function initDb() {
  const db = await open({
    filename: './data.db',
    driver: sqlite3.Database,
  });

  // Cria tabela se não existir
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    )
  `);

  return db;
}
