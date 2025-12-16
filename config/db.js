import mysql from "mysql2/promise";
import { config as loadEnv } from "dotenv";

const envPath =
  process.env.DOTENV_CONFIG_PATH ??
  (process.env.NODE_ENV === "production" ? ".env.production" : ".env.local");

loadEnv({ path: envPath, override: false });

const POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "20", 10);
const DB_NAME = process.env.DB_NAME || "db_shop";

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: DB_NAME,
  port: process.env.DB_PORT ?? 3306,
  waitForConnections: true,
  connectionLimit: POOL_SIZE,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export { db, POOL_SIZE, DB_NAME };
