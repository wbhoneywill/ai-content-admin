/**
 * Admin UI client. Dependency-free; talks to the /api endpoints. Flow:
 * login → type a request → review the proposal → Approve/Reject → Publish.
 */
const $ = (sel) => document.querySelector(sel);

const api = async (path, body) => {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

function show(view) {
  $("#login-view").hidden = view !== "login";
  $("#app-view").hidden = view !== "app";
}

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  $("#messages").appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return el;
}

function renderProposal(p) {
  const el = document.createElement("div");
  el.className =
    "msg bot proposal" + (p.requiresConfirmation ? " confirm" : "");
  const refs =
    p.validation?.issues?.filter((i) => i.kind === "reference") ?? [];
  const blast = (p.blastRadius ?? []).concat(refs.map((r) => r.message));
  el.innerHTML = `
    <h3>${p.requiresConfirmation ? "Please confirm" : "Proposed change"}</h3>
    <p>${escapeHtml(p.summary)}</p>
    ${
      blast.length
        ? `<ul>${blast.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
        : ""
    }
    <div class="actions">
      <button class="primary" data-act="approve">${p.requiresConfirmation ? "Confirm & stage" : "Approve"}</button>
      <button class="ghost" data-act="reject">Discard</button>
    </div>`;
  $("#messages").appendChild(el);
  el.querySelector('[data-act="approve"]').onclick = () => approve(p.id, el);
  el.querySelector('[data-act="reject"]').onclick = () => reject(p.id, el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
}

async function refreshStatus() {
  const { ok, data } = await api("/api/status");
  if (!ok) return;
  $("#site-name").textContent = data.profile?.name ?? "Content Admin";
  const canPublish = data.preview?.canPublish;
  $("#publish-btn").disabled = !canPublish;
  const pill = $("#status-pill");
  pill.textContent = canPublish ? "Changes staged" : "No changes staged";
  pill.classList.toggle("staged", !!canPublish);
  if (data.profile?.adminDomain) {
    const link = $("#preview-link");
    link.hidden = false;
    // Preview deploy convention; actual URL wired in M4c.
    link.href = `https://preview.${data.profile.adminDomain.replace(/^admin\./, "")}/`;
  }
}

async function send(prompt) {
  addMessage("user", prompt);
  const sending = addMessage("bot", "Thinking…");
  const { ok, data } = await api("/api/propose", { prompt });
  sending.remove();
  if (!ok) {
    addMessage("bot", data.error ?? "Something went wrong.").classList.add(
      "error",
    );
    return;
  }
  if (data.kind === "proposal") renderProposal(data);
  else if (data.kind === "clarify")
    addMessage(
      "bot",
      data.question +
        (data.candidates?.length ? ` (${data.candidates.join(", ")})` : ""),
    );
  else if (data.kind === "decline") addMessage("bot", data.reason);
  else if (data.kind === "error")
    addMessage("bot", data.message).classList.add("error");
}

async function approve(id, el) {
  const { ok, data } = await api("/api/approve", { id });
  el.querySelector(".actions").remove();
  if (ok) {
    addMessage("bot", "Staged to preview. Review it, then Publish when ready.");
    await refreshStatus();
  } else {
    addMessage(
      "bot",
      data.error ?? "Could not stage the change.",
    ).classList.add("error");
  }
}

async function reject(id, el) {
  await api("/api/reject", { id });
  el.querySelector(".actions")?.remove();
  addMessage("bot", "Discarded.");
}

async function publish() {
  if (!confirm("Publish all staged changes to the live site?")) return;
  const { ok, data } = await api("/api/publish", {});
  addMessage(
    "bot",
    ok ? "Published to the live site." : (data.error ?? "Publish failed."),
  );
  await refreshStatus();
}

// --- wiring ---
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  const { ok, data } = await api("/api/login", {
    password: $("#password").value,
  });
  if (ok) {
    show("app");
    await refreshStatus();
  } else {
    $("#login-error").textContent = data.error ?? "Sign in failed.";
  }
});

$("#prompt-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const prompt = $("#prompt").value.trim();
  if (!prompt) return;
  $("#prompt").value = "";
  send(prompt);
});

$("#publish-btn").addEventListener("click", publish);
$("#logout-btn").addEventListener("click", async () => {
  await api("/api/logout", {});
  show("login");
});

// On load, check whether we already have a session.
(async () => {
  const { ok } = await api("/api/status");
  if (ok) {
    show("app");
    await refreshStatus();
  } else {
    show("login");
  }
})();
