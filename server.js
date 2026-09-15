const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "work");
const DATA_FILE = path.join(DATA_DIR, "classpulse-db.json");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

let db = { sessions: {} };
const clients = new Map();

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
      db = { sessions: {} };
    }
  }
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function baseUrlFromReq(req) {
  const configured = String(process.env.PUBLIC_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  return `http://${host}`;
}

function joinUrlFor(session) {
  return `${session.joinBaseUrl || `http://127.0.0.1:${PORT}`}/student.html?session=${session.id}`;
}

function id(size = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  while (value.length < size) value += alphabet[crypto.randomInt(alphabet.length)];
  return value;
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function publicSession(session) {
  return {
    id: session.id,
    title: session.title,
    institution: session.institution,
    createdAt: session.createdAt,
    questions: session.questions.filter(q => q.isOpen).map(q => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      options: q.options,
      isOpen: q.isOpen
    }))
  };
}

function tutorSession(session) {
  return {
    ...session,
    joinUrl: joinUrlFor(session),
    tutorToken: undefined
  };
}

function requireTutor(reqUrl, session) {
  return reqUrl.searchParams.get("token") === session.tutorToken;
}

function sendEvent(sessionId) {
  const session = db.sessions[sessionId];
  const list = clients.get(sessionId) || [];
  const payload = JSON.stringify({ session: tutorSession(session) });
  for (const res of list) {
    res.write(`event: update\ndata: ${payload}\n\n`);
  }
}

function addClient(sessionId, res) {
  const list = clients.get(sessionId) || [];
  list.push(res);
  clients.set(sessionId, list);
  res.on("close", () => {
    const current = clients.get(sessionId) || [];
    clients.set(sessionId, current.filter(item => item !== res));
  });
}

function validateQuestion(input) {
  const prompt = String(input.prompt || "").trim();
  const type = String(input.type || "single");
  const validTypes = new Set(["single", "multi", "open"]);
  if (!prompt) return "Please add a question prompt.";
  if (!validTypes.has(type)) return "Unsupported question type.";
  const options = Array.isArray(input.options)
    ? input.options.map(item => String(item).trim()).filter(Boolean)
    : [];
  if (type !== "open" && options.length < 2) return "Closed questions need at least two options.";
  return null;
}

function routeStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  if (filePath.includes("..")) return json(res, 400, { error: "Bad path" });
  const full = path.join(PUBLIC, filePath);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return json(res, 404, { error: "Not found" });
  }
  const ext = path.extname(full);
  res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

