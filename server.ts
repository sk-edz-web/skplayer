import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

// Admin configuration constants from environment variables with secure fallbacks
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "sarathik354@gmail.com").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Sarathi@5023";
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "sk_edz_admin_secret_key_session_token_secure";

// Helper to generate HMAC signed token
function generateAdminToken(email: string): string {
  const payload = JSON.stringify({
    email,
    role: "admin",
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days validity
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", ADMIN_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

// Helper to verify HMAC signed token
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 200MB limit to handle base64 audio/image uploads safely
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  // Admin Auth Route: Login (Strict server-side validation)
  app.post("/api/admin/login", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          message: "Email address and password are required." 
        });
      }

      const inputEmail = String(email).trim().toLowerCase();
      const inputPassword = String(password);

      // Verify email and password on server side only
      if (inputEmail !== ADMIN_EMAIL || inputPassword !== ADMIN_PASSWORD) {
        // Uniform error response to avoid credential enumeration
        return res.status(401).json({ 
          success: false, 
          message: "Access Denied: Invalid credentials or unauthorized administrator account." 
        });
      }

      const token = generateAdminToken(inputEmail);
      console.log(`[Admin Auth] Successfully authenticated admin: ${inputEmail}`);
      
      return res.json({
        success: true,
        token,
        email: inputEmail,
        message: "Admin authentication successful."
      });
    } catch (err: any) {
      console.error("[Admin Auth] Login error:", err);
      return res.status(500).json({ success: false, message: "Internal server authentication error." });
    }
  });

  // Admin Auth Route: Verify Session Token
  app.post("/api/admin/verify", (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null);
      
      if (!token) {
        return res.status(401).json({ valid: false, message: "No token provided" });
      }

      const result = verifyAdminToken(token);
      if (!result.valid) {
        return res.status(401).json({ valid: false, message: "Invalid or expired session token" });
      }

      return res.json({ valid: true, email: result.email });
    } catch (err: any) {
      return res.status(500).json({ valid: false, message: "Verification error" });
    }
  });

  // Serve uploaded files statically
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // API Upload Route (Securely handles base64 audio/image uploads and saves them locally)
  app.post("/api/upload", async (req, res) => {
    try {
      const { file, presetType } = req.body;

      if (!file) {
        return res.status(400).json({ error: "No file content provided." });
      }

      // Ensure local uploads directory exists
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      let isImage = false;
      let extension = "mp3"; // default for audio
      let base64Data = file;

      if (typeof file === "string" && file.startsWith("data:")) {
        const mimeMatch = file.match(/^data:([^;]+);base64,/);
        if (mimeMatch) {
          const mime = mimeMatch[1];
          if (mime.startsWith("image/")) {
            isImage = true;
            extension = mime.split("/")[1] || "png";
          } else if (mime.startsWith("audio/")) {
            isImage = false;
            extension = mime.split("/")[1] || "mp3";
          }
          if (extension === "mpeg") extension = "mp3";
        }
        
        if (file.includes(";base64,")) {
          base64Data = file.split(";base64,")[1];
        }
      } else {
        // Fallback/guess based on presetType
        if (presetType && (presetType.includes("image") || presetType === "avatar" || presetType === "playlist" || presetType.includes("pfp"))) {
          isImage = true;
          extension = "png";
        } else {
          isImage = false;
          extension = "mp3";
        }
      }

      const prefix = isImage ? "img" : "audio";
      const filename = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}.${extension}`;
      const filePath = path.join(uploadsDir, filename);

      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(filePath, buffer);
      console.log(`[API Upload] Saved ${prefix} locally at: ${filePath}`);

      const secureUrl = `/uploads/${filename}`;

      return res.json({
        secure_url: secureUrl,
        format: extension,
        duration: null,
      });
    } catch (error: any) {
      console.error("[API Upload] Internal server error:", error);
      return res.status(500).json({
        error: "Internal Server Error in local upload",
        message: error.message,
      });
    }
  });



  // Serve static assets and frontend SPA build
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Server listening on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Start server failed:", err);
});
