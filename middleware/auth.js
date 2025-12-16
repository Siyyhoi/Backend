import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET;
const activeTokens =
  globalThis.__activeTokens ?? (globalThis.__activeTokens = new Map());

function getActiveToken(userId) {
  return activeTokens.get(userId);
}

export default function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    const storedToken = getActiveToken(user.id);
    if (!storedToken || storedToken !== token) {
      return res
        .status(403)
        .json({ error: "Session revoked, please login again" });
    }
    req.user = user;
    next();
  });
}
