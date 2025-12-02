import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import bcrypt from "bcrypt";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.BCRYPT_ROUNDS = "4";

const fixedNow = new Date("2024-01-01T12:00:00.000Z");

let users = [];
let nextId = 1;
let userCounter = 0;

const mockQuery = jest.fn();
const mockExecute = jest.fn();
const createPool = jest.fn(() => ({
  query: mockQuery,
  execute: mockExecute,
}));

// Stub the MySQL client so routes use in-memory data during tests.
jest.unstable_mockModule("mysql2/promise", () => ({
  __esModule: true,
  default: { createPool },
}));

const { app } = await import("../index.js");

const seedUser = {
  firstname: "Seed",
  fullname: "Seed User",
  lastname: "User",
  username: "seed_user",
  password: "seed-pass-123",
  status: "active",
};

const toPublicUser = (user) => ({
  id: user.id,
  firstname: user.firstname,
  fullname: user.fullname,
  lastname: user.lastname,
  username: user.username,
  status: user.status,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

let seedPasswordHash;

const buildUserPayload = (overrides = {}) => {
  userCounter += 1;
  const suffix = userCounter;
  return {
    firstname: `User${suffix}`,
    fullname: `User ${suffix}`,
    lastname: `Test${suffix}`,
    username: `user_${suffix}`,
    password: `pass${suffix}#123`,
    status: "active",
    ...overrides,
  };
};

function resetDbState() {
  users = [
    {
      id: 1,
      firstname: seedUser.firstname,
      fullname: seedUser.fullname,
      lastname: seedUser.lastname,
      username: seedUser.username,
      password: seedPasswordHash,
      status: seedUser.status,
      created_at: fixedNow,
      updated_at: fixedNow,
    },
  ];
  nextId = 2;
}

function hydrateDbMocks() {
  mockQuery.mockReset();
  mockExecute.mockReset();

  mockQuery.mockImplementation(async (sql) => {
    if (sql.includes("SELECT NOW() AS now")) {
      return [[{ now: fixedNow }]];
    }

    if (sql.includes("SELECT COUNT(*) AS total FROM tbl_users")) {
      return [[{ total: users.length }]];
    }

    if (
      sql.includes(
        "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM tbl_users"
      )
    ) {
      return [users.map(toPublicUser)];
    }

    return [[]];
  });

  mockExecute.mockImplementation(async (sql, params = []) => {
    if (sql.includes("INSERT INTO tbl_users")) {
      const [firstname, fullname, lastname, username, hashedPassword, status] =
        params;
      const newUser = {
        id: nextId++,
        firstname,
        fullname,
        lastname,
        username,
        password: hashedPassword,
        status,
        created_at: fixedNow,
        updated_at: fixedNow,
      };
      users.push(newUser);
      return [{ insertId: newUser.id, affectedRows: 1 }];
    }

    if (
      sql.includes(
        "SELECT id, fullname, lastname, password FROM tbl_users WHERE username = ?"
      )
    ) {
      const usernameParam = params[0];
      const user = users.find((u) => u.username === usernameParam);
      return [user ? [user] : []];
    }

    if (
      sql.includes(
        "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM tbl_users WHERE id = ?"
      )
    ) {
      const userId = Number(params[0]);
      const user = users.find((u) => u.id === userId);
      return [user ? [toPublicUser(user)] : []];
    }

    if (
      sql.includes(
        "SELECT id, firstname, fullname, lastname, username, status, created_at, updated_at FROM tbl_users"
      ) &&
      sql.includes("LIMIT ? OFFSET ?")
    ) {
      const [limit, offset] = params.map((val) => Number(val));
      const start = Number.isNaN(offset) ? 0 : offset;
      const end = Number.isNaN(limit) ? users.length : start + limit;
      return [users.slice(start, end).map(toPublicUser)];
    }

    if (sql.startsWith("UPDATE tbl_users SET")) {
      const targetId = Number(params[params.length - 1]);
      const user = users.find((u) => u.id === targetId);
      if (!user) return [{ affectedRows: 0 }];

      const assignments = sql
        .split("SET")[1]
        .split("WHERE")[0]
        .split(",")
        .map((part) => part.trim());

      let paramIndex = 0;
      for (const statement of assignments) {
        const [field] = statement.split(" = ");
        if (statement.includes("?")) {
          const value = params[paramIndex++];
          if (field === "password") {
            user.password = value;
          } else {
            user[field] = value;
          }
        } else if (field === "updated_at") {
          user.updated_at = fixedNow;
        }
      }

      return [{ affectedRows: 1 }];
    }

    if (sql.includes("DELETE FROM tbl_users WHERE id = ?")) {
      const userId = Number(params[0]);
      const before = users.length;
      users = users.filter((user) => user.id !== userId);
      return [{ affectedRows: before !== users.length ? 1 : 0 }];
    }

    return [[]];
  });
}

beforeAll(async () => {
  seedPasswordHash = await bcrypt.hash(seedUser.password, 4);
});

beforeEach(async () => {
  userCounter = 0;
  resetDbState();
  hydrateDbMocks();
  globalThis.__activeTokens?.clear?.();
});

async function loginAsSeed() {
  const res = await request(app).post("/login").send({
    username: seedUser.username,
    password: seedUser.password,
  });

  expect(res.status).toBe(200);
  return res.body.token;
}

async function createUser(payload) {
  return request(app).post("/users").send(payload);
}

describe("Integration Test Suite", () => {
  test("GET /ping returns heartbeat with database time", async () => {
    const res = await request(app).get("/ping");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(new Date(res.body.time).toISOString()).toBe(fixedNow.toISOString());
  });

  test("GET / returns server heartbeat text", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/server is running/i);
  });

  test("GET /api/data returns sample payload", async () => {
    const res = await request(app).get("/api/data");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello, CORS!" });
  });

  test("POST /users validates required fields", async () => {
    const res = await request(app).post("/users").send({
      firstname: "No Username",
      fullname: "No Username",
      lastname: "User",
      password: "pass1234",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/username/);
  });

  test("POST /users creates a new user and allows login", async () => {
    const newUser = buildUserPayload();
    const createRes = await createUser(newUser);

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      status: "ok",
      firstname: newUser.firstname,
      fullname: newUser.fullname,
      lastname: newUser.lastname,
      username: newUser.username,
      status: newUser.status,
    });
    expect(typeof createRes.body.id).toBe("number");

    const loginRes = await request(app).post("/login").send({
      username: newUser.username,
      password: newUser.password,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
    expect(loginRes.body.message).toBe("Login successful");
  });

  test("POST /login succeeds with seed user and stores token", async () => {
    const res = await request(app).post("/login").send({
      username: seedUser.username,
      password: seedUser.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(globalThis.__activeTokens.get(1)).toBe(res.body.token);
  });

  test("POST /login rejects invalid credentials", async () => {
    const res = await request(app).post("/login").send({
      username: seedUser.username,
      password: "wrong-password",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid password");
  });

  test("POST /login requires username field", async () => {
    const res = await request(app).post("/login").send({
      password: "no-username",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/);
  });

  test("POST /login returns 401 when user not found", async () => {
    const res = await request(app).post("/login").send({
      username: "ghost_user",
      password: "pass1234",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("User not found");
  });

  test("POST /logout revokes active token", async () => {
    const token = await loginAsSeed();
    const logoutRes = await request(app)
      .post("/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);
    expect(globalThis.__activeTokens.has(1)).toBe(false);

    const revokedRes = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${token}`);
    expect(revokedRes.status).toBe(403);
    expect(revokedRes.body.error).toMatch(/Session revoked/);
  });

  test("GET /users requires an auth token", async () => {
    const res = await request(app).get("/users");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  test("GET /users returns 403 for invalid token", async () => {
    const res = await request(app)
      .get("/users")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Invalid or expired token/);
  });

  test("GET /users without pagination returns full list", async () => {
    const token = await loginAsSeed();

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.count).toBe(users.length);
    expect(res.body.data).toHaveLength(users.length);
    expect(res.body.total).toBeUndefined();
  });

  test("GET /users returns paginated data when authorized", async () => {
    // create one more user so pagination has more to slice
    await createUser(buildUserPayload());

    const login = await request(app).post("/login").send({
      username: seedUser.username,
      password: seedUser.password,
    });

    const token = login.body.token;
    expect(token).toBeTruthy();

    const res = await request(app)
      .get("/users")
      .query({ limit: 1, page: 1 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.count).toBe(1);
    expect(res.body.total).toBe(users.length);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(1);
  });

  test("GET /users/:id returns seed user when found", async () => {
    const token = await loginAsSeed();

    const res = await request(app)
      .get("/users/1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.data.username).toBe(seedUser.username);
  });

  test("GET /users/:id returns not found for missing user", async () => {
    const login = await request(app).post("/login").send({
      username: seedUser.username,
      password: seedUser.password,
    });

    const res = await request(app)
      .get("/users/9999")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("not_found");
  });

  test("POST /users requires password field", async () => {
    const res = await request(app).post("/users").send({
      firstname: "No Password",
      fullname: "No Password",
      lastname: "User",
      username: "nopassword",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/);
  });

  test("POST /users with duplicate username should reject with conflict (expected LOW fail)", async () => {
    const dupeUser = buildUserPayload({ username: "duplicate_user" });
    const first = await createUser(dupeUser);
    expect(first.status).toBe(201);

    const second = await createUser(dupeUser);

    // Currently the API does not return a conflict; this test captures the gap.
    expect(second.status).toBe(409);
  });

  test("PUT /users/:id updates profile fields", async () => {
    const newUser = buildUserPayload();
    const created = await createUser(newUser);
    const token = await loginAsSeed();

    const res = await request(app)
      .put(`/users/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ firstname: "Updated", status: "inactive" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/);

    const fetchRes = await request(app)
      .get(`/users/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(fetchRes.body.data.firstname).toBe("Updated");
    expect(fetchRes.body.data.status).toBe("inactive");
  });

  test("PUT /users/:id returns bad request when no fields provided", async () => {
    const token = await loginAsSeed();

    const res = await request(app)
      .put("/users/1")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No fields to update/);
  });

  test("PUT /users/:id returns 404 when user not found", async () => {
    const token = await loginAsSeed();

    const res = await request(app)
      .put("/users/9999")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstname: "Nobody" });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("not_found");
  });

  test("PUT /users/:id updates password and allows login with new password", async () => {
    const newUser = buildUserPayload();
    const created = await createUser(newUser);
    const token = await loginAsSeed();

    const res = await request(app)
      .put(`/users/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "updatedPass!234" });

    expect(res.status).toBe(200);

    const loginRes = await request(app).post("/login").send({
      username: newUser.username,
      password: "updatedPass!234",
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
  });

  test("DELETE /users/:id deletes an existing user", async () => {
    const newUser = buildUserPayload();
    const created = await createUser(newUser);
    const token = await loginAsSeed();

    const res = await request(app)
      .delete(`/users/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const followUp = await request(app)
      .get(`/users/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(followUp.status).toBe(404);
  });

  test("DELETE /users/:id returns not found when user missing", async () => {
    const token = await loginAsSeed();

    const res = await request(app)
      .delete("/users/9999")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("not_found");
  });

  test("DELETE /users/:id requires auth token", async () => {
    const newUser = buildUserPayload();
    const created = await createUser(newUser);

    const res = await request(app).delete(`/users/${created.body.id}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });
});
