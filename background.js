// ============================================================
// Job Research Agent - Background Service Worker
// Agent Loop + All Tool Definitions
// ============================================================

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const MAX_ITERATIONS = 6;

// ============================================================
// System Prompt — Defines the agent's behaviour and tools
// ============================================================

const SYSTEM_PROMPT = `You are a Job Application Research Agent. Your job is to research a company and help the user decide whether to apply for a job there.

You have access to exactly these 3 tools:

1. get_company_news(company_name: string)
   - Fetches recent news articles about the company
   - Use this to understand company health, controversies, layoffs, growth
   - Example: get_company_news("Google")

2. get_company_info(company_name: string)
   - Fetches company summary, industry, and background from Wikipedia
   - Use this to understand what the company does and its scale
   - Example: get_company_info("Infosys")

3. get_job_demand(job_title: string)
   - Fetches the number of live job postings for a role and average salary range.
   - Use this to understand market demand for the role
   - Example: get_job_demand("Data Scientist")

RESPONSE FORMAT — You must ALWAYS respond in one of these two JSON formats only:

To call a tool:
{"tool_name": "tool_name_here", "tool_arguments": {"argument_name": "value"}, "reasoning": "Why you are calling this tool"}

To give the final answer:
{"answer": "your detailed final recommendation here", "verdict": "APPLY" or "SKIP" or "RESEARCH MORE"}

RULES:
- Respond with ONLY valid JSON. No markdown. No code fences. No extra text.
- Call ONLY the tools that are relevant to the user's question. You do NOT need to call all 3 tools every time.
  - If the user asks about a company, call get_company_info and get_company_news.
  - If the user asks about a specific role, also call get_job_demand.
  - If the user only asks about job market demand for a role or average salary range, just call get_job_demand.
  - Use your judgement — call as few or as many tools as needed to answer well.
- After you have enough information, synthesise into a clear recommendation.
- Your final answer should cover whatever is relevant: company summary, news sentiment, job market demand, and a clear verdict.
- Keep reasoning concise and factual`;


// ============================================================
// Tool 1: Get Company News via GNews API
// ============================================================

async function get_company_news(company_name) {
  try {
    const apiKey = await getStoredKey("gnewsApiKey");
    if (!apiKey) {
      // Fallback: use Wikipedia search for news-like content
      return JSON.stringify({
        source: "fallback",
        articles: [
          { title: `${company_name} - No GNews API key set`, description: "Please set GNews API key in popup for real news. Using fallback data.", date: new Date().toISOString() }
        ],
        note: "Set GNews API key in extension popup for real news results"
      });
    }

    const query = encodeURIComponent(`${company_name} company`);
    const url = `https://gnews.io/api/v4/search?q=${query}&lang=en&max=5&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.errors) {
      return JSON.stringify({ error: data.errors[0] });
    }

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      description: a.description,
      date: a.publishedAt,
      source: a.source?.name
    }));

    return JSON.stringify({
      company: company_name,
      total_results: data.totalArticles,
      articles: articles.slice(0, 5)
    });

  } catch (err) {
    return JSON.stringify({ error: `News fetch failed: ${err.message}` });
  }
}


// ============================================================
// Tool 2: Get Company Info via Wikipedia API
// ============================================================

async function get_company_info(company_name) {
  try {
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(company_name)}`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      // Try search endpoint
      const searchResp = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(company_name)}&limit=1&format=json&origin=*`);
      const searchData = await searchResp.json();
      if (searchData[1]?.length > 0) {
        const title = searchData[1][0];
        const summaryResp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        const summaryData = await summaryResp.json();
        return JSON.stringify({
          company: company_name,
          title: summaryData.title,
          summary: summaryData.extract?.slice(0, 600),
          url: summaryData.content_urls?.desktop?.page
        });
      }
      return JSON.stringify({ error: `No Wikipedia article found for ${company_name}` });
    }

    const data = await response.json();
    return JSON.stringify({
      company: company_name,
      title: data.title,
      summary: data.extract?.slice(0, 600),
      type: data.type,
      url: data.content_urls?.desktop?.page
    });

  } catch (err) {
    return JSON.stringify({ error: `Company info fetch failed: ${err.message}` });
  }
}


// ============================================================
// Tool 3: Get Job Market Demand via Adzuna API
// ============================================================

async function get_job_demand(job_title) {
  try {
    const appId = await getStoredKey("adzunaAppId");
    const appKey = await getStoredKey("adzunaAppKey");

    if (!appId || !appKey) {
      // Fallback with simulated but realistic data
      const demandMap = {
        "data scientist": { count: 12400, trend: "High demand", avg_salary: "₹12-25 LPA" },
        "software engineer": { count: 45000, trend: "Very high demand", avg_salary: "₹8-30 LPA" },
        "product manager": { count: 8200, trend: "Growing demand", avg_salary: "₹15-35 LPA" },
        "machine learning engineer": { count: 9800, trend: "High demand", avg_salary: "₹15-40 LPA" },
        "frontend developer": { count: 28000, trend: "High demand", avg_salary: "₹6-20 LPA" },
        "backend developer": { count: 31000, trend: "Very high demand", avg_salary: "₹8-25 LPA" },
        "devops engineer": { count: 14000, trend: "High demand", avg_salary: "₹10-30 LPA" },
        "data analyst": { count: 18000, trend: "High demand", avg_salary: "₹6-18 LPA" },
      };

      const key = job_title.toLowerCase();
      const match = Object.entries(demandMap).find(([k]) => key.includes(k));
      if (match) {
        return JSON.stringify({
          job_title,
          source: "estimated",
          ...match[1],
          note: "Set Adzuna API keys in popup for live job counts"
        });
      }

      return JSON.stringify({
        job_title,
        source: "estimated",
        count: Math.floor(Math.random() * 10000) + 2000,
        trend: "Moderate demand",
        note: "Set Adzuna API keys in popup for accurate live data"
      });
    }

    const query = encodeURIComponent(job_title);
    const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=1&what=${query}`;
    const response = await fetch(url);
    const data = await response.json();

    return JSON.stringify({
      job_title,
      total_live_jobs: data.count,
      source: "Adzuna Live",
      sample_salary: data.results?.[0]?.salary_min
        ? `${data.results[0].salary_min} - ${data.results[0].salary_max}`
        : "Not available"
    });

  } catch (err) {
    return JSON.stringify({ error: `Job demand fetch failed: ${err.message}` });
  }
}


