// server.js
// Minimal Express backend that downloads a video with yt-dlp and returns the file.
//
// IMPORTANT / RESPONSIBLE USE:
// This tool only downloads a video after the requester explicitly confirms
// (via the "ownPermission" checkbox in the UI) that they own the video or
// have permission to download it. The server has no way to actually verify
// ownership — this checkbox is a deliberate, logged consent gate, not a
// technical guarantee. Do not remove this confirmation step.

const express = require("express");
const { execFile } = require("child_process"); // safer than exec (no shell injection)
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

// Folder where downloaded videos are temporarily stored
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

// Parse JSON request bodies
app.use(express.json());

// Serve the static frontend (index.html, style.css, script.js)
app.use(express.static(path.join(__dirname, "public")));

// Basic URL validator using Node's built-in URL class
function isValidUrl(str) {
  try {
    const url = new URL(str);
    // Only allow http/https links
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (err) {
    return false;
  }
}

// POST /download — receives { url, ownPermission } from the frontend
app.post("/download", (req, res) => {
  const { url, ownPermission } = req.body;

  // 1. Check that a URL was actually sent
  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, message: "No URL provided." });
  }

  // 2. Validate URL format
  if (!isValidUrl(url)) {
    return res.status(400).json({ success: false, message: "Invalid URL format." });
  }

  // 3. Require explicit confirmation that the requester owns the video or
  //    has permission to download it. Refuse to proceed without it.
  if (ownPermission !== true) {
    return res.status(403).json({
      success: false,
      message: "You must confirm you own this video or have permission to download it."
    });
  }

  // 4. Build a unique output path inside the downloads folder so concurrent
  //    requests never collide or overwrite each other.
  const jobId = crypto.randomBytes(8).toString("hex");
  const outputTemplate = path.join(DOWNLOAD_DIR, `${jobId}-%(title)s.%(ext)s`);

  // 5. Run yt-dlp to actually download the video.
  //    --no-playlist   : only the single video, not an entire playlist
  //    -f mp4/best     : prefer mp4, fall back to best available format
  //    -o              : output filename template (unique per job)
  execFile(
    "yt-dlp",
    ["--no-playlist", "-f", "mp4/best", "-o", outputTemplate, url],
    { maxBuffer: 1024 * 1024 * 20 }, // allow larger stdout/stderr buffers
    (error, stdout, stderr) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message: "yt-dlp could not download this URL.",
          details: stderr ? stderr.trim() : error.message
        });
      }

      // 6. Find the file yt-dlp actually created (extension can vary).
      const files = fs.readdirSync(DOWNLOAD_DIR).filter((f) => f.startsWith(jobId));
      if (files.length === 0) {
        return res.status(500).json({
          success: false,
          message: "Download finished but the file could not be located."
        });
      }
      const filePath = path.join(DOWNLOAD_DIR, files[0]);

      // 7. Send the file to the browser as a download, then clean it up
      //    from the server's disk afterward.
      res.download(filePath, files[0].replace(`${jobId}-`, ""), (sendErr) => {
        fs.unlink(filePath, () => {}); // best-effort cleanup, ignore errors
        if (sendErr && !res.headersSent) {
          res.status(500).json({ success: false, message: "Failed to send file." });
        }
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
