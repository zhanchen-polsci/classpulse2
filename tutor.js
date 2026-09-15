const params = new URLSearchParams(location.search);
const sessionId = params.get("session") || "";
const token = params.get("token") || "";
const app = document.querySelector("#tutor-app");
let session = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function joinUrl() {
  return session?.joinUrl || `${location.origin}/student.html?session=${sessionId}`;
}

function presentUrl() {
  return `${location.origin}/present.html?session=${sessionId}&token=${encodeURIComponent(token)}`;
}

function qrUrl() {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(joinUrl())}`;
}

function isLocalJoinUrl() {
  return /\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(joinUrl());
}

async function api(path, options = {}) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}token=${encodeURIComponent(token)}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function load() {
  try {
    const data = await api(`/api/session/${sessionId}/tutor`);
    session = data.session;
    render();
    connectEvents();
  } catch (error) {
    app.innerHTML = `<main class="entry-shell"><section class="entry-panel"><h1>Unable to open tutor view</h1><p class="lede">${escapeHtml(error.message)}</p></section></main>`;
  }
}

function render() {
  const totalResponses = session.responses.length;
  app.innerHTML = `
    <main class="tutor-shell">
      <aside class="sidebar">
        <div class="brand-row">
          <h1>ClassPulse</h1>
          <span class="pill">${totalResponses} responses</span>
        </div>
        <section class="session-code">
          <p class="eyebrow">Student join</p>
          <div class="join-code">${escapeHtml(session.id)}</div>
          <div class="qr-wrap"><img alt="QR code for student join link" src="${qrUrl()}"></div>
          <div class="link-line">${escapeHtml(joinUrl())}</div>
          ${isLocalJoinUrl() ? `<p class="join-warning">This link works on this computer only. For student phones, use your computer's Wi-Fi IP address, for example <strong>http://192.168.1.25:4173</strong>.</p>` : ""}
          <div class="button-row">
            <button class="secondary" data-copy="${escapeHtml(joinUrl())}">Copy join link</button>
            <a class="button-link" href="${escapeHtml(joinUrl())}" target="_blank" rel="noreferrer">Open student page</a>
          </div>
          <form id="join-url-form" class="mini-form">
            <label>
              <span>Classroom address for QR code</span>
              <input name="joinBaseUrl" value="${escapeHtml(new URL(joinUrl()).origin)}" placeholder="http://192.168.1.25:4173">
            </label>
            <button class="secondary" type="submit">Save QR address</button>
            <p class="help-text">Use a fixed address that student phones can reach. If you use VPN, make sure local network access is allowed.</p>
          </form>
        </section>
        <section class="session-code">
          <p class="eyebrow">Privacy</p>
          <p>Students never enter names or accounts. The dashboard labels answers only as individual or group.</p>
        </section>
      </aside>
      <section class="main-area">
        <div class="toolbar">
          <div>
            <p class="eyebrow">${escapeHtml(session.institution)}</p>
            <h2>${escapeHtml(session.title)}</h2>
          </div>
          <div class="button-row">
            <a class="button-link primary-link" href="${escapeHtml(presentUrl())}" target="_blank" rel="noreferrer">Presentation mode</a>
            <button class="secondary" data-copy="${escapeHtml(presentUrl())}">Copy presentation link</button>
          </div>
        </div>
        ${builderTemplate()}
        <section class="question-grid" aria-label="Live question results">
          ${session.questions.length ? session.questions.map(questionCard).join("") : `<div class="panel empty-state">Create your first question to start collecting responses.</div>`}
        </section>
      </section>
    </main>
  `;
  bindTutor();
}

function builderTemplate() {
  return `
    <section class="panel">
      <form id="question-form" class="stack">
        <div class="builder-grid">
          <label>
            <span>Question prompt</span>
            <input name="prompt" maxlength="280" required placeholder="Example: Which topic should we revisit?">
          </label>
          <label>
            <span>Question type</span>
            <select name="type">
              <option value="single">Multiple choice</option>
              <option value="multi">Multi-select</option>
              <option value="open">Open-ended</option>
            </select>
          </label>
        </div>
        <div id="options-box" class="options-box">
          <span class="label-text">Options</span>
          ${[1, 2, 3, 4].map(index => `
            <div class="option-row">
              <input name="option" placeholder="Option ${index}" ${index < 3 ? "required" : ""}>
              <button class="ghost" type="button" data-remove-option aria-label="Remove option">×</button>
            </div>
          `).join("")}
          <div class="button-row">
            <button class="secondary" type="button" id="add-option">Add option</button>
            <button class="secondary" type="button" id="add-other-option">Add Other option</button>
          </div>
        </div>
        <button class="primary" type="submit">Add question and open responses</button>
        <div id="builder-message" role="status"></div>
      </form>
    </section>
  `;
}

function questionResponses(question) {
  return session.responses.filter(response => response.questionId === question.id);
}

function countsFor(question) {
  const counts = Object.fromEntries(question.options.map(option => [option, 0]));
  questionResponses(question).forEach(response => {
    response.answer.forEach(answer => {
      const option = String(answer).toLowerCase().startsWith("other:") ? "Other" : answer;
      counts[option] = (counts[option] || 0) + 1;
    });
  });
  return counts;
}

function chartTemplate(question) {
  const counts = countsFor(question);
  const max = Math.max(1, ...Object.values(counts));
  return `
    <div class="chart">
      ${question.options.map(option => `
        <div class="bar-row">
          <strong>${escapeHtml(option)}</strong>
          <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${(counts[option] / max) * 100}%"></div></div>
          <span>${counts[option]}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function wordCounts(question) {
  const stop = new Set("a an and are as at be but by for from have i in is it of on or our that the their this to we with you your about into was were will can could should would".split(" "));
  const words = {};
  questionResponses(question).forEach(response => {
    String(response.answer || "").toLowerCase().match(/[a-z][a-z'-]{2,}/g)?.forEach(word => {
      if (!stop.has(word)) words[word] = (words[word] || 0) + 1;
    });
  });
  return Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 32);
}

function wordCloudTemplate(question) {
  const words = wordCounts(question);
  if (!words.length) return `<div class="empty-state">Word cloud will appear as students submit open responses.</div>`;
  const max = Math.max(...words.map(([, count]) => count));
  return `
    <div class="word-cloud">
      ${words.map(([word, count]) => `<span class="word" style="font-size:${0.95 + (count / max) * 1.9}rem">${escapeHtml(word)}</span>`).join("")}
    </div>
  `;
}

function responseList(question) {
  const responses = questionResponses(question).slice().reverse();
  if (!responses.length) return `<div class="empty-state">No responses yet.</div>`;
  return `
    <div class="responses">
      ${responses.map(response => `
        <div class="response">
          <strong>${response.participantType === "group" ? `Group: ${escapeHtml(response.groupName)}` : "Individual"}</strong>
          <div>${escapeHtml(Array.isArray(response.answer) ? response.answer.join(", ") : response.answer)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function questionCard(question) {
  const responses = questionResponses(question);
  return `
    <article class="question-card" id="question-${escapeHtml(question.id)}">
      <div class="question-head">
        <div>
          <h3>${escapeHtml(question.prompt)}</h3>
          <div class="meta">${question.type === "open" ? "Open-ended" : question.type === "multi" ? "Multi-select" : "Multiple choice"} · ${responses.length} submissions</div>
        </div>
        <button class="${question.isOpen ? "danger" : "secondary"}" data-toggle="${escapeHtml(question.id)}" data-open="${question.isOpen ? "false" : "true"}">${question.isOpen ? "Close" : "Open"}</button>
      </div>
      ${question.type === "open" ? wordCloudTemplate(question) : chartTemplate(question)}
      ${responseList(question)}
      <div class="button-row">
        <button class="ghost" data-download="${escapeHtml(question.id)}">Download visual</button>
        <button class="ghost" data-copy-summary="${escapeHtml(question.id)}">Copy summary</button>
      </div>
    </article>
  `;
}

function bindTutor() {
  const form = document.querySelector("#question-form");
  form.addEventListener("submit", addQuestion);
  form.type.addEventListener("change", () => updateOptionsState(form));
  document.querySelector("#add-option").addEventListener("click", () => {
    const row = document.createElement("div");
    row.className = "option-row";
    row.innerHTML = `<input name="option" placeholder="Another option"><button class="ghost" type="button" data-remove-option aria-label="Remove option">×</button>`;
    document.querySelector("#options-box .button-row").before(row);
    bindRemoveOption(row);
    updateOptionsState(form);
  });
  document.querySelector("#add-other-option").addEventListener("click", () => {
    const existing = [...document.querySelectorAll('[name="option"]')].find(input => input.value.trim().toLowerCase() === "other");
    if (existing) {
      existing.focus();
      return;
    }
    const row = document.createElement("div");
    row.className = "option-row";
    row.innerHTML = `<input name="option" value="Other" aria-label="Other option"><button class="ghost" type="button" data-remove-option aria-label="Remove option">×</button>`;
    document.querySelector("#options-box .button-row").before(row);
    bindRemoveOption(row);
    updateOptionsState(form);
  });
  document.querySelectorAll("[data-remove-option]").forEach(button => {
    bindRemoveOption(button.closest(".option-row"));
  });
  document.querySelectorAll("[data-toggle]").forEach(button => {
    button.addEventListener("click", () => toggleQuestion(button.dataset.toggle, button.dataset.open === "true"));
  });
  document.querySelectorAll("[data-copy]").forEach(button => {
    button.addEventListener("click", () => copyText(button.dataset.copy, button));
  });
  document.querySelectorAll("[data-copy-summary]").forEach(button => {
    button.addEventListener("click", () => copyText(summaryFor(button.dataset.copy), button));
  });
  document.querySelectorAll("[data-download]").forEach(button => {
    button.addEventListener("click", () => downloadVisual(button.dataset.download));
  });
  document.querySelector("#join-url-form").addEventListener("submit", updateJoinUrl);
  updateOptionsState(form);
}

function bindRemoveOption(row) {
  row.querySelector("[data-remove-option]").addEventListener("click", () => row.remove());
}

function updateOptionsState(form) {
  const isOpenEnded = form.type.value === "open";
  const optionsBox = document.querySelector("#options-box");
  const optionInputs = [...form.querySelectorAll('[name="option"]')];
  optionsBox.hidden = isOpenEnded;
  optionInputs.forEach((input, index) => {
    input.disabled = isOpenEnded;
    input.required = !isOpenEnded && index < 2;
  });
}

async function addQuestion(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#builder-message");
  const button = form.querySelector('button[type="submit"]');
  const type = form.type.value;
  const options = [...form.querySelectorAll('[name="option"]')].map(input => input.value);
  button.disabled = true;
  try {
    const data = await api(`/api/session/${sessionId}/questions`, {
      method: "POST",
      body: JSON.stringify({ prompt: form.prompt.value, type, options, isOpen: true })
    });
    session = data.session;
    render();
  } catch (error) {
    message.className = "notice error";
    message.textContent = error.message;
  }
  button.disabled = false;
}

async function updateJoinUrl(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const data = await api(`/api/session/${sessionId}/join-url`, {
      method: "PATCH",
      body: JSON.stringify({ joinBaseUrl: form.joinBaseUrl.value })
    });
    session = data.session;
    render();
  } catch (error) {
    alert(error.message);
  }
  button.disabled = false;
}

async function toggleQuestion(questionId, isOpen) {
  const data = await api(`/api/session/${sessionId}/questions/${questionId}`, {
    method: "PATCH",
    body: JSON.stringify({ isOpen })
  });
  session = data.session;
  render();
}

function summaryFor(questionId) {
  const question = session.questions.find(item => item.id === questionId);
  const responses = questionResponses(question);
  if (question.type === "open") {
    return `${question.prompt}\n\n${responses.map(item => `- ${item.participantType === "group" ? item.groupName : "Individual"}: ${item.answer}`).join("\n")}`;
  }
  const counts = countsFor(question);
  return `${question.prompt}\n\n${Object.entries(counts).map(([option, count]) => `${option}: ${count}`).join("\n")}`;
}

async function copyText(text, button) {
  await navigator.clipboard.writeText(text);
  const old = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = old;
  }, 1300);
}

function svgText(value, x, y, size = 22, weight = 700, colour = "#172026") {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${colour}">${escapeHtml(value)}</text>`;
}

function visualSvg(question) {
  const width = 1100;
  const height = question.type === "open" ? 720 : 260 + question.options.length * 76;
  let body = `<rect width="100%" height="100%" fill="#ffffff"/>${svgText(question.prompt, 54, 76, 34, 800)}`;
  if (question.type === "open") {
    const words = wordCounts(question);
    if (!words.length) body += svgText("Waiting for responses", 54, 150, 26, 700, "#5c6770");
    const max = Math.max(1, ...words.map(([, count]) => count));
    let x = 70;
    let y = 170;
    words.forEach(([word, count], index) => {
      const size = 25 + Math.round((count / max) * 44);
      const estimated = word.length * size * 0.58;
      if (x + estimated > width - 80) {
        x = 70;
        y += 78;
      }
      const colours = ["#174ea6", "#20845a", "#c65d42", "#172026"];
      body += svgText(word, x, y, size, 800, colours[index % colours.length]);
      x += estimated + 34;
    });
  } else {
    const counts = countsFor(question);
    const max = Math.max(1, ...Object.values(counts));
    question.options.forEach((option, index) => {
      const y = 150 + index * 76;
      const barWidth = Math.round((counts[option] / max) * 640);
      body += svgText(option, 54, y + 24, 24, 800);
      body += `<rect x="310" y="${y}" width="650" height="34" rx="17" fill="#edf1f4"/>`;
      body += `<rect x="310" y="${y}" width="${barWidth}" height="34" rx="17" fill="#1f6feb"/>`;
      body += svgText(String(counts[option]), 990, y + 25, 24, 800);
    });
  }
  body += svgText(`${responsesFor(question).length} anonymous submissions`, 54, height - 42, 20, 700, "#5c6770");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

function downloadVisual(questionId) {
  const question = session.questions.find(item => item.id === questionId);
  const svg = visualSvg(question);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${session.id}-${question.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "visual"}.svg`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function connectEvents() {
  const source = new EventSource(`/api/session/${sessionId}/events?token=${encodeURIComponent(token)}`);
  source.addEventListener("update", event => {
    session = JSON.parse(event.data).session;
    render();
  });
}

load();
