import { CHAT_API_BASE_URL, escapeHtml } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const vesselSelect = document.getElementById("vesselSelect");
const vendorInput = document.getElementById("vendorInput");
const amountInput = document.getElementById("amountInput");
const currencyInput = document.getElementById("currencyInput");
const descriptionInput = document.getElementById("descriptionInput");
const statusEl = document.getElementById("status");
const paymentsListEl = document.getElementById("paymentsList");
const payForm = document.getElementById("payForm");
const submitBtn = document.getElementById("submitBtn");
const treasuryBalanceEl = document.getElementById("treasuryBalance");
const treasuryBalanceUsdcEl = document.getElementById("treasuryBalanceUsdc");
const depositAddressEl = document.getElementById("depositAddress");
const autoApproveNearEl = document.getElementById("autoApproveNear");
const treasuryNoteEl = document.getElementById("treasuryNote");

vesselSelect.addEventListener("change", () => {
  loadTreasury().catch(() => {});
  loadPayments().catch(() => {});
});

payForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const slug = vesselSelect.value;
  if (!slug) return;
  const vendor = vendorInput.value.trim();
  const amount = amountInput.value.trim();
  const description = descriptionInput.value.trim();
  if (!vendor || !amount || !description) {
    statusEl.textContent = "Vendor account, amount, and description are required.";
    statusEl.className = "meta status-warn";
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";
  statusEl.textContent = "Submitting payment...";
  statusEl.className = "meta";
  try {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vendor,
        amount,
        currency: "NEAR",
        description
      })
    });
    const payload = await response.json();
    if (response.status === 402 && payload?.requiresApproval) {
      statusEl.textContent = `Vendor not yet approved. ${payload.howToApprove ?? "Use the Security Controls below to approve them first."}`;
      statusEl.className = "meta status-warn";
      const approveInput = document.getElementById("approveAccountInput");
      if (approveInput) approveInput.value = vendor;
    } else if (response.status === 403) {
      statusEl.textContent = `Velocity circuit is open. Use the Security Controls below to reset it, or wait for automatic reset.`;
      statusEl.className = "meta status-bad";
    } else if (payload?.ok && payload.payment) {
      const p = payload.payment;
      const proposalInfo = payload.proposalId ? `proposal #${payload.proposalId}` : "";
      if (p.status === "executed") {
        statusEl.textContent = `Payment executed via ${proposalInfo}. Transfer sent from coordination contract.`;
        statusEl.className = "meta status-good";
      } else if (p.status === "pending_approval") {
        statusEl.textContent = `Payment ${proposalInfo} created. Awaiting council approval (over auto-approve threshold).`;
        statusEl.className = "meta status-warn";
      } else {
        statusEl.textContent = `Payment status: ${p.status}. ${proposalInfo}`;
        statusEl.className = "meta";
      }
    } else {
      const detail = payload?.payment?.error || payload?.error || "unknown error";
      statusEl.textContent = `Payment failed: ${detail}`;
      statusEl.className = "meta status-bad";
    }
    await loadPayments();
    await loadTreasury();
  } catch (err) {
    statusEl.textContent = `Payment request failed: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.className = "meta status-bad";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Payment";
  }
});

subscribeRuntime((state) => {
  const vessels = Array.isArray(state?.vessels) ? state.vessels : [];
  const current = vesselSelect.value;
  vesselSelect.innerHTML = "";
  for (const vessel of vessels) {
    const option = document.createElement("option");
    option.value = vessel.slug;
    option.textContent = `${vessel.slug} (${vessel.owner})`;
    vesselSelect.appendChild(option);
  }
  if (current && vessels.some((entry) => entry.slug === current)) {
    vesselSelect.value = current;
  }
  if (vessels.length > 0) {
    loadTreasury().catch(() => {});
    loadPayments().catch(() => {});
  } else {
    treasuryBalanceEl.textContent = "-";
    treasuryBalanceUsdcEl.textContent = "-";
    depositAddressEl.textContent = "-";
    autoApproveNearEl.textContent = "-";
    treasuryNoteEl.textContent = "";
  }
});

async function loadTreasury() {
  const slug = vesselSelect.value;
  if (!slug) return;
  treasuryBalanceEl.textContent = "loading...";
  treasuryBalanceUsdcEl.textContent = "loading...";
  treasuryNoteEl.textContent = "";
  try {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/treasury`);
    const payload = await response.json();
    if (payload?.ok) {
      treasuryBalanceEl.textContent = String(payload.balanceNear ?? "0");
      treasuryBalanceUsdcEl.textContent = String(payload.balanceUsdc ?? "0");
      depositAddressEl.textContent = String(payload.depositAddress ?? "-");
      autoApproveNearEl.textContent = String(payload.policyAutoApproveNear ?? "-");
      treasuryNoteEl.textContent = payload.note ?? "";
    } else {
      treasuryBalanceEl.textContent = "unavailable";
      treasuryBalanceUsdcEl.textContent = "unavailable";
      treasuryNoteEl.textContent = "";
    }
  } catch {
    treasuryBalanceEl.textContent = "error";
    treasuryBalanceUsdcEl.textContent = "error";
    treasuryNoteEl.textContent = "";
  }
}

