import jwt from "jsonwebtoken";

const verifyToken = (req, res, next) => {
  // 1. ดึง Token จาก Header
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  // 2. ถ้าไม่มี Token ส่งมาเลย
  if (!token) {
    return res.status(401).json({ error: "No token provided, authorization denied" });
  }

  // 3. ตรวจสอบ Token (ใช้ process.env.JWT_SECRET ตรงๆ เพื่อความชัวร์)
  // ถ้าใน .env มึงตั้งชื่ออื่น ต้องเปลี่ยนตรงนี้ให้ตรงกัน
  const secret = process.env.JWT_SECRET;

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      console.log("❌ JWT Verification Failed:", err.message); // ดูใน Terminal ว่ามันฟ้องอะไร
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    // 4. ถ้าผ่าน เก็บข้อมูล user ไว้ใน request
    req.user = decoded;
    next();
  });
};

export default verifyToken;