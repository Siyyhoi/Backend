// server.js
import "dotenv/config.js";
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import verifyToken from "./middleware/auth.js";

const SECRET_KEY = process.env.JWT_SECRET; // ควรเก็บใน .env

// --------------------------------------------------
// 1) CONFIG / SERVER TUNING
// --------------------------------------------------

const app = express();

app.disable("x-powered-by");
app.set("etag", "strong");

app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

const POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "20", 10);
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
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

// log env summary (no secrets)
console.log("[DB CONFIG]", {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  db: DB_NAME,
  port: process.env.DB_PORT ?? 3306,
  poolSize: POOL_SIZE,
  bcryptRounds: BCRYPT_ROUNDS,
});

// --------------------------------------------------
// 2) SMALL UTILS
// --------------------------------------------------

async function runQuery(sql, params = []) {
  if (params.length === 0) {
    const [rows] = await db.query(sql);
    return rows;
  } else {
    const [rows] = await db.execute(sql, params);
    return rows;
  }
}

function sendDbError(res, err, httpCode = 500) {
  console.error("[DB ERROR]", err);
  return res.status(httpCode).json({
    status: "error",
    message: err?.message ?? "Database error",
    code: err?.code ?? null,
  });
}

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

app.get("/users", verifyToken, async (req, res) => {
  try {
    const rows = await runQuery(
      "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM tbl_users"
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

app.get("/users/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await runQuery(
      "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM tbl_users WHERE id = ?",
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

app.post("/users", async (req, res) => {
  try {
    const {
      firstname,
      fullname,
      lastname,
      username,
      password,
      status = "active",
    } = req.body;

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

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [result] = await db.execute(
      `
        INSERT INTO tbl_users (firstname, fullname, lastname, username, password, status)
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

app.put("/users/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { firstname, fullname, lastname, username, password, status } =
      req.body;

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

    fields.push("updated_at = CURRENT_TIMESTAMP");

    const [result] = await db.execute(
      `UPDATE tbl_users SET ${fields.join(", ")} WHERE id = ?`,
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
app.delete("/users/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.execute("DELETE FROM tbl_users WHERE id = ?", [
      id,
    ]);

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

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const missing = requireFields({ username, password }, [
    "username",
    "password",
  ]);
  if (missing) {
    return res.status(400).json({
      error: `Missing required field: ${missing}`,
    });
  }

  try {
    const [rows] = await db.execute(
      "SELECT id, fullname, lastname, password FROM tbl_users WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user.id, fullname: user.fullname, lastname: user.lastname },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/logout", (req, res) => {
  localStorage.removeItem("token");
  window.location.href = "/login";
});

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
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
