import {
  CHAT_API_BASE_URL,
  LOCAL_MEMORY_PREFIX,
  loadVesselRows,
  normalizeSlug,
  escapeHtml
} from "../keelbase-shared/core.js";

const vesselSelect = document.getElementById("vesselSelect");
const roleSelect = document.getElementById("roleSelect");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const reloadBtn = document.getElementById("reloadBtn");
const activeLabel = document.getElementById("activeLabel");
const statusEl = document.getElementById("status");
const memoryInfoEl = document.getElementById("memoryInfo");
const chatLogEl = document.getElementById("chatLog");

let vessels = [];
let chatHistory = [];

vesselSelect.addEventListener("change", () => {
  syncActiveLabel();
  loadChatMemory();
});

roleSelect.addEventListener("change", () => {
  syncActiveLabel();
  loadChatMemory();
});

clearBtn.addEventListener("click", () => {
  const key = getMemoryKey();
  if (!key) return;
  localStorage.removeItem(key);
  chatHistory = [];
  renderChatLog();
  statusEl.textContent = "Local memory cleared for selected vessel and role.";
  statusEl.className = "meta status-warn";
  loadChatMemory();
});

reloadBtn.addEventListener("click", () => loadVessels());

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  const vesselSlug = vesselSelect.value;
  const crewRole = roleSelect.value || "liaison";

  if (!message || !vesselSlug) return;

  appendMessage("user", message, crewRole);
  messageInput.value = "";

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";
  statusEl.textContent = `Asking ${crewRole} for vessel ${vesselSlug}...`;
  statusEl.className = "meta";

  try {
    const res = await fetch(`${CHAT_API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vesselSlug,
        crewRole,
        message,
        history: chatHistory.slice(-12).map((entry) => ({ role: entry.role, content: entry.content }))
      })
    });

    const json = await res.json();
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `chat request failed (${res.status})`);
    }

    const effectiveRole = String(json.effectiveRole || crewRole);
    appendMessage("assistant", String(json.reply || "No response"), effectiveRole);

    const anchored = json.anchorProposalId ? ` anchor=${json.anchorProposalId}` : "";
    const routed = json.requestedRole && json.effectiveRole && json.requestedRole !== json.effectiveRole
      ? ` route=${json.requestedRole}->${json.effectiveRole}`
      : "";

    statusEl.textContent = `Live reply for ${vesselSlug} (${json.source || "near_ai"}) model=${json.model || "unknown"}${routed}${anchored}`;
    statusEl.className = "meta status-good";
  } catch (err) {
    appendMessage("assistant", `I hit an error: ${err instanceof Error ? err.message : String(err)}`, crewRole);
    statusEl.textContent = "Chat failed. Check API/CORS config.";
    statusEl.className = "meta status-bad";
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send Message";
  }
});

function appendMessage(role, content, crewRole) {
  chatHistory.push({ role, content, crewRole, ts: Date.now() });
  chatHistory = chatHistory.slice(-60);
  saveChatMemory();
  renderChatLog();
}

function renderChatLog() {
  chatLogEl.innerHTML = "";
  if (chatHistory.length === 0) {
    chatLogEl.innerHTML = '<article class="item"><div class="line2">No messages yet.</div></article>';
    return;
  }

  for (const entry of chatHistory) {
    const node = document.createElement("article");
    node.className = "chat-msg";
    const roleTag = entry.crewRole || "liaison";
    const who = entry.role === "assistant" ? `Vessel Agent (${roleTag})` : `You (${roleTag})`;
    node.innerHTML = `
      <p class="who">${escapeHtml(who)}</p>
      <p class="text">${escapeHtml(entry.content)}</p>
    `;
    chatLogEl.appendChild(node);
  }
}

async function loadVessels() {
  statusEl.textContent = "Loading vessel list...";
  statusEl.className = "meta";

  try {
    const rows = await loadVesselRows();
    vessels = rows;
    const current = vesselSelect.value;

    vesselSelect.innerHTML = "";
    if (rows.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No vessels available";
      vesselSelect.appendChild(option);
      vesselSelect.disabled = true;
      sendBtn.disabled = true;
      statusEl.textContent = "No registered vessels found yet.";
      statusEl.className = "meta status-warn";
    } else {
      for (const vessel of rows) {
        const option = document.createElement("option");
        option.value = vessel.slug;
        option.textContent = `${vessel.slug} (${vessel.owner})`;
        vesselSelect.appendChild(option);
      }
      vesselSelect.disabled = false;
      sendBtn.disabled = false;

      if (current && rows.some((row) => row.slug === current)) {
        vesselSelect.value = current;
      }

      statusEl.textContent = `Loaded ${rows.length} vessel(s).`;
      statusEl.className = "meta status-good";
    }

    syncActiveLabel();
    loadChatMemory();
  } catch (err) {
    statusEl.textContent = `Failed to load vessels: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.className = "meta status-bad";
  }
}

function syncActiveLabel() {
  const slug = vesselSelect.value || "none";
  const role = roleSelect.value || "liaison";
  activeLabel.textContent = `Active vessel: ${slug} - role: ${role}`;
}

function getMemoryKey() {
  const slug = normalizeSlug(String(vesselSelect.value || ""));
  const role = String(roleSelect.value || "").trim().toLowerCase();
  if (!slug || !role) return "";
  return `${LOCAL_MEMORY_PREFIX}:${slug}:${role}`;
}

function loadChatMemory() {
  const key = getMemoryKey();
  if (!key) {
    chatHistory = [];
    memoryInfoEl.textContent = "Memory: local-only (browser) for selected vessel and role.";
    renderChatLog();
    return;
  }

  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    chatHistory = Array.isArray(parsed) ? parsed.filter(isMemoryEntry).slice(-60) : [];
  } catch {
    chatHistory = [];
  }

  memoryInfoEl.textContent = `Memory key: ${key}`;
  renderChatLog();
}

function saveChatMemory() {
  const key = getMemoryKey();
  if (!key) return;

  try {
    localStorage.setItem(key, JSON.stringify(chatHistory.slice(-60)));
  } catch {
    // Ignore storage failures in constrained browser environments.
  }
}

function isMemoryEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.role !== "user" && entry.role !== "assistant") return false;
  if (typeof entry.content !== "string") return false;
  return true;
}

await loadVessels();
