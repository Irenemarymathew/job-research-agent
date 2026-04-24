// Load saved keys
chrome.storage.sync.get(["geminiApiKey", "gnewsApiKey"], (result) => {
  if (result.geminiApiKey) document.getElementById("geminiKey").value = result.geminiApiKey;
  if (result.gnewsApiKey)  document.getElementById("gnewsKey").value  = result.gnewsApiKey;
});

// Save keys
document.getElementById("saveBtn").addEventListener("click", () => {
  const geminiKey = document.getElementById("geminiKey").value.trim();
  const gnewsKey  = document.getElementById("gnewsKey").value.trim();

  if (!geminiKey) {
    showStatus("Gemini API key is required", "error");
    return;
  }

  chrome.storage.sync.set(
    { geminiApiKey: geminiKey, gnewsApiKey: gnewsKey },
    () => showStatus("Settings saved successfully!", "success")
  );
});

// Open panel — inject content script first if needed
document.getElementById("openPanel").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tabId = tabs[0].id;

    try {
      // Try sending message first — if content script already loaded this works
      await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_PANEL" });
    } catch (err) {
      // Content script not loaded yet — inject it now
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"]
        });
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ["panel.css"]
        });
        // Small delay to let scripts initialize
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_PANEL" });
          } catch (e) {
            console.error("Still failed after inject:", e);
          }
        }, 300);
      } catch (injectErr) {
        console.error("Inject failed:", injectErr);
      }
    }

    window.close();
  });
});

function showStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className   = `status ${type}`;
  setTimeout(() => el.className = "status", 3000);
}
