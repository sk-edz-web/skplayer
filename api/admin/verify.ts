import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "sarathik354@gmail.com").trim().toLowerCase();
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "sk_edz_admin_secret_key_session_token_secure";

function verifyAdminToken(token: string): { valid: boolean; email?: string } {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return { valid: false };
    }
    const [encodedPayload, signature] = token.split(".");
    const expectedSignature = crypto.createHmac("sha256", ADMIN_SECRET).update(encodedPayload).digest("base64url");
    
    if (signature !== expectedSignature) {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"));
    if (Date.now() > payload.expiresAt) {
      return { valid: false };
    }
    if (payload.role !== "admin" || payload.email.toLowerCase() !== ADMIN_EMAIL) {
      return { valid: false };
    }

    return { valid: true, email: payload.email };
  } catch (err) {
    return { valid: false };
  }
}

export default function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, message: "Method not allowed" });
  }

  try {
    const authHeader = req.headers?.authorization;
    const token = req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null);

    if (!token) {
      return res.status(401).json({ valid: false, message: "No token provided" });
    }

    const result = verifyAdminToken(token);
    if (!result.valid) {
      return res.status(401).json({ valid: false, message: "Invalid or expired session token" });
    }

    return res.status(200).json({ valid: true, email: result.email });
  } catch (err: any) {
    return res.status(500).json({ valid: false, message: "Verification error" });
  }
}
