const params = new URLSearchParams(location.search);
const sessionId = params.get("session") || "";
const app = document.querySelector("#student-app");

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

async function load() {
  const response = await fetch(`/api/session/${sessionId}`);
  const data = await response.json();
  if (!response.ok) {
    app.innerHTML = `<section class="student-card"><h1>Session not found</h1><p class="lede">${escapeHtml(data.error || "Please check the join link.")}</p></section>`;
    return;
  }
  session = data.session;
  render();
}

function questionFields(question) {
  if (question.type === "open") {
    return `
      <label>
        <span>Your answer</span>
        <textarea name="answer" maxlength="800" required placeholder="Write a short anonymous response"></textarea>
      </label>
    `;
  }
  const inputType = question.type === "multi" ? "checkbox" : "radio";
  const hint = question.type === "multi" ? "Choose all that apply" : "Choose one option";
  return `
    <fieldset class="stack">
      <legend class="label-text">${hint}</legend>
      <div class="choice-list">
        ${question.options.map((option, index) => `
          <div class="choice-wrap">
            <label class="choice">
              <input type="${inputType}" name="answer" value="${escapeHtml(option)}" ${index === 0 && question.type === "single" ? "required" : ""} ${option.toLowerCase() === "other" ? "data-other-choice" : ""}>
              <span>${escapeHtml(option)}</span>
            </label>
            ${option.toLowerCase() === "other" ? `
              <label class="other-answer" hidden>
                <span>Please tell us more</span>
                <input name="otherText" maxlength="160" placeholder="Type your own answer">
              </label>
            ` : ""}
          </div>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function render() {
  const questions = session.questions;
  app.innerHTML = `
    <section class="student-card">
      <div class="student-top">
        <div>
          <p class="eyebrow">Anonymous entry</p>
          <h1>${escapeHtml(session.title)}</h1>
        </div>
        <span class="pill">Code ${escapeHtml(session.id)}</span>
      </div>
      <p class="lede">No account or name is needed. Choose individual or group mode, answer the open questions, then submit.</p>
      ${questions.length ? questions.map(question => `
        <form class="stack response-form" data-question="${escapeHtml(question.id)}">
          <h2>${escapeHtml(question.prompt)}</h2>
          <div class="mode-toggle" role="radiogroup" aria-label="Answer mode">
            <label><input type="radio" name="participantType" value="individual" checked> Individual</label>
            <label><input type="radio" name="participantType" value="group"> Group</label>
          </div>
          <label class="group-name" hidden>
            <span>Group or table name</span>
            <input name="groupName" maxlength="40" placeholder="Example: Table 3">
          </label>
          ${questionFields(question)}
          <button class="primary" type="submit">Submit anonymously</button>
          <div class="form-message" role="status"></div>
        </form>
      `).join("") : `<div class="empty-state">The tutor has not opened a question yet. Keep this page open and refresh when asked.</div>`}
    </section>
  `;
  bindForms();
}

function bindForms() {
  document.querySelectorAll(".response-form").forEach(form => {
    form.querySelectorAll('input[name="participantType"]').forEach(input => {
      input.addEventListener("change", () => {
        const group = form.querySelector(".group-name");
        const field = group.querySelector("input");
        const isGroup = form.participantType.value === "group";
        group.hidden = !isGroup;
        field.required = isGroup;
      });
    });
    form.querySelectorAll('[name="answer"]').forEach(input => {
      input.addEventListener("change", () => updateOtherField(form));
    });
    form.addEventListener("submit", submitResponse);
  });
}

function updateOtherField(form) {
  const other = form.querySelector(".other-answer");
  const otherChoice = form.querySelector("[data-other-choice]");
  const field = other?.querySelector("input");
  if (!other || !otherChoice || !field) return;
  const isSelected = otherChoice.checked;
  other.hidden = !isSelected;
  field.required = isSelected;
  if (!isSelected) field.value = "";
}

async function submitResponse(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.querySelector(".form-message");
  const button = form.querySelector("button");
  const questionId = form.dataset.question;
  const question = session.questions.find(item => item.id === questionId);
  const checked = [...form.querySelectorAll('[name="answer"]:checked')].map(item => item.value);
  const answer = question.type === "open" ? form.answer.value : checked;
  const otherText = form.otherText ? form.otherText.value : "";
  button.disabled = true;
  message.className = "form-message";
  message.textContent = "";
  const response = await fetch(`/api/session/${session.id}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      questionId,
      participantType: form.participantType.value,
      groupName: form.groupName ? form.groupName.value : "",
      answer,
      otherText
    })
  });
  const data = await response.json();
  if (response.ok) {
    form.reset();
    form.querySelector(".group-name").hidden = true;
    updateOtherField(form);
    message.className = "form-message notice";
    message.textContent = "Submitted. Thank you.";
  } else {
    message.className = "form-message notice error";
    message.textContent = data.error || "Could not submit your response.";
  }
  button.disabled = false;
}

load();

setInterval(() => {
  const active = document.activeElement;
  const isTyping = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
  if (!isTyping) load();
}, 7000);
