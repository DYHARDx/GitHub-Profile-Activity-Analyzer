(() => {
  // js/utils.js
  function $(id) {
    return document.getElementById(id);
  }
  function showEl(el) {
    if (el) {
      el.hidden = false;
    }
  }
  function hideEl(el) {
    if (el) {
      el.hidden = true;
    }
  }
  function escapeHtml(str) {
    if (str === null || str === void 0) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function getUtcDateStr(d) {
    const dateObj = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (!dateObj || isNaN(dateObj.getTime())) return "";
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function formatNumber(n) {
    if (n === "N/A" || n === null || n === void 0) return "N/A";
    const num = Number(n);
    if (isNaN(num)) return String(n);
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "k";
    return num.toLocaleString();
  }
  function formatDate(d) {
    if (!d) return "N/A";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "N/A";
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(dateObj);
  }
  function formatMonthYear(monthStr) {
    if (!monthStr || !monthStr.includes("-")) return monthStr || "N/A";
    const [year, month] = monthStr.split("-");
    const dateObj = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    return dateObj.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  function relativeDate(d) {
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "N/A";
    const diff = Date.now() - dateObj.getTime();
    const days = Math.floor(diff / 864e5);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
  }

  // js/config.js
  var CONFIG = {
    GITHUB_TOKEN: window.ENV && window.ENV.GITHUB_TOKEN || "",
    GITHUB_API: "https://api.github.com",
    GEMINI_API_KEY: window.ENV && window.ENV.GEMINI_API_KEY || "",
    GEMINI_MODEL: "gemini-3.7-flash",
    MAX_REPOS: 150,
    COMMIT_REPOS: 25,
    COMMITS_PER_REPO: 100,
    REPOS_PER_PAGE: 15
  };
  var LANG_COLORS = {
    JavaScript: "#f7df1e",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Go: "#00add8",
    Rust: "#dea584",
    Ruby: "#701516",
    PHP: "#4f5d95",
    Swift: "#fa7343",
    Kotlin: "#A97BFF",
    Scala: "#c22d40",
    R: "#198ce7",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c",
    SCSS: "#c6538c",
    Dart: "#00b4ab",
    Lua: "#000080",
    Haskell: "#5e5086",
    Elixir: "#6e4a7e",
    Clojure: "#db5855",
    "Objective-C": "#438eff",
    Perl: "#0298c3",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Jupyter: "#da5b0b",
    Other: "#8a95a5"
  };
  function getLangColor(lang) {
    return LANG_COLORS[lang] || LANG_COLORS.Other;
  }

  // js/state.js
  var state = {
    profile: null,
    repos: [],
    languages: {},
    // { lang: { bytes, repoCount, repos } }
    commits: [],
    // flat list of { sha, date, dateStr, hour, day, month, repo }
    repoPage: 1,
    repoQuery: "",
    repoLang: "",
    repoSort: "stars",
    period: "all",
    insights: null,
    techStack: [],
    career: null
  };

  // js/storage.js
  var Storage = {
    // --- Theme ---
    getTheme() {
      return localStorage.getItem("gh_analyzer_theme") || "light";
    },
    setTheme(theme) {
      localStorage.setItem("gh_analyzer_theme", theme);
    },
    // --- Recent Searches ---
    getRecentSearches() {
      try {
        const stored = localStorage.getItem("gh_analyzer_recent");
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    },
    addRecentSearch(username) {
      if (!username) return;
      let searches = this.getRecentSearches();
      searches = searches.filter((u) => u.toLowerCase() !== username.toLowerCase());
      searches.unshift(username);
      if (searches.length > 5) searches = searches.slice(0, 5);
      localStorage.setItem("gh_analyzer_recent", JSON.stringify(searches));
    },
    // --- API Cache (sessionStorage) ---
    getCached(key) {
      try {
        const stored = sessionStorage.getItem(`gh_cache_${key}`);
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp > 6e5) {
          sessionStorage.removeItem(`gh_cache_${key}`);
          return null;
        }
        return parsed.data;
      } catch {
        return null;
      }
    },
    setCache(key, data) {
      try {
        const payload = {
          timestamp: Date.now(),
          data
        };
        sessionStorage.setItem(`gh_cache_${key}`, JSON.stringify(payload));
      } catch (e) {
        console.warn("Session storage full, unable to cache.", e);
      }
    }
  };

  // js/theme.js
  var ThemeManager = {
    init() {
      const savedTheme = Storage.getTheme();
      this.applyTheme(savedTheme);
      document.querySelectorAll(".theme-toggle-btn, #theme-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const current = document.documentElement.getAttribute("data-theme");
          const newTheme = current === "dark" ? "light" : "dark";
          this.applyTheme(newTheme);
        });
      });
    },
    applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      Storage.setTheme(theme);
      const sunSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
      const moonSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
      document.querySelectorAll(".theme-toggle-btn, #theme-toggle-btn").forEach((btn) => {
        btn.innerHTML = theme === "dark" ? moonSvg : sunSvg;
      });
    }
  };

  // js/chat.js
  var ChatEngine = {
    history: [],
    contextData: null,
    isOpen: false,
    init() {
      this.bindUI();
    },
    setContext(data) {
      this.contextData = data;
      this.history = [];
      this._renderMessages();
      this.addSystemMessage(`I'm your AI Career Advisor! I've analyzed **${data.profile?.login || "this developer"}**'s GitHub profile. Ask me anything about their tech stack, open-source presence, or how they can improve their career!`);
    },
    bindUI() {
      $("chat-fab")?.addEventListener("click", () => this.toggle());
      $("chat-close")?.addEventListener("click", () => this.close());
      const input = $("chat-input");
      const sendBtn = $("chat-send");
      const handleSend = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        this.sendMessage(text);
      };
      sendBtn?.addEventListener("click", handleSend);
      input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSend();
      });
    },
    toggle() {
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        $("chat-panel")?.classList.add("open");
        $("chat-fab")?.classList.add("hidden");
        $("chat-input")?.focus();
      } else {
        this.close();
      }
    },
    close() {
      this.isOpen = false;
      $("chat-panel")?.classList.remove("open");
      $("chat-fab")?.classList.remove("hidden");
    },
    addSystemMessage(text) {
      this.history.push({ role: "model", parts: [{ text }] });
      this._renderMessages();
    },
    addUserMessage(text) {
      this.history.push({ role: "user", parts: [{ text }] });
      this._renderMessages();
    },
    _renderMessages() {
      const container = $("chat-messages");
      if (!container) return;
      container.innerHTML = this.history.map((msg) => {
        const isUser = msg.role === "user";
        const formattedText = msg.parts[0].text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
        return `
        <div class="chat-message ${isUser ? "user" : "bot"}">
          <div class="chat-bubble neu-card">
            ${formattedText}
          </div>
        </div>
      `;
      }).join("");
      container.scrollTop = container.scrollHeight;
    },
    async sendMessage(text) {
      this.addUserMessage(text);
      const apiKey = CONFIG.GEMINI_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        setTimeout(() => {
          this.addSystemMessage("\u26A0\uFE0F **API Key Required**<br>Please add a valid Google Gemini API Key in `env.js` to enable the AI Chat Assistant.");
        }, 500);
        return;
      }
      const loaderId = Date.now();
      this.history.push({ role: "model", parts: [{ text: '<div class="chat-typing">Typing<span>.</span><span>.</span><span>.</span></div>' }], _id: loaderId });
      this._renderMessages();
      try {
        const systemPrompt = `You are a helpful AI Career Advisor & GitHub Profile Analyzer.
Context about the user being analyzed:
Username: ${this.contextData?.profile?.login || "Unknown"}
Total Repos: ${this.contextData?.totalRepos || 0}
Total Commits (analyzed): ${this.contextData?.totalCommits || 0}
Top Languages: ${JSON.stringify(this.contextData?.topLanguages?.slice(0, 3) || [])}
Streak: ${this.contextData?.currentStreak || 0} days

Answer the user's question concisely based on this data. Offer actionable career advice if asked. Keep responses short and friendly. Use markdown.`;
        const messages = [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: "Understood. I will help the user based on this profile." }] },
          ...this.history.filter((m) => !m._id)
        ];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || "gemini-3.7-flash"}:generateContent`;
        let resp;
        let retries = 3;
        while (retries > 0) {
          resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": apiKey.trim()
            },
            body: JSON.stringify({
              contents: messages,
              generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
            })
          });
          if (resp.status === 503 && retries > 1) {
            retries--;
            await new Promise((r) => setTimeout(r, 2e3));
            continue;
          }
          if (!resp.ok) {
            const errorText = await resp.text();
            console.error("Gemini API Error:", resp.status, errorText);
            throw new Error("API Error: " + resp.status + " " + errorText);
          }
          break;
        }
        const data = await resp.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't process that.";
        this.history = this.history.filter((m) => m._id !== loaderId);
        this.addSystemMessage(reply);
      } catch (e) {
        this.history = this.history.filter((m) => m._id !== loaderId);
        this.addSystemMessage(`\u274C Error: ${e.message}`);
        console.error(e);
      }
    }
  };

  // js/resume.js
  var ResumeManager = {
    async generate() {
      if (!state.profile) {
        alert("Please analyze a profile first!");
        return;
      }
      let container = $("resume-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "resume-container";
        document.body.appendChild(container);
      }
      const btn = $("btn-resume");
      const originalText = btn.innerHTML;
      btn.innerHTML = "Generating...";
      btn.disabled = true;
      try {
        const summary = await this.generateSummary();
        const html = this.buildHTML(summary);
        container.innerHTML = html;
        setTimeout(() => window.print(), 500);
      } catch (err) {
        console.error(err);
        alert("Failed to generate resume.");
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    },
    async generateSummary() {
      const apiKey = CONFIG.GEMINI_API_KEY;
      if (!apiKey || !apiKey.trim() || apiKey.startsWith("AQ.")) {
        return state.profile.bio || "A passionate software developer building open-source projects.";
      }
      const prompt = `Write a professional 2-3 sentence resume summary for a developer.
Details:
- Name: ${state.profile.name || state.profile.login}
- Top Languages: ${Object.keys(state.languages).slice(0, 4).join(", ")}
- Total Repos: ${state.repos.length}
- GitHub Bio: ${state.profile.bio || "None"}
Keep it strictly professional and concise. Don't use markdown formatting like asterisks.`;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || "gemini-1.5-flash"}:generateContent?key=${apiKey.trim()}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await resp.json();
        if (data.candidates && data.candidates[0].content.parts[0].text) {
          return data.candidates[0].content.parts[0].text.trim();
        }
      } catch (e) {
        console.error("Gemini error:", e);
      }
      return state.profile.bio || "A passionate software developer building open-source projects.";
    },
    buildHTML(summary) {
      const p = state.profile;
      const topLangs = Object.keys(state.languages).slice(0, 5);
      const topRepos = state.repos.filter((r) => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 4);
      return `
      <div class="resume-paper">
        <header class="resume-header">
          <h1>${p.name || p.login}</h1>
          <div class="contact-info">
            <span>github.com/${p.login}</span>
            ${p.location ? `<span>\u2022 ${p.location}</span>` : ""}
            ${p.blog ? `<span>\u2022 ${p.blog}</span>` : ""}
          </div>
        </header>

        <section class="resume-section">
          <h2>Professional Summary</h2>
          <p>${summary}</p>
        </section>

        <section class="resume-section">
          <h2>Technical Skills</h2>
          <p><strong>Top Languages:</strong> ${topLangs.join(", ")}</p>
          <p><strong>GitHub Metrics:</strong> ${state.repos.length} Repositories, ${state.commits.length} Analyzed Commits</p>
        </section>

        <section class="resume-section">
          <h2>Featured Open Source Projects</h2>
          <div class="resume-projects">
            ${topRepos.map((repo) => `
              <div class="resume-project">
                <div class="project-title-row">
                  <h3>${repo.name}</h3>
                  <span class="project-meta">${repo.stargazers_count} Stars \u2022 ${repo.language || "N/A"}</span>
                </div>
                <p>${repo.description || "No description provided."}</p>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
    `;
    }
  };

  // js/trading-card.js
  var TradingCardManager = {
    init() {
      const btn = $("btn-trading-card");
      if (btn) {
        btn.addEventListener("click", () => this.generateCard());
      }
    },
    async generateCard() {
      if (!state.profile) {
        alert("Please analyze a profile first!");
        return;
      }
      if (typeof html2canvas === "undefined") {
        alert("html2canvas is still loading, please wait a moment and try again.");
        return;
      }
      const btn = $("btn-trading-card");
      const originalContent = btn.innerHTML;
      btn.innerHTML = "Generating...";
      btn.disabled = true;
      try {
        const card = $("tc-export-node");
        $("tc-avatar").src = state.profile.avatar_url;
        $("tc-name").textContent = state.profile.name || state.profile.login;
        $("tc-login").textContent = "@" + state.profile.login;
        const totalCommits = state.commits ? state.commits.length : 0;
        $("tc-commits").textContent = totalCommits;
        $("tc-repos").textContent = state.repos.length;
        const stars = state.repos.reduce((acc, r) => acc + r.stars, 0);
        $("tc-stars").textContent = stars;
        const activityScore = $("score-value")?.textContent || "0";
        $("tc-score").textContent = activityScore;
        let title = "Code Alchemist";
        const scoreNum = parseInt(activityScore) || 0;
        if (scoreNum > 80) title = "Grandmaster of Code";
        else if (scoreNum > 60) title = "Senior Architect";
        else if (scoreNum > 40) title = "Journeyman Developer";
        if (state.techStack.includes("React") || state.techStack.includes("Next.js")) title = "Frontend Sorcerer";
        if (state.techStack.includes("Django") || state.techStack.includes("Go Modules") || state.techStack.includes("FastAPI")) title = "Backend Warlock";
        $("tc-title-badge").textContent = title;
        let allTech = [];
        const topLangs = Object.keys(state.languages).slice(0, 3);
        allTech = [...state.techStack.slice(0, 4), ...topLangs];
        allTech = [...new Set(allTech)].slice(0, 6);
        $("tc-stack").innerHTML = allTech.map(
          (t) => `<span style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; text-align: center; display: inline-block;">${escapeHtml(t)}</span>`
        ).join("");
        card.style.display = "block";
        const canvas = await html2canvas(card, {
          backgroundColor: null,
          scale: 3,
          useCORS: true
        });
        card.style.display = "none";
        const link = document.createElement("a");
        link.download = `${state.profile.login}-trading-card.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } catch (err) {
        console.error(err);
        alert("Failed to generate trading card.");
        $("tc-export-node").style.display = "none";
      } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
      }
    }
  };

  // js/api.js
  var AppError2 = class extends Error {
    constructor(code, detail) {
      super(code);
      this.code = code;
      this.detail = detail;
    }
  };
  var ApiClient = {
    _headers() {
      const token = CONFIG.GITHUB_TOKEN;
      const h = { Accept: "application/vnd.github+json" };
      if (token && token.trim()) {
        h["Authorization"] = `Bearer ${token.trim()}`;
      }
      return h;
    },
    async get(path) {
      const url = path.startsWith("http") ? path : `${CONFIG.GITHUB_API}${path}`;
      const cached = Storage.getCached(url);
      if (cached) return cached;
      let resp;
      try {
        resp = await fetch(url, { headers: this._headers() });
      } catch (networkErr) {
        throw new AppError2("network_error", networkErr.message);
      }
      if (resp.status === 404) throw new AppError2("not_found");
      if (resp.status === 401) throw new AppError2("invalid_token");
      if (resp.status === 403) throw new AppError2("rate_limit");
      if (!resp.ok) throw new AppError2("api_error", resp.status);
      const data = await resp.json();
      Storage.setCache(url, data);
      return data;
    },
    async getPages(path, maxPages = 3, perPage = 100) {
      const results = [];
      for (let page = 1; page <= maxPages; page++) {
        const sep = path.includes("?") ? "&" : "?";
        const data = await this.get(`${path}${sep}per_page=${perPage}&page=${page}`);
        if (Array.isArray(data)) {
          results.push(...data);
          if (data.length < perPage) break;
        } else {
          break;
        }
      }
      return results;
    },
    async graphql(query, variables = {}) {
      const url = "https://api.github.com/graphql";
      let resp;
      try {
        resp = await fetch(url, {
          method: "POST",
          headers: this._headers(),
          body: JSON.stringify({ query, variables })
        });
      } catch (networkErr) {
        throw new AppError2("network_error", networkErr.message);
      }
      if (resp.status === 401) throw new AppError2("invalid_token");
      if (resp.status === 403) throw new AppError2("rate_limit");
      if (!resp.ok) throw new AppError2("api_error", resp.status);
      const data = await resp.json();
      if (data.errors) {
        console.error("GraphQL Errors:", data.errors);
        throw new AppError2("api_error", data.errors[0].message);
      }
      return data.data;
    }
  };
  var InsightsEngine = {
    async analyze(analysisData) {
      const apiKey = CONFIG.GEMINI_API_KEY;
      if (!apiKey || !apiKey.trim() || apiKey.startsWith("AQ.")) {
        return this._fallbackInsights(analysisData);
      }
      const prompt = this._buildPrompt(analysisData);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || "gemini-3.7-flash"}:generateContent?key=${apiKey.trim()}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: 1200 }
      };
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return this._parseResponse(text, analysisData);
      } catch (e) {
        console.warn("Gemini API unavailable, using local insights generator:", e);
        return this._fallbackInsights(analysisData);
      }
    },
    async generateJobs(state2) {
      const apiKey = CONFIG.GEMINI_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        return [
          { title: "Frontend Developer", match: "85%", reason: "Solid experience with web technologies." },
          { title: "Backend Engineer", match: "80%", reason: "Experience building server-side applications." },
          { title: "Full Stack Developer", match: "90%", reason: "Balanced contributions across the stack." }
        ];
      }
      const langNames = Object.keys(state2.languages || {}).slice(0, 5).join(", ");
      const stack = (state2.techStack || []).join(", ");
      const loc = state2.profile?.location || "Remote";
      const repos = state2.profile?.public_repos || 0;
      const isSenior = repos > 30 ? "Senior" : repos > 10 ? "Mid-level" : "Junior";
      const prompt = `Based on the following developer profile, suggest exactly 3 specific job titles or roles they are highly suited for. 
