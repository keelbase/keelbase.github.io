import { connect, keyStores, WalletConnection } from "https://esm.sh/near-api-js@5.1.1";
import {
  CHAT_API_BASE_URL,
  CONTRACT_ID,
  NETWORK_ID,
  RPC_URL,
  WALLET_URL,
  HELPER_URL,
  escapeHtml
} from "../keelbase-shared/core.js";
import { requestRuntimeRefresh } from "../keelbase-shared/client-runtime.js";

const KEELBASE_FLOW_KEY = "keelbase_flow_phase_v1";
const KEELBASE_FLOW_CHANNEL = "keelbase-flow-v1";
const ARCHITECT_SESSION_KEY = "keelbase_architect_session_id";

const walletStatusEl = document.getElementById("walletStatus");
const progressEl = document.getElementById("progress");
const transcriptEl = document.getElementById("transcript");
const answerForm = document.getElementById("answerForm");
const answerInput = document.getElementById("answerInput");
const submitBtn = document.getElementById("submitBtn");
const resultBox = document.getElementById("resultBox");
const suggestionsEl = document.getElementById("suggestions");
const connectWalletBtn = document.getElementById("connectWalletBtn");
const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");

let wallet = null;
let connectedAccountId = "";
let session = null;
const transcript = [];

connectWalletBtn.addEventListener("click", async () => {
  if (!wallet) await initWallet();
  if (!wallet) return;
  if (wallet.isSignedIn()) {
    syncWalletUi(wallet.getAccountId());
    return;
  }
  wallet.requestSignIn(CONTRACT_ID, "Keelbase Architect", window.location.href, window.location.href);
});

disconnectWalletBtn.addEventListener("click", () => {
  if (!wallet) return;
  wallet.signOut();
  syncWalletUi("");
});

answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const answer = answerInput.value.trim();
  if (!answer || !session?.sessionId) return;
  appendLine("Founder", answer);
  answerInput.value = "";
  await sendAnswer(answer);
});

async function init() {
  await initWallet();
  await resumeOrStartSession();
}

async function initWallet() {
  const keyStore = new keyStores.BrowserLocalStorageKeyStore();
  const near = await connect({
    networkId: NETWORK_ID,
    nodeUrl: RPC_URL,
    walletUrl: WALLET_URL,
    helperUrl: HELPER_URL,
    keyStore,
    headers: {}
  });
  wallet = new WalletConnection(near, "keelbase-pages");
  syncWalletUi(wallet.isSignedIn() ? wallet.getAccountId() : "");
}

function syncWalletUi(accountId) {
  connectedAccountId = accountId || "";
  walletStatusEl.textContent = connectedAccountId ? `Wallet: ${connectedAccountId}` : "Wallet: not connected";
  connectWalletBtn.textContent = connectedAccountId ? "Wallet Connected" : "Connect NEAR Wallet";
  emitFlowEvent(connectedAccountId ? "keelbase:flow:wallet-connected" : "keelbase:flow:wallet-disconnected", {
    accountId: connectedAccountId
  });
}

async function resumeOrStartSession() {
  const savedSessionId = sessionStorage.getItem(ARCHITECT_SESSION_KEY);
  if (savedSessionId) {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/architect/session/${savedSessionId}`);
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.session) {
      session = payload.session;
      renderSession();
      return;
    }
  }
  await startSession();
}

async function startSession() {
  const response = await fetch(`${CHAT_API_BASE_URL}/api/architect/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ownerAccountId: connectedAccountId
    })
  });
  const payload = await response.json();
  session = payload?.session ?? null;
  if (session?.sessionId) {
    sessionStorage.setItem(ARCHITECT_SESSION_KEY, session.sessionId);
  }
  renderSession();
}

async function sendAnswer(answer) {
  submitBtn.disabled = true;
  submitBtn.textContent = "Architecting...";
  try {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/architect/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        answer,
        ownerAccountId: connectedAccountId
      })
    });
    const payload = await response.json();
    session = payload?.session ?? null;
    renderSession();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send to Architect";
  }
}

function renderSession() {
  if (!session) {
    progressEl.textContent = "Architect session unavailable.";
    return;
  }

  if (session.question) {
    progressEl.textContent = `Architect step ${session.currentStep + 1} / ${session.totalSteps}`;
    if (!transcript.some((entry) => entry.id === session.question.id)) {
      appendLine("Architect", session.question.prompt, session.question.id);
    }
    renderSuggestions(session.question.suggestions || []);
    answerInput.placeholder = session.question.placeholder || "Answer the current Architect question...";
  }

  if (session.status === "completed") {
    progressEl.textContent = "Architect completed onboarding.";
    renderSuggestions([]);
    resultBox.textContent = [
      "status=completed",
      `slug=${session.provisionResult?.slug || session.vesselSlug || "unknown"}`,
      `contractId=${session.provisionResult?.vesselContractId || "unknown"}`,
      `anchorProposalId=${session.provisionResult?.registryAnchorId || "unknown"}`
    ].join("\n");
    answerForm.style.display = "none";
    try {
      localStorage.setItem(KEELBASE_FLOW_KEY, "full");
    } catch {}
    emitFlowEvent("keelbase:flow:architect-complete", { ts: Date.now() });
    emitFlowEvent("keelbase:flow:vessel-created", { ts: Date.now() });
    requestRuntimeRefresh();
    sessionStorage.removeItem(ARCHITECT_SESSION_KEY);
    return;
  }

  if (session.status === "error") {
    progressEl.textContent = "Architect hit an error.";
    resultBox.textContent = `status=error\nmessage=${session.error || "Unknown error"}`;
  }
}

function renderSuggestions(items) {
  suggestionsEl.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = item;
    button.addEventListener("click", () => {
      answerInput.value = item;
      answerInput.focus();
    });
    suggestionsEl.appendChild(button);
  }
}

function appendLine(who, text, id = "") {
  transcript.push({ who, text, id });
  transcriptEl.innerHTML = "";
  for (const entry of transcript) {
    const node = document.createElement("article");
    node.className = "chat-msg assistant-msg";
    node.innerHTML = `
      <p class="who">${escapeHtml(entry.who)}</p>
      <p class="text">${escapeHtml(entry.text)}</p>
    `;
    transcriptEl.appendChild(node);
  }
}

function emitFlowEvent(type, extra = {}) {
  try {
    const channel = new BroadcastChannel(KEELBASE_FLOW_CHANNEL);
    channel.postMessage({ type, ...extra });
    channel.close();
  } catch {}
}

await init();
