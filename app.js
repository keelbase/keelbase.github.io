import { connect, keyStores, WalletConnection } from "https://esm.sh/near-api-js@5.1.1";

const RPC_URL = "https://rpc.testnet.near.org";
const CONTRACT_ID = "coord2-1772411670-keelbase.testnet";
const CEO_ACCOUNT = "ceo.coord2-1772411670-keelbase.testnet";
const NETWORK_ID = "testnet";
const WALLET_URL = "https://testnet.mynearwallet.com";
const HELPER_URL = "https://helper.testnet.near.org";
const CHAT_API_BASE_URL = "https://keelbase-platform-internal-production.up.railway.app";
const REFRESH_MS = 30000;

const statusEl = document.getElementById("status");
const snapshotEl = document.getElementById("snapshot");
const proposalsEl = document.getElementById("proposals");
const anchorSummaryEl = document.getElementById("anchorSummary");
const anchorMetaEl = document.getElementById("anchorMeta");
const signalBoxEl = document.getElementById("signalBox");
const signalTitleEl = document.getElementById("signalTitle");
const signalNoteEl = document.getElementById("signalNote");

const refreshBtn = document.getElementById("refreshBtn");
refreshBtn.addEventListener("click", () => loadData(true));

const onboardForm = document.getElementById("onboardForm");
const onboardOutput = document.getElementById("onboardOutput");
const slugInput = document.getElementById("slugInput");
const ownerInput = document.getElementById("ownerInput");
const contractInput = document.getElementById("contractInput");
const registerResultEl = document.getElementById("registerResult");
const connectWalletBtn = document.getElementById("connectWalletBtn");
const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
const walletStatusEl = document.getElementById("walletStatus");

const vesselCountEl = document.getElementById("vesselCount");
const vesselsListEl = document.getElementById("vesselsList");

const chatForm = document.getElementById("chatForm");
const chatVesselSelect = document.getElementById("chatVesselSelect");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatStatusEl = document.getElementById("chatStatus");
const chatLogEl = document.getElementById("chatLog");
const activeVesselSlugEl = document.getElementById("activeVesselSlug");

let wallet = null;
let connectedAccountId = "";
let latestProposals = [];
const vesselMetaCache = new Map();
const vesselsBySlug = new Map();
const chatHistory = [];
let preferredVesselSlug = "";

