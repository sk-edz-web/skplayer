import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "sarathik354@gmail.com").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Sarathi@5023";
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "sk_edz_admin_secret_key_session_token_secure";

function generateAdminToken(email: string): string {
  const payload = JSON.stringify({
    email,
    role: "admin",
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", ADMIN_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export default function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email address and password are required."
      });
    }

    const inputEmail = String(email).trim().toLowerCase();
    const inputPassword = String(password);

    if (inputEmail !== ADMIN_EMAIL || inputPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: "Access Denied: Invalid credentials or unauthorized administrator account."
      });
    }

    const token = generateAdminToken(inputEmail);
    return res.status(200).json({
      success: true,
      token,
      email: inputEmail,
      message: "Admin authentication successful."
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server authentication error."
    });
  }
}
