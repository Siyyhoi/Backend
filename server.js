// server.js
import "dotenv/config.js"; // load .env asap
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

// --------------------------------------------------
// 1) CONFIG / SERVER TUNING
// --------------------------------------------------

const app = express();

// basic hardening / micro perf
app.disable("x-powered-by"); // don't leak framework
app.set("etag", "strong"); // allow client-side caching on GETs

// middleware
app.use(cors({ origin: true })); // allow all origins by default
app.use(express.json({ limit: "64kb" })); // lightweight body limit

// tune pool + bcrypt from env
const POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "20", 10); // more concurrency
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10); // hash cost

// create mysql pool (keepAlive improves latency on repeat reqs)
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ?? 3306,
  waitForConnections: true,
  connectionLimit: POOL_SIZE,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// log env summary (no secrets)
console.log("[DB CONFIG]", {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  db: process.env.DB_NAME,
  port: process.env.DB_PORT ?? 3306,
  poolSize: POOL_SIZE,
  bcryptRounds: BCRYPT_ROUNDS,
});

// --------------------------------------------------
// 2) SMALL UTILS
// --------------------------------------------------

// runQuery() uses prepared statements via .execute() when params exist
// this lets MySQL cache the statement and reduces parse/plan cost
async function runQuery(sql, params = []) {
  if (params.length === 0) {
    const [rows] = await db.query(sql);
    return rows;
  } else {
    const [rows] = await db.execute(sql, params);
    return rows;
  }
}

// send error with consistent shape
function sendDbError(res, err, httpCode = 500) {
  console.error("[DB ERROR]", err);
  return res.status(httpCode).json({
    status: "error",
    message: err?.message ?? "Database error",
    code: err?.code ?? null,
  });
}

// tiny helper to validate required fields quickly
function requireFields(obj, keys) {
  for (const k of keys) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === "") {
      return k;
    }
  }
  return null;
}

// --------------------------------------------------
// 3) ROUTES
// --------------------------------------------------

// Health check / ping DB
app.get("/ping", async (req, res) => {
  try {
    const rows = await runQuery("SELECT NOW() AS now");
    res.json({
      status: "ok",
      time: rows[0].now,
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// GET /users - list all users (select only needed columns to reduce payload)
app.get("/users", async (req, res) => {
  try {
    const rows = await runQuery(
      "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM users"
    );

    res.json({
      status: "ok",
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// GET /users/:id - get single user
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await runQuery(
      "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM users WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: "not_found", message: "User not found" });
    }

    res.json({
      status: "ok",
      data: rows[0],
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// POST /users - create new user
app.post("/users", async (req, res) => {
  try {
    const {
      firstname,
      fullname,
      lastname,
      username,
      password, // plaintext from body
      status = "active",
    } = req.body;

    // fast validation
    const missing = requireFields(req.body, [
      "firstname",
      "fullname",
      "lastname",
      "username",
      "password",
    ]);
    if (missing) {
      return res.status(400).json({
        status: "bad_request",
        message: `Missing required field: ${missing}`,
      });
    }

    // hash password (bcrypt is CPU heavy, we allow tuning rounds via env)
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // single round-trip insert (created_at/updated_at handled by DB defaults)
    const [result] = await db.execute(
      `
        INSERT INTO users (firstname, fullname, lastname, username, password, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [firstname, fullname, lastname, username, hashed, status]
    );

    res.status(201).json({
      status: "ok",
      id: result.insertId,
      firstname,
      fullname,
      lastname,
      username,
      status,
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// PUT /users/:id - update user
app.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstname,
      fullname,
      lastname,
      username,
      password, // optional
      status,
    } = req.body;

    // dynamic fields
    const fields = [];
    const params = [];

    if (firstname !== undefined) {
      fields.push("firstname = ?");
      params.push(firstname);
    }
    if (fullname !== undefined) {
      fields.push("fullname = ?");
      params.push(fullname);
    }
    if (lastname !== undefined) {
      fields.push("lastname = ?");
      params.push(lastname);
    }
    if (username !== undefined) {
      fields.push("username = ?");
      params.push(username);
    }
    if (status !== undefined) {
      fields.push("status = ?");
      params.push(status);
    }
    if (password !== undefined) {
      const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
      fields.push("password = ?");
      params.push(hashed);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        status: "bad_request",
        message: "No fields to update",
      });
    }

    // always bump updated_at in same query (no second trip)
    fields.push("updated_at = CURRENT_TIMESTAMP");

    const [result] = await db.execute(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      [...params, id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "not_found", message: "User not found" });
    }

    res.json({
      status: "ok",
      message: "User updated successfully",
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// DELETE /users/:id - delete user
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.execute("DELETE FROM users WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "not_found", message: "User not found" });
    }

    res.json({
      status: "ok",
      message: "User deleted successfully",
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// CORS sanity check
app.get("/api/data", (req, res) => {
  res.json({ message: "Hello, CORS!" });
});

// --------------------------------------------------
// 4) GLOBAL FALLBACK ERROR HANDLER
// --------------------------------------------------
app.use((err, req, res, next) => {
  console.error("[UNCAUGHT ERROR]", err);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

// --------------------------------------------------
// 5) START SERVER
// --------------------------------------------------
const PORT = process.env.PORT || 3000;

// NOTE: for even higher concurrency on CPU-heavy stuff (bcrypt),
// run multiple Node workers (PM2 cluster / node --cluster) OR
// increase libuv threadpool: UV_THREADPOOL_SIZE=16
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
