document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const state = {
    documents: [],
    batchQuestions: [],
    batchResults: [],
    latestCitations: [],
    role: localStorage.getItem("knowledgeiqRole") || "admin",
    token: localStorage.getItem("knowledgeiqToken") || "",
    user: null,
    isAuthenticated: false,
    assistantMode: "platform",
    currentPage: "dashboard"
  };

  function buildScanSummary() {
    if (!state.documents.length) {
      return "No files uploaded yet. Add PDF, TXT or Markdown documents to start the knowledge scan.";
    }

    const fileNames = state.documents.slice(0, 4).map(doc => doc.name).join(", ");
    const extra = state.documents.length > 4 ? ` +${state.documents.length - 4} more` : "";
    return `Scanned ${state.documents.length} file(s): ${fileNames}${extra}. Ready for grounded question answering.`;
  }

  function updateScanSummary(customText) {
    const summary = document.getElementById("scan-summary");
    if (!summary) return;
    summary.textContent = customText || buildScanSummary();
  }

  const pageTitleMap = {
    dashboard: "Dashboard",
    upload: "Upload Documents",
    chat: "AI Assistant",
    citations: "Citation Viewer",
    batch: "Batch Questions",
    versions: "Version Control",
    analytics: "Analytics",
    "employee-dashboard": "Dashboard"
  };

  function getApiBase() {
    return (
      localStorage.getItem("enteriqApiUrl") ||
      $("#api-url")?.value ||
      "http://127.0.0.1:8000/api"
    ).trim().replace(/\/+$/, "");
  }

  function getPageTitle(pageId) {
    return pageTitleMap[pageId] || pageTitleMap.dashboard;
  }

  function updateRoleUI() {
    const isAdmin = state.role === "admin";
    const adminNavs = document.querySelectorAll(".admin-nav");
    const employeeNavs = document.querySelectorAll(".employee-nav");

    adminNavs.forEach(item => item.classList.toggle("hidden", !isAdmin));
    employeeNavs.forEach(item => item.classList.toggle("hidden", isAdmin));

    const profileName = document.getElementById("profile-name");
    const profileRole = document.getElementById("profile-role");
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    const topAvatar = document.getElementById("top-avatar");

    const title = isAdmin ? "Administrator" : "Employee";
    const roleLabel = isAdmin ? "Workspace" : "Knowledge Access";
    if (profileName) profileName.textContent = title;
    if (profileRole) profileRole.textContent = roleLabel;
    if (sidebarAvatar) sidebarAvatar.textContent = isAdmin ? "AD" : "EM";
    if (topAvatar) topAvatar.textContent = isAdmin ? "AD" : "EM";
  }

  function showAuth() {
    document.getElementById("auth-shell")?.classList.remove("hidden");
    document.querySelector(".app-shell")?.classList.add("hidden");
    state.isAuthenticated = false;
    localStorage.setItem("knowledgeiqLoggedIn", "false");
  }

  async function loginAs(role) {
    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;
    const button = document.getElementById("login-button");
    if (!email || !password) { toast("Enter your email and password.", "error"); return; }
    if (button) { button.disabled = true; button.textContent = "Signing in..."; }
    try {
      const result = await callApi("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (result.user.role !== role) throw new Error(`This account is ${result.user.role}. Select the matching role.`);
      state.token = result.access_token; state.user = result.user; state.role = result.user.role; state.isAuthenticated = true;
      localStorage.setItem("knowledgeiqToken", state.token); localStorage.setItem("knowledgeiqRole", state.role); localStorage.setItem("knowledgeiqLoggedIn", "true");
      document.getElementById("auth-shell")?.classList.add("hidden"); document.querySelector(".app-shell")?.classList.remove("hidden");
      updateRoleUI(); showPage(role === "admin" ? "dashboard" : "employee-dashboard"); await refreshDocumentsFromBackend(); toast(`Welcome, ${result.user.full_name}.`);
    } catch (error) { toast(error.message || "Sign in failed.", "error"); }
    finally { if (button) { button.disabled = false; button.textContent = "Access Workspace"; } }
  }

  async function callApi(endpoint, options = {}) {
    const apiBase = getApiBase();
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

    const response = await fetch(`${apiBase}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(state.token ? { "Authorization": `Bearer ${state.token}` } : {}),
        ...(options.headers || {})
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const detail = typeof payload === "string"
        ? payload
        : (payload && payload.detail) || "Request failed.";
      throw new Error(detail);
    }

    return payload;
  }

  const pageNames = {
    dashboard: "dashboard",
    upload: "documentUpload",
    chat: "aiKnowledgeAssistant",
    citations: "citations",
    batch: "batch",
    versions: "versions",
    analytics: "analytics",
    "employee-dashboard": "dashboard",
    library: "documentUpload",
    conversations: "chat",
    voice: "chat"
  };

  /* -----------------------------
     SAFE TEXT AND NOTIFICATIONS
  ----------------------------- */

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function toast(message, type = "") {
    const container = $("#toast-container");
    if (!container) return;

    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    container.appendChild(item);

    setTimeout(() => item.remove(), 3000);
  }

  function feedback(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  /* -----------------------------
     PAGE NAVIGATION
  ----------------------------- */

  function showPage(pageId) {
    if (state.role !== "admin" && ["dashboard","upload","citations","batch","versions","analytics"].includes(pageId)) pageId = "employee-dashboard";
    if (!state.isAuthenticated) {
      showAuth();
      return;
    }

    const page = document.getElementById(pageId);
    if (!page || !page.classList.contains("page")) return;

    state.currentPage = pageId;

    $$(".page").forEach(item => item.classList.remove("active"));
    $$(".nav-link[data-page]").forEach(item => {
      const shouldBeActive = item.dataset.page === pageId;
      item.classList.toggle("active", shouldBeActive);
    });

    page.classList.add("active");

    const title = getPageTitle(pageId);

    $("#page-title").textContent = title;
    $("#crumb-current").textContent = title.toUpperCase();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $$("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  $$("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.go);
    });
  });

  document.querySelectorAll("[data-login-role]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-login-role]").forEach(item => {
        item.classList.toggle("active", item.dataset.loginRole === button.dataset.loginRole);
      });
      state.role = button.dataset.loginRole;
    });
  });

  document.getElementById("login-button")?.addEventListener("click", () => {
    loginAs(state.role || "admin");
  });

  document.getElementById("logout-button")?.addEventListener("click", () => {
    state.isAuthenticated = false; state.token = ""; state.user = null;
    localStorage.removeItem("knowledgeiqToken");
    localStorage.setItem("knowledgeiqLoggedIn", "false");
    showAuth();
  });

  /* -----------------------------
     DOCUMENT COUNTS
  ----------------------------- */

  function updateDashboard() {
    const total = state.documents.length;

    $("#stat-total").textContent = total;
    $("#stat-current").textContent = total;
    $("#stat-old").textContent = 0;

    // Files are not indexed until a backend is connected.
    $("#stat-indexed").textContent = 0;

    $("#version-current").textContent = total;
    $("#version-old").textContent = 0;
    $("#version-unknown").textContent = 0;

    renderRecentDocuments();
  }

  function renderRecentDocuments() {
    const container = $("#recent-documents");

    if (!state.documents.length) {
      container.textContent = "No documents loaded yet.";
      container.className = "empty-state";
      return;
    }

    container.className = "";

    container.innerHTML = `
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>DOCUMENT</th>
              <th>TYPE</th>
              <th>SIZE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${state.documents.slice(-5).reverse().map(doc => `
              <tr>
                <td>${escapeHTML(doc.name)}</td>
                <td>${escapeHTML(doc.type)}</td>
                <td>${escapeHTML(doc.sizeLabel)}</td>
                <td><span class="pill current">Selected locally</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  /* -----------------------------
     DOCUMENT UPLOAD
  ----------------------------- */

  const fileInput = $("#document-input");
  const dropZone = $("#drop-zone");

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderDocumentTable() {
    const body = $("#documents-table");

    if (!state.documents.length) {
      body.innerHTML = `
        <tr>
          <td colspan="5" class="empty-cell">
            No documents selected yet.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = state.documents.map((doc, index) => `
      <tr>
        <td>
          ${escapeHTML(doc.name)}
          <br><small>${escapeHTML(doc.sizeLabel)}</small>
        </td>
        <td>${escapeHTML(doc.type)}</td>
        <td>Not assigned</td>
        <td><span class="pill">Awaiting backend</span></td>
        <td>
          <span class="pill current">Unclassified</span>
          <button class="text-button remove-doc" data-index="${index}" type="button">
            Remove
          </button>
        </td>
      </tr>
    `).join("");
  }

  async function refreshDocumentsFromBackend() {
    try {
      const result = await callApi("/documents");
      state.documents = (result.documents || []).map(doc => ({ ...doc, sizeLabel: formatFileSize(Number(doc.size) || 0) }));
      renderDocumentTable(); updateDashboard();
    } catch (error) { if (error.message.includes("Sign in") || error.message.includes("session")) { state.token=""; localStorage.removeItem("knowledgeiqToken"); showAuth(); } }
  }

  async function uploadFilesToBackend(files) {
    if (!files.length) return;

    const formData = new FormData();
    files.forEach(file => formData.append("files", file));

    try {
      const result = await callApi("/upload", {
        method: "POST",
        body: formData
      });

      const uploadedDocs = Array.isArray(result.documents) ? result.documents : [];
      if (!uploadedDocs.length) {
        throw new Error("The backend did not return uploaded document metadata.");
      }

      state.documents = state.documents.map(doc => {
        const match = uploadedDocs.find(uploaded => uploaded.name === doc.name);
        if (!match) return doc;

        return {
          ...doc,
          status: match.status || doc.status,
          size: Number(match.size) || doc.size,
          sizeLabel: formatFileSize(Number(match.size) || doc.size)
        };
      });

      renderDocumentTable();
      updateDashboard();
      toast(`${uploadedDocs.length} file(s) uploaded to the FastAPI backend.`);
      feedback("upload-message", `${uploadedDocs.length} file(s) uploaded and indexed successfully.`);
    } catch (error) {
      const detail = error.message || "Document upload failed.";
      toast(detail, "error");
      feedback("upload-message", `Upload attempted but the backend rejected the file(s): ${detail}`, true);
    }
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    let added = 0;

    files.forEach(file => {
      const extension = file.name.split(".").pop().toLowerCase();

      if (!["pdf", "txt", "md"].includes(extension)) {
        toast(`${file.name}: unsupported file type.`, "error");
        return;
      }

      const duplicate = state.documents.some(doc =>
        doc.name === file.name && doc.size === file.size
      );

      if (duplicate) {
        toast(`${file.name} is already selected.`);
        return;
      }

      state.documents.push({
        name: file.name,
        type: extension.toUpperCase(),
        size: file.size,
        sizeLabel: formatFileSize(file.size),
        file: file,
        status: "Queued for upload"
      });

      added++;
    });

    renderDocumentTable();
    updateDashboard();
    updateScanSummary();

    if (added > 0) {
      feedback(
        "upload-message",
        `${added} file(s) selected locally and being sent to the backend.`
      );
      uploadFilesToBackend(files.filter(file =>
        ["pdf", "txt", "md"].includes(file.name.split(".").pop().toLowerCase())
      ));
    }

    if (fileInput) fileInput.value = "";
  }

  $("#browse-files").addEventListener("click", () => {
    fileInput.click();
  });

  $("#scan-data")?.addEventListener("click", () => {
    const currentText = $("#data-description")?.value.trim();
    const summary = currentText ? `${currentText} | ${buildScanSummary()}` : buildScanSummary();
    updateScanSummary(summary);
    toast("Data scan complete. The uploaded knowledge set is ready for Q&A.");
  });

  fileInput.addEventListener("change", event => {
    addFiles(event.target.files);
  });

  dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
    addFiles(event.dataTransfer.files);
  });

  $("#documents-table").addEventListener("click", event => {
    const button = event.target.closest(".remove-doc");
    if (!button) return;

    const index = Number(button.dataset.index);

    if (!Number.isInteger(index)) return;

    state.documents.splice(index, 1);

    renderDocumentTable();
    updateDashboard();
    updateScanSummary();

    feedback("upload-message", "Selected document removed.");
  });

  $("#refresh-documents").addEventListener("click", async () => {
    try {
      const response = await callApi("/documents", { method: "GET" });
      const docs = Array.isArray(response.documents) ? response.documents : [];

      state.documents = docs.map(doc => ({
        name: doc.name,
        type: (doc.type || "FILE").toUpperCase(),
        size: Number(doc.size) || 0,
        sizeLabel: formatFileSize(Number(doc.size) || 0),
        file: null,
        status: doc.status || "Uploaded"
      }));

      renderDocumentTable();
      updateDashboard();
      toast("Document list refreshed from the backend.");
    } catch (error) {
      renderDocumentTable();
      updateDashboard();
      toast(error.message || "Could not refresh the document list.");
    }
  });

  /* -----------------------------
     AI CHAT
     No fake document answers.
  ----------------------------- */

  const chatMessages = $("#chat-messages");

  function addChatMessage(text, type) {
    const message = document.createElement("div");
    message.className = `message ${type}`;

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = type === "user" ? "YOU" : "ENTERIQ";

    const content = document.createElement("div");
    content.textContent = text;

    message.append(label, content);
    chatMessages.appendChild(message);

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function resetChat() {
    chatMessages.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">✧</div>
        <h3>What would you like to know?</h3>
        <p>Ask a question about your knowledge base.</p>
        <div class="suggestions">
          <button data-question="What is the employee leave policy?">
            Employee leave policy
          </button>
          <button data-question="What are the security procedures?">
            Security procedures
          </button>
          <button data-question="What is the document retention period?">
            Document retention
          </button>
          <button data-question="Whom should we approach during difficult situations?">
            Approach during difficult situations
          </button>
          <button data-question="Whom should we approach to ask for suggestions?">
            Who to ask for suggestions
          </button>
        </div>
      </div>
    `;

    $("#chat-status").textContent = "WAITING FOR QUESTION";
    $("#chat-status").className = "status neutral";

    $("#chat-source-count").textContent = "0";
    $("#chat-version").textContent = "—";
    $("#chat-score").textContent = "—";

    state.latestCitations = [];
    renderCitations();
  }

  $("#chat-messages").addEventListener("click", event => {
    const button = event.target.closest("[data-question]");
    if (!button) return;

    $("#chat-question").value = button.dataset.question;
    $("#chat-question").focus();
  });

  $("#clear-chat").addEventListener("click", () => {
    resetChat();
    toast("Chat cleared.");
  });

  $("#chat-form").addEventListener("submit", async event => {
    event.preventDefault();

    const question = $("#chat-question").value.trim();
    if (!question) return;

    addChatMessage(question, "user");

    try {
      const result = await callApi("/chat", {
        method: "POST",
        body: JSON.stringify({ question })
      });

      addChatMessage(result.answer || "No answer returned.", "assistant");

      $("#chat-status").textContent = result.status || "ANSWERED";
      $("#chat-status").className = `status ${
        result.status === "Not Covered" ? "neutral" : "ok"
      }`;

      $("#chat-source-count").textContent = String(result.source_count || 0);
      $("#chat-version").textContent = result.version || "—";
      $("#chat-score").textContent = result.evidence_score || "—";

      state.latestCitations = Array.isArray(result.citations) ? result.citations : [];
      renderCitations();
      renderAnswerEvidence(result);
    } catch (error) {
      addChatMessage(
        "The backend did not respond. Please save a valid FastAPI endpoint and try again.",
        "assistant"
      );

      $("#chat-status").textContent = "NOT PROCESSED";
      $("#chat-status").className = "status neutral";

      $("#chat-source-count").textContent = "0";
      $("#chat-version").textContent = "—";
      $("#chat-score").textContent = "—";

      state.latestCitations = [];
      renderCitations();
      renderAnswerEvidence({ answer: "No answer available.", status: "Not Covered", citations: [] });
    }

    $("#chat-question").value = "";
  });

  /* -----------------------------
     CITATION VIEWER
  ----------------------------- */

  function renderCitations() {
    const container = $("#citation-list");

    if (!state.latestCitations.length) {
      $("#citation-count").textContent = "0 source passages";

      container.innerHTML = `
        <div class="panel empty-state">
          No verified citations available. Connect document retrieval to populate this area.
        </div>
      `;
      return;
    }

    $("#citation-count").textContent =
      `${state.latestCitations.length} source passages`;

    container.innerHTML = state.latestCitations.map(citation => `
      <article class="panel citation-card">
        <h3>${escapeHTML(citation.name)}</h3>
        <div class="citation-meta">
          ${escapeHTML(citation.section)} · Page ${escapeHTML(citation.page)}
        </div>
        <div class="citation-excerpt">
          ${escapeHTML(citation.excerpt)}
        </div>
      </article>
    `).join("");
  }

  function renderAnswerEvidence(response) {
    const container = $("#answer-evidence");
    if (!container) return;

    const citations = Array.isArray(response?.citations) ? response.citations : [];
    const answer = response?.answer || "No answer returned.";
    const status = response?.status || "ANSWERED";

    if (!citations.length) {
      container.classList.add("hidden");
      container.innerHTML = "";
      return;
    }

    container.classList.remove("hidden");
    container.innerHTML = `
      <div class="evidence-panel">
        <div class="evidence-answer">
          <span class="status-pill ${status === "Not Covered" ? "neutral" : "success"}">${escapeHTML(status)}</span>
          <p>${escapeHTML(answer)}</p>
        </div>
        <div class="evidence-citations">
          ${citations.map(citation => `
            <article class="doc-citation-card">
              <div class="doc-citation-header">
                <strong>${escapeHTML(citation.name)}</strong>
                <span>${escapeHTML(citation.section)} · Page ${escapeHTML(citation.page)}</span>
              </div>
              <p>${escapeHTML(citation.excerpt)}</p>
            </article>
          `).join("")}
        </div>
      </div>
    `;
  }

  $("#refresh-citations").addEventListener("click", () => {
    renderCitations();
    toast("Citation list refreshed.");
  });

  /* -----------------------------
     CSV PARSER
  ----------------------------- */

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      const next = text[i + 1];

      if (character === '"' && quoted && next === '"') {
        value += '"';
        i++;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === "," && !quoted) {
        row.push(value.trim());
        value = "";
      } else if (
        (character === "\n" || character === "\r") &&
        !quoted
      ) {
        if (character === "\r" && next === "\n") i++;

        row.push(value.trim());

        if (row.some(cell => cell !== "")) {
          rows.push(row);
        }

        row = [];
        value = "";
      } else {
        value += character;
      }
    }

    row.push(value.trim());

    if (row.some(cell => cell !== "")) {
      rows.push(row);
    }

    return rows;
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map(row =>
      row.map(value =>
        `"${String(value ?? "").replace(/"/g, '""')}"`
      ).join(",")
    ).join("\r\n");

    const blob = new Blob(
      [csv],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  /* -----------------------------
     BATCH QUESTIONS
  ----------------------------- */

  $("#batch-browse").addEventListener("click", () => {
    $("#batch-input").click();
  });

  $("#batch-input").addEventListener("change", event => {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const rows = parseCSV(String(reader.result || ""));

        if (!rows.length) {
          feedback("batch-message", "The CSV file is empty.", true);
          return;
        }

        const headers = rows[0].map(header =>
          header.trim().toLowerCase()
        );

        const questionIndex = headers.indexOf("question");

        if (questionIndex === -1) {
          feedback(
            "batch-message",
            'The CSV must contain a column named "question".',
            true
          );
          return;
        }

        state.batchQuestions = rows
          .slice(1)
          .map(row => (row[questionIndex] || "").trim())
          .filter(Boolean);

        $("#batch-filename").textContent = file.name;
        $("#run-batch").disabled = state.batchQuestions.length === 0;

        feedback(
          "batch-message",
          `${state.batchQuestions.length} question(s) loaded. The AI backend is required to process them.`
        );
      } catch (error) {
        console.error(error);
        feedback("batch-message", "Could not read this CSV file.", true);
      }
    };

    reader.onerror = () => {
      feedback("batch-message", "Could not read this CSV file.", true);
    };

    reader.readAsText(file);
  });

  $("#download-template").addEventListener("click", () => {
    downloadCSV("enteriq_questions_template.csv", [
      ["question"],
      ["What is the employee leave policy?"],
      ["What are the security procedures?"],
      ["What is the document retention period?"]
    ]);

    toast("CSV template downloaded.");
  });

  function renderBatchResults() {
    const body = $("#batch-results");

    if (!state.batchResults.length) {
      body.innerHTML = `
        <tr>
          <td colspan="4" class="empty-cell">No batch results yet.</td>
        </tr>
      `;
      return;
    }

    body.innerHTML = state.batchResults.map(result => `
      <tr>
        <td>${escapeHTML(result.question)}</td>
        <td>${escapeHTML(result.answer)}</td>
        <td><span class="pill">${escapeHTML(result.status)}</span></td>
        <td>${escapeHTML(result.citation)}</td>
      </tr>
    `).join("");
  }

  $("#run-batch").addEventListener("click", async () => {
    if (!state.batchQuestions.length) return;

    try {
      const response = await callApi("/batch", {
        method: "POST",
        body: JSON.stringify({ questions: state.batchQuestions })
      });

      state.batchResults = Array.isArray(response.results) ? response.results : [];
      renderBatchResults();
      $("#export-batch").disabled = false;

      feedback(
        "batch-message",
        `${state.batchResults.length} question(s) processed by the FastAPI backend.`
      );
    } catch (error) {
      state.batchResults = state.batchQuestions.map(question => ({
        question,
        answer: "Awaiting document retrieval backend.",
        status: "NOT PROCESSED",
        citation: "No verified citation"
      }));

      renderBatchResults();
      $("#export-batch").disabled = false;
      feedback("batch-message", error.message || "Batch processing failed.", true);
    }
  });

  $("#export-batch").addEventListener("click", () => {
    if (!state.batchResults.length) return;

    downloadCSV("enteriq_batch_results.csv", [
      ["question", "answer", "status", "citations"],
      ...state.batchResults.map(result => [
        result.question,
        result.answer,
        result.status,
        result.citation
      ])
    ]);

    toast("Batch results exported.");
  });

  /* -----------------------------
     VERSION CONTROL
  ----------------------------- */

  function renderVersions() {
    const body = $("#versions-table");

    if (!state.documents.length) {
      body.innerHTML = `
        <tr>
          <td colspan="5" class="empty-cell">
            No version information available.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = state.documents.map(doc => `
      <tr>
        <td>${escapeHTML(doc.name)}</td>
        <td>Not assigned</td>
        <td>Not provided</td>
        <td><span class="pill">Unclassified</span></td>
        <td><span class="pill">Awaiting backend</span></td>
      </tr>
    `).join("");
  }

  $("#refresh-versions").addEventListener("click", () => {
    renderVersions();
    updateDashboard();
    toast("Version list refreshed.");
  });

  const assistantToggle = document.getElementById("assistant-toggle");
  const assistantPanel = document.getElementById("assistant-panel");
  const assistantClose = document.getElementById("assistant-close");

  assistantToggle?.addEventListener("click", () => {
    assistantPanel?.classList.toggle("hidden");
  });

  assistantClose?.addEventListener("click", () => {
    assistantPanel?.classList.add("hidden");
  });

  document.querySelectorAll(".mode-btn").forEach(button => {
    button.addEventListener("click", () => {
      state.assistantMode = button.dataset.assistantMode;
      document.querySelectorAll(".mode-btn").forEach(item => {
        item.classList.toggle("active", item === button);
      });
    });
  });

  document.getElementById("assistant-send")?.addEventListener("click", () => {
    const input = document.getElementById("assistant-input");
    if (!input || !input.value.trim()) return;

    const container = document.querySelector(".assistant-body");
    const message = document.createElement("div");
    message.className = "assistant-message reply";
    message.textContent = state.assistantMode === "knowledge"
      ? "I can help answer company-related questions using the retrieved document corpus and citations."
      : "I can guide you through uploads, navigation, document management, and feature usage.";
    container.appendChild(message);
    input.value = "";
  });

  document.getElementById("voice-toggle")?.addEventListener("click", () => {
    const output = document.getElementById("voice-transcript");
    if (!output) return;

    output.textContent = "Listening... Recognizing voice input in English for the current question.";
    output.classList.add("recording");
  });

  document.getElementById("voice-stop")?.addEventListener("click", () => {
    const output = document.getElementById("voice-transcript");
    if (!output) return;
    output.textContent = "Transcript captured: What is the annual leave policy?";
    output.classList.remove("recording");
  });

  document.getElementById("voice-replay")?.addEventListener("click", () => {
    const output = document.getElementById("voice-transcript");
    if (!output) return;
    output.textContent = "Replay: The annual leave policy is defined in the current approved Leave Policy document.";
  });

  /* -----------------------------
     INITIAL PAGE SETUP
  ----------------------------- */

  renderDocumentTable();
  renderRecentDocuments();
  renderCitations();
  renderBatchResults();
  renderVersions();
  updateDashboard();
  updateRoleUI();
  if (state.token) {
    callApi("/auth/me").then(user => {
      state.user=user; state.role=user.role; state.isAuthenticated=true;
      document.getElementById("auth-shell")?.classList.add("hidden"); document.querySelector(".app-shell")?.classList.remove("hidden");
      updateRoleUI(); showPage(user.role === "admin" ? "dashboard" : "employee-dashboard"); return refreshDocumentsFromBackend();
    }).catch(() => { localStorage.removeItem("knowledgeiqToken"); state.token=""; showAuth(); });
  } else { showAuth(); }

  $("#server-label").textContent = "Backend connected";

  if (!state.isAuthenticated) {
    showAuth();
  } else {
    document.getElementById("auth-shell")?.classList.add("hidden");
    document.querySelector(".app-shell")?.classList.remove("hidden");
    showPage(state.role === "admin" ? "dashboard" : "employee-dashboard");
  }

  console.log("EnterIQ frontend initialized successfully.");
});