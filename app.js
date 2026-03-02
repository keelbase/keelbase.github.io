import { connect, keyStores, WalletConnection } from "https://esm.sh/near-api-js@5.1.1";

const RPC_URL = "https://test.rpc.fastnear.com";
const CONTRACT_ID = "coord2-1772411670-keelbase.testnet";
const CEO_ACCOUNT = "ceo.coord2-1772411670-keelbase.testnet";
const NETWORK_ID = "testnet";
const WALLET_URL = "https://wallet.testnet.near.org";
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
const deployCmdEl = document.getElementById("deployCmd");
const registerCmdEl = document.getElementById("registerCmd");
const copyDeployBtn = document.getElementById("copyDeployBtn");
const copyRegisterBtn = document.getElementById("copyRegisterBtn");
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
  wallet.requestSignIn({
    successUrl: window.location.href,
    failureUrl: window.location.href
  });
});

disconnectWalletBtn.addEventListener("click", () => {
  if (!wallet) return;
  wallet.signOut();
  syncWalletUi("");
  onboardOutput.classList.add("hidden");
});

onboardForm.addEventListener("submit", (event) => {
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

  const deployCmd = [
    "near deploy",
    vesselContractId,
    "../../target/near/coordination_contract/coordination_contract.wasm",
    "--initFunction new",
    "--initArgs '{}'",
    `--accountId ${owner}`,
    "--networkId testnet"
  ].join(" ");

  const registerCmd = [
    "npm run ceo:register-vessel --",
    `--slug=${slug}`,
    `--owner-account=${owner}`,
    `--vessel-contract-id=${vesselContractId}`
  ].join(" ");

  deployCmdEl.textContent = deployCmd;
  registerCmdEl.textContent = registerCmd;
  onboardOutput.classList.remove("hidden");
});

copyDeployBtn.addEventListener("click", async () => {
  await copyToClipboard(deployCmdEl.textContent || "");
  copyDeployBtn.textContent = "Copied";
  setTimeout(() => (copyDeployBtn.textContent = "Copy"), 1000);
});

copyRegisterBtn.addEventListener("click", async () => {
  await copyToClipboard(registerCmdEl.textContent || "");
  copyRegisterBtn.textContent = "Copied";
  setTimeout(() => (copyRegisterBtn.textContent = "Copy"), 1000);
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
