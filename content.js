// Content script — injects the agent panel into any page

let panelInjected = false;
let panelVisible  = false;

// ── Inject Panel ──────────────────────────────────────────────

function injectPanel() {
  // Always remove stale panel so re-injection after extension reload gets fresh HTML
  const existing = document.getElementById("jra-panel");
  if (existing) existing.remove();
  panelInjected = false;

  const panel = document.createElement("div");
  panel.id    = "jra-panel";
  panel.innerHTML = getPanelHTML();
  document.body.appendChild(panel);
  panelInjected = true;

  // Wire up buttons
  document.getElementById("jra-close").addEventListener("click", hidePanel);
  document.getElementById("jra-run").addEventListener("click", runAgent);
  document.getElementById("jra-clear").addEventListener("click", clearPanel);
  document.getElementById("jra-copy-logs").addEventListener("click", copyLogs);
  document.getElementById("jra-download-logs").addEventListener("click", downloadLogs);

  // Allow Enter key in textarea
  document.getElementById("jra-query").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.ctrlKey) runAgent();
  });

  // Auto-detect page content
  autoDetect();
}

function showPanel() {
  if (!panelInjected) injectPanel();
  document.getElementById("jra-panel").classList.add("jra-visible");
  panelVisible = true;
}

function hidePanel() {
  const panel = document.getElementById("jra-panel");
  if (panel) panel.classList.remove("jra-visible");
  panelVisible = false;
}

// ── Auto Detect Company/Job from Page ──────────────────────────

function autoDetect() {
  const title   = document.title || "";
  const h1      = document.querySelector("h1")?.textContent || "";
  const metaDesc= document.querySelector('meta[name="description"]')?.content || "";

  // Try to detect job postings
  const jobSites = ["linkedin.com", "naukri.com", "indeed.com", "glassdoor.com", "wellfound.com", "internshala.com"];
  const isJobSite = jobSites.some(s => window.location.hostname.includes(s));

  let suggested = "";
  if (isJobSite) {
    // Try to extract company name from page
    const companyEl = document.querySelector('[data-company], .company-name, .topcard__org-name-link, .employer-name');
    if (companyEl) suggested = companyEl.textContent.trim();
  }

  if (!suggested && h1) suggested = h1.slice(0, 60);

  const textarea = document.getElementById("jra-query");
  if (textarea && suggested) {
    textarea.placeholder = `e.g. "Should I apply to ${suggested}? I am a Data Scientist"`;
  }
}

// ── Run Agent ──────────────────────────────────────────────────

function runAgent() {
  const query = document.getElementById("jra-query").value.trim();
  if (!query) {
    showToast("Please enter a company name or question");
    return;
  }

  // Clear previous results
  document.getElementById("jra-chain").innerHTML = "";
  document.getElementById("jra-logs-box").value  = "";
  document.getElementById("jra-logs-section").style.display = "none";
  document.getElementById("jra-run").disabled    = true;
  document.getElementById("jra-run").textContent = "⏳ Agent Running...";
  document.getElementById("jra-verdict").style.display = "none";

  chrome.runtime.sendMessage({ type: "RUN_AGENT", query });
}

function clearPanel() {
  document.getElementById("jra-query").value     = "";
  document.getElementById("jra-chain").innerHTML = "";
  document.getElementById("jra-logs-box").value  = "";
  document.getElementById("jra-logs-section").style.display = "none";
  document.getElementById("jra-verdict").style.display      = "none";
  document.getElementById("jra-run").disabled    = false;
  document.getElementById("jra-run").textContent = "🔍 Research This Company";
}

function copyLogs() {
  const logs = document.getElementById("jra-logs-box").value;
  navigator.clipboard.writeText(logs).then(() => showToast("Logs copied to clipboard!"));
}