// ============================================================
// Helper: Get stored API keys
// ============================================================

function getStoredKey(key) {
  return new Promise(resolve => {
    chrome.storage.sync.get(key, result => resolve(result[key] || null));
  });
}


// ============================================================
// Tool Registry
// ============================================================

const TOOLS = {
  get_company_news,
  get_company_info,
  get_job_demand
};


// ============================================================
// LLM Caller
// ============================================================

async function callLLM(prompt) {
  const apiKey = await getStoredKey("geminiApiKey");
  if (!apiKey) throw new Error("No Gemini API key set. Please set it in the extension popup.");

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000
      }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}


// ============================================================
// Response Parser
// ============================================================

function parseResponse(text) {
  text = text.trim();

  // Strip markdown fences
  if (text.startsWith("```")) {
    text = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  // Direct parse
  try { return JSON.parse(text); } catch { }

  // Find JSON object in text
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { }
  }

  throw new Error(`Could not parse: ${text.slice(0, 200)}`);
}


// ============================================================
// Build prompt from conversation history
// ============================================================

function buildPrompt(messages) {
  let prompt = "";
  for (const msg of messages) {
    if (msg.role === "system") prompt += msg.content + "\n\n";
    else if (msg.role === "user") prompt += `User Request: ${msg.content}\n\n`;
    else if (msg.role === "assistant") prompt += `Agent: ${msg.content}\n\n`;
    else if (msg.role === "tool") prompt += `Tool Result: ${msg.content}\n\n`;
  }
  prompt += "Agent:";
  return prompt;
}


// ============================================================
// THE AGENT LOOP
// ============================================================

async function runAgent(query, tabId) {

  // Full conversation log for submission
  const logs = [];

  // Send step to UI
  function sendStep(type, data) {
    logs.push({ type, data, timestamp: new Date().toISOString() });
    chrome.tabs.sendMessage(tabId, { type: "AGENT_STEP", step: { type, data } });
  }

  // Conversation memory — stores ALL past interactions
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: query }
  ];

  sendStep("START", { query });
  sendStep("LOG", { message: `Starting research for: "${query}"` });

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    sendStep("THINKING", { iteration: i + 1 });

    let responseText;
    try {
      const prompt = buildPrompt(messages);
      responseText = await callLLM(prompt);
      sendStep("LLM_RESPONSE", { raw: responseText, iteration: i + 1 });
    } catch (err) {
      sendStep("ERROR", { message: err.message });
      return;
    }

    let parsed;
    try {
      parsed = parseResponse(responseText);
    } catch (err) {
      sendStep("ERROR", { message: `Parse error: ${err.message}` });
      messages.push({ role: "assistant", content: responseText });
      messages.push({ role: "user", content: "Respond with valid JSON only. No markdown or extra text." });
      continue;
    }

    // ── Final Answer ──
    if (parsed.answer) {
      sendStep("FINAL_ANSWER", {
        answer: parsed.answer,
        verdict: parsed.verdict || "RESEARCH MORE"
      });
      // Break the circular reference by cloning the logs array before sending
      const finalLogs = JSON.parse(JSON.stringify(logs));
      sendStep("LOGS", { logs: finalLogs, fullConversation: messages });
      return;
    }

    // ── Tool Call ──
    if (parsed.tool_name) {
      const toolName = parsed.tool_name;
      const toolArgs = parsed.tool_arguments || {};
      const reasoning = parsed.reasoning || "";

      sendStep("TOOL_CALL", {
        tool: toolName,
        args: toolArgs,
        reasoning
      });

      if (!TOOLS[toolName]) {
        const errResult = JSON.stringify({ error: `Unknown tool: ${toolName}` });
        sendStep("TOOL_RESULT", { tool: toolName, result: errResult, error: true });
        messages.push({ role: "assistant", content: responseText });
        messages.push({ role: "tool", content: errResult });
        continue;
      }

      // Execute the tool
      let toolResult;
      try {
        toolResult = await TOOLS[toolName](...Object.values(toolArgs));
      } catch (err) {
        toolResult = JSON.stringify({ error: err.message });
      }

      sendStep("TOOL_RESULT", { tool: toolName, result: toolResult });

      // Add to conversation memory — LLM sees everything next iteration
      messages.push({ role: "assistant", content: responseText });
      messages.push({ role: "tool", content: `Tool: ${toolName}\nResult: ${toolResult}` });
      continue;
    }

    // Unknown response format
    sendStep("ERROR", { message: "Unexpected response format from LLM" });
    break;
  }

  sendStep("ERROR", { message: "Max iterations reached without a final answer." });
}


// ============================================================
// Message Listener
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_AGENT") {
    runAgent(message.query, sender.tab.id);
    sendResponse({ started: true });
    return true;
  }
  if (message.type === "SAVE_KEYS") {
    chrome.storage.sync.set(message.keys, () => sendResponse({ ok: true }));
    return true;
  }
});
