const params = new URLSearchParams(location.search);
const sessionId = params.get("session") || "";
const token = params.get("token") || "";
const app = document.querySelector("#present-app");
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

async function api(path) {
  const response = await fetch(`${path}?token=${encodeURIComponent(token)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function responsesFor(question) {
  return session.responses.filter(response => response.questionId === question.id);
}

function countsFor(question) {
  const counts = Object.fromEntries(question.options.map(option => [option, 0]));
  responsesFor(question).forEach(response => {
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
          <div class="bar-track"><div class="bar-fill" style="width:${(counts[option] / max) * 100}%"></div></div>
          <span>${counts[option]}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function wordCounts(question) {
  const stop = new Set("a an and are as at be but by for from have i in is it of on or our that the their this to we with you your about into was were will can could should would".split(" "));
  const words = {};
  responsesFor(question).forEach(response => {
    String(response.answer || "").toLowerCase().match(/[a-z][a-z'-]{2,}/g)?.forEach(word => {
      if (!stop.has(word)) words[word] = (words[word] || 0) + 1;
    });
  });
  return Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 45);
}

function wordCloudTemplate(question) {
  const words = wordCounts(question);
  if (!words.length) return `<div class="empty-state">Waiting for open responses.</div>`;
  const max = Math.max(...words.map(([, count]) => count));
  return `
    <div class="word-cloud">
      ${words.map(([word, count]) => `<span class="word" style="font-size:${1.1 + (count / max) * 2.8}rem">${escapeHtml(word)}</span>`).join("")}
    </div>
  `;
}

function render() {
  app.innerHTML = `
    <section class="present-shell">
      <header class="present-top">
        <div>
          <p class="eyebrow">${escapeHtml(session.institution)}</p>
          <h1>${escapeHtml(session.title)}</h1>
        </div>
        <div class="pill">${session.responses.length} anonymous responses</div>
      </header>
      <section class="present-grid">
        ${session.questions.length ? session.questions.map(question => `
          <article class="present-card">
            <p class="eyebrow">${question.type === "open" ? "Word cloud" : "Response distribution"}</p>
            <h2>${escapeHtml(question.prompt)}</h2>
            <p class="meta">${responsesFor(question).length} submissions</p>
            ${question.type === "open" ? wordCloudTemplate(question) : chartTemplate(question)}
          </article>
        `).join("") : `<article class="present-card empty-state">No questions yet.</article>`}
      </section>
    </section>
  `;
}

async function load() {
  try {
    const data = await api(`/api/session/${sessionId}/tutor`);
    session = data.session;
    render();
    const source = new EventSource(`/api/session/${sessionId}/events?token=${encodeURIComponent(token)}`);
    source.addEventListener("update", event => {
      session = JSON.parse(event.data).session;
      render();
    });
  } catch (error) {
    app.innerHTML = `<section class="present-shell"><article class="present-card"><h1>Presentation unavailable</h1><p>${escapeHtml(error.message)}</p></article></section>`;
  }
}

load();
