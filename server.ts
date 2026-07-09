import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 200MB limit to handle base64 audio/image uploads safely
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  // Serve uploaded files statically
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // API Upload Route (Securely proxies request to Cloudinary/ImgBB from server-side)
  app.post("/api/upload", async (req, res) => {
    try {
      const { file, presetType } = req.body;

      if (!file) {
        return res.status(400).json({ error: "No file content provided." });
      }

      // Check if this is an image upload (cover image, avatar, or base64 starts with data:image)
      const isImage = 
        (presetType && presetType.includes("image")) || 
        (typeof file === "string" && file.startsWith("data:image/")) || 
        !(typeof file === "string" && file.startsWith("data:audio/"));

      if (isImage) {
        // Strip base64 data URI schema prefix if present
        let base64Image = file;
        if (typeof file === "string" && file.includes(";base64,")) {
          base64Image = file.split(";base64,")[1];
        }

        const imgbbKey = process.env.IMGBB_API_KEY || "7a39d89ccdbcf9a749363143c7b6009f";
        console.log(`[API Upload] Uploading image to ImgBB using API key: ${imgbbKey ? "provided" : "none"}`);

        const params = new URLSearchParams();
        params.append("image", base64Image);

        const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
          method: "POST",
          body: params,
        });

        if (!imgbbResponse.ok) {
          const errText = await imgbbResponse.text();
          console.error("[API Upload] ImgBB upload failed:", errText);
          throw new Error(`ImgBB upload failed: ${errText}`);
        }

        const imgbbData = await imgbbResponse.json() as any;
        console.log("[API Upload] ImgBB upload successful secure_url:", imgbbData.data.url);

        return res.json({
          secure_url: imgbbData.data.url,
          format: imgbbData.data.image?.extension || "png",
          duration: null,
        });
      }

      // Ensure local uploads directory exists
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Audio upload saved locally on the server filesystem
      let base64Audio = file;
      let extension = "mp3"; // default extension

      // Extract extension if it has data URI schema
      if (typeof file === "string" && file.startsWith("data:audio/")) {
        const mimeMatch = file.match(/^data:audio\/([^;]+);base64,/);
        if (mimeMatch) {
          extension = mimeMatch[1];
          if (extension === "mpeg") extension = "mp3"; // normalise mpeg to mp3
        }
        base64Audio = file.split(";base64,")[1];
      }

      const buffer = Buffer.from(base64Audio, "base64");
      const filename = `audio-${Date.now()}-${Math.floor(Math.random() * 100000)}.${extension}`;
      const filePath = path.join(uploadsDir, filename);

      fs.writeFileSync(filePath, buffer);
      console.log(`[API Upload] Saved audio locally at: ${filePath}`);

      const secureUrl = `/uploads/${filename}`;

      return res.json({
        secure_url: secureUrl,
        format: extension,
        duration: null,
      });
    } catch (error: any) {
      console.error("[API Upload] Internal server error:", error);
      return res.status(500).json({
        error: "Internal Server Error in proxy upload",
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
