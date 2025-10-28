import "dotenv/config.js";
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

console.log("[DB CONFIG]", {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  db: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
});

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
const query = (sql, params = []) =>
  pool.execute(sql, params).then(([rows]) => rows);
const toInt = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

app.get(
  "/ping",
  asyncRoute(async (_req, res) => {
    const rows = await query("SELECT NOW() AS now");
    res.json({ status: "ok", time: rows[0].now });
  })
);

app.get(
  "/users",
  asyncRoute(async (req, res) => {
    const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 500);
    const page = Math.max(toInt(req.query.page, 1), 1);
    const offset = (page - 1) * limit;
    const data = await query(
      "SELECT * FROM users ORDER BY id DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    res.json({ status: "ok", page, limit, count: data.length, data });
  })
);

app.get(
  "/users/:id",
  asyncRoute(async (req, res) => {
    const rows = await query("SELECT * FROM users WHERE id = ?", [
      req.params.id,
    ]);
    if (rows.length === 0) fail(404, "User not found");
    res.json({ status: "ok", data: rows[0] });
  })
);

app.post(
  "/users",
  asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    const required = [
      "firstname",
      "fullname",
      "lastname",
      "username",
      "password",
    ];
    if (required.some((key) => !body[key]))
      fail(400, "Missing required fields");

    const hashed = await bcrypt.hash(body.password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO users (firstname, fullname, lastname, username, password, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        body.firstname,
        body.fullname,
        body.lastname,
        body.username,
        hashed,
        body.status ?? "active",
      ]
    );

    res.status(201).json({
      status: "ok",
      id: result.insertId,
      firstname: body.firstname,
      fullname: body.fullname,
      lastname: body.lastname,
      username: body.username,
      status: body.status ?? "active",
    });
  })
);

app.put(
  "/users/:id",
  asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    const fields = [];
    const params = [];

    ["firstname", "fullname", "lastname", "username", "status"].forEach(
      (key) => {
        if (body[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(body[key]);
        }
      }
    );

    if (body.password !== undefined) {
      fields.push("password = ?");
      params.push(await bcrypt.hash(body.password, SALT_ROUNDS));
    }

    if (fields.length === 0) fail(400, "No fields to update");

    fields.push("updated_at = CURRENT_TIMESTAMP");
    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      [...params, req.params.id]
    );

    if (!result.affectedRows) fail(404, "User not found");
    res.json({ status: "ok", message: "User updated successfully" });
  })
);

app.delete(
  "/users/:id",
  asyncRoute(async (req, res) => {
    const result = await query("DELETE FROM users WHERE id = ?", [
      req.params.id,
    ]);
    if (!result.affectedRows) fail(404, "User not found");
    res.json({ status: "ok", message: "User deleted successfully" });
  })
);

app.get("/api/data", (_req, res) => {
  res.json({ message: "Hello, CORS!" });
});

app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT ERROR]", err);
  res.status(err.status ?? 500).json({
    status: "error",
    message: err.message ?? "Internal server error",
    code: err.code ?? null,
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
