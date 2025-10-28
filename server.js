// server.js
import "dotenv/config.js"; // โหลด .env ตั้งแต่บรรทัดแรก
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

// --------------------------------------------------
// 1) CONFIG
// --------------------------------------------------

const app = express();

// middleware พื้นฐาน
app.use(cors());
app.use(express.json());

// ใช้ connection pool (ดีกว่าเปิด-ปิด connection ตลอด)
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ?? 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// log env แบบไม่ leak password
console.log("[DB CONFIG]", {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  db: process.env.DB_NAME,
  port: process.env.DB_PORT ?? 3306,
});

// --------------------------------------------------
// 2) SMALL UTILS
// --------------------------------------------------

// generic db query wrapper (ให้โค้ดอ่านง่ายขึ้น)
async function runQuery(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

// อัพเดต timestamp updated_at เป็น CURRENT_TIMESTAMP ให้ user คนเดียว
// ใช้เวลาแก้ไขข้อมูล user เสร็จ เพื่อ keep audit log สดใหม่
async function updated_now(userId) {
  await runQuery(
    "UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [userId]
  );
}

// ส่ง error format เดียวทั้งระบบ
function sendDbError(res, err, httpCode = 500) {
  console.error("[DB ERROR]", err);
  return res.status(httpCode).json({
    status: "error",
    message: err?.message ?? "Database error",
    code: err?.code ?? null,
  });
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

// GET /users - ดึง user ทั้งหมด
app.get("/users", async (req, res) => {
  try {
    const rows = await runQuery("SELECT * FROM users");
    res.json({
      status: "ok",
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// GET /users/:id - ดึง user ตาม id
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await runQuery("SELECT * FROM users WHERE id = ?", [id]);

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

// POST /users - เพิ่ม user ใหม่
// NOTE: ถ้าอยากเก็บรหัสผ่านแบบ hash -> ส่ง body.password มา แล้ว hash ก่อน insert
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

    if (!firstname || !fullname || !lastname || !username || !password) {
      return res.status(400).json({
        status: "bad_request",
        message: "Missing required fields",
      });
    }

    // hash password ก่อนเก็บ
    const hashed = await bcrypt.hash(password, 10);

    const result = await db.query(
      `
      INSERT INTO users (firstname, fullname, lastname, username, password, status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [firstname, fullname, lastname, username, hashed, status]
    );

    const insertId = result[0]?.insertId;

    // sync timestamp just in case (not really needed here because created_at already set)
    await updated_now(insertId);

    res.status(201).json({
      status: "ok",
      id: insertId,
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

// PUT /users/:id - อัปเดตข้อมูล user
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

    // สร้าง dynamic update query แบบไม่อัพ field ที่ไม่ได้ส่งมา
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
      const hashed = await bcrypt.hash(password, 10);
      fields.push("password = ?");
      params.push(hashed);
    }

    // ถ้าไม่มี field ให้แก้เลย -> 400
    if (fields.length === 0) {
      return res.status(400).json({
        status: "bad_request",
        message: "No fields to update",
      });
    }

    // run update
    const [result] = await db.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      [...params, id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "not_found", message: "User not found" });
    }

    // update timestamp updated_at
    await updated_now(id);

    res.json({
      status: "ok",
      message: "User updated successfully",
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// DELETE /users/:id - ลบ user
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query("DELETE FROM users WHERE id = ?", [id]);

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

// simple public route (CORS test / sanity check)
app.get("/api/data", (req, res) => {
  res.json({ message: "Hello, CORS!" });
});

// --------------------------------------------------
// 4) GLOBAL FALLBACK ERROR HANDLER (safety net)
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
