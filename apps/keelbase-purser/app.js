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
    if (payload?.ok && payload.payment) {
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
    depositAddressEl.textContent = "-";
    autoApproveNearEl.textContent = "-";
    treasuryNoteEl.textContent = "";
  }
});

async function loadTreasury() {
  const slug = vesselSelect.value;
  if (!slug) return;
  treasuryBalanceEl.textContent = "loading...";
  treasuryNoteEl.textContent = "";
  try {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/treasury`);
    const payload = await response.json();
    if (payload?.ok) {
      treasuryBalanceEl.textContent = String(payload.balanceNear ?? "0");
      depositAddressEl.textContent = String(payload.depositAddress ?? "-");
      autoApproveNearEl.textContent = String(payload.policyAutoApproveNear ?? "-");
      treasuryNoteEl.textContent = payload.note ?? "";
    } else {
      treasuryBalanceEl.textContent = "unavailable";
      treasuryNoteEl.textContent = "";
    }
  } catch {
    treasuryBalanceEl.textContent = "error";
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

requestRuntimeRefresh();
