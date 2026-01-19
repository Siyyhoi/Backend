import express from "express";
import bcrypt from "bcrypt";
import verifyToken from "../middleware/auth.js";
import { db } from "../config/db.js";

const router = express.Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
const MAX_PAGE_SIZE = parseInt(process.env.MAX_PAGE_SIZE || "100", 10);

// --------------------------------------------------
// SMALL UTILS
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
// ROUTES
// --------------------------------------------------

// GET ALL USERS
router.get("/", verifyToken, async (req, res) => {
  try {
    const limitParam = parseInt(req.query.limit ?? "", 10);
    const limit =
      Number.isNaN(limitParam) || limitParam <= 0
        ? null
        : Math.min(limitParam, MAX_PAGE_SIZE);

    const pageParam = parseInt(req.query.page ?? "", 10);
    const page = Number.isNaN(pageParam) || pageParam <= 0 ? 1 : pageParam;
    const offset = limit ? (page - 1) * limit : 0;

    let sql = `
      SELECT 
        id,
        firstname,
        fullname,
        lastname,
        username,
        address,
        status,
        created_at,
        updated_at
      FROM tbl_users
    `;

    const params = [];
    if (limit) {
      sql += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
    }

    const data = await runQuery(sql, params);

    const response = {
      status: "ok",
      count: data.length,
      data,
    };

    if (limit) {
      const total = await runQuery("SELECT COUNT(*) AS total FROM tbl_users");
      response.total = total[0].total;
      response.page = page;
      response.limit = limit;
    }

    res.json(response);
  } catch (err) {
    return sendDbError(res, err);
  }
});

// GET USER BY ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await runQuery(
      `
      SELECT 
        id,
        firstname,
        fullname,
        lastname,
        username,
        address,
        status,
        created_at,
        updated_at
      FROM tbl_users
      WHERE id = ?
      `,
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

// CREATE USER (REGISTER)
router.post("/", async (req, res) => {
  try {
    const {
      firstname,
      fullname,
      lastname,
      username,
      password,
      address,
      status = "active",
    } = req.body;

    const missing = requireFields(req.body, [
      "firstname",
      "fullname",
      "lastname",
      "username",
      "password",
      "address",
    ]);

    if (missing) {
      return res.status(400).json({
        status: "bad_request",
        message: `Missing required field: ${missing}`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [result] = await db.execute(
      `
      INSERT INTO tbl_users
      (firstname, fullname, lastname, username, password, address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        firstname,
        fullname,
        lastname,
        username,
        hashedPassword,
        address,
        status,
      ]
    );

    res.status(201).json({
      status: "ok",
      id: result.insertId,
      firstname,
      fullname,
      lastname,
      username,
      address,
      status,
    });
  } catch (err) {
    return sendDbError(res, err);
  }
});

// UPDATE USER
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstname,
      fullname,
      lastname,
      username,
      password,
      address,
      status,
    } = req.body;

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
    if (address !== undefined) {
      fields.push("address = ?");
      params.push(address);
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

// DELETE USER
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.execute(
      "DELETE FROM tbl_users WHERE id = ?",
      [id]
    );

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

export default router;
