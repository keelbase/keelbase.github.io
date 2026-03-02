export const RPC_URLS = [
  "https://test.rpc.fastnear.com",
  "https://rpc.testnet.near.org"
];
export const RPC_URL = RPC_URLS[0];
export const CONTRACT_ID = "coord2-1772411670-keelbase.testnet";
export const CEO_ACCOUNT = "ceo.coord2-1772411670-keelbase.testnet";
export const NETWORK_ID = "testnet";
export const WALLET_URL = "https://testnet.mynearwallet.com";
export const HELPER_URL = "https://helper.testnet.near.org";
export const CHAT_API_BASE_URL = "https://keelbase-platform-internal-production.up.railway.app";
export const LOCAL_MEMORY_PREFIX = "keelbase.chat.v1";

export async function rpcView(methodName, args) {
  const requestBody = JSON.stringify({
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
  });

  let lastError = null;
  for (const rpcUrl of RPC_URLS) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody
      });
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error.message || `RPC error from ${rpcUrl}`);
      }
      const bytes = json?.result?.result || [];
      const text = new TextDecoder().decode(new Uint8Array(bytes));
      return JSON.parse(text);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "RPC request failed");
}

export function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function normalizeSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function collectRegistrationAnchors(proposals) {
  const anchors = [];
  for (const proposal of proposals) {
    const kind = proposal?.kind || {};
    const isAnchor = kind.type === "ANCHOR_LOG";
    const isDelegation = String(kind.category || "").toUpperCase() === "DELEGATION";
    const actionId = String(kind.action_id || "");
    if (!isAnchor || !isDelegation || !actionId.startsWith("reg_")) continue;

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

export async function loadVesselRows() {
  const proposals = await rpcView("get_proposals", { from_index: 0, limit: 120 });
  const candidates = collectRegistrationAnchors(proposals);
  const rows = [];

  for (const candidate of candidates) {
    const raw = candidate.metaHash ? await rpcView("get_blob", { hash: candidate.metaHash }).catch(() => null) : null;
    let meta = null;
    if (typeof raw === "string") {
      try { meta = JSON.parse(raw); } catch {}
    }

    const slug = normalizeSlug(String(meta?.vessel_slug || candidate.slug || ""));
    if (!slug) continue;
    rows.push({
      slug,
      owner: String(meta?.owner_account_id || candidate.owner || "unknown"),
      vesselContractId: String(meta?.vessel_contract_id || candidate.owner || "unknown"),
      mode: String(meta?.mode || "low_balance_alpha"),
      createdAtMs: Number(meta?.created_at_ms || candidate.createdAtMs || 0),
      proposalId: candidate.proposalId
    });
  }

  rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
  const uniq = new Map();
  for (const row of rows) {
    if (!uniq.has(row.slug)) uniq.set(row.slug, row);
  }
  return [...uniq.values()];
}

export async function latestAnchor() {
  const proposals = await rpcView("get_proposals", { from_index: 0, limit: 120 });
  const anchor = [...proposals].reverse().find((p) => p.kind?.type === "ANCHOR_LOG") || null;
  return { proposals, anchor };
}
