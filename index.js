import dotenv from "dotenv";
// 1. ต้องโหลด dotenv ก่อนเพื่อน เพื่อให้ process.env มีค่าใช้งานได้ในทุกไฟล์ที่ import มาหลังจากนี้
dotenv.config(); 

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import path from "path";

// 2. Import ไฟล์อื่นๆ หลังจากโหลด Config แล้ว
import verifyToken from "./middleware/auth.js";
import { specs } from "./swagger.js";
import { db, POOL_SIZE, DB_NAME } from "./config/db.js";
import usersRouter from "./routes/users.js";

// 3. ตรวจสอบ Secret Key ทันที ถ้าไม่มีให้เตือนใน Terminal
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  console.error("❌ ERROR: JWT_SECRET is not defined in .env file!");
}

const activeTokens =
  globalThis.__activeTokens ?? (globalThis.__activeTokens = new Map());

function setActiveToken(userId, token) {
  activeTokens.set(userId, token);
}

function clearActiveToken(userId) {
  activeTokens.delete(userId);
}

// --------------------------------------------------
// 1) CONFIG / SERVER TUNING
// --------------------------------------------------

export const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve favicon
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "njz.png"), {
    headers: { "Content-Type": "image/x-icon" },
  });
});

// Swagger UI setup
app.get("/api-docs", (req, res) => {
  const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BackEnd API Documentation</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        spec: ${JSON.stringify(specs)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(swaggerHtml);
});

app.disable("x-powered-by");
app.set("etag", "strong");

app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);

// log env summary เพื่อให้คุณเช็คความถูกต้องใน Terminal
console.log("[SYSTEM CHECK]", {
  host: process.env.DB_HOST || "MISSING",
  user: process.env.DB_USER || "MISSING",
  database: DB_NAME,
  jwt_secret_status: SECRET_KEY ? "✅ LOADED" : "❌ MISSING",
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
    res.json({ status: "ok", time: rows[0].now });
  } catch (err) {
    return sendDbError(res, err);
  }
});

app.get("/", (req, res) => {
  res.send("✅ Server is running. Go to /api-docs for documentation.");
});

// Users routes
app.use("/users", usersRouter);

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const missing = requireFields({ username, password }, ["username", "password"]);
  if (missing) {
    return res.status(400).json({ error: `Missing required field: ${missing}` });
  }

  try {
    const [rows] = await db.execute(
      "SELECT id, fullname, lastname, password FROM tbl_users WHERE username = ? LIMIT 1",
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

    // สร้าง Token โดยดึงค่าจาก process.env โดยตรงเพื่อความชัวร์
    const token = jwt.sign(
      { id: user.id, fullname: user.fullname, lastname: user.lastname },
      process.env.JWT_SECRET, 
      { expiresIn: "1h" }
    );

    setActiveToken(user.id, token);
    res.json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/logout", verifyToken, (req, res) => {
  clearActiveToken(req.user.id);
  res.json({ status: "ok", message: "Logged out" });
});

app.get("/api/data", (req, res) => {
  res.json({ message: "Hello, CORS!" });
});

// --------------------------------------------------
// 4) GLOBAL FALLBACK ERROR HANDLER
// --------------------------------------------------
app.use((err, req, res, next) => {
  console.error("[UNCAUGHT ERROR]", err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

// --------------------------------------------------
// 5) START SERVER
// --------------------------------------------------
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
}

export default app;