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

  // API Route to fetch YouTube video info (title, author, duration, thumbnail)
  app.get("/api/youtube-info", async (req, res) => {
    try {
      const input = (req.query.id || req.query.url || req.query.v) as string;
      if (!input) {
        return res.status(400).json({ error: "Missing video id or url parameter" });
      }

      let videoId = input.trim();
      if (videoId.includes("youtube.com") || videoId.includes("youtu.be")) {
        const match = videoId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
        if (match && match[1]) {
          videoId = match[1];
        }
      }

      if (videoId.length !== 11) {
        return res.status(400).json({ error: "Invalid YouTube Video ID" });
      }

      let title = "";
      let artist = "";
      let duration = 0;
      let thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      // 1. Fetch metadata using YouTube's official public oEmbed API
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembedRes.ok) {
          const oembedData: any = await oembedRes.json();
          title = oembedData.title || "";
          artist = oembedData.author_name || "";
          if (oembedData.thumbnail_url) {
            thumbnail = oembedData.thumbnail_url;
          }
        }
      } catch (e) {
        console.warn("[YouTube Info] oEmbed fetch failed:", e);
      }

      // 2. Query Invidious instances to get duration and check stream availability
      const instances = [
        "https://yewtu.be",
        "https://invidious.nerdvpn.de",
        "https://inv.nadeko.net",
        "https://vid.priv.au",
        "https://iv.melmac.space",
        "https://invidious.asir.dev"
      ];

      for (const instance of instances) {
        try {
          const invRes = await fetch(`${instance}/api/v1/videos/${videoId}`, {
            signal: AbortSignal.timeout(3500)
          });
          if (invRes.ok) {
            const data: any = await invRes.json();
            if (!title && data.title) title = data.title;
            if (!artist && data.author) artist = data.author;
            if (data.lengthSeconds) duration = Number(data.lengthSeconds);
            break;
          }
        } catch (_) {}
      }

      if (!title) title = `YouTube Track (${videoId})`;
      if (!artist) artist = "YouTube Music";

      return res.json({
        id: videoId,
        title,
        artist,
        duration,
        imageUrl: thumbnail,
        audioUrl: `/api/youtube-stream?id=${videoId}&audioOnly=true`,
        originalUrl: `https://www.youtube.com/watch?v=${videoId}`
      });
    } catch (err: any) {
      console.error("[YouTube Info Error]:", err);
      return res.status(500).json({ error: "Failed to fetch YouTube info", message: err.message });
    }
  });

  // API Route to proxy YouTube stream through Node.js with CORS and Range header support
  app.get("/api/youtube-stream", async (req, res) => {
    let videoId = (req.query.id || req.query.url || req.query.v) as string;
    if (!videoId) {
      return res.status(400).send("Video ID is required");
    }

    if (videoId.includes("youtube.com") || videoId.includes("youtu.be")) {
      const match = videoId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
      if (match && match[1]) {
        videoId = match[1];
      }
    }

    const isAudioOnly = req.query.audioOnly !== "false";

    const getYoutubeStreamUrl = async (id: string): Promise<string | null> => {
      const instances = [
        "https://yewtu.be",
        "https://invidious.nerdvpn.de",
        "https://inv.nadeko.net",
        "https://vid.priv.au",
        "https://iv.melmac.space",
        "https://invidious.lunar.icu",
        "https://invidious.asir.dev",
        "https://iv.ggtyler.dev"
      ];
      
      for (const instance of instances) {
        try {
          const response = await fetch(`${instance}/api/v1/videos/${id}`, {
            signal: AbortSignal.timeout(4000)
          });
          if (response.ok) {
            const data: any = await response.json();

            // When audio-only requested (for song streaming without video/ads)
            if (isAudioOnly && data.adaptiveFormats && data.adaptiveFormats.length > 0) {
              const audioStream = data.adaptiveFormats.find(
                (s: any) => s.type?.includes("audio") || s.container === "m4a"
              );
              if (audioStream && audioStream.url) {
                return audioStream.url;
              }
            }

            // Fallback to standard formatStreams (mp4 audio+video, which HTML5 <audio> can play directly)
            if (data.formatStreams && data.formatStreams.length > 0) {
              const stream = data.formatStreams.find((s: any) => s.container === "mp4" || s.type?.includes("mp4")) || data.formatStreams[0];
              if (stream && stream.url) {
                return stream.url;
              }
            }

            // Adaptive formats general fallback
            if (data.adaptiveFormats && data.adaptiveFormats.length > 0) {
              const stream = data.adaptiveFormats.find((s: any) => s.type?.includes("audio") || (s.type?.includes("video") && s.container === "mp4"));
              if (stream && stream.url) {
                return stream.url;
              }
            }
          }
        } catch (e) {
          console.warn(`[YouTube Proxy] Invidious instance ${instance} failed:`, e);
        }
      }
      return null;
    };

    try {
      const streamUrl = await getYoutubeStreamUrl(videoId);
      if (!streamUrl) {
        return res.status(404).send("Could not resolve YouTube stream URL");
      }

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      };

      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      const streamResponse = await fetch(streamUrl, { headers });

      res.status(streamResponse.status);
      
      const contentType = streamResponse.headers.get("content-type");
      const contentLength = streamResponse.headers.get("content-length");
      const contentRange = streamResponse.headers.get("content-range");
      const acceptRanges = streamResponse.headers.get("accept-ranges");

      if (contentType) res.setHeader("Content-Type", contentType);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
      
      // Allow cross-origin requests for Web Audio API Eq / Bass Boost compatibility!
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");

      if (streamResponse.body) {
        const reader = streamResponse.body.getReader();
        let active = true;
        req.on("close", () => {
          active = false;
          reader.cancel();
        });

        const pump = async () => {
          if (!active) return;
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          await pump();
        };
        await pump();
      } else {
        res.status(500).send("Stream body is empty");
      }
    } catch (error) {
      console.error("[YouTube Proxy] Error proxying YouTube stream:", error);
      res.status(500).send("Error proxying YouTube stream");
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
