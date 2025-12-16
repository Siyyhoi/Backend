import { config as loadEnv } from "dotenv";
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import verifyToken from "./middleware/auth.js";
import { swaggerUi, specs } from "./swagger.js";

const envPath =
  process.env.DOTENV_CONFIG_PATH ??
  (process.env.NODE_ENV === "production" ? ".env.production" : ".env.local");

loadEnv({ path: envPath, override: false });

const SECRET_KEY = process.env.JWT_SECRET;
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

// Swagger UI setup - explicit routes for Vercel serverless compatibility
app.use("/api-docs", swaggerUi.serve);
app.get(
  "/api-docs",
  swaggerUi.setup(specs, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "BackEnd API Documentation",
  })
);

app.disable("x-powered-by");
app.set("etag", "strong");

app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

const POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "20", 10);
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
const DB_NAME = process.env.DB_NAME || "db_shop";
const MAX_PAGE_SIZE = parseInt(process.env.MAX_PAGE_SIZE || "100", 10);

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

/**
 * @openapi
 * /ping:
 *   get:
 *     tags:
 *       - Health
 *     summary: Test DB connection
 *     description: Returns the current database server time to verify connectivity
 *     responses:
 *       200:
 *         description: Database connection successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 time:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Database error
 */
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

/**
 * @openapi
 * /:
 *   get:
 *     tags:
 *       - Health
 *     summary: Root endpoint
 *     description: Returns a simple message to confirm server is running
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "✅ Server is running on cloud. Go to /ping to check its status."
 */
app.get("/", (req, res) => {
  res.send("✅ Server is running on cloud. Go to /ping to check its status.");
});

/**
 * @openapi
 * /users:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get all users
 *     description: Retrieve a paginated list of all users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of users per page
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Database error
 */
app.get("/users", verifyToken, async (req, res) => {
  try {
    const limitParam = Number.parseInt(req.query.limit ?? "", 10);
    const limit =
      Number.isNaN(limitParam) || limitParam <= 0
        ? null
        : Math.min(limitParam, MAX_PAGE_SIZE);

    const pageParam = Number.parseInt(req.query.page ?? "", 10);
    const page = Number.isNaN(pageParam) || pageParam <= 0 ? 1 : pageParam;
    const offset = limit !== null ? Math.max(0, (page - 1) * limit) : 0;

    let sql =
      "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM tbl_users";
    const params = [];
    if (limit !== null) {
      sql += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
    }

    const dataPromise = runQuery(sql, params);
    const countPromise =
      limit !== null
        ? runQuery("SELECT COUNT(*) AS total FROM tbl_users")
        : null;

    const rows = await dataPromise;
    const responseBody = {
      status: "ok",
      count: rows.length,
      data: rows,
    };

    if (countPromise) {
      const total = await countPromise;
      responseBody.total = total[0].total;
      responseBody.page = page;
      responseBody.limit = limit;
    }

    res.json(responseBody);
  } catch (err) {
    return sendDbError(res, err);
  }
});

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get user by ID
 *     description: Retrieve a single user by their ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Database error
 */
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

/**
 * @openapi
 * /users:
 *   post:
 *     tags:
 *       - Users
 *     summary: Create a new user
 *     description: Register a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 id:
 *                   type: integer
 *                 firstname:
 *                   type: string
 *                 fullname:
 *                   type: string
 *                 lastname:
 *                   type: string
 *                 username:
 *                   type: string
 *                 userStatus:
 *                   type: string
 *                   description: User account status (e.g., active, inactive)
 *       400:
 *         description: Bad request - missing required fields
 *       500:
 *         description: Database error
 */
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

/**
 * @openapi
 * /users/{id}:
 *   put:
 *     tags:
 *       - Users
 *     summary: Update user
 *     description: Update an existing user's information
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstname:
 *                 type: string
 *               fullname:
 *                 type: string
 *               lastname:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: User updated successfully
 *       400:
 *         description: No fields to update
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Database error
 */
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

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete user
 *     description: Delete a user by their ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Database error
 */
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

/**
 * @openapi
 * /login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User login
 *     description: Authenticate user and receive a JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   description: JWT token for authentication
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Login failed
 */
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

    const token = jwt.sign(
      { id: user.id, fullname: user.fullname, lastname: user.lastname },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    setActiveToken(user.id, token);

    res.json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * @openapi
 * /logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User logout
 *     description: Invalidate the current user's session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Logged out
 *       401:
 *         description: Unauthorized
 */
app.post("/logout", verifyToken, (req, res) => {
  clearActiveToken(req.user.id);
  res.json({ status: "ok", message: "Logged out" });
});

/**
 * @openapi
 * /api/data:
 *   get:
 *     tags:
 *       - Misc
 *     summary: Test CORS endpoint
 *     description: Simple endpoint to test CORS configuration
 *     responses:
 *       200:
 *         description: CORS test successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Hello, CORS!
 */
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
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
}

export default app;