async function routeApi(req, res, reqUrl) {
  const parts = reqUrl.pathname.split("/").filter(Boolean);

  if (req.method === "POST" && reqUrl.pathname === "/api/sessions") {
    const body = await readBody(req);
    const sessionId = id(6);
    const tutorToken = crypto.randomBytes(18).toString("base64url");
    const session = {
      id: sessionId,
      tutorToken,
      title: String(body.title || "Classroom check-in").trim().slice(0, 90),
      institution: String(body.institution || "UK university session").trim().slice(0, 90),
      joinBaseUrl: baseUrlFromReq(req),
      createdAt: new Date().toISOString(),
      questions: [],
      responses: []
    };
    db.sessions[sessionId] = session;
    save();
    return json(res, 201, {
      session: tutorSession(session),
      tutorPath: `/tutor.html?session=${sessionId}&token=${tutorToken}`,
      joinPath: `/student.html?session=${sessionId}`,
      joinUrl: joinUrlFor(session)
    });
  }

  if (parts[0] !== "api" || parts[1] !== "session" || !parts[2]) {
    return json(res, 404, { error: "Unknown endpoint" });
  }

  const session = db.sessions[parts[2]];
  if (!session) return json(res, 404, { error: "Session not found" });
  if (!session.joinBaseUrl) {
    session.joinBaseUrl = baseUrlFromReq(req);
    save();
  }

  if (req.method === "GET" && parts.length === 3) {
    return json(res, 200, { session: publicSession(session) });
  }

  if (req.method === "GET" && parts[3] === "tutor") {
    if (!requireTutor(reqUrl, session)) return json(res, 403, { error: "Tutor link required" });
    return json(res, 200, { session: tutorSession(session) });
  }

  if (req.method === "PATCH" && parts[3] === "join-url") {
    if (!requireTutor(reqUrl, session)) return json(res, 403, { error: "Tutor link required" });
    const body = await readBody(req);
    const joinBaseUrl = String(body.joinBaseUrl || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/\s]+(?::\d+)?$/i.test(joinBaseUrl)) {
      return json(res, 400, { error: "Use an address like http://192.168.1.25:4173" });
    }
    session.joinBaseUrl = joinBaseUrl;
    save();
    sendEvent(session.id);
    return json(res, 200, { session: tutorSession(session) });
  }

  if (req.method === "GET" && parts[3] === "events") {
    if (!requireTutor(reqUrl, session)) return json(res, 403, { error: "Tutor link required" });
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    res.write(`event: update\ndata: ${JSON.stringify({ session: tutorSession(session) })}\n\n`);
    addClient(session.id, res);
    return;
  }

  if (req.method === "POST" && parts[3] === "questions") {
    if (!requireTutor(reqUrl, session)) return json(res, 403, { error: "Tutor link required" });
    const body = await readBody(req);
    const error = validateQuestion(body);
    if (error) return json(res, 400, { error });
    const type = String(body.type);
    const question = {
      id: id(8),
      prompt: String(body.prompt).trim().slice(0, 280),
      type,
      options: type === "open" ? [] : body.options.map(item => String(item).trim()).filter(Boolean).slice(0, 10),
      isOpen: body.isOpen !== false,
      createdAt: new Date().toISOString()
    };
    session.questions.push(question);
    save();
    sendEvent(session.id);
    return json(res, 201, { question, session: tutorSession(session) });
  }

  if (req.method === "PATCH" && parts[3] === "questions" && parts[4]) {
    if (!requireTutor(reqUrl, session)) return json(res, 403, { error: "Tutor link required" });
    const body = await readBody(req);
    const question = session.questions.find(q => q.id === parts[4]);
    if (!question) return json(res, 404, { error: "Question not found" });
    if (typeof body.isOpen === "boolean") question.isOpen = body.isOpen;
    save();
    sendEvent(session.id);
    return json(res, 200, { question, session: tutorSession(session) });
  }

  if (req.method === "POST" && parts[3] === "responses") {
    const body = await readBody(req);
    const question = session.questions.find(q => q.id === body.questionId && q.isOpen);
    if (!question) return json(res, 400, { error: "This question is not accepting responses." });
    const participantType = body.participantType === "group" ? "group" : "individual";
    const groupName = participantType === "group" ? String(body.groupName || "").trim().slice(0, 40) : "";
    if (participantType === "group" && !groupName) return json(res, 400, { error: "Please add a group name or table number." });
    let answer = body.answer;
    if (question.type === "open") {
      answer = String(answer || "").trim().slice(0, 800);
      if (!answer) return json(res, 400, { error: "Please add an answer before submitting." });
    } else {
      const values = Array.isArray(answer) ? answer : [answer];
      answer = values.map(item => String(item)).filter(item => question.options.includes(item));
      const hasOther = question.options.some(option => option.toLowerCase() === "other");
      if (hasOther && answer.some(item => item.toLowerCase() === "other")) {
        const otherText = String(body.otherText || "").trim().slice(0, 160);
        if (!otherText) return json(res, 400, { error: "Please write your Other answer." });
        answer = answer.map(item => item.toLowerCase() === "other" ? `Other: ${otherText}` : item);
      }
      if (!answer.length) return json(res, 400, { error: "Please choose an option." });
      if (question.type === "single") answer = [answer[0]];
    }
    const response = {
      id: id(10),
      questionId: question.id,
      participantType,
      groupName,
      answer,
      submittedAt: new Date().toISOString()
    };
    session.responses.push(response);
    save();
    sendEvent(session.id);
    return json(res, 201, { ok: true });
  }

  return json(res, 404, { error: "Unknown endpoint" });
}

ensureStore();

http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  if (reqUrl.pathname.startsWith("/api/")) {
    routeApi(req, res, reqUrl).catch(error => json(res, 400, { error: error.message || "Request failed" }));
  } else {
    routeStatic(req, res, reqUrl.pathname);
  }
}).listen(PORT, HOST, () => {
  console.log(`ClassPulse running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});
