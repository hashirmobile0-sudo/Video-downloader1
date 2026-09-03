// script.js
// Handles the button click, sends the URL to the backend, shows the response.

const urlInput = document.getElementById("videoUrl");
const ownPermissionEl = document.getElementById("ownPermission");
const downloadBtn = document.getElementById("downloadBtn");
const resultEl = document.getElementById("result");

downloadBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();

  if (!url) {
    resultEl.textContent = "Please enter a URL.";
    resultEl.style.color = "red";
    return;
  }

  // Require the checkbox to be ticked before even contacting the server
  if (!ownPermissionEl.checked) {
    resultEl.textContent = "Please confirm you own this video or have permission to download it.";
    resultEl.style.color = "red";
    return;
  }

  resultEl.textContent = "Downloading... this may take a moment.";
  resultEl.style.color = "black";

  try {
    // Send the URL + confirmation to our backend's /download endpoint
    const response = await fetch("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, ownPermission: ownPermissionEl.checked })
    });

    // If something went wrong, the server responds with JSON
    const contentType = response.headers.get("Content-Type") || "";
    if (!response.ok || contentType.includes("application/json")) {
      const data = await response.json();
      resultEl.textContent = `❌ ${data.message}`;
      resultEl.style.color = "red";
      return;
    }

    // Otherwise the response body IS the video file — trigger a browser download
    const blob = await response.blob();

    // Try to read the filename the server suggested
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : "video";

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    resultEl.textContent = "✅ Download complete.";
    resultEl.style.color = "green";
  } catch (err) {
    resultEl.textContent = "❌ Network or server error.";
    resultEl.style.color = "red";
  }
});