async function loadPayments() {
  const slug = vesselSelect.value;
  if (!slug) return;
  const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/payments`);
  const payload = await response.json();
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  paymentsListEl.innerHTML = "";
  for (const payment of payments.slice().reverse()) {
    const node = document.createElement("article");
    node.className = "item";
    const statusText = String(payment.status || "unknown");
    const proposalLine = payment.proposalId
      ? `<div class="line2">proposal #${escapeHtml(String(payment.proposalId))}</div>`
      : "";
    const errorLine = payment.error
      ? `<div class="line2 status-bad">error: ${escapeHtml(String(payment.error))}</div>`
      : "";
    node.innerHTML = `
      <div class="line1">
        <span>${escapeHtml(String(payment.vendor || "vendor"))}</span>
        <span>${escapeHtml(statusText)}</span>
      </div>
      <div class="line2">${escapeHtml(String(payment.amount || "0"))} ${escapeHtml(String(payment.currency || "NEAR"))}</div>
      <div class="line2">${escapeHtml(String(payment.description || ""))}</div>
      ${proposalLine}
      ${errorLine}
    `;
    paymentsListEl.appendChild(node);
  }
  if (payments.length === 0) {
    paymentsListEl.innerHTML = '<article class="item"><div class="line2">No payments yet.</div></article>';
  }
}

const approveAccountInput = document.getElementById("approveAccountInput");
const approveBtn = document.getElementById("approveBtn");
const approveStatus = document.getElementById("approveStatus");
const resetVelocityBtn = document.getElementById("resetVelocityBtn");
const velocityStatus = document.getElementById("velocityStatus");

approveBtn.addEventListener("click", async () => {
  const slug = vesselSelect.value;
  const accountId = approveAccountInput.value.trim();
  if (!slug || !accountId) {
    approveStatus.textContent = "Select a vessel and enter an account to approve.";
    approveStatus.className = "meta status-warn";
    return;
  }
  approveBtn.disabled = true;
  approveStatus.textContent = "Approving...";
  approveStatus.className = "meta";
  try {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/approve-counterparty`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId })
    });
    const payload = await response.json();
    if (payload?.ok) {
      approveStatus.textContent = `Approved ${accountId} as a counterparty.`;
      approveStatus.className = "meta status-good";
      approveAccountInput.value = "";
    } else {
      approveStatus.textContent = `Failed: ${payload?.error ?? "unknown error"}`;
      approveStatus.className = "meta status-bad";
    }
  } catch (err) {
    approveStatus.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    approveStatus.className = "meta status-bad";
  } finally {
    approveBtn.disabled = false;
  }
});

resetVelocityBtn.addEventListener("click", async () => {
  const slug = vesselSelect.value;
  if (!slug) {
    velocityStatus.textContent = "Select a vessel first.";
    velocityStatus.className = "meta status-warn";
    return;
  }
  resetVelocityBtn.disabled = true;
  velocityStatus.textContent = "Resetting...";
  velocityStatus.className = "meta";
  try {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/reset-velocity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const payload = await response.json();
    if (payload?.ok) {
      velocityStatus.textContent = "Velocity circuit has been reset.";
      velocityStatus.className = "meta status-good";
    } else {
      velocityStatus.textContent = `Failed: ${payload?.error ?? "unknown error"}`;
      velocityStatus.className = "meta status-bad";
    }
  } catch (err) {
    velocityStatus.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    velocityStatus.className = "meta status-bad";
  } finally {
    resetVelocityBtn.disabled = false;
  }
});

requestRuntimeRefresh();
