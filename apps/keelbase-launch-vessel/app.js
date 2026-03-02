import { connect, keyStores, WalletConnection } from "https://esm.sh/near-api-js@5.1.1";
import {
  CONTRACT_ID,
  NETWORK_ID,
  RPC_URL,
  WALLET_URL,
  HELPER_URL,
  normalizeSlug,
  sha256Hex
} from "../keelbase-shared/core.js";
import { getRuntimeState, requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const CREW_ROLES = ["ceo", "liaison", "ops", "marketing", "finance", "tech"];
const KEELBASE_FLOW_KEY = "keelbase_flow_phase_v1";
const KEELBASE_FLOW_CHANNEL = "keelbase-flow-v1";

const walletStatusEl = document.getElementById("walletStatus");
const connectWalletBtn = document.getElementById("connectWalletBtn");
const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
const launchForm = document.getElementById("launchForm");
const slugInput = document.getElementById("slugInput");
const ownerInput = document.getElementById("ownerInput");
const contractInput = document.getElementById("contractInput");
const createBtn = document.getElementById("createBtn");
const resultBox = document.getElementById("resultBox");

let wallet = null;
let connectedAccountId = "";
let knownVessels = [];

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
  } catch (err) {
    alert(`Wallet redirect failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

disconnectWalletBtn.addEventListener("click", () => {
  if (!wallet) return;
  wallet.signOut();
  syncWalletUi("");
});

launchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!connectedAccountId) {
    alert("Connect NEAR wallet first.");
    return;
  }

  const slug = normalizeSlug(slugInput.value);
  if (!slug) {
    alert("Please enter a valid slug.");
    return;
  }

  const owner = connectedAccountId;
  const vesselContractId = connectedAccountId;
  const metaDocId = `vessel:${slug}:meta`;

  createBtn.disabled = true;
  createBtn.textContent = "Creating...";
  resultBox.textContent = "Creating vessel registration...";

  try {
    const existing = knownVessels.find((entry) => entry.slug === slug);
    if (existing) {
      throw new Error(`Vessel slug already exists: ${slug}`);
    }

    const now = Date.now();

    const identityDoc = JSON.stringify(
      {
        document_id: "ceo_identity",
        vessel_slug: slug,
        owner_account_id: owner,
        vessel_contract_id: vesselContractId,
        seeded_at_ms: now,
        role: "CEO",
        crew_roles: CREW_ROLES
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
        liaison_behavior: "delegate_to_specialist_then_report_to_ceo",
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
        crew_roles: CREW_ROLES,
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

    resultBox.textContent = [
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

    markFlowAsFull();
    slugInput.value = "";
    requestRuntimeRefresh();
  } catch (err) {
    resultBox.textContent = `status=error\nmessage=${err instanceof Error ? err.message : String(err)}`;
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "Create Vessel";
  }
});

async function walletCall(methodName, args) {
  return wallet.account().functionCall({
    contractId: CONTRACT_ID,
    methodName,
    args,
    gas: "100000000000000",
    attachedDeposit: "0"
  });
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
    walletStatusEl.className = "meta status-good";
    connectWalletBtn.textContent = "Wallet Connected";
  } else {
    walletStatusEl.textContent = "Wallet: not connected";
    walletStatusEl.className = "meta";
    connectWalletBtn.textContent = "Connect NEAR Wallet";
  }
}

function markFlowAsFull() {
  try {
    localStorage.setItem(KEELBASE_FLOW_KEY, "full");
  } catch {}
  try {
    const channel = new BroadcastChannel(KEELBASE_FLOW_CHANNEL);
    channel.postMessage({ type: "keelbase:flow:vessel-created", ts: Date.now() });
    channel.close();
  } catch {}
}

await initWallet();
subscribeRuntime((state) => {
  knownVessels = Array.isArray(state?.vessels) ? state.vessels : [];
});
const initialState = getRuntimeState();
knownVessels = Array.isArray(initialState?.vessels) ? initialState.vessels : [];
