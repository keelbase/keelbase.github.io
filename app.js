import { connect, keyStores, WalletConnection } from "https://esm.sh/near-api-js@5.1.1";

const RPC_URL = "https://test.rpc.fastnear.com";
const CONTRACT_ID = "coord2-1772411670-keelbase.testnet";
const CEO_ACCOUNT = "ceo.coord2-1772411670-keelbase.testnet";
const NETWORK_ID = "testnet";
const WALLET_URL = "https://testnet.mynearwallet.com";
const HELPER_URL = "https://helper.testnet.near.org";
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

let wallet = null;
let connectedAccountId = "";

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

onboardForm.addEventListener("submit", (event) => {
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
      `status=registered`,
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
  } catch (error) {
    registerResultEl.textContent = `status=error\nmessage=${error instanceof Error ? error.message : String(error)}`;
    onboardOutput.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Vessel";
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
  anchorMetaEl.textContent = `action_id=${latestAnchor.kind.action_id} • outcome=${latestAnchor.kind.outcome} • proposal_id=${latestAnchor.id}`;
  return latestAnchor;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadData(manual = false) {
  statusEl.textContent = manual ? "Refreshing..." : "Syncing...";
  setSignal("sync", "SYNCING", "Fetching on-chain data...");
  try {
    const [snapshot, proposals] = await Promise.all([
      rpcView("get_state_snapshot", { account_id: CEO_ACCOUNT }),
      rpcView("get_proposals", { from_index: 0, limit: 50 })
    ]);

    renderSnapshot(snapshot);
    const latestAnchor = renderProposals(proposals);
    updateTrafficLight(latestAnchor);
    statusEl.textContent = `Live at ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    setSignal("error", "RPC ERROR", err instanceof Error ? err.message : String(err));
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

async function copyToClipboard(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
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
loadData();
setInterval(loadData, REFRESH_MS);