Consider their experience level as roughly "${isSenior}" based on their public activity (${repos} public repos).
CRITICAL: The job titles MUST explicitly include their specific detected technologies (e.g. if they have React and Node.js, suggest "Senior React Developer" or "Node.js Backend Engineer").
Keep the titles concise and professional.

Profile Location: ${loc}
Top Languages: ${langNames}
Detected Frameworks/Tools: ${stack}

Return ONLY a JSON array of objects, with no markdown formatting or extra text. Each object must have:
- "title": The specific job title
- "match": A realistic match percentage string (e.g. "95%")
- "reason": A short 1-sentence explanation of why they fit this role based on their tech stack.

Example:
[{"title": "Senior React Developer", "match": "98%", "reason": "Your extensive use of React and Tailwind makes you a perfect fit."}]`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || "gemini-3.7-flash"}:generateContent?key=${apiKey.trim()}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 200 }
      };
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const clean = text.replace(/```json?/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
        return [{ title: "Software Engineer", match: "80%", reason: "General software development experience." }];
      } catch (e) {
        console.warn("Job generation failed:", e);
        return [{ title: "Software Engineer", match: "80%", reason: "General software development experience." }];
      }
    },
    async generateRepoRanking(reposSubset) {
      const apiKey = CONFIG.GEMINI_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        return reposSubset.slice(0, 3).map((r) => ({
          repo: r.name,
          tier: "A",
          analysis: `Solid ${r.language || "code"} repository with ${r.stargazers_count} stars.`
        }));
      }
      const repoData = reposSubset.map((r) => ({
        name: r.name,
        language: r.language,
        stars: r.stargazers_count,
        sizeKB: Math.round(r.size || 0),
        forks: r.forks_count,
        updated_at: r.updated_at
      }));
      const prompt = `You are a Senior Staff Engineer analyzing a developer's GitHub repositories. 
Evaluate the following top repositories based on their metrics (stars, size, language, updates) and assign a codebase Tier ranking (S, A, B, or C) to each.
- S-Tier: Highly impactful, large, popular, or extremely active.
- A-Tier: Solid projects, good size or decent stars.
- B-Tier: Standard projects, smaller size.
- C-Tier: Minor scripts or inactive forks.

Repositories Data:
${JSON.stringify(repoData, null, 2)}

Return ONLY a JSON array of objects. Each object MUST have:
- "repo": The exact repository name.
- "tier": The assigned tier ("S", "A", "B", or "C").
- "analysis": A 1-2 sentence technical analysis justifying the tier based on the provided metrics.

Example:
[{"repo": "my-cool-app", "tier": "A", "analysis": "A solid React codebase with good community engagement (15 stars) and active updates."}]`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || "gemini-3.7-flash"}:generateContent?key=${apiKey.trim()}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, topP: 0.8, maxOutputTokens: 500 }
      };
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const clean = text.replace(/```json?/gi, "").replace(/```/g, "").trim();
        return JSON.parse(clean);
      } catch (e) {
        console.warn("Repo ranking failed:", e);
        return reposSubset.slice(0, 3).map((r) => ({
          repo: r.name,
          tier: "B",
          analysis: "Unable to generate AI ranking. Standard repository."
        }));
      }
    },
    _buildPrompt(d) {
      return `You are a GitHub developer activity analyzer.
Analyze ONLY the measurable GitHub metrics below. Return a valid JSON array of 7 insight objects.

Metrics:
${JSON.stringify(d, null, 2)}

Required Schema:
[
  {
    "id": "consistency|momentum|tech_focus|repo_health|open_source|pattern|career_advice",
    "title": "Short Title",
    "body": "1-2 sentence evidence-based factual summary. For career_advice, provide 1 actionable career tip based on their tech stack.",
    "chips": ["Metric 1", "Metric 2"]
  }
]

Return ONLY raw JSON. No markdown backticks.`;
    },
    _parseResponse(text, fallbackData) {
      try {
        const clean = text.replace(/```json?/gi, "").replace(/```/g, "").trim();
        const arr = JSON.parse(clean);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch (_) {
      }
      return this._fallbackInsights(fallbackData);
    },
    _fallbackInsights(d) {
      const {
        totalCommits,
        currentStreak,
        longestStreak,
        topLanguages,
        totalRepos,
        totalStars,
        activeDays,
        recentCommits90,
        activityScore
      } = d;
      const topLangName = topLanguages && topLanguages.length > 0 ? topLanguages[0].name : "various languages";
      const topLangPct = topLanguages && topLanguages.length > 0 ? `${topLanguages[0].pct.toFixed(0)}%` : "";
      return [
        {
          id: "consistency",
          title: "Activity Consistency",
          body: activeDays > 0 ? `Recorded active contributions across ${activeDays} unique days with a peak streak of ${longestStreak} continuous days. ${currentStreak > 0 ? `Currently maintaining an active streak of ${currentStreak} days.` : "No current active streak."}` : "Profile shows periodic project releases with limited recorded public commit timestamps.",
          chips: [`${activeDays || 0} active days`, `${longestStreak || 0}d longest streak`]
        },
        {
          id: "momentum",
          title: "Recent Momentum",
          body: recentCommits90 > 0 ? `${recentCommits90} commits logged over the past 90 days, demonstrating steady development velocity.` : "Low commit activity detected within the last 90-day window on analyzed repositories.",
          chips: [`${recentCommits90 || 0} commits (90d)`]
        },
        {
          id: "tech_focus",
          title: "Technology Stack",
          body: topLanguages && topLanguages.length > 0 ? `Primary focus is ${topLangName}${topLangPct ? ` (${topLangPct} of tracked code)` : ""}. ${topLanguages.length > 1 ? `Also actively develops with ${topLanguages.slice(1, 3).map((l) => l.name).join(" and ")}.` : ""}` : "Repository languages span multiple domains and tooling.",
          chips: topLanguages && topLanguages.length > 0 ? topLanguages.slice(0, 3).map((l) => `${l.name} ${l.pct.toFixed(0)}%`) : ["Polyglot"]
        },
        {
          id: "repo_health",
          title: "Repository Portfolio",
          body: `Maintains ${totalRepos} public repositories with ${totalStars} total stargazers and ${totalCommits} analyzed commit records.`,
          chips: [`${totalRepos} repos`, `${totalStars} stars`, `${totalCommits} commits`]
        },
        {
          id: "open_source",
          title: "Community Recognition",
          body: totalStars > 0 ? `Public projects have gathered ${totalStars} stars across open repositories, reflecting community usage and interest.` : "Public repositories are available for exploration and collaboration on GitHub.",
          chips: [`${totalStars} stars`, `Score: ${activityScore}/100`]
        },
        {
          id: "pattern",
          title: "Development Cadence",
          body: totalCommits > 0 ? `Activity indicates ${currentStreak > 5 ? "a daily active" : activeDays > 20 ? "a regular weekly" : "a milestone-based"} workflow across the analyzed repository portfolio.` : "Activity follows episodic releases and project updates.",
          chips: [`${topLanguages ? topLanguages.length : 0} languages`, `${totalRepos} repos`]
        },
        {
          id: "career_advice",
          title: "Career & Growth",
          body: topLanguages && topLanguages.length > 0 ? `Consider contributing to major open-source projects in ${topLangName} to expand your portfolio. Exploring related frameworks can also boost your profile's visibility.` : "Start building a consistent contribution history by pushing small, regular updates to public repositories.",
          chips: ["Growth Tip"]
        }
      ];
    }
  };

  // js/jobs.js
  var JobsManager = {
    async runJobMatcher() {
      const container = $("career-matcher-container");
      const list = $("career-roles-list");
      if (!container || !list || !state.profile) return;
      container.style.display = "block";
      list.innerHTML = `
      <div style="text-align: center; opacity: 0.6; padding: 20px;">
        <div class="insight-spinner" aria-hidden="true" style="margin: 0 auto 10px;"></div>
        Analyzing profile and finding best matches...
      </div>
    `;
      try {
        const roles = await InsightsEngine.generateJobs(state);
        if (!roles || roles.length === 0) {
          list.innerHTML = `<div style="text-align: center; opacity: 0.6; padding: 10px;">No specific matches found. Keep building!</div>`;
          return;
        }
        let loc = state.profile.location || "Remote";
        list.innerHTML = roles.map((roleObj) => {
          const title = roleObj.title || roleObj;
          const match = roleObj.match || "High Match";
          const reason = roleObj.reason || "";
          const query = encodeURIComponent(`${title} jobs in ${loc}`);
          const linkedInQuery = encodeURIComponent(title);
          const linkedInLoc = encodeURIComponent(loc);
          return `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; flex-direction: column; max-width: 65%;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 600; font-size: 1.05rem;">${escapeHtml(title)}</span>
                <span style="font-size: 0.7rem; background: rgba(56, 201, 122, 0.2); color: #38c97a; padding: 2px 6px; border-radius: 4px;">${escapeHtml(match)}</span>
              </div>
              <span style="font-size: 0.8rem; opacity: 0.7; margin-top: 2px;">\u{1F4CD} ${escapeHtml(loc)} / Remote</span>
              ${reason ? `<span style="font-size: 0.75rem; opacity: 0.8; margin-top: 6px; font-style: italic;">${escapeHtml(reason)}</span>` : ""}
            </div>
            <div style="display: flex; gap: 8px;">
              <a href="https://www.google.com/search?q=${query}&ibp=htl;jobs" target="_blank" rel="noopener noreferrer" style="background: white; color: #1a1a1a; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                Google Jobs
              </a>
              <a href="https://www.linkedin.com/jobs/search/?keywords=${linkedInQuery}&location=${linkedInLoc}" target="_blank" rel="noopener noreferrer" style="background: #0a66c2; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </a>
            </div>
          </div>
        `;
        }).join("");
      } catch (err) {
        console.error(err);
        list.innerHTML = `<div style="text-align: center; opacity: 0.6; padding: 10px; color: #ff6b81;">Failed to generate career matches. Please try again later.</div>`;
      }
    }
  };

  // js/career.js
  var CareerMatcher = {
    // Database of roles with matching criteria, skill requirements, and project ideas
    ROLES_CATALOG: [
      {
        id: "frontend-intern",
        title: "Frontend Developer Intern",
        type: "Internship",
        category: "Frontend & Web",
        primaryLangs: ["JavaScript", "TypeScript", "HTML", "CSS", "Vue", "Svelte"],
        keywords: ["react", "next.js", "vue", "tailwind", "redux", "vite", "webpack", "frontend", "ui", "css", "sass"],
        baseMatch: 75,
        skillsPossessed: ["HTML5 & CSS3", "JavaScript / ES6+", "Modern UI Design"],
        skillsToLearn: ["TypeScript", "Tailwind CSS", "Testing (Jest/Cypress)", "Web Performance"],
        description: "Build interactive, responsive web interfaces, collaborate with design teams, and optimize client-side performance.",
        projectIdeas: [
          "Interactive SaaS Dashboard with dark mode, live charts, and component library",
          "Real-time Collaborative Whiteboard or Canvas tool using WebSockets"
        ],
        searchKeywords: "Frontend Developer Internship"
      },
      {
        id: "junior-frontend-dev",
        title: "Junior Frontend Engineer",
        type: "Junior / Entry-Level",
        category: "Frontend & Web",
        primaryLangs: ["TypeScript", "JavaScript", "HTML", "CSS"],
        keywords: ["react", "next.js", "typescript", "tailwind", "graphql", "zustand"],
        baseMatch: 70,
        skillsPossessed: ["JavaScript / TypeScript", "Component Architecture", "State Management"],
        skillsToLearn: ["Next.js / SSR", "GraphQL / REST Integration", "CI/CD & Accessibility (a11y)"],
        description: "Develop production-grade user-facing features, maintain clean component hierarchies, and integrate REST/GraphQL APIs.",
        projectIdeas: [
          "Full-featured E-Commerce Store with cart, Stripe checkout, and SSR with Next.js",
          "Developer Tooling Web App with markdown rendering and GitHub OAuth"
        ],
        searchKeywords: "Junior Frontend Engineer"
      },
      {
        id: "backend-python-intern",
        title: "Backend Engineering Intern (Python)",
        type: "Internship",
        category: "Backend & APIs",
        primaryLangs: ["Python"],
        keywords: ["django", "fastapi", "flask", "sqlalchemy", "postgresql", "api", "backend", "redis"],
        baseMatch: 80,
        skillsPossessed: ["Python 3", "REST API Design", "Data Modeling"],
        skillsToLearn: ["FastAPI / AsyncIO", "PostgreSQL & ORM", "Docker & Containerization", "Redis Caching"],
        description: "Design and deploy scalable RESTful APIs, manage databases, and write efficient backend services.",
        projectIdeas: [
          "High-performance REST API with FastAPI, JWT authentication, and rate limiting",
          "Task Queue & Background Worker service with Celery and Redis"
        ],
        searchKeywords: "Python Backend Developer Internship"
      },
      {
        id: "fullstack-intern",
        title: "Full-Stack Developer Intern",
        type: "Internship",
        category: "Full-Stack",
        primaryLangs: ["JavaScript", "TypeScript", "Python", "PHP", "Ruby", "Java"],
        keywords: ["node.js", "express", "react", "next.js", "django", "mongodb", "postgresql", "fullstack"],
        baseMatch: 78,
        skillsPossessed: ["Client & Server Architecture", "Database Integration", "API Development"],
        skillsToLearn: ["Docker Containers", "Cloud Deployment (AWS/Vercel)", "Automated Unit/E2E Testing"],
        description: "Work across both the client-side interface and server-side business logic, shipping complete end-to-end features.",
        projectIdeas: [
          "Full-stack Project Management Tool with drag-and-drop Kanban and real-time updates",
          "Multi-tenant Blogging Platform with markdown editor and image storage"
        ],
        searchKeywords: "Full Stack Developer Internship"
      },
      {
        id: "junior-fullstack-dev",
        title: "Junior Full-Stack Engineer",
        type: "Junior / Entry-Level",
        category: "Full-Stack",
        primaryLangs: ["TypeScript", "JavaScript", "Python", "Go"],
        keywords: ["next.js", "react", "node.js", "postgresql", "prisma", "docker"],
        baseMatch: 72,
        skillsPossessed: ["Full-Stack TypeScript / Node", "SQL Databases", "Authentication & Security"],
        skillsToLearn: ["Microservices / Monorepo architecture", "Docker & Kubernetes", "System Design Basics"],
        description: "Ship scalable full-stack applications with robust backend services, databases, and polished frontends.",
        projectIdeas: [
          "AI-Powered Code Assistant Web App with OAuth, streaming responses, and billing",
          "Real-time Analytics Engine with dashboard and high-throughput ingestion endpoint"
        ],
        searchKeywords: "Junior Full Stack Engineer"
      },
      {
        id: "ai-ml-intern",
        title: "AI / Machine Learning Intern",
        type: "Internship",
        category: "AI & Data Science",
        primaryLangs: ["Python", "R", "C++", "Julia"],
        keywords: ["tensorflow", "pytorch", "scikit-learn", "pandas", "numpy", "opencv", "nlp", "llm", "machine learning", "deep learning"],
        baseMatch: 82,
        skillsPossessed: ["Python Scientific Stack (NumPy/Pandas)", "Model Training & Evaluation", "Data Cleaning"],
        skillsToLearn: ["PyTorch / HuggingFace Transformers", "Vector Databases (Chroma/Pinecone)", "MLOps & Model Deployment"],
        description: "Train, evaluate, and fine-tune machine learning and NLP models, clean complex datasets, and build intelligent features.",
        projectIdeas: [
          "RAG (Retrieval-Augmented Generation) Document Search engine using LangChain and Vector DB",
          "Computer Vision Object Detection / Image Classifier deployed as a web service"
        ],
        searchKeywords: "Machine Learning Intern"
      },
      {
        id: "data-analytics-intern",
        title: "Data Analyst / Data Engineer Intern",
        type: "Internship",
        category: "AI & Data Science",
        primaryLangs: ["Python", "R", "SQL", "Julia"],
        keywords: ["pandas", "numpy", "matplotlib", "seaborn", "sql", "tableau", "spark", "etl"],
        baseMatch: 76,
        skillsPossessed: ["Data Wrangling & Analysis", "SQL Querying", "Data Visualization"],
        skillsToLearn: ["ETL Pipeline Orchestration", "dbt / Apache Spark", "Cloud Data Warehouses (BigQuery/Snowflake)"],
        description: "Extract insights from complex datasets, build automated ETL data pipelines, and design business intelligence dashboards.",
        projectIdeas: [
          "Automated GitHub Trends ETL Pipeline and interactive visualization dashboard",
          "Predictive Customer Churn / Financial Analysis with interactive Streamlit app"
        ],
        searchKeywords: "Data Analyst Internship"
      },
      {
        id: "mobile-dev-intern",
        title: "Mobile App Developer Intern (iOS/Android/Flutter)",
        type: "Internship",
        category: "Mobile Development",
        primaryLangs: ["Dart", "Kotlin", "Swift", "Java", "JavaScript", "TypeScript"],
        keywords: ["flutter", "react native", "android", "ios", "swiftui", "jetpack compose"],
        baseMatch: 80,
        skillsPossessed: ["Mobile UI Development", "State Management", "REST API Consumption"],
        skillsToLearn: ["Offline-First Storage / SQLite", "Native Platform APIs & Notifications", "App Store / Play Store Deployment"],
        description: "Build fluid, cross-platform or native mobile applications with responsive layouts and offline sync.",
        projectIdeas: [
          "Habit Tracker & Productivity Mobile App with local SQLite and push notifications",
          "Social Fitness / Workout Tracking App with camera integration and cloud backup"
        ],
        searchKeywords: "Mobile App Developer Internship"
      },
      {
        id: "backend-go-rust-intern",
        title: "Systems & Backend Intern (Go / Rust / C++)",
        type: "Internship",
        category: "Systems & Cloud",
        primaryLangs: ["Go", "Rust", "C++", "C"],
        keywords: ["goroutines", "concurrency", "grpc", "tokio", "memory management", "systems", "microservices"],
        baseMatch: 84,
        skillsPossessed: ["Strong Type Systems", "Concurrency & Multithreading", "Memory Efficiency"],
        skillsToLearn: ["gRPC & Protocol Buffers", "High-throughput Networking", "Distributed Systems Patterns"],
        description: "Build blazing-fast, low-latency microservices, CLI tools, and network daemons with strict memory and CPU budgets.",
        projectIdeas: [
          "Custom In-Memory Key-Value Database with custom wire protocol (like Redis)",
          "High-Throughput Reverse Proxy / Load Balancer with health checks"
        ],
        searchKeywords: "Go Backend Developer Internship"
      },
      {
        id: "devops-cloud-intern",
        title: "DevOps & Cloud Infrastructure Intern",
        type: "Internship",
        category: "Systems & Cloud",
        primaryLangs: ["Shell", "Python", "Go", "HCL", "Dockerfile"],
        keywords: ["docker", "kubernetes", "aws", "terraform", "ci/cd", "github actions", "linux", "bash"],
        baseMatch: 75,
        skillsPossessed: ["Linux & Bash Scripting", "Git & GitHub Actions", "Containerization (Docker)"],
        skillsToLearn: ["Kubernetes Orchestration", "Terraform (IaC)", "Prometheus & Grafana Monitoring"],
        description: "Automate deployment pipelines, orchestrate containerized workloads, and ensure high availability and security of cloud infrastructure.",
        projectIdeas: [
          "Automated Multi-Stage CI/CD Pipeline deploying microservices to Kubernetes",
          "Infrastructure as Code (Terraform) blueprint provisioning complete AWS VPC with monitoring"
        ],
        searchKeywords: "DevOps Cloud Intern"
      },
      {
        id: "java-backend-intern",
        title: "Java / Enterprise Backend Intern",
        type: "Internship",
        category: "Backend & APIs",
        primaryLangs: ["Java", "Kotlin", "C#"],
        keywords: ["spring boot", "spring", "hibernate", "maven", "gradle", ".net", "asp.net"],
        baseMatch: 78,
        skillsPossessed: ["Object-Oriented Design", "Java / Spring Framework", "Relational Databases"],
        skillsToLearn: ["Spring Security & JWT", "Microservices with Spring Cloud", "Kafka Message Queues"],
        description: "Build enterprise-grade REST APIs, maintain business logic, and handle large-scale database operations.",
        projectIdeas: [
          "Banking / Payment Gateway Simulation API with Spring Boot and PostgreSQL",
          "Event-driven Order Processing System with Apache Kafka and Spring Boot"
        ],
        searchKeywords: "Java Spring Boot Internship"
      },
      {
        id: "open-source-fellow",
        title: "Open Source Software Engineering Fellow",
        type: "Fellowship / Remote",
        category: "Open Source",
        primaryLangs: ["JavaScript", "TypeScript", "Python", "Rust", "Go", "C++", "Java"],
        keywords: ["git", "github", "open source", "documentation", "testing"],
        baseMatch: 70,
        skillsPossessed: ["Git Version Control", "Code Review & Collaboration", "Public Documentation"],
        skillsToLearn: ["Large Codebase Navigation", "Upstream Patching & RFCs", "Community Issue Triage"],
        description: "Contribute to global open-source ecosystems, resolve community bug reports, and architect modular software libraries.",
        projectIdeas: [
          "Published Open-Source NPM/PyPI Utility Library with 100% test coverage and automated releases",
          "Contribution record with 3+ merged Pull Requests to major open-source repositories"
        ],
        searchKeywords: "Open Source Software Fellowship"
      }
    ],
    // Main career analysis engine
    analyzeCareer(profileData) {
      const { profile, repos, langStats, commits, streaks, techStack = [] } = profileData;
      const topLangs = (langStats || []).map((l) => l.name);
      const topLangNamesLower = topLangs.map((l) => l.toLowerCase());
      const topLangPcts = {};
      (langStats || []).forEach((l) => {
        topLangPcts[l.name] = l.pct;
      });
      const repoCorpus = (repos || []).map((r) => `${r.name} ${r.description || ""}`).join(" ").toLowerCase();
      const techStackLower = (techStack || []).map((t) => t.toLowerCase());
      const matchedRoles = this.ROLES_CATALOG.map((role) => {
        let score = 0;
        let matchedReasons = [];
        let langWeight = 0;
        role.primaryLangs.forEach((lang) => {
          if (topLangs.includes(lang)) {
            const pct = topLangPcts[lang] || 0;
            langWeight += pct / 100 * 45;
            matchedReasons.push(`Strong code footprint in **${lang}** (${pct.toFixed(0)}%)`);
          }
        });
        score += Math.min(langWeight, 50);
        let keywordHits = 0;
        role.keywords.forEach((kw) => {
          if (repoCorpus.includes(kw) || techStackLower.includes(kw)) {
            keywordHits++;
          }
        });
        const kwScore = Math.min(keywordHits * 7, 30);
        score += kwScore;
        if (keywordHits > 0) {
          matchedReasons.push(`Detected related repositories and tooling matching **${role.category}**`);
        }
        const repoCount = repos ? repos.length : 0;
        const commitCount = commits ? commits.length : 0;
        if (repoCount >= 5) score += 5;
        if (repoCount >= 15) score += 5;
        if (commitCount >= 30) score += 5;
        if (streaks && streaks.totalActive >= 10) score += 5;
        const hasLangMatch = role.primaryLangs.some((l) => topLangs.includes(l));
        if (hasLangMatch && score < 60) {
          score = 60 + Math.floor(Math.random() * 15);
        } else if (!hasLangMatch) {
          score = Math.max(25, Math.min(score, 55));
        }
        const finalMatchPct = Math.min(Math.round(score), 98);
        return {
          ...role,
          matchPct: finalMatchPct,
          reasons: matchedReasons.length > 0 ? matchedReasons : [`Compatible with your polyglot developer foundations.`],
          links: {
            linkedin: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role.searchKeywords)}`,
            indeed: `https://www.indeed.com/jobs?q=${encodeURIComponent(role.searchKeywords)}`,
            wellfound: `https://wellfound.com/jobs?query=${encodeURIComponent(role.searchKeywords)}`,
            google: `https://www.google.com/search?q=${encodeURIComponent(role.searchKeywords + " jobs")}`
          }
        };
      });
      matchedRoles.sort((a, b) => b.matchPct - a.matchPct);
      const archetype = this._calculateArchetype(topLangs, techStackLower, repos);
      const readiness = this._calculateReadiness(profile, repos, commits, streaks, (langStats || []).length);
      return {
        archetype,
        readiness,
        topLanguages: topLangs.slice(0, 4),
        matchedRoles,
        topMatchedRole: matchedRoles[0],
        totalRolesAnalyzed: this.ROLES_CATALOG.length
      };
    },
    _calculateArchetype(topLangs, techStack, repos) {
      const langs = topLangs.map((l) => l.toLowerCase());
      if (langs.includes("python") && (langs.includes("r") || techStack.includes("tensorflow") || techStack.includes("pytorch") || techStack.includes("pandas"))) {
        return {
          title: "AI & Data Science Specialist",
          tagline: "Excels at building intelligent algorithms, analyzing large datasets, and deploying machine learning models.",
          badge: "\u{1F916} AI / ML Domain",
          color: "#9f7aea"
        };
      }
      if ((langs.includes("javascript") || langs.includes("typescript")) && (langs.includes("html") || techStack.includes("react") || techStack.includes("vue") || techStack.includes("next.js"))) {
        if (langs.includes("python") || langs.includes("go") || langs.includes("java") || techStack.includes("node.js")) {
          return {
            title: "Full-Stack Web Architect",
            tagline: "Versatile across modern frontend user experiences and scalable server-side REST APIs.",
            badge: "\u26A1 Full-Stack Domain",
            color: "#5b6af0"
          };
        }
        return {
          title: "Frontend UI/UX Specialist",
          tagline: "Focuses on craft, fluid user interactions, component architectures, and responsive design systems.",
          badge: "\u{1F3A8} Frontend Domain",
          color: "#38c97a"
        };
      }
      if (langs.includes("go") || langs.includes("rust") || langs.includes("c++") || langs.includes("c")) {
        return {
          title: "Systems & Performance Engineer",
          tagline: "Specializes in high-throughput backends, memory-safe code, and low-latency infrastructure.",
          badge: "\u2699\uFE0F Systems Domain",
          color: "#f79824"
        };
      }
      if (langs.includes("dart") || langs.includes("kotlin") || langs.includes("swift")) {
        return {
          title: "Mobile Application Creator",
          tagline: "Passionate about mobile ecosystems, touch-first ergonomics, and cross-platform native apps.",
          badge: "\u{1F4F1} Mobile Domain",
          color: "#ed64a6"
        };
      }
      if (langs.length >= 3) {
        return {
          title: "Polyglot Software Engineer",
          tagline: "Adaptable problem-solver proficient across multiple programming paradigms and runtimes.",
          badge: "\u{1F310} Polyglot Domain",
          color: "#38b2ac"
        };
      }
      return {
        title: "Software Engineering Explorer",
        tagline: "Building versatile software foundations and actively expanding repository portfolio.",
        badge: "\u{1F680} Core Engineering",
        color: "#5b6af0"
      };
    },
    _calculateReadiness(profile, repos, commits, streaks, langCount) {
      const repoCount = (repos || []).length;
      const commitCount = (commits || []).length;
      const totalStars = (repos || []).reduce((acc, r) => acc + (r.stars || 0), 0);
      const activeDays = streaks ? streaks.totalActive : 0;
      let score = 40;
      if (repoCount >= 3) score += 10;
      if (repoCount >= 8) score += 10;
      if (commitCount >= 20) score += 10;
      if (commitCount >= 60) score += 10;
      if (activeDays >= 10) score += 10;
      if (totalStars >= 5) score += 5;
      if (langCount >= 2) score += 5;
      score = Math.min(score, 100);
      let level = "Internship Ready";
      let badgeClass = "readiness-intern";
      let desc = "You have active code projects and core language foundations ready to secure competitive software internships.";
      if (score >= 85) {
        level = "Junior / Associate Engineer Ready";
        badgeClass = "readiness-junior";
        desc = "Your GitHub portfolio demonstrates substantial project variety, strong version control cadence, and production readiness.";
      } else if (score >= 65) {
        level = "Strong Internship & Project Candidate";
        badgeClass = "readiness-strong";
        desc = "Solid repository base and consistent commits. Adding 1-2 featured full-stack projects will elevate your recruiter callback rate.";
      }
      return { score, level, badgeClass, desc };
    },
    // Generates an AI Job Application & Interview Prep Strategy
    async generateAiCareerStrategy(role, profileData) {
      const apiKey = CONFIG.GEMINI_API_KEY;
      const { profile, langStats, repos } = profileData;
      const username = profile?.login || "Developer";
      const topLangs = (langStats || []).slice(0, 3).map((l) => l.name).join(", ");
      const topRepos = (repos || []).slice(0, 3).map((r) => r.name).join(", ");
      if (!apiKey || !apiKey.trim()) {
        return this._fallbackStrategy(role, username, topLangs, topRepos);
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;
      const prompt = `You are an elite Tech Career Coach and Hiring Manager.
Provide a hyper-tailored job application and interview preparation blueprint for developer @${username} targeting the role: "${role.title}".
Their top languages are: ${topLangs}.
Their top repositories are: ${topRepos}.

Return a JSON object with this EXACT structure (no markdown fences, just pure JSON):
{
  "elevatorPitch": "A punchy, 2-sentence introduction for recruiters highlighting their exact GitHub experience.",
  "resumeBulletPoints": [
    "Action-driven resume bullet point incorporating one of their repositories",
    "Second strong bullet point emphasizing technical problem-solving and scalability"
  ],
  "interviewQuestions": [
    { "q": "Technical interview question tailored to this role and their tech stack", "tip": "How they should answer using their GitHub projects as proof" },
    { "q": "Second behavioral or system question", "tip": "Strategic answer tip" }
  ],
  "breakthroughAction": "The single most impactful project or skill addition they should make this week."
}`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
          })
        });
        if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const clean = text.replace(/```json?/gi, "").replace(/```/g, "").trim();
        return JSON.parse(clean);
      } catch (err) {
        console.warn("Using fallback career strategy:", err);
        return this._fallbackStrategy(role, username, topLangs, topRepos);
      }
    },
    _fallbackStrategy(role, username, topLangs, topRepos) {
      return {
        elevatorPitch: `Passionate developer proficient in ${topLangs || "modern software technologies"}, with demonstrated practical experience building public projects such as ${topRepos || "featured GitHub repositories"}. Ready to deliver immediate impact as a ${role.title}.`,
        resumeBulletPoints: [
          `Architected and deployed open-source projects using ${topLangs || "modern software stack"}, implementing clean modular architecture and responsive state management.`,
          `Maintained active Git version control workflows, implementing RESTful API integrations and optimized algorithms across ${topRepos || "core repositories"}.`
        ],
        interviewQuestions: [
          {
            q: `How have you structured your projects in ${topLangs.split(",")[0] || "your primary language"} to ensure clean maintainability?`,
            tip: `Reference one of your top repositories (${topRepos.split(",")[0] || "your main repo"}), explain the folder structure, component/service separation, and how you handled error states.`
          },
          {
            q: `Describe a technical hurdle you encountered while building your GitHub projects and how you debugged it.`,
            tip: `Use the STAR method (Situation, Task, Action, Result) focusing on your debugging strategy and metrics improvement.`
          }
        ],
        breakthroughAction: `Build and deploy the recommended portfolio project: "${role.projectIdeas[0]}" with live demo link and comprehensive README to stand out immediately to recruiters.`
      };
    }
  };

  // js/ranking.js
  var RankingManager = {
    async runRankingAnalysis() {
      const container = $("repo-ranking-container");
      const list = $("repo-ranking-list");
      if (!container || !list || !state.repos || state.repos.length === 0) return;
      container.style.display = "block";
      const sortedRepos = [...state.repos].sort((a, b) => {
        const scoreA = a.stargazers_count * 10 + a.forks_count * 5 + a.size / 1e3;
        const scoreB = b.stargazers_count * 10 + b.forks_count * 5 + b.size / 1e3;
        return scoreB - scoreA;
      }).slice(0, 10);
      list.innerHTML = `
      <div style="text-align: center; opacity: 0.6; padding: 20px;">
        <div class="insight-spinner" aria-hidden="true" style="margin: 0 auto 10px;"></div>
        Scanning repositories and analyzing codebase impact...
      </div>
    `;
      try {
        const rankings = await InsightsEngine.generateRepoRanking(sortedRepos);
        if (!rankings || rankings.length === 0) {
          list.innerHTML = `<div style="text-align: center; opacity: 0.6; padding: 10px;">Not enough repository data for ranking.</div>`;
          return;
        }
        const getTierColor = (tier) => {
          switch (tier.toUpperCase()) {
            case "S":
              return "background: linear-gradient(135deg, #FFD700, #FFA500); color: #000;";
            // Gold
            case "A":
              return "background: linear-gradient(135deg, #00C9FF, #92FE9D); color: #000;";
            // Cyan/Green
            case "B":
              return "background: linear-gradient(135deg, #8E2DE2, #4A00E0); color: #fff;";
            // Purple
            case "C":
              return "background: linear-gradient(135deg, #3a3a3a, #5a5a5a); color: #fff;";
            // Gray
            default:
              return "background: #333; color: #fff;";
          }
        };
        list.innerHTML = rankings.map((r) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 12px;">
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 48px; height: 48px; border-radius: 8px; font-weight: 900; font-size: 1.5rem; ${getTierColor(r.tier)}">
            ${escapeHtml(r.tier)}
          </div>
          <div style="display: flex; flex-direction: column; flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-weight: 600; font-size: 1.1rem; color: #fff;">${escapeHtml(r.repo)}</span>
            </div>
            <p style="font-size: 0.85rem; opacity: 0.8; margin-top: 6px; line-height: 1.4;">${escapeHtml(r.analysis)}</p>
          </div>
        </div>
      `).join("");
      } catch (err) {
        console.error(err);
        list.innerHTML = `<div style="text-align: center; opacity: 0.6; padding: 10px; color: #ff6b81;">Failed to generate repository rankings. Please try again later.</div>`;
      }
    }
  };

  // js/data.js
  var DataProcessor = {
    processRepos(repos) {
      if (!Array.isArray(repos)) return [];
      return repos.map((r) => ({
        name: r.name,
        fullName: r.full_name || `${r.owner?.login || ""}/${r.name}`,
        description: r.description || "",
        language: r.language || null,
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        issues: r.open_issues_count || 0,
        updatedAt: new Date(r.pushed_at || r.updated_at),
        createdAt: new Date(r.created_at),
        url: r.html_url || `https://github.com/${r.full_name}`,
        fork: !!r.fork,
        size: r.size || 0
      }));
    },
    aggregateLanguages(langDataArray) {
      const agg = {};
      if (Array.isArray(langDataArray)) {
        for (const item of langDataArray) {
          if (!item || !item.data) continue;
          const repo = item.repo;
          for (const [lang, bytes] of Object.entries(item.data)) {
            if (typeof bytes !== "number" || bytes <= 0) continue;
            if (!agg[lang]) agg[lang] = { bytes: 0, repoCount: 0, repos: [] };
            agg[lang].bytes += bytes;
            agg[lang].repoCount++;
            if (repo) agg[lang].repos.push(repo);
          }
        }
      }
      return agg;
    },
    getLanguageStats(langMap) {
      const total = Object.values(langMap).reduce((s, v) => s + (v.bytes || 0), 0);
      return Object.entries(langMap).filter(([, info]) => info.bytes > 0).sort((a, b) => b[1].bytes - a[1].bytes).map(([name, info], i) => ({
        rank: i + 1,
        name,
        bytes: info.bytes,
        repoCount: info.repoCount,
        pct: total > 0 ? info.bytes / total * 100 : 0
      }));
    },
    parseCommits(rawCommits) {
      if (!Array.isArray(rawCommits)) return [];
      const seen = /* @__PURE__ */ new Set();
      return rawCommits.map((c) => {
        if (!c) return null;
        const dateRaw = c.commit?.author?.date || c.commit?.committer?.date || c.created_at;
        if (!dateRaw) return null;
        const d = new Date(dateRaw);
        if (isNaN(d.getTime())) return null;
        const sha = c.sha || c.id || `${d.getTime()}-${c._repo || ""}`;
        if (seen.has(sha)) return null;
        seen.add(sha);
        const dateStr = getUtcDateStr(d);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        return {
          sha,
          date: d,
          dateStr,
          hour: d.getUTCHours(),
          day: d.getUTCDay(),
          month: `${y}-${m}`,
          repo: c._repo || c.repo?.name || ""
        };
      }).filter(Boolean);
    },
    calculateStreaks(calendar) {
      if (!calendar || !calendar.weeks) {
        return { current: 0, longest: 0, totalActive: 0, longestInactive: 0, avgPerWeek: 0 };
      }
      const activeDates = [];
      calendar.weeks.forEach((w) => {
        w.contributionDays.forEach((d) => {
          if (d.contributionCount > 0) activeDates.push(d.date);
        });
      });
      const dateSets = [...new Set(activeDates)].sort();
      if (dateSets.length === 0) {
        return { current: 0, longest: 0, totalActive: 0, longestInactive: 0, avgPerWeek: 0 };
      }
      const todayStr = getUtcDateStr(/* @__PURE__ */ new Date());
      const yesterdayStr = getUtcDateStr(new Date(Date.now() - 864e5));
      const gaps = [];
      for (let i = 1; i < dateSets.length; i++) {
        const d1 = /* @__PURE__ */ new Date(dateSets[i - 1] + "T00:00:00Z");
        const d2 = /* @__PURE__ */ new Date(dateSets[i] + "T00:00:00Z");
        const gap = Math.round((d2 - d1) / 864e5);
        gaps.push(gap);
      }
      let longest = 1, cur = 1;
      for (const g of gaps) {
        cur = g === 1 ? cur + 1 : 1;
        if (cur > longest) longest = cur;
      }
      let current = 0;
      const lastDate = dateSets[dateSets.length - 1];
      if (lastDate === todayStr || lastDate === yesterdayStr) {
        current = 1;
        for (let i = dateSets.length - 2; i >= 0; i--) {
          const dNext = /* @__PURE__ */ new Date(dateSets[i + 1] + "T00:00:00Z");
          const dCur = /* @__PURE__ */ new Date(dateSets[i] + "T00:00:00Z");
          const diff = Math.round((dNext - dCur) / 864e5);
          if (diff === 1) current++;
          else break;
        }
      }
      let longestInactive = 0;
      for (const g of gaps) {
        if (g - 1 > longestInactive) longestInactive = g - 1;
      }
      const firstDateObj = /* @__PURE__ */ new Date(dateSets[0] + "T00:00:00Z");
      const lastDateObj = /* @__PURE__ */ new Date(dateSets[dateSets.length - 1] + "T00:00:00Z");
      const totalWeeks = Math.max(1, (lastDateObj - firstDateObj) / (7 * 864e5));
      const avgPerWeek = +(dateSets.length / totalWeeks).toFixed(1);
      return {
        current,
        longest,
        totalActive: dateSets.length,
        longestInactive: Math.round(longestInactive),
        avgPerWeek
      };
    },
    activityByDay(calendar) {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const counts = Array(7).fill(0);
      if (!calendar || !calendar.weeks) return days.map((name, i) => ({ name, count: 0 }));
      calendar.weeks.forEach((w) => {
        w.contributionDays.forEach((d) => {
          const date = /* @__PURE__ */ new Date(d.date + "T00:00:00Z");
          const dayIdx = date.getUTCDay();
          counts[dayIdx] += d.contributionCount;
        });
      });
      return days.map((name, i) => ({ name, count: counts[i] }));
    },
    activityByHour(commits) {
      const slots = [
        { label: "Morning", emoji: "\u{1F305}", range: "06:00 - 12:00", count: 0 },
        { label: "Afternoon", emoji: "\u2600\uFE0F", range: "12:00 - 17:00", count: 0 },
        { label: "Evening", emoji: "\u{1F306}", range: "17:00 - 21:00", count: 0 },
        { label: "Night", emoji: "\u{1F319}", range: "21:00 - 06:00", count: 0 }
      ];
      commits.forEach((c) => {
        if (!c || typeof c.hour !== "number") return;
        const h = c.hour;
        if (h >= 6 && h < 12) slots[0].count++;
        else if (h >= 12 && h < 17) slots[1].count++;
        else if (h >= 17 && h < 21) slots[2].count++;
        else slots[3].count++;
      });
      return slots;
    },
    monthlyCommits(calendar) {
      const map = {};
      if (!calendar || !calendar.weeks) return [];
      calendar.weeks.forEach((w) => {
        w.contributionDays.forEach((d) => {
          const date = /* @__PURE__ */ new Date(d.date + "T00:00:00Z");
          const y = date.getUTCFullYear();
          const m = String(date.getUTCMonth() + 1).padStart(2, "0");
          const monthStr = `${y}-${m}`;
          map[monthStr] = (map[monthStr] || 0) + d.contributionCount;
        });
      });
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
    },
    calculateScore(data) {
      const { repos = [], commits = [], streaks = {}, langStats = [] } = data;
      const MAX = { consistency: 20, recentActivity: 20, repoActivity: 15, openSource: 15, streak: 15, langDiversity: 15 };
      const factors = {};
      const firstCommit = commits.length > 0 ? commits[commits.length - 1].date : null;
      let consistencyScore = 0;
      if (firstCommit && streaks.totalActive) {
        const totalDays = Math.max(1, (Date.now() - firstCommit.getTime()) / 864e5);
        const ratio = Math.min(1, streaks.totalActive / (totalDays * 0.35));
        consistencyScore = Math.round(ratio * MAX.consistency);
      } else if (repos.length > 0) {
        consistencyScore = Math.min(MAX.consistency, repos.length * 2);
      }
      factors.consistency = { label: "Consistency", pts: Math.min(MAX.consistency, consistencyScore), max: MAX.consistency };
      const cutoff90 = Date.now() - 90 * 864e5;
      const recentCommits = commits.filter((c) => c.date && c.date.getTime() > cutoff90).length;
      const recentScore = Math.min(MAX.recentActivity, Math.round(recentCommits / 30 * MAX.recentActivity));
      factors.recentActivity = { label: "Recent Activity", pts: recentScore, max: MAX.recentActivity };
      const starsTotal = repos.reduce((s, r) => s + (r.stars || 0), 0);
      const forksTotal = repos.reduce((s, r) => s + (r.forks || 0), 0);
      const repoScore = Math.min(
        MAX.repoActivity,
        Math.round(Math.log10(starsTotal + forksTotal + 1) / 3.5 * MAX.repoActivity)
      );
      factors.repoActivity = { label: "Repository Engagement", pts: repoScore, max: MAX.repoActivity };
      const ownRepos = repos.filter((r) => !r.fork);
      const osScore = Math.min(
        MAX.openSource,
        Math.round(Math.min(ownRepos.length, 20) / 20 * MAX.openSource)
      );
      factors.openSource = { label: "Original Repositories", pts: osScore, max: MAX.openSource };
      const streakScore = Math.min(
        MAX.streak,
        Math.round(Math.min(streaks.longest || 0, 30) / 30 * MAX.streak)
      );
      factors.streak = { label: "Commit Streak", pts: streakScore, max: MAX.streak };
      const langCount = langStats.length;
      const langScore = Math.min(
        MAX.langDiversity,
        Math.round(Math.min(langCount, 6) / 6 * MAX.langDiversity)
      );
      factors.langDiversity = { label: "Language Diversity", pts: langScore, max: MAX.langDiversity };
      const total = Object.values(factors).reduce((s, f) => s + f.pts, 0);
      return { total: Math.min(100, Math.max(0, total)), factors };
    },
    filterByPeriod(commits, period) {
      if (period === "all") return commits;
      const numDays = Number(period);
      if (isNaN(numDays) || numDays <= 0) return commits;
      const cutoff = Date.now() - numDays * 864e5;
      return commits.filter((c) => c.date && c.date.getTime() >= cutoff);
    },
    computeStats(profile, repos, calendar) {
      const totalStars = repos.reduce((s, r) => s + (r.stars || 0), 0);
      const totalForks = repos.reduce((s, r) => s + (r.forks || 0), 0);
      const totalIssues = repos.reduce((s, r) => s + (r.issues || 0), 0);
      return {
        totalRepos: profile.public_repos || repos.length,
        totalStars,
        totalForks,
        totalCommits: calendar ? calendar.totalContributions : 0,
        followers: profile.followers || 0,
        following: profile.following || 0,
        totalIssues,
        publicGists: profile.public_gists || 0
      };
    }
  };

  // js/ui.js
  var tooltipEl = null;
  function getTooltip() {
    if (!tooltipEl) tooltipEl = $("tooltip");
    return tooltipEl;
  }
  function showTooltip(html, x, y) {
    const tip = getTooltip();
    if (!tip) return;
    tip.innerHTML = html;
    tip.classList.add("visible");
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    tip.style.left = Math.min(x + 12, window.innerWidth - tw - 12) + "px";
    tip.style.top = Math.max(y - th - 10, 10) + "px";
  }
  function hideTooltip() {
    const tip = getTooltip();
    if (tip) tip.classList.remove("visible");
  }
  var STEPS = ["profile", "repos", "languages", "activity", "insights"];
  function setStep(step, done = false) {
    STEPS.forEach((s) => {
      const el = document.querySelector(`.loading-step[data-step="${s}"]`);
      if (el) {
        el.classList.remove("active", "done");
        if (s === step) el.classList.add(done ? "done" : "active");
      }
    });
  }
  function setStatus(msg) {
    const el = $("loading-status");
    if (el) el.textContent = msg;
  }
  function renderProfile(profile) {
    const avatar = $("profile-avatar");
    if (avatar) {
      avatar.src = profile.avatar_url || "";
      avatar.alt = `${escapeHtml(profile.login)}'s avatar`;
    }
    $("profile-name").textContent = profile.name || profile.login || "";
    $("profile-username").textContent = profile.login || "";
    $("profile-bio").textContent = profile.bio || "";
    const metas = [];
    if (profile.location) metas.push({ icon: "\u{1F4CD}", text: profile.location });
    if (profile.company) metas.push({ icon: "\u{1F3E2}", text: profile.company });
    if (profile.blog) {
      const blogUrl = profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`;
      metas.push({ icon: "\u{1F517}", text: profile.blog, isLink: true, url: blogUrl });
    }
    const joined = profile.created_at ? new Date(profile.created_at).getUTCFullYear() : "";
    if (joined) metas.push({ icon: "\u{1F4C5}", text: `Joined ${joined}` });
    $("profile-meta").innerHTML = metas.map(
      (m) => m.isLink ? `<span class="meta-item"><span>${m.icon}</span><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.text)}</a></span>` : `<span class="meta-item"><span>${m.icon}</span><span>${escapeHtml(m.text)}</span></span>`
    ).join("");
    const stats = [
      { value: profile.public_repos || 0, label: "Repositories" },
      { value: profile.followers || 0, label: "Followers" },
      { value: profile.following || 0, label: "Following" }
    ];
    $("profile-stats").innerHTML = stats.map(
      (s) => `<div class="profile-stat-item">
      <span class="profile-stat-value">${formatNumber(s.value)}</span>
      <span class="profile-stat-label">${s.label}</span>
    </div>`
    ).join("");
    const link = $("profile-link");
    if (link) link.href = profile.html_url || `https://github.com/${profile.login}`;
  }
  function renderStats(stats, streaks = { current: 0, longest: 0 }) {
    const items = [
      { label: "Total Stars", value: stats.totalStars, icon: "\u2B50", color: "#f79824" },
      { label: "Total Forks", value: stats.totalForks, icon: "\u{1F374}", color: "#38c97a" },
      { label: "Commits Analyzed", value: stats.totalCommits, icon: "\u{1F4E6}", color: "#9f7aea" },
      { label: "Current Streak", value: streaks.current + "d", icon: "\u{1F525}", color: "#ff6b81" },
      { label: "Longest Streak", value: streaks.longest + "d", icon: "\u{1F3C6}", color: "#eab308" }
    ];
    $("stats-grid").innerHTML = items.map(
      (item) => `<div class="stat-card neu-card" role="listitem">
      <div class="stat-icon" style="color:${item.color}">${item.icon}</div>
      <div class="stat-value">${typeof item.value === "number" ? formatNumber(item.value) : escapeHtml(item.value)}</div>
      <div class="stat-label">${item.label}</div>
    </div>`
    ).join("");
  }
  function renderScore(scoreData) {
    const { total, factors } = scoreData;
    $("score-value").textContent = total;
    const circle = $("score-circle");
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - Math.min(100, Math.max(0, total)) / 100 * circumference;
    if (circle) {
      circle.style.strokeDasharray = `${circumference}`;
      circle.style.strokeDashoffset = `${circumference}`;
      const color = total >= 70 ? "#38c97a" : total >= 40 ? "#f79824" : "#e85b5b";
      circle.style.stroke = color;
      $("score-value").style.color = color;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          circle.style.strokeDashoffset = `${offset}`;
        });
      });
    }
    $("score-breakdown").innerHTML = Object.values(factors).map(
      (f) => `<div class="score-factor">
      <div class="score-factor-header">
        <span class="score-factor-label">${escapeHtml(f.label)}</span>
        <span class="score-factor-pts">${f.pts}/${f.max}</span>
      </div>
      <div class="score-factor-bar">
        <div class="score-factor-fill" style="width:${f.max > 0 ? f.pts / f.max * 100 : 0}%"></div>
      </div>
    </div>`
    ).join("");
  }
  function renderActivity(calendar, commits, period) {
    renderHeatmap(calendar, period);
    renderActivitySummary(calendar);
    renderStreaks(DataProcessor.calculateStreaks(calendar));
    renderDayChart(DataProcessor.activityByDay(calendar));
    renderTimeGrid(DataProcessor.activityByHour(commits));
    renderMonthlyChart(DataProcessor.monthlyCommits(calendar));
  }
  function renderActivitySummary(calendar) {
    const streaks = DataProcessor.calculateStreaks(calendar);
    const byDay = DataProcessor.activityByDay(calendar);
    const mostActiveDay = [...byDay].sort((a, b) => b.count - a.count)[0];
    const monthly = DataProcessor.monthlyCommits(calendar);
    const mostActiveMonth = [...monthly].sort((a, b) => b.count - a.count)[0];
    const totalCommits = calendar && calendar.totalContributions ? calendar.totalContributions : 0;
    const items = [
      { label: "Total Contributions", value: totalCommits, sub: "last 365 days" },
      { label: "Active Days", value: streaks.totalActive, sub: "unique days" },
      {
        label: "Daily Average",
        value: totalCommits > 0 && streaks.totalActive > 0 ? (totalCommits / streaks.totalActive).toFixed(1) : "0",
        sub: "commits/active day"
      },
      {
        label: "Peak Day",
        value: mostActiveDay && mostActiveDay.count > 0 ? mostActiveDay.name.slice(0, 3) : "N/A",
        sub: mostActiveDay && mostActiveDay.count > 0 ? `${mostActiveDay.count} commits` : ""
      },
      {
        label: "Top Month",
        value: mostActiveMonth && mostActiveMonth.count > 0 ? formatMonthYear(mostActiveMonth.month) : "N/A",
        sub: mostActiveMonth && mostActiveMonth.count > 0 ? `${mostActiveMonth.count} commits` : ""
      }
    ];
    $("activity-summary").innerHTML = items.map(
      (i) => `<div class="activity-stat" role="listitem">
      <span class="activity-stat-label">${i.label}</span>
      <span class="activity-stat-value">${i.value}</span>
      <span class="activity-stat-sub">${i.sub}</span>
    </div>`
    ).join("");
  }
  function renderHeatmap(calendar, period) {
    const grid = $("heatmap-grid");
    if (!grid || !calendar || !calendar.weeks) return;
    grid.innerHTML = "";
    let maxCount = 1;
    calendar.weeks.forEach((w) => {
      w.contributionDays.forEach((d) => {
        if (d.contributionCount > maxCount) maxCount = d.contributionCount;
      });
    });
    calendar.weeks.forEach((w) => {
      const weekEl = document.createElement("div");
      weekEl.className = "heatmap-week";
      const firstDayDate = /* @__PURE__ */ new Date(w.contributionDays[0].date + "T00:00:00Z");
      const startPadding = firstDayDate.getUTCDay();
      const daysInWeek = Array(7).fill(null);
      w.contributionDays.forEach((d) => {
        const date = /* @__PURE__ */ new Date(d.date + "T00:00:00Z");
        daysInWeek[date.getUTCDay()] = d;
      });
      daysInWeek.forEach((d) => {
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        if (d) {
          const count = d.contributionCount;
          if (count > 0) {
            const level = count >= maxCount * 0.75 ? 4 : count >= maxCount * 0.5 ? 3 : count >= maxCount * 0.25 ? 2 : 1;
            cell.dataset.level = String(level);
          }
          cell.addEventListener("mouseenter", (e) => {
            showTooltip(
              `<strong>${formatDate(d.date + "T00:00:00Z")}</strong><br>
             ${count} contribution${count !== 1 ? "s" : ""}`,
              e.clientX,
              e.clientY
            );
          });
          cell.addEventListener("mouseleave", hideTooltip);
        } else {
          cell.style.visibility = "hidden";
        }
        weekEl.appendChild(cell);
      });
      grid.appendChild(weekEl);
    });
    const legend = $("heatmap-legend");
    if (legend) {
      legend.innerHTML = `
      <span>Less</span>
      <div class="legend-cell" style="background:var(--shadow-dark)"></div>
      <div class="legend-cell" data-level="1" style="background:rgba(91,106,240,0.25)"></div>
      <div class="legend-cell" data-level="2" style="background:rgba(91,106,240,0.5)"></div>
      <div class="legend-cell" data-level="3" style="background:rgba(91,106,240,0.75)"></div>
      <div class="legend-cell" data-level="4" style="background:var(--accent)"></div>
      <span>More</span>`;
    }
    const scrollEl = document.querySelector(".heatmap-scroll");
    if (scrollEl) {
      setTimeout(() => {
        scrollEl.scrollLeft = scrollEl.scrollWidth;
      }, 100);
      let isDown = false;
      let startX;
      let scrollLeft;
      scrollEl.addEventListener("mousedown", (e) => {
        isDown = true;
        startX = e.pageX - scrollEl.offsetLeft;
        scrollLeft = scrollEl.scrollLeft;
      });
      scrollEl.addEventListener("mouseleave", () => {
        isDown = false;
      });
      scrollEl.addEventListener("mouseup", () => {
        isDown = false;
      });
      scrollEl.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - scrollEl.offsetLeft;
        const walk = (x - startX) * 2;
        scrollEl.scrollLeft = scrollLeft - walk;
      });
    }
  }
  function renderStreaks(streaks) {
    $("current-streak").textContent = streaks.current || 0;
    $("longest-streak").textContent = streaks.longest || 0;
    $("total-active-days").textContent = streaks.totalActive || 0;
    $("avg-active-week").textContent = streaks.avgPerWeek || 0;
    $("longest-inactive").textContent = streaks.longestInactive || 0;
  }
  function renderDayChart(dayData) {
    const container = $("day-bar-chart");
    if (!container || !dayData || dayData.length === 0) return;
    const max = Math.max(1, ...dayData.map((d) => d.count));
    const maxDay = dayData.reduce((a, b) => a.count > b.count ? a : b, dayData[0]);
    container.innerHTML = dayData.map(
      (d) => `<div class="bar-row">
      <span class="bar-day">${escapeHtml(d.name.slice(0, 3))}</span>
      <div class="bar-track">
        <div class="bar-fill${d.name === maxDay.name && d.count > 0 ? " highlight" : ""}" style="width:${d.count / max * 100}%"></div>
      </div>
      <span class="bar-count">${d.count}</span>
    </div>`
    ).join("");
  }
  function renderTimeGrid(timeData) {
    const container = $("time-grid");
    if (!container || !timeData || timeData.length === 0) return;
    const total = timeData.reduce((s, t) => s + t.count, 0);
    const maxSlot = timeData.reduce((a, b) => a.count > b.count ? a : b, timeData[0]);
    container.innerHTML = timeData.map(
      (t) => `<div class="time-quadrant${t.label === maxSlot.label && t.count > 0 ? " highlight-time" : ""}">
      <span class="time-q-label">${t.emoji} ${escapeHtml(t.label)}</span>
      <span class="time-q-count">${t.count}</span>
      <span class="time-q-pct">${total > 0 ? (t.count / total * 100).toFixed(0) : 0}%</span>
    </div>`
    ).join("");
  }
  function renderMonthlyChart(monthly) {
    const container = $("monthly-chart");
    if (!container) return;
    if (!monthly || monthly.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;margin:auto">No monthly commit data available.</p>';
      return;
    }
    const max = Math.max(1, ...monthly.map((m) => m.count));
    const maxMonth = monthly.reduce((a, b) => a.count > b.count ? a : b, monthly[0]);
    container.innerHTML = monthly.map((m) => {
      const monthLabel = formatMonthYear(m.month);
      const height = max > 0 && m.count > 0 ? Math.max(6, m.count / max * 100) : 4;
      return `<div class="month-col" title="${escapeHtml(monthLabel)}: ${m.count} commits">
      <div class="month-bar-wrap">
        <div class="month-bar${m.month === maxMonth.month && m.count > 0 ? " highlight" : ""}" style="height:${height}%"></div>
      </div>
      <span class="month-label">${escapeHtml(monthLabel)}</span>
      <span class="month-count">${m.count}</span>
    </div>`;
    }).join("");
  }
  function renderRepositories() {
    let repos = [...state.repos];
    if (state.repoQuery) {
      const q = state.repoQuery.toLowerCase();
      repos = repos.filter(
        (r) => r.name && r.name.toLowerCase().includes(q) || r.description && r.description.toLowerCase().includes(q)
      );
    }
    if (state.repoLang) {
      repos = repos.filter((r) => r.language === state.repoLang);
    }
    switch (state.repoSort) {
      case "stars":
        repos.sort((a, b) => (b.stars || 0) - (a.stars || 0));
        break;
      case "forks":
        repos.sort((a, b) => (b.forks || 0) - (a.forks || 0));
        break;
      case "updated":
        repos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        break;
      case "name":
        repos.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
    }
    const total = repos.length;
    const totalPages = Math.max(1, Math.ceil(total / CONFIG.REPOS_PER_PAGE));
    if (state.repoPage > totalPages) state.repoPage = 1;
    if (state.repoPage < 1) state.repoPage = 1;
    const start = (state.repoPage - 1) * CONFIG.REPOS_PER_PAGE;
    const page = repos.slice(start, start + CONFIG.REPOS_PER_PAGE);
    const tbody = $("repo-tbody");
    if (tbody) {
      if (page.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No repositories match your criteria.</td></tr>`;
      } else {
        tbody.innerHTML = page.map((r) => {
          const updatedStr = relativeDate(r.updatedAt);
          const actLevel = r.stars > 50 ? 5 : r.stars > 10 ? 4 : r.stars > 2 ? 3 : r.stars > 0 ? 2 : 1;
          const bars = Array.from(
            { length: 5 },
            (_, i) => `<div class="activity-bar${i < actLevel ? " active" : ""}" style="height:${(i + 1) * 3 + 4}px"></div>`
          ).join("");
          return `<tr>
          <td>
            <div class="repo-name-cell">
              <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" class="repo-name-link">${escapeHtml(r.name)}</a>
              ${r.description ? `<span class="repo-description" title="${escapeHtml(r.description)}">${escapeHtml(r.description)}</span>` : ""}
            </div>
          </td>
          <td>${r.language ? `<span><span class="lang-dot" style="background:${getLangColor(r.language)}"></span>${escapeHtml(r.language)}</span>` : `<span style="color:var(--text-muted)">\u2014</span>`}</td>
          <td>${formatNumber(r.stars)}</td>
          <td>${formatNumber(r.forks)}</td>
          <td>${formatNumber(r.issues)}</td>
          <td title="${r.updatedAt ? r.updatedAt.toLocaleString() : ""}">${escapeHtml(updatedStr)}</td>
          <td><div class="activity-indicator">${bars}</div></td>
        </tr>`;
        }).join("");
      }
    }
    const pag = $("repo-pagination");
    if (pag) {
      if (totalPages <= 1) {
        pag.innerHTML = "";
        return;
      }
      let html = `<button class="page-btn" data-page="${state.repoPage - 1}" ${state.repoPage === 1 ? "disabled" : ""} aria-label="Previous page">&#8592;</button>`;
      for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || Math.abs(p - state.repoPage) <= 2) {
          html += `<button class="page-btn${p === state.repoPage ? " active" : ""}" data-page="${p}">${p}</button>`;
        } else if (Math.abs(p - state.repoPage) === 3) {
          html += `<span style="color:var(--text-muted);padding:0 4px">\u2026</span>`;
        }
      }
      html += `<button class="page-btn" data-page="${state.repoPage + 1}" ${state.repoPage === totalPages ? "disabled" : ""} aria-label="Next page">&#8594;</button>`;
      pag.innerHTML = html;
    }
  }
  function renderRepoHighlights() {
    const sorted = [...state.repos];
    const mostStarred = [...sorted].sort((a, b) => (b.stars || 0) - (a.stars || 0))[0];
    const mostActive = [...sorted].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    const mostForked = [...sorted].sort((a, b) => (b.forks || 0) - (a.forks || 0))[0];
    const highlightsEl = $("repo-highlights");
    if (highlightsEl) {
      if (mostStarred && mostStarred.name) {
        highlightsEl.innerHTML = [
          { badge: "Most Starred", repo: mostStarred, meta: `${mostStarred.stars} stars` },
          { badge: "Most Recent", repo: mostActive, meta: `Updated ${relativeDate(mostActive.updatedAt)}` },
          { badge: "Most Forked", repo: mostForked, meta: `${mostForked.forks} forks` }
        ].map(
          (h) => `<div class="repo-highlight-card">
          <span class="rh-badge">${h.badge}</span>
          <span class="rh-name" title="${escapeHtml(h.repo.name)}">${escapeHtml(h.repo.name)}</span>
          <span class="rh-meta">${h.meta}</span>
        </div>`
        ).join("");
      } else {
        highlightsEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No repository data available.</p>';
      }
    }
    const langs = [...new Set(state.repos.map((r) => r.language).filter(Boolean))].sort();
    const sel = $("lang-filter");
    if (sel) {
      sel.innerHTML = `<option value="">All Languages</option>` + langs.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
    }
  }
  function renderLanguages(langStats) {
    const bars = $("lang-bars");
    const tbody = $("lang-tbody");
    const legend = $("donut-legend");
    const svg = $("donut-svg");
    if (!langStats || langStats.length === 0) {
      if (bars) bars.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No language data available.</p>';
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No language data available</td></tr>';
      if (legend) legend.innerHTML = "";
      if (svg) svg.innerHTML = "";
      return;
    }
    renderDonut(langStats.slice(0, 8));
    if (bars) {
      bars.innerHTML = langStats.slice(0, 10).map(
        (l) => `<div class="lang-bar-row">
        <div class="lang-bar-header">
          <span class="lang-rank">#${l.rank}</span>
          <span class="lang-dot" style="background:${getLangColor(l.name)}"></span>
          <span class="lang-name-text">${escapeHtml(l.name)}</span>
          <span class="lang-pct-text">${l.pct.toFixed(1)}%</span>
        </div>
        <div class="lang-bar-track">
          <div class="lang-bar-fill" style="width:${l.pct}%;background:${getLangColor(l.name)}"></div>
        </div>
      </div>`
      ).join("");
    }
    if (tbody) {
      tbody.innerHTML = langStats.map(
        (l) => `<tr>
        <td>${l.rank}</td>
        <td><span class="lang-dot" style="background:${getLangColor(l.name)}"></span>${escapeHtml(l.name)}</td>
        <td style="font-family:var(--font-mono)">${l.bytes.toLocaleString()}</td>
        <td style="font-family:var(--font-mono)">${l.pct.toFixed(2)}%</td>
        <td>${l.repoCount}</td>
      </tr>`
      ).join("");
    }
  }
  function renderDonut(langStats) {
    const svg = $("donut-svg");
    if (!svg || !langStats || langStats.length === 0) return;
    const cx = 100, cy = 100, r = 75;
    const total = langStats.reduce((s, l) => s + l.pct, 0) || 100;
    const gap = langStats.length > 1 ? 2 : 0;
    let currentAngle = -90;
    const segments = langStats.map((l) => {
      const angle = l.pct / total * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return { ...l, startAngle, sweepAngle: Math.max(0.5, angle - gap) };
    });
    function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
      const rad = angleInDegrees * Math.PI / 180;
      return { x: centerX + radius * Math.cos(rad), y: centerY + radius * Math.sin(rad) };
    }
    function describeArc(centerX, centerY, radius, startAngle, sweepAngle) {
      if (sweepAngle >= 359.9 || langStats.length === 1) {
        return `M ${centerX} ${centerY - radius} A ${radius} ${radius} 0 1 1 ${centerX} ${centerY + radius} A ${radius} ${radius} 0 1 1 ${centerX} ${centerY - radius}`;
      }
      const s = polarToCartesian(centerX, centerY, radius, startAngle);
      const e = polarToCartesian(centerX, centerY, radius, startAngle + sweepAngle);
      const large = sweepAngle > 180 ? 1 : 0;
      return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
    }
    svg.innerHTML = segments.map(
      (seg) => `<path
      d="${describeArc(cx, cy, r, seg.startAngle, seg.sweepAngle)}"
      fill="none"
      stroke="${getLangColor(seg.name)}"
      stroke-width="22"
      class="donut-seg"
      data-lang="${escapeHtml(seg.name)}"
      data-pct="${seg.pct.toFixed(1)}"
      style="cursor:pointer;transition:stroke-width 0.2s ease"
    />`
    ).join("");
    svg.querySelectorAll(".donut-seg").forEach((path) => {
      path.addEventListener("mouseenter", () => {
        path.style.strokeWidth = "28";
        const nameEl = $("donut-lang-name");
        const pctEl = $("donut-lang-pct");
        if (nameEl) nameEl.textContent = path.dataset.lang;
        if (pctEl) pctEl.textContent = path.dataset.pct + "%";
      });
      path.addEventListener("mouseleave", () => {
        path.style.strokeWidth = "22";
        const nameEl = $("donut-lang-name");
        const pctEl = $("donut-lang-pct");
        if (nameEl) nameEl.textContent = "Total";
        if (pctEl) pctEl.textContent = "100%";
      });
    });
    const legend = $("donut-legend");
    if (legend) {
      legend.innerHTML = langStats.map(
        (l) => `<div class="legend-item" role="listitem">
        <div class="legend-color" style="background:${getLangColor(l.name)}"></div>
        <span class="legend-name">${escapeHtml(l.name)}</span>
        <span class="legend-pct">${l.pct.toFixed(1)}%</span>
      </div>`
      ).join("");
    }
  }
  function renderInsights(insights) {
    const container = $("insights-grid");
    if (!container) return;
    const ICONS = {
      consistency: { emoji: "\u{1F4CA}", color: "#5b6af0" },
      momentum: { emoji: "\u{1F680}", color: "#38c97a" },
      tech_focus: { emoji: "\u{1F4BB}", color: "#9f7aea" },
      repo_health: { emoji: "\u{1F3D7}\uFE0F", color: "#38b2ac" },
      open_source: { emoji: "\u{1F310}", color: "#f79824" },
      pattern: { emoji: "\u{1F504}", color: "#ed64a6" }
    };
    container.innerHTML = (insights || []).map((ins, i) => {
      const ico = ICONS[ins.id] || { emoji: "\u{1F4CC}", color: "#5b6af0" };
      return `<div class="insight-card" style="animation-delay:${i * 70}ms">
      <div class="insight-header">
        <div class="insight-icon" style="color:${ico.color};font-size:1.2rem">${ico.emoji}</div>
        <span class="insight-title">${escapeHtml(ins.title)}</span>
      </div>
      <p class="insight-body">${escapeHtml(ins.body)}</p>
      ${ins.chips && ins.chips.length ? `<div class="insight-metrics">
        ${ins.chips.map((c) => `<span class="insight-metric-chip">${escapeHtml(c)}</span>`).join("")}
      </div>` : ""}
    </div>`;
    }).join("");
  }
  function renderTechStack(techStack) {
    const container = $("tech-stack-container");
    const chips = $("tech-stack-chips");
    if (!container || !chips) return;
    if (techStack && techStack.length > 0) {
      chips.innerHTML = techStack.map(
        (tech) => `<span style="background: var(--accent-bg); color: var(--accent); padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border: 1px solid rgba(91,106,240,0.2);">${escapeHtml(tech)}</span>`
      ).join("");
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
  }
  function renderCareerSection(careerData, onGenerateStrategy) {
    if (!careerData) return;
    const { archetype, readiness, topLanguages, matchedRoles } = careerData;
    const archBadge = $("career-archetype-badge");
    const archTitle = $("career-archetype-title");
    const archTagline = $("career-archetype-tagline");
    if (archBadge) {
      archBadge.textContent = archetype.badge;
      archBadge.style.color = archetype.color;
      archBadge.style.borderColor = archetype.color + "40";
    }
    if (archTitle) archTitle.textContent = archetype.title;
    if (archTagline) archTagline.textContent = archetype.tagline;
    const readBadge = $("career-readiness-badge");
    const readScore = $("career-readiness-score");
    const readDesc = $("career-readiness-desc");
    if (readBadge) readBadge.textContent = readiness.level;
    if (readScore) readScore.textContent = readiness.score;
    if (readDesc) readDesc.textContent = readiness.desc;
    const langPills = $("career-lang-pills");
    if (langPills) {
      langPills.innerHTML = (topLanguages || []).map(
        (lang) => `<span class="career-lang-pill">
        <span class="lang-dot" style="background:${getLangColor(lang)}"></span>
        <span>${escapeHtml(lang)}</span>
      </span>`
      ).join("");
    }
    const internCount = matchedRoles.filter((r) => r.type.includes("Internship")).length;
    const juniorCount = matchedRoles.filter((r) => r.type.includes("Junior") || r.type.includes("Entry")).length;
    if ($("career-count-all")) $("career-count-all").textContent = matchedRoles.length;
    if ($("career-count-intern")) $("career-count-intern").textContent = internCount;
    if ($("career-count-junior")) $("career-count-junior").textContent = juniorCount;
    function renderRoles(filter = "all") {
      const grid = $("career-roles-grid");
      if (!grid) return;
      let list = [...matchedRoles];
      if (filter === "Internship") {
        list = list.filter((r) => r.type.includes("Internship"));
      } else if (filter === "Junior") {
        list = list.filter((r) => r.type.includes("Junior") || r.type.includes("Entry"));
      } else if (filter === "high-match") {
        list = list.filter((r) => r.matchPct >= 80);
      }
      if (list.length === 0) {
        grid.innerHTML = `<div class="neu-card" style="padding: 30px; text-align: center; grid-column: 1 / -1;">
        <p style="color: var(--text-secondary);">No roles found for this filter. Try viewing All Roles.</p>
      </div>`;
        return;
      }
      grid.innerHTML = list.map((role, idx) => `
      <div class="career-role-card neu-card" style="animation-delay: ${idx * 60}ms;">
        <div>
          <div class="career-role-header">
            <div>
              <h3 class="career-role-title">${escapeHtml(role.title)}</h3>
              <span class="career-role-type">${escapeHtml(role.type)} \u2022 ${escapeHtml(role.category)}</span>
            </div>
            <div class="career-match-badge">
              <span class="career-match-pct">${role.matchPct}%</span>
              <span class="career-match-label">Match</span>
            </div>
          </div>

          <div class="career-match-bar-track">
            <div class="career-match-bar-fill" style="width: ${role.matchPct}%;"></div>
          </div>

          <p class="career-role-desc">${escapeHtml(role.description)}</p>

          <div class="career-skills-wrap">
            <div class="career-section-label">Skills You Have</div>
            <div class="career-skills-list" style="margin-bottom: 8px;">
              ${role.skillsPossessed.map((s) => `<span class="career-skill-tag possessed">\u2713 ${escapeHtml(s)}</span>`).join("")}
            </div>
            <div class="career-section-label">High-Impact Skills to Add</div>
            <div class="career-skills-list">
              ${role.skillsToLearn.map((s) => `<span class="career-skill-tag to-learn">+ ${escapeHtml(s)}</span>`).join("")}
            </div>
          </div>

          <div class="career-projects-wrap">
            <div class="career-section-label">Recommended Portfolio Projects</div>
            ${role.projectIdeas.map((p) => `
              <div class="career-project-item">
                <span class="career-project-bullet">\u26A1</span>
                <span>${escapeHtml(p)}</span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="career-actions-row">
          <button class="neu-button primary small btn-generate-strategy" data-role-id="${role.id}" style="width: 100%;">
            \u{1F916} Generate AI Job Strategy
          </button>
          
          <div class="career-search-links">
            <a href="${role.links.linkedin}" target="_blank" rel="noopener noreferrer" class="career-job-link linkedin" title="Search on LinkedIn">
              <span>LinkedIn</span> \u2197
            </a>
            <a href="${role.links.indeed}" target="_blank" rel="noopener noreferrer" class="career-job-link indeed" title="Search on Indeed">
              <span>Indeed</span> \u2197
            </a>
            <a href="${role.links.wellfound}" target="_blank" rel="noopener noreferrer" class="career-job-link wellfound" title="Search Startups on Wellfound">
              <span>Wellfound</span> \u2197
            </a>
            <a href="${role.links.google}" target="_blank" rel="noopener noreferrer" class="career-job-link" title="Search on Google Jobs">
              <span>Google</span> \u2197
            </a>
          </div>
        </div>
      </div>
    `).join("");
      grid.querySelectorAll(".btn-generate-strategy").forEach((btn) => {
        btn.addEventListener("click", () => {
          const roleId = btn.dataset.roleId;
          const targetRole = matchedRoles.find((r) => r.id === roleId);
          if (targetRole && onGenerateStrategy) {
            onGenerateStrategy(targetRole);
          }
        });
      });
    }
    renderRoles("all");
    document.querySelectorAll(".career-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".career-tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderRoles(btn.dataset.filter);
      });
    });
  }

  // js/app.js
  function showError(code, customMessage) {
    const messages = {
      not_found: "GitHub profile not found. Please check the username and try again.",
      invalid_token: "Invalid GitHub Personal Access Token. Please update or clear the token in your env.js file.",
      rate_limit: "GitHub API rate limit reached (60 req/hr). Tip: Add a free GitHub token in env.js to increase the limit to 5,000 req/hr.",
      network_error: "Network connection error. Please check your internet connection.",
      api_error: "Could not reach GitHub API. Please try again later.",
      default: "An unexpected error occurred. Please try again."
    };
    const msgEl = $("error-message");
    if (msgEl) {
      msgEl.textContent = code && messages[code] || customMessage || messages.default;
    }
    showEl($("error-banner"));
  }
  function showSection(name) {
    document.querySelectorAll(".content-section").forEach((s) => {
      s.hidden = true;
      s.classList.remove("active");
    });
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    const sec = $(`section-${name}`);
    const btn = document.querySelector(`.nav-item[data-section="${name}"]`);
    if (sec) {
      sec.hidden = false;
      sec.classList.add("active");
      if (name === "activity") {
        const scrollEl = document.querySelector(".heatmap-scroll");
        if (scrollEl) {
          setTimeout(() => {
            scrollEl.scrollLeft = scrollEl.scrollWidth;
          }, 10);
        }
      }
    }
    if (btn) btn.classList.add("active");
  }
  function initNavigation() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        showSection(btn.dataset.section);
        closeSidebar();
      });
    });
  }
  function closeSidebar() {
    $("sidebar")?.classList.remove("open");
    $("sidebar-overlay")?.classList.remove("open");
    hideEl($("sidebar-overlay"));
    $("sidebar-toggle")?.setAttribute("aria-expanded", "false");
  }
  function updateRecentSearchesUI() {
    const container = $("recent-searches-container");
    if (!container) return;
    const recent = Storage.getRecentSearches();
    if (recent.length > 0) {
      container.innerHTML = `
      <span class="examples-label">Recent:</span>
      ${recent.map((u) => `<button class="example-chip recent-chip" data-user="${u}" type="button">${u}</button>`).join("")}
    `;
      container.querySelectorAll(".recent-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const user = chip.dataset.user;
          if ($("username-input")) $("username-input").value = user;
          analyzeProfile(user);
        });
      });
      showEl(container);
    } else {
      hideEl(container);
    }
  }
  async function analyzeProfile(rawUsername) {
    const username = rawUsername ? rawUsername.trim() : "";
    if (!username) return;
    const url = new URL(window.location);
    url.searchParams.set("user", username);
    window.history.pushState({}, "", url);
    Storage.addRecentSearch(username);
    Object.assign(state, { profile: null, repos: [], languages: {}, commits: [], repoPage: 1 });
    hideEl($("error-banner"));
    hideEl($("landing"));
    showEl($("loading-screen"));
    hideEl($("dashboard"));
    try {
      setStep("profile");
      setStatus("Fetching comprehensive profile data via GraphQL...");
      const query = `
      query($login: String!) {
        user(login: $login) {
          name
          login
          avatarUrl
          bio
          location
          company
          websiteUrl
          createdAt
          url
          followers { totalCount }
          following { totalCount }
          repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
            totalCount
            nodes {
              name
              description
              stargazerCount
              forkCount
              isFork
              pushedAt
              createdAt
              url
              diskUsage
              primaryLanguage {
                name
              }
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    name
                  }
                }
              }
            }
          }
          contributionsCollection {
            contributionYears
          }
        }
      }
    `;
      const gqlData = await ApiClient.graphql(query, { login: username });
      if (!gqlData || !gqlData.user) throw new AppError("not_found");
      const u = gqlData.user;
      state.profile = {
        login: u.login,
        name: u.name,
        avatar_url: u.avatarUrl,
        bio: u.bio,
        location: u.location,
        company: u.company,
        blog: u.websiteUrl,
        created_at: u.createdAt,
        html_url: u.url,
        public_repos: u.repositories?.totalCount || 0,
        followers: u.followers?.totalCount || 0,
        following: u.following?.totalCount || 0
      };
      setStep("profile", true);
      const actualLogin = u.login;
      setStep("repos");
      setStatus("Processing repositories...");
      const rawRepos = u.repositories?.nodes || [];
      state.repos = rawRepos.map((r) => ({
        name: r.name,
        fullName: `${u.login}/${r.name}`,
        description: r.description || "",
        language: r.primaryLanguage?.name || null,
        stars: r.stargazerCount || 0,
        forks: r.forkCount || 0,
        issues: 0,
        updatedAt: new Date(r.pushedAt || r.createdAt),
        createdAt: new Date(r.createdAt),
        url: r.url,
        fork: r.isFork,
        size: r.diskUsage || 0,
        _languages: r.languages?.edges || []
      }));
      setStep("repos", true);
      setStep("languages");
      setStatus("Aggregating languages & code stats...");
      const langMap = {};
      state.repos.forEach((r) => {
        if (r.fork) return;
        r._languages.forEach((edge) => {
          const langName = edge.node.name;
          const bytes = edge.size;
          if (!langMap[langName]) {
            langMap[langName] = { bytes: 0, repoCount: 0, repos: [] };
          }
          langMap[langName].bytes += bytes;
          langMap[langName].repoCount++;
          langMap[langName].repos.push(r.name);
        });
      });
      state.languages = langMap;
      setStep("languages", true);
      setStatus("Detecting tech stack...");
      const topReposForStack = state.repos.filter((r) => !r.fork).sort((a, b) => b.stars - a.stars || b.updatedAt - a.updatedAt).slice(0, 10);
      state.techStack = [];
      if (topReposForStack.length > 0) {
        let stackQuery = `query($login: String!) { user(login: $login) { `;
        topReposForStack.forEach((r, i) => {
          const safeName = `repo${i}`;
          stackQuery += `
          ${safeName}: repository(name: "${r.name}") {
            pkg: object(expression: "HEAD:package.json") { ... on Blob { text } }
            req: object(expression: "HEAD:requirements.txt") { ... on Blob { text } }
            gomod: object(expression: "HEAD:go.mod") { ... on Blob { text } }
            pom: object(expression: "HEAD:pom.xml") { ... on Blob { text } }
            composer: object(expression: "HEAD:composer.json") { ... on Blob { text } }
          }
        `;
        });
        stackQuery += ` } }`;
        try {
          const stackData = await ApiClient.graphql(stackQuery, { login: username });
          const techSet = /* @__PURE__ */ new Set();
          if (stackData && stackData.user) {
            Object.values(stackData.user).forEach((repoData) => {
              if (!repoData) return;
              if (repoData.pkg?.text) {
                const text = repoData.pkg.text;
                if (text.includes('"react"')) techSet.add("React");
                if (text.includes('"next"')) techSet.add("Next.js");
                if (text.includes('"vue"')) techSet.add("Vue");
                if (text.includes('"svelte"')) techSet.add("Svelte");
                if (text.includes('"express"')) techSet.add("Express");
                if (text.includes('"tailwindcss"')) techSet.add("Tailwind CSS");
                if (text.includes('"@angular/core"')) techSet.add("Angular");
                techSet.add("Node.js");
              }
              if (repoData.req?.text) {
                const text = repoData.req.text.toLowerCase();
                if (text.includes("django")) techSet.add("Django");
                if (text.includes("flask")) techSet.add("Flask");
                if (text.includes("fastapi")) techSet.add("FastAPI");
                if (text.includes("pandas") || text.includes("numpy")) techSet.add("Data Science");
              }
              if (repoData.gomod?.text) {
                techSet.add("Go Modules");
              }
              if (repoData.pom?.text) {
                const text = repoData.pom.text.toLowerCase();
                if (text.includes("spring-boot")) techSet.add("Spring Boot");
              }
              if (repoData.composer?.text) {
                const text = repoData.composer.text.toLowerCase();
                if (text.includes("laravel/framework")) techSet.add("Laravel");
                if (text.includes("symfony/symfony")) techSet.add("Symfony");
              }
            });
          }
          state.techStack = Array.from(techSet);
        } catch (err) {
          console.warn("Failed to fetch tech stack:", err);
        }
      }
      setStep("activity");
      setStatus("Analyzing commit activity & streak metrics...");
      const years = u.contributionsCollection?.contributionYears || [];
      if (years.length > 0) {
        setStatus("Fetching lifetime contribution data...");
        let lifetimeQuery = `query($login: String!) { user(login: $login) { `;
        const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
        years.forEach((year) => {
          const from = `${year}-01-01T00:00:00Z`;
          const to = year === currentYear ? (/* @__PURE__ */ new Date()).toISOString() : `${year}-12-31T23:59:59Z`;
          lifetimeQuery += `
          year${year}: contributionsCollection(from: "${from}", to: "${to}") {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                }
              }
            }
          }
        `;
        });
        lifetimeQuery += ` } }`;
        const lifetimeData = await ApiClient.graphql(lifetimeQuery, { login: username });
        if (lifetimeData && lifetimeData.user) {
          let totalContributions = 0;
          let allWeeks = [];
          const sortedYears = [...years].sort((a, b) => a - b);
          sortedYears.forEach((year) => {
            const cal = lifetimeData.user[`year${year}`]?.contributionCalendar;
            if (cal) {
              totalContributions += cal.totalContributions;
              allWeeks = allWeeks.concat(cal.weeks);
            }
          });
          state.contributionCalendar = {
            totalContributions,
            weeks: allWeeks
          };
        }
      } else {
        state.contributionCalendar = { totalContributions: 0, weeks: [] };
      }
      const events = await ApiClient.get(`/users/${encodeURIComponent(actualLogin)}/events/public?per_page=100`).catch(() => []);
      const extracted = [];
      if (Array.isArray(events)) {
        events.forEach((ev) => {
          if (ev.type === "PushEvent" && ev.payload?.commits) {
            ev.payload.commits.forEach((pc) => {
              extracted.push({
                sha: pc.sha,
                commit: { author: { date: ev.created_at } },
                _repo: ev.repo?.name ? ev.repo.name.split("/")[1] || ev.repo.name : ""
              });
            });
          } else if (ev.created_at) {
            extracted.push({
              sha: ev.id,
              commit: { author: { date: ev.created_at } },
              _repo: ev.repo?.name ? ev.repo.name.split("/")[1] || ev.repo.name : ""
            });
          }
        });
      }
      state.commits = DataProcessor.parseCommits(extracted);
      setStep("activity", true);
      setStep("insights");
      setStatus("Generating developer intelligence insights...");
      const langStats = DataProcessor.getLanguageStats(state.languages);
      const stats = DataProcessor.computeStats(state.profile, state.repos, state.contributionCalendar);
      const streaks = DataProcessor.calculateStreaks(state.contributionCalendar);
      const scoreData = DataProcessor.calculateScore({
        repos: state.repos,
        commits: state.commits,
        streaks,
        langStats,
        profile: state.profile
      });
      const cutoff90 = Date.now() - 90 * 864e5;
      const recentCommits90 = state.commits.filter((c) => c.date && c.date.getTime() > cutoff90).length;
      const analysisData = {
        totalRepos: stats.totalRepos,
        totalStars: stats.totalStars,
        totalForks: stats.totalForks,
        totalCommits: state.contributionCalendar?.totalContributions || 0,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        activeDays: streaks.totalActive,
        avgPerWeek: streaks.avgPerWeek,
        recentCommits90,
        topLanguages: langStats.slice(0, 5),
        activityScore: scoreData.total
      };
      state.insights = await InsightsEngine.analyze(analysisData);
      setStep("insights", true);
      state.career = CareerMatcher.analyzeCareer({
        profile: state.profile,
        repos: state.repos,
        langStats,
        commits: state.commits,
        streaks,
        techStack: state.techStack
      });
      setStatus("Preparing dashboard presentation...");
      renderProfile(state.profile);
      renderStats(stats, streaks);
      renderScore(scoreData);
      renderActivity(state.contributionCalendar, state.commits, state.period);
      renderRepoHighlights();
      renderRepositories();
      renderLanguages(langStats);
      renderTechStack(state.techStack);
      renderInsights(state.insights);
      JobsManager.runJobMatcher();
      renderCareerSection(state.career, handleGenerateStrategy);
      ChatEngine.setContext({ ...analysisData, profile: state.profile });
      await new Promise((r) => setTimeout(r, 400));
      hideEl($("loading-screen"));
      showEl($("dashboard"));
      showSection("overview");
    } catch (err) {
      console.error("Analysis error:", err);
      hideEl($("loading-screen"));
      showEl($("landing"));
      showError(err.code, err.message);
    }
  }
  async function handleGenerateStrategy(role) {
    const modal = $("ai-strategy-modal");
    const title = $("strategy-role-title");
    const sub = $("strategy-role-subtitle");
    const content = $("ai-strategy-content");
    if (!modal || !content) return;
    showEl(modal);
    if (title) title.textContent = `${role.title} \u2014 AI Application Blueprint`;
    if (sub) sub.textContent = `Targeting ${role.category} \u2022 Match ${role.matchPct}%`;
    content.innerHTML = `
    <div class="insight-loading neu-card" style="margin: 20px 0;">
      <div class="insight-spinner" aria-hidden="true"></div>
      <p>Generating personalized application pitch, resume highlights & interview questions...</p>
    </div>
  `;
    try {
      const langStats = DataProcessor.getLanguageStats(state.languages);
      const strategy = await CareerMatcher.generateAiCareerStrategy(role, {
        profile: state.profile,
        langStats,
        repos: state.repos
      });
      content.innerHTML = `
      <div class="strategy-block">
        <div class="strategy-block-title">\u{1F3AF} Recruiter Elevator Pitch</div>
        <div class="strategy-box">
          <p>${strategy.elevatorPitch}</p>
        </div>
      </div>

      <div class="strategy-block">
        <div class="strategy-block-title">\u{1F4C4} High-Impact Resume Bullet Points</div>
        <div class="strategy-box">
          <ul class="strategy-bullet-list">
            ${(strategy.resumeBulletPoints || []).map((bp) => `<li>${bp}</li>`).join("")}
          </ul>
        </div>
      </div>

      <div class="strategy-block">
        <div class="strategy-block-title">\u{1F4AC} Technical & Behavioral Interview Prep</div>
        <div class="strategy-box">
          ${(strategy.interviewQuestions || []).map((iq) => `
            <div style="margin-bottom: 12px;">
              <strong style="color: var(--text-primary);">Q: ${iq.q}</strong>
              <p style="margin-top: 4px; color: var(--text-secondary); font-size: 0.82rem;">\u{1F4A1} <em>Strategy:</em> ${iq.tip}</p>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="strategy-block" style="margin-bottom: 0;">
        <div class="strategy-block-title">\u{1F680} Fast-Track Action to Stand Out</div>
        <div class="strategy-box" style="border-left: 3px solid var(--accent);">
          <p><strong>${strategy.breakthroughAction}</strong></p>
        </div>
      </div>
    `;
    } catch (e) {
      content.innerHTML = `<p style="color: var(--red);">Could not generate strategy at this time. Please try again.</p>`;
    }
  }
  function init() {
    $("btn-career-match")?.addEventListener("click", () => {
      JobsManager.runJobMatcher();
    });
    $("btn-career-hub")?.addEventListener("click", () => {
      showSection("career");
    });
    $("btn-repo-ranking")?.addEventListener("click", () => {
      RankingManager.runRankingAnalysis();
      $("repo-ranking-container").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("close-repo-ranking")?.addEventListener("click", () => {
      $("repo-ranking-container").style.display = "none";
    });
    $("btn-career-ideas")?.addEventListener("click", () => {
      showSection("career");
    });
    $("btn-career-ask-ai")?.addEventListener("click", () => {
      ChatEngine.isOpen = false;
      ChatEngine.toggle();
      ChatEngine.sendMessage("Based on my top languages and repositories, what specific software engineering jobs or internships should I apply for, and what portfolio projects will help me get hired?");
    });
    $("strategy-modal-close")?.addEventListener("click", () => {
      hideEl($("ai-strategy-modal"));
    });
    $("ai-strategy-modal")?.addEventListener("click", (e) => {
      if (e.target === $("ai-strategy-modal")) hideEl($("ai-strategy-modal"));
    });
    $("btn-roast")?.addEventListener("click", () => {
      ChatEngine.isOpen = false;
      ChatEngine.toggle();
      ChatEngine.sendMessage("Please roast my GitHub profile based on my stats. Be extremely sarcastic, funny, and ruthless about my commits, languages, and repos. Do not hold back.");
    });
    $("btn-career-pred")?.addEventListener("click", () => {
      ChatEngine.isOpen = false;
      ChatEngine.toggle();
      ChatEngine.sendMessage("Based on my top programming languages and GitHub stats, predict what technology, framework, or language I should learn next to level up my career. Give me a structured learning path.");
    });
    $("btn-resume")?.addEventListener("click", () => {
      ResumeManager.generate();
    });
    ThemeManager.init();
    ChatEngine.init();
    TradingCardManager.init();
    initNavigation();
    updateRecentSearchesUI();
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get("user");
    if (userParam) {
      if ($("username-input")) $("username-input").value = userParam;
      analyzeProfile(userParam);
    }
    document.querySelectorAll(".period-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".period-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.period = btn.dataset.period === "all" ? "all" : Number(btn.dataset.period);
        renderActivity(state.commits, state.period);
      });
    });
    $("repo-search")?.addEventListener("input", (e) => {
      state.repoQuery = e.target.value.trim();
      state.repoPage = 1;
      renderRepositories();
    });
    $("lang-filter")?.addEventListener("change", (e) => {
      state.repoLang = e.target.value;
      state.repoPage = 1;
      renderRepositories();
    });
    $("sort-select")?.addEventListener("change", (e) => {
      state.repoSort = e.target.value;
      state.repoPage = 1;
      renderRepositories();
    });
    $("repo-pagination")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".page-btn");
      if (btn && btn.dataset.page) {
        const p = Number(btn.dataset.page);
        if (!isNaN(p) && p >= 1) {
          state.repoPage = p;
          renderRepositories();
          $("repo-table")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    });
    function resetToLanding() {
      hideEl($("dashboard"));
      hideEl($("loading-screen"));
      hideEl($("error-banner"));
      showEl($("landing"));
      const input = $("username-input");
      if (input) {
        input.value = "";
        input.focus();
      }
      window.history.pushState({}, "", window.location.pathname);
      updateRecentSearchesUI();
    }
    $("new-search-btn")?.addEventListener("click", resetToLanding);
    $("mobile-new-search")?.addEventListener("click", resetToLanding);
    $("analyze-btn")?.addEventListener("click", () => {
      const username = $("username-input")?.value.trim();
      if (!username) {
        $("username-input")?.focus();
        return;
      }
      analyzeProfile(username);
    });
    $("username-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("analyze-btn")?.click();
    });
    document.querySelectorAll(".example-chip").forEach((chip) => {
      if (chip.classList.contains("recent-chip")) return;
      chip.addEventListener("click", () => {
        const user = chip.dataset.user;
        if ($("username-input")) $("username-input").value = user;
        analyzeProfile(user);
      });
    });
    $("error-close")?.addEventListener("click", () => hideEl($("error-banner")));
    $("sidebar-toggle")?.addEventListener("click", () => {
      const sidebar = $("sidebar");
      const overlay = $("sidebar-overlay");
      const isOpen = sidebar?.classList.contains("open");
      if (sidebar) sidebar.classList.toggle("open", !isOpen);
      if (overlay) {
        overlay.classList.toggle("open", !isOpen);
        if (!isOpen) showEl(overlay);
        else hideEl(overlay);
      }
      $("sidebar-toggle")?.setAttribute("aria-expanded", String(!isOpen));
    });
    $("sidebar-overlay")?.addEventListener("click", closeSidebar);
    $("desktop-sidebar-toggle")?.addEventListener("click", () => {
      $("sidebar")?.classList.remove("collapsed");
      $("main-content")?.classList.remove("expanded");
      const toggleBtn = $("desktop-sidebar-toggle");
      if (toggleBtn) toggleBtn.style.display = "none";
    });
    $("close-sidebar-btn")?.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        closeSidebar();
      } else {
        $("sidebar")?.classList.add("collapsed");
        $("main-content")?.classList.add("expanded");
        const toggleBtn = $("desktop-sidebar-toggle");
        if (toggleBtn) toggleBtn.style.display = "inline-flex";
      }
    });
    $("sidebar-new-search")?.addEventListener("click", resetToLanding);
    hideEl($("dashboard"));
    hideEl($("loading-screen"));
    hideEl($("error-banner"));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