connectWalletBtn.addEventListener("click", async () => {
  if (!wallet) {
    await initWallet();
  }
  if (!wallet) return;
  if (wallet.isSignedIn()) {
    syncWalletUi(wallet.getAccountId());
    return;
  }
  try {
    wallet.requestSignIn(CONTRACT_ID, "Keelbase", window.location.href, window.location.href);
  } catch (error) {
    alert(`Wallet redirect failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

disconnectWalletBtn.addEventListener("click", () => {
  if (!wallet) return;
  wallet.signOut();
  syncWalletUi("");
  onboardOutput.classList.add("hidden");
});

chatVesselSelect.addEventListener("change", () => {
  syncActiveVesselLabel();
});

onboardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!connectedAccountId) {
    alert("Please connect a NEAR testnet wallet first.");
    return;
  }
  const slug = normalizeSlug(slugInput.value);
  const owner = connectedAccountId;
  const vesselContractId = connectedAccountId;

  if (!slug) {
    alert("Please enter a valid slug (letters, numbers, hyphens).");
    return;
  }

  const submitBtn = document.getElementById("generateBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";

  try {
    const metaDocId = `vessel:${slug}:meta`;
    const existingMeta = await rpcView("get_active_document", { document_id: metaDocId }).catch(() => null);
    if (existingMeta) {
      throw new Error(`Vessel slug already registered: ${slug}`);
    }

    const now = Date.now();
    const identityDoc = JSON.stringify(
      {
        document_id: "ceo_identity",
        vessel_slug: slug,
        owner_account_id: owner,
        vessel_contract_id: vesselContractId,
        seeded_at_ms: now,
        role: "CEO"
      },
      null,
      2
    );

    const operationsDoc = JSON.stringify(
      {
        document_id: "ceo_operations",
        vessel_slug: slug,
        owner_account_id: owner,
        vessel_contract_id: vesselContractId,
        seeded_at_ms: now,
        mode: "low_balance_alpha",
        rules: {
          allowlisted_actions_only: true,
          max_auto_transfer_near: "0",
          escalation_required: true
        }
      },
      null,
      2
    );

    const identityHash = await sha256Hex(identityDoc);
    const operationsHash = await sha256Hex(operationsDoc);

    await walletCall("store_blob", { data: identityDoc });
    await walletCall("store_blob", { data: operationsDoc });

    await walletCall("set_active_document", { document_id: `vessel:${slug}:ceo_identity`, hash: identityHash });
    await walletCall("set_active_document", { document_id: `vessel:${slug}:ceo_operations`, hash: operationsHash });

    const metaDoc = JSON.stringify(
      {
        vessel_slug: slug,
        owner_account_id: owner,
        vessel_contract_id: vesselContractId,
        mode: "low_balance_alpha",
        created_at_ms: now,
        documents: {
          ceo_identity_hash: identityHash,
          ceo_operations_hash: operationsHash
        }
      },
      null,
      2
    );
    const metaHash = await sha256Hex(metaDoc);
    const metaResult = await walletCall("store_blob", { data: metaDoc });
    await walletCall("set_active_document", { document_id: metaDocId, hash: metaHash });

    const anchorResult = await walletCall("add_proposal", {
      proposal_input: {
        kind: {
          type: "ANCHOR_LOG",
          action_id: `reg_${now}`,
          category: "DELEGATION",
          outcome: "EXECUTED",
          content_hash: metaHash,
          summary: `Registered vessel ${slug} for ${owner}`.slice(0, 140),
          timestamp: now
        },
        description: `Registered vessel ${slug} for ${owner}`.slice(0, 140)
      }
    });

    const txHash = metaResult?.transaction?.hash || metaResult?.transaction_outcome?.id || "unknown";
    const anchorTxHash = anchorResult?.transaction?.hash || anchorResult?.transaction_outcome?.id || "unknown";
    registerResultEl.textContent = [
      "status=registered",
      `slug=${slug}`,
      `ownerAccountId=${owner}`,
      `vesselContractId=${vesselContractId}`,
      `metaDocId=${metaDocId}`,
      `metaHash=${metaHash}`,
      `txHash=${txHash}`,
      `anchorTxHash=${anchorTxHash}`,
      `explorer=https://testnet.nearblocks.io/txns/${anchorTxHash}`
    ].join("\n");
    onboardOutput.classList.remove("hidden");
    slugInput.value = "";
    preferredVesselSlug = slug;
    await loadData(true);
  } catch (error) {
    registerResultEl.textContent = `status=error\nmessage=${error instanceof Error ? error.message : String(error)}`;
    onboardOutput.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Vessel";
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  const vesselSlug = chatVesselSelect.value;

  if (!message) {
    return;
  }
  if (!vesselSlug) {
    alert("Please select a vessel first.");
    return;
  }

  appendChatMessage("user", message, vesselSlug);
  chatInput.value = "";
  chatSendBtn.disabled = true;
  chatSendBtn.textContent = "Sending...";
  chatStatusEl.textContent = `Asking vessel ${vesselSlug} agent...`;

  try {
    const res = await fetch(`${CHAT_API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vesselSlug,
        accountId: connectedAccountId,
        message,
        history: chatHistory.slice(-8)
      })
    });

    const json = await res.json();
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `chat request failed (${res.status})`);
    }

    appendChatMessage("assistant", String(json.reply || "No response"), vesselSlug);
    const anchored = json.anchorProposalId ? ` anchor=${json.anchorProposalId}` : "";
    chatStatusEl.textContent = `Live reply for ${vesselSlug} (${json.source || "near_ai"}) model=${json.model || "unknown"}${anchored}`;
    await loadData(true);
  } catch (error) {
    appendChatMessage("assistant", `I hit an error: ${error instanceof Error ? error.message : String(error)}`, vesselSlug);
    chatStatusEl.textContent = "Chat failed. Check API/CORS config.";
  } finally {
    chatSendBtn.disabled = false;
    chatSendBtn.textContent = "Send Message";
  }
});

document.getElementById("contractId").textContent = CONTRACT_ID;
document.getElementById("rpcUrl").textContent = RPC_URL;

async function rpcView(methodName, args) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "keelbase-pages",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: CONTRACT_ID,
        method_name: methodName,
        args_base64: btoa(JSON.stringify(args))
      }
    })
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || "RPC error");
  }

  const bytes = json?.result?.result || [];
  const text = new TextDecoder().decode(new Uint8Array(bytes));
  return JSON.parse(text);
}

function renderSnapshot(snapshot) {
  const pending = Array.isArray(snapshot.pending_escalations)
    ? snapshot.pending_escalations.length
    : Number(snapshot.pending_escalations?.count || 0);

  snapshotEl.innerHTML = "";
  const rows = [
    ["Role", snapshot.role],
    ["Last Action ID", snapshot.last_action_id],
    ["Pending Escalations", String(pending)],
    ["Active Agents", String(snapshot.active_agents?.length || 0)]
  ];

  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    snapshotEl.append(dt, dd);
  }
}

function renderProposals(proposals) {
  proposalsEl.innerHTML = "";

  const recent = proposals.slice(-10).reverse();
  for (const p of recent) {
    const node = document.createElement("article");
    node.className = "item";
    const type = p.kind?.type || "UNKNOWN";
    const summary = p.kind?.summary || p.description || "(no summary)";

    node.innerHTML = `
      <div class="line1">
        <span>#${p.id} ${type}</span>
        <span>${p.status || "UNKNOWN"}</span>
      </div>
      <div class="line2">${escapeHtml(summary)}</div>
    `;
    proposalsEl.appendChild(node);
  }

  const latestAnchor = [...proposals].reverse().find((p) => p.kind?.type === "ANCHOR_LOG");
  if (!latestAnchor) {
    anchorSummaryEl.textContent = "No anchor log yet.";
    anchorMetaEl.textContent = "";
    return null;
  }

  anchorSummaryEl.textContent = latestAnchor.kind.summary || "(no summary)";
  anchorMetaEl.textContent = `action_id=${latestAnchor.kind.action_id} - outcome=${latestAnchor.kind.outcome} - proposal_id=${latestAnchor.id}`;
  return latestAnchor;
}

async function loadData(manual = false) {
  statusEl.textContent = manual ? "Refreshing..." : "Syncing...";
  setSignal("sync", "SYNCING", "Fetching on-chain data...");
  try {
    const [snapshot, proposals] = await Promise.all([
      rpcView("get_state_snapshot", { account_id: CEO_ACCOUNT }),
      rpcView("get_proposals", { from_index: 0, limit: 120 })
    ]);

    latestProposals = proposals;
    renderSnapshot(snapshot);
    const latestAnchor = renderProposals(proposals);
    updateTrafficLight(latestAnchor);
    await renderVessels(proposals);
    statusEl.textContent = `Live at ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    setSignal("error", "RPC ERROR", err instanceof Error ? err.message : String(err));
  }
}

async function renderVessels(proposals) {
  const candidates = collectRegistrationAnchors(proposals);
  const rows = [];

  for (const candidate of candidates) {
    const meta = await loadMetaByHash(candidate.metaHash);
    const slug = normalizeSlug(String(meta?.vessel_slug || candidate.slug || ""));
    if (!slug) continue;

    rows.push({
      slug,
      owner: String(meta?.owner_account_id || candidate.owner || "unknown"),
      vesselContractId: String(meta?.vessel_contract_id || candidate.owner || "unknown"),
      mode: String(meta?.mode || "low_balance_alpha"),
      createdAtMs: Number(meta?.created_at_ms || candidate.createdAtMs || 0),
      metaHash: candidate.metaHash,
      proposalId: candidate.proposalId
    });
  }

  rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
  vesselsBySlug.clear();
  for (const row of rows) {
    if (!vesselsBySlug.has(row.slug)) {
      vesselsBySlug.set(row.slug, row);
    }
  }

  vesselsListEl.innerHTML = "";
  if (vesselsBySlug.size === 0) {
    vesselCountEl.textContent = "0 found";
    const empty = document.createElement("article");
    empty.className = "item";
    empty.innerHTML = '<div class="line2">No vessel registrations found yet.</div>';
    vesselsListEl.appendChild(empty);
  } else {
    vesselCountEl.textContent = `${vesselsBySlug.size} found`;
    for (const vessel of vesselsBySlug.values()) {
      const node = document.createElement("article");
      node.className = "item";
      const created = vessel.createdAtMs > 0 ? new Date(vessel.createdAtMs).toLocaleString() : "unknown";
      node.innerHTML = `
        <div class="line1">
          <span>${escapeHtml(vessel.slug)}</span>
          <span>${escapeHtml(vessel.mode)}</span>
        </div>
        <div class="line2">owner=${escapeHtml(vessel.owner)}</div>
        <div class="line2">contract=${escapeHtml(vessel.vesselContractId)}</div>
        <div class="line2">created=${escapeHtml(created)} - anchor=#${vessel.proposalId}</div>
      `;
      vesselsListEl.appendChild(node);
    }
  }

  renderChatVesselOptions();
}

function renderChatVesselOptions() {
  const current = chatVesselSelect.value;
  chatVesselSelect.innerHTML = "";

  const vessels = [...vesselsBySlug.values()];
  if (vessels.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No vessels available";
    chatVesselSelect.appendChild(option);
    chatVesselSelect.disabled = true;
    chatSendBtn.disabled = true;
    syncActiveVesselLabel();
    return;
  }

  chatVesselSelect.disabled = false;
  chatSendBtn.disabled = false;

  for (const vessel of vessels) {
    const option = document.createElement("option");
    option.value = vessel.slug;
    option.textContent = `${vessel.slug} (${vessel.owner})`;
    chatVesselSelect.appendChild(option);
  }

  if (current && vesselsBySlug.has(current)) {
    chatVesselSelect.value = current;
  } else if (preferredVesselSlug && vesselsBySlug.has(preferredVesselSlug)) {
    chatVesselSelect.value = preferredVesselSlug;
  } else if (connectedAccountId) {
    const ownVessel = vessels.find((entry) => entry.owner === connectedAccountId);
    if (ownVessel) {
      chatVesselSelect.value = ownVessel.slug;
    }
  }
  syncActiveVesselLabel();
}

function collectRegistrationAnchors(proposals) {
  const anchors = [];
  for (const proposal of proposals) {
    const kind = proposal?.kind || {};
    const isAnchor = kind.type === "ANCHOR_LOG";
    const isDelegation = String(kind.category || "").toUpperCase() === "DELEGATION";
    const actionId = String(kind.action_id || "");
    const looksLikeRegistration = actionId.startsWith("reg_");
    if (!isAnchor || !isDelegation || !looksLikeRegistration) continue;

    const summary = String(kind.summary || proposal.description || "");
    const summaryMatch = summary.match(/Registered vessel\s+([a-z0-9-]+)\s+for\s+([a-z0-9._-]+)/i);

    anchors.push({
      proposalId: Number(proposal.id || 0),
      createdAtMs: Number(proposal.created_at || 0),
      slug: normalizeSlug(String(summaryMatch?.[1] || "")),
      owner: String(summaryMatch?.[2] || ""),
      metaHash: String(kind.content_hash || "")
    });
  }
  return anchors;
}

async function loadMetaByHash(hash) {
  if (!hash) return null;
  if (vesselMetaCache.has(hash)) {
    return vesselMetaCache.get(hash);
  }
  const raw = await rpcView("get_blob", { hash }).catch(() => null);
  if (!raw || typeof raw !== "string") {
    vesselMetaCache.set(hash, null);
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    vesselMetaCache.set(hash, parsed);
    return parsed;
  } catch {
    vesselMetaCache.set(hash, null);
    return null;
  }
}

function appendChatMessage(role, text, vesselSlug) {
  chatHistory.push({ role, content: text });
  const node = document.createElement("article");
  node.className = "chat-msg";
  const who = role === "assistant" ? `Vessel Agent (${vesselSlug || "none"})` : `You (${vesselSlug || "none"})`;
  node.innerHTML = `
    <p class="who">${escapeHtml(who)}</p>
    <p class="text">${escapeHtml(text)}</p>
  `;
  chatLogEl.appendChild(node);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function syncActiveVesselLabel() {
  const slug = chatVesselSelect.value;
  if (slug) {
    activeVesselSlugEl.textContent = `Active vessel: ${slug}`;
  } else {
    activeVesselSlugEl.textContent = "Active vessel: none selected";
  }
}

function updateTrafficLight(latestAnchor) {
  if (!latestAnchor) {
    setSignal("fallback", "NO ANCHOR YET", "No AnchorLog found yet. Run a cycle to begin.");
    return;
  }

  const summary = String(latestAnchor.kind?.summary || "").toLowerCase();
  const outcome = String(latestAnchor.kind?.outcome || "").toLowerCase();
  const createdAt = Number(latestAnchor.created_at || 0);
  const isStale = createdAt > 0 && Date.now() - createdAt > 10 * 60 * 1000;
  const isFallback = summary.includes("fallback");
  const isLive = !isFallback && (outcome === "executed" || outcome === "completed" || outcome === "logged");

  if (isStale) {
    setSignal("fallback", "STALE", "No recent anchor activity in the last 10 minutes.");
    return;
  }
  if (isFallback) {
    setSignal("fallback", "AI FALLBACK", "Cycle ran with fallback behavior. Check inference output.");
    return;
  }
  if (isLive) {
    setSignal("live", "AI LIVE", "AI decisions are landing on-chain with fresh anchors.");
    return;
  }

  setSignal("fallback", "UNKNOWN STATE", "Anchor present, but state needs manual review.");
}

function setSignal(kind, title, note) {
  signalBoxEl.className = `signal signal-${kind}`;
  signalTitleEl.textContent = title;
  signalNoteEl.textContent = note;
}

function normalizeSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function walletCall(methodName, args) {
  return wallet.account().functionCall({
    contractId: CONTRACT_ID,
    methodName,
    args,
    gas: "100000000000000",
    attachedDeposit: "0"
  });
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  ownerInput.value = connectedAccountId;
  contractInput.value = connectedAccountId;
  if (connectedAccountId) {
    walletStatusEl.textContent = `Wallet: ${connectedAccountId}`;
    connectWalletBtn.textContent = "Wallet Connected";
  } else {
    walletStatusEl.textContent = "Wallet: not connected";
    connectWalletBtn.textContent = "Connect NEAR Wallet";
  }
}

await initWallet();
await loadData();
setInterval(loadData, REFRESH_MS);