function downloadLogs() {
  const logs = document.getElementById("jra-logs-box").value;
  if (!logs) { showToast("No logs to download yet"); return; }
  const blob = new Blob([logs], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `job_research_agent_logs_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Logs downloaded!");
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className   = "jra-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Render Reasoning Chain Steps ──────────────────────────────

function addStep(step) {
  const chain = document.getElementById("jra-chain");

  const el = document.createElement("div");
  el.className = "jra-step";

  switch (step.type) {

    case "START":
      el.className += " jra-step-start";
      el.innerHTML = `<div class="jra-step-icon">🎯</div>
        <div class="jra-step-body">
          <div class="jra-step-title">Query Received</div>
          <div class="jra-step-content">${escHtml(step.data.query)}</div>
        </div>`;
      break;

    case "LOG":
      el.className += " jra-step-log";
      el.innerHTML = `<div class="jra-step-icon">📋</div>
        <div class="jra-step-body">
          <div class="jra-step-content">${escHtml(step.data.message)}</div>
        </div>`;
      break;

    case "THINKING":
      el.className += " jra-step-thinking";
      el.innerHTML = `<div class="jra-step-icon jra-spin">⚙️</div>
        <div class="jra-step-body">
          <div class="jra-step-title">Iteration ${step.data.iteration} — Agent Thinking...</div>
        </div>`;
      break;

    case "LLM_RESPONSE":
      el.className += " jra-step-llm";
      el.innerHTML = `<div class="jra-step-icon">🧠</div>
        <div class="jra-step-body">
          <div class="jra-step-title">LLM Response (Iteration ${step.data.iteration})</div>
          <div class="jra-step-code">${escHtml(step.data.raw)}</div>
        </div>`;
      break;

    case "TOOL_CALL":
      el.className += " jra-step-tool-call";
      el.innerHTML = `<div class="jra-step-icon">🔧</div>
        <div class="jra-step-body">
          <div class="jra-step-title">Tool Call → <span class="jra-tool-name">${escHtml(step.data.tool)}</span></div>
          <div class="jra-step-reasoning">💭 ${escHtml(step.data.reasoning)}</div>
          <div class="jra-step-code">Args: ${escHtml(JSON.stringify(step.data.args, null, 2))}</div>
        </div>`;
      break;

    case "TOOL_RESULT":
      el.className += " jra-step-tool-result";
      let resultDisplay = step.data.result;
      try {
        const parsed = JSON.parse(step.data.result);
        resultDisplay = JSON.stringify(parsed, null, 2);
      } catch {}
      el.innerHTML = `<div class="jra-step-icon">📦</div>
        <div class="jra-step-body">
          <div class="jra-step-title">Tool Result ← <span class="jra-tool-name">${escHtml(step.data.tool)}</span></div>
          <div class="jra-step-code">${escHtml(resultDisplay)}</div>
        </div>`;
      break;

    case "FINAL_ANSWER":
      el.className += " jra-step-final";
      const verdictClass = step.data.verdict === "APPLY" ? "jra-verdict-apply"
                         : step.data.verdict === "SKIP"  ? "jra-verdict-skip"
                         : "jra-verdict-maybe";
      el.innerHTML = `<div class="jra-step-icon">✅</div>
        <div class="jra-step-body">
          <div class="jra-step-title">Final Recommendation</div>
          <div class="jra-step-content">${escHtml(step.data.answer)}</div>
        </div>`;

      // Show verdict badge
      const verdict = document.getElementById("jra-verdict");
      verdict.className    = `jra-verdict-badge ${verdictClass}`;
      verdict.textContent  = step.data.verdict === "APPLY" ? "✅ APPLY" : step.data.verdict === "SKIP" ? "❌ SKIP" : "🔍 RESEARCH MORE";
      verdict.style.display = "block";

      // Re-enable button
      document.getElementById("jra-run").disabled    = false;
      document.getElementById("jra-run").textContent = "🔍 Research This Company";
      break;

    case "LOGS":
      // Populate the logs textarea for submission
      const logText = formatLogsForSubmission(step.data);
      document.getElementById("jra-logs-box").value  = logText;
      document.getElementById("jra-logs-section").style.display = "block";
      // Scroll the panel body down so the logs section is visible
      setTimeout(() => {
        const body = document.querySelector("#jra-panel .jra-body");
        if (body) body.scrollTop = body.scrollHeight;
      }, 50);
      return; // don't fall through to chain.appendChild

    case "ERROR":
      el.className += " jra-step-error";
      el.innerHTML = `<div class="jra-step-icon">⚠️</div>
        <div class="jra-step-body">
          <div class="jra-step-title">Error</div>
          <div class="jra-step-content">${escHtml(step.data.message)}</div>
        </div>`;
      document.getElementById("jra-run").disabled    = false;
      document.getElementById("jra-run").textContent = "🔍 Research This Company";
      break;
  }

  chain.appendChild(el);
  chain.scrollTop = chain.scrollHeight;
}

// ── Format Logs for Assignment Submission ──────────────────────

function formatLogsForSubmission(data) {
  let log = "=".repeat(60) + "\n";
  log += "JOB RESEARCH AGENT — FULL CONVERSATION LOG\n";
  log += `Generated: ${new Date().toLocaleString()}\n`;
  log += `Page URL: ${window.location.href}\n`;
  log += "=".repeat(60) + "\n\n";

  // --- Step-by-step agent trace ---
  log += "─".repeat(60) + "\n";
  log += "SECTION 1: AGENT STEP-BY-STEP TRACE\n";
  log += "─".repeat(60) + "\n\n";

  for (const entry of data.logs) {
    log += `[${entry.timestamp}] ${entry.type}\n`;
    log += JSON.stringify(entry.data, null, 2) + "\n";
    log += "-".repeat(40) + "\n";
  }

  // --- Full conversation memory (including system prompt) ---
  log += "\n" + "─".repeat(60) + "\n";
  log += "SECTION 2: FULL LLM CONVERSATION MEMORY\n";
  log += "(Includes system prompt, all user/assistant/tool turns)\n";
  log += "─".repeat(60) + "\n\n";

  for (const msg of data.fullConversation) {
    log += `[${ msg.role.toUpperCase() }]\n${msg.content}\n\n`;
  }

  log += "=".repeat(60) + "\n";
  log += "END OF LOG\n";
  log += "=".repeat(60) + "\n";

  return log;
}

// ── HTML Template ──────────────────────────────────────────────

function getPanelHTML() {
  return `
    <div class="jra-header">
      <div class="jra-header-left">
        <span class="jra-logo">🔍</span>
        <div>
          <div class="jra-title">Job Research Agent</div>
          <div class="jra-subtitle">AI-powered company research</div>
        </div>
      </div>
      <button id="jra-close" class="jra-icon-btn" title="Close">✕</button>
    </div>

    <div class="jra-body">
      <div class="jra-input-section">
        <textarea id="jra-query" class="jra-textarea"
          placeholder='e.g. "Should I apply to Google as a Data Scientist?"'
          rows="2"></textarea>
        <div class="jra-btn-row">
          <button id="jra-run" class="jra-btn jra-btn-primary">🔍 Research This Company</button>
          <button id="jra-clear" class="jra-btn jra-btn-ghost">Clear</button>
        </div>
        <div class="jra-hint">Ctrl+Enter to run · Agent picks relevant tools and shows full reasoning</div>
      </div>

      <div id="jra-verdict" class="jra-verdict-badge" style="display:none"></div>

      <div class="jra-chain-header">
        <span>🔗 Agent Reasoning Chain</span>
        <span class="jra-chain-sub">Each step shown in real time</span>
      </div>

      <div id="jra-chain" class="jra-chain"></div>

      <div id="jra-logs-section" class="jra-logs-section" style="display:none">
        <div class="jra-logs-header">
          <span>📋 Full LLM Logs (for submission)</span>
          <div class="jra-logs-actions">
            <button id="jra-copy-logs" class="jra-btn jra-btn-ghost jra-btn-sm">📋 Copy All</button>
            <button id="jra-download-logs" class="jra-btn jra-btn-ghost jra-btn-sm">💾 Download .txt</button>
          </div>
        </div>
        <textarea id="jra-logs-box" class="jra-logs-box" readonly
          placeholder="Logs will appear here after agent completes..."></textarea>
      </div>
    </div>
  `;
}

// ── Escape HTML ────────────────────────────────────────────────

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Message Listener ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "AGENT_STEP") {
    addStep(message.step);
  }
  if (message.type === "SHOW_PANEL") {
    showPanel();
  }
});

// ── Listen for toolbar icon click ─────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TOGGLE_PANEL") {
    if (panelVisible) hidePanel();
    else showPanel();
  }
});

// Auto-inject on load
injectPanel();
