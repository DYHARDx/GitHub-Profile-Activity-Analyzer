/**
 * GitHub Profile Activity Analyzer — script.js
 *
 * Architecture:
 *   API Layer  → api.js functions (all requests go through ApiClient)
 *   Data Layer → DataProcessor (computes all metrics from raw API data)
 *   UI Layer   → section renderers (render* functions)
 *   Insights   → InsightsEngine (sends computed metrics to Gemini)
 *
 * Security:
 *   API keys must NEVER be hardcoded here.
 *   For production: route requests through a backend proxy.
 *   The CONFIG object below is the injection point for backend URLs.
 */

'use strict';

/* ============================================================
   CONFIG — swap these base URLs for your backend proxy in prod
   ============================================================ */
const CONFIG = {
  // GitHub: direct public API for unauthenticated requests (60 req/h)
  // Replace with '/api/github' when behind a proxy with a token
  GITHUB_API: 'https://api.github.com',

  // Gemini: In production, NEVER call Gemini from the frontend.
  // Replace GEMINI_API_KEY with your key only for local dev,
  // then move to backend (/api/analyze) before any deployment.
  GEMINI_API_KEY: '', // <-- inject via backend; leave empty to skip insights
  GEMINI_MODEL: 'gemini-1.5-flash',

  MAX_REPOS: 100,        // pages to fetch (up to 100 per page)
  COMMIT_REPOS: 10,      // top repos to fetch commits for
  COMMITS_PER_REPO: 100, // commits per repo
  REPOS_PER_PAGE: 15,    // table pagination
};

/* ============================================================
   LANGUAGE COLOURS
   ============================================================ */
const LANG_COLORS = {
  JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3572A5',
  Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
  Go: '#00add8', Rust: '#dea584', Ruby: '#701516', PHP: '#4f5d95',
  Swift: '#fa7343', Kotlin: '#A97BFF', Scala: '#c22d40', R: '#198ce7',
  Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c',
  Dart: '#00b4ab', Lua: '#000080', Haskell: '#5e5086', Elixir: '#6e4a7e',
  Clojure: '#db5855', 'Objective-C': '#438eff', Perl: '#0298c3',
  Vue: '#41b883', Svelte: '#ff3e00', Other: '#8a95a5',
};

function getLangColor(lang) {
  return LANG_COLORS[lang] || LANG_COLORS.Other;
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  profile: null,
  repos: [],
  languages: {},   // { lang: { bytes, repoCount } }
  commits: [],     // flat list of { date, repo, sha }
  repoPage: 1,
  repoQuery: '',
  repoLang: '',
  repoSort: 'stars',
  period: 7,
  insights: null,
};

/* ============================================================
   API CLIENT
   ============================================================ */
const ApiClient = {
  async get(path) {
    const url = path.startsWith('http') ? path : `${CONFIG.GITHUB_API}${path}`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (resp.status === 404) throw new AppError('not_found');
    if (resp.status === 403) throw new AppError('rate_limit');
    if (!resp.ok) throw new AppError('api_error', resp.status);
    return resp.json();
  },

  async getPages(path, maxPages = 5, perPage = 100) {
    const results = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const data = await this.get(`${path}${sep}per_page=${perPage}&page=${page}`);
      results.push(...data);
      if (data.length < perPage) break;
    }
    return results;
  },
};

/* ============================================================
   CUSTOM ERROR
   ============================================================ */
class AppError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

/* ============================================================
   DATA PROCESSOR
   ============================================================ */
const DataProcessor = {
  // ─── Repositories ──────────────────────────────────────────
  processRepos(repos) {
    return repos.map(r => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description || '',
      language: r.language || null,
      stars: r.stargazers_count,
      forks: r.forks_count,
      issues: r.open_issues_count,
      updatedAt: new Date(r.updated_at),
      createdAt: new Date(r.created_at),
      url: r.html_url,
      fork: r.fork,
      size: r.size,
    }));
  },

  // ─── Languages ─────────────────────────────────────────────
  aggregateLanguages(langDataArray) {
    const agg = {};
    for (const { repo, data } of langDataArray) {
      for (const [lang, bytes] of Object.entries(data)) {
        if (!agg[lang]) agg[lang] = { bytes: 0, repoCount: 0, repos: [] };
        agg[lang].bytes += bytes;
        agg[lang].repoCount++;
        agg[lang].repos.push(repo);
      }
    }
    return agg;
  },

  getLanguageStats(langMap) {
    const total = Object.values(langMap).reduce((s, v) => s + v.bytes, 0);
    return Object.entries(langMap)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([name, info], i) => ({
        rank: i + 1,
        name,
        bytes: info.bytes,
        repoCount: info.repoCount,
        pct: total > 0 ? (info.bytes / total) * 100 : 0,
      }));
  },

  // ─── Commits ───────────────────────────────────────────────
  parseCommits(rawCommits) {
    return rawCommits
      .filter(c => c.commit?.author?.date)
      .map(c => {
        const d = new Date(c.commit.author.date);
        return {
          sha: c.sha,
          date: d,
          dateStr: d.toISOString().slice(0, 10), // YYYY-MM-DD
          hour: d.getHours(),
          day: d.getDay(), // 0=Sun
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          repo: c._repo || '',
        };
      });
  },

  // ─── Streaks ───────────────────────────────────────────────
  calculateStreaks(commits) {
    const dateSets = [...new Set(commits.map(c => c.dateStr))].sort();
    if (dateSets.length === 0) {
      return { current: 0, longest: 0, totalActive: 0, longestInactive: 0, avgPerWeek: 0 };
    }

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Build day-gap array
    const gaps = [];
    for (let i = 1; i < dateSets.length; i++) {
      const gap = (new Date(dateSets[i]) - new Date(dateSets[i - 1])) / 86400000;
      gaps.push(gap);
    }

    // Longest streak
    let longest = 1, cur = 1;
    for (const g of gaps) {
      cur = g === 1 ? cur + 1 : 1;
      if (cur > longest) longest = cur;
    }

    // Current streak — walk backwards from today
    let current = 0;
    const lastDate = dateSets[dateSets.length - 1];
    if (lastDate === today || lastDate === yesterday) {
      current = 1;
      for (let i = dateSets.length - 2; i >= 0; i--) {
        const diff = (new Date(dateSets[i + 1]) - new Date(dateSets[i])) / 86400000;
        if (diff === 1) current++;
        else break;
      }
    }

    // Longest inactive
    let longestInactive = 0;
    for (const g of gaps) {
      if (g - 1 > longestInactive) longestInactive = g - 1;
    }

    // Avg active days per week
    const firstDate = new Date(dateSets[0]);
    const lastDateObj = new Date(dateSets[dateSets.length - 1]);
    const totalWeeks = Math.max(1, (lastDateObj - firstDate) / (7 * 86400000));
    const avgPerWeek = +(dateSets.length / totalWeeks).toFixed(1);

    return {
      current,
      longest,
      totalActive: dateSets.length,
      longestInactive: Math.round(longestInactive),
      avgPerWeek,
    };
  },

  // ─── Activity by day of week / time ────────────────────────
  activityByDay(commits) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const counts = Array(7).fill(0);
    commits.forEach(c => counts[c.day]++);
    return days.map((name, i) => ({ name, count: counts[i] }));
  },

  activityByHour(commits) {
    const slots = [
      { label: 'Morning',   emoji: '🌅', range: [6, 12],  count: 0 },
      { label: 'Afternoon', emoji: '☀️', range: [12, 17], count: 0 },
      { label: 'Evening',   emoji: '🌆', range: [17, 21], count: 0 },
      { label: 'Night',     emoji: '🌙', range: [21, 30], count: 0 }, // 21-06
    ];
    commits.forEach(c => {
      const h = c.hour;
      if (h >= 6  && h < 12) slots[0].count++;
      else if (h >= 12 && h < 17) slots[1].count++;
      else if (h >= 17 && h < 21) slots[2].count++;
      else slots[3].count++;
    });
    return slots;
  },

  // ─── Monthly commits ────────────────────────────────────────
  monthlyCommits(commits) {
    const map = {};
    commits.forEach(c => {
      map[c.month] = (map[c.month] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  },

  // ─── Activity Score ─────────────────────────────────────────
  calculateScore(data) {
    const { repos, commits, streaks, langStats, profile } = data;
    const MAX = { consistency: 20, recentActivity: 20, repoActivity: 15, openSource: 15, streak: 15, langDiversity: 15 };
    const factors = {};

    // 1. Consistency (based on active days vs total days)
    const firstCommit = commits.length > 0 ? new Date(commits[commits.length - 1].date) : null;
    let consistencyScore = 0;
    if (firstCommit) {
      const totalDays = Math.max(1, (Date.now() - firstCommit) / 86400000);
      const ratio = Math.min(1, streaks.totalActive / (totalDays * 0.4));
      consistencyScore = Math.round(ratio * MAX.consistency);
    }
    factors.consistency = { label: 'Consistency', pts: consistencyScore, max: MAX.consistency };

    // 2. Recent activity (last 90 days)
    const cutoff90 = Date.now() - 90 * 86400000;
    const recentCommits = commits.filter(c => c.date > cutoff90).length;
    const recentScore = Math.min(MAX.recentActivity, Math.round((recentCommits / 50) * MAX.recentActivity));
    factors.recentActivity = { label: 'Recent Activity', pts: recentScore, max: MAX.recentActivity };

    // 3. Repository activity
    const starsTotal = repos.reduce((s, r) => s + r.stars, 0);
    const forksTotal = repos.reduce((s, r) => s + r.forks, 0);
    const repoScore = Math.min(MAX.repoActivity,
      Math.round((Math.log10(starsTotal + forksTotal + 1) / 4) * MAX.repoActivity));
    factors.repoActivity = { label: 'Repository Activity', pts: repoScore, max: MAX.repoActivity };

    // 4. Open source (non-fork repos with stars)
    const ownRepos = repos.filter(r => !r.fork);
    const osScore = Math.min(MAX.openSource,
      Math.round((Math.min(ownRepos.length, 30) / 30) * MAX.openSource));
    factors.openSource = { label: 'Open Source Activity', pts: osScore, max: MAX.openSource };

    // 5. Streak
    const streakScore = Math.min(MAX.streak,
      Math.round((Math.min(streaks.longest, 60) / 60) * MAX.streak));
    factors.streak = { label: 'Streak', pts: streakScore, max: MAX.streak };

    // 6. Language diversity
    const langCount = langStats.length;
    const langScore = Math.min(MAX.langDiversity,
      Math.round((Math.min(langCount, 8) / 8) * MAX.langDiversity));
    factors.langDiversity = { label: 'Language Diversity', pts: langScore, max: MAX.langDiversity };

    const total = Object.values(factors).reduce((s, f) => s + f.pts, 0);
    return { total, factors };
  },

  // ─── Filter commits by period ────────────────────────────────
  filterByPeriod(commits, period) {
    if (period === 'all') return commits;
    const cutoff = Date.now() - period * 86400000;
    return commits.filter(c => c.date >= cutoff);
  },

  // ─── Stats summary ──────────────────────────────────────────
  computeStats(profile, repos, commits) {
    const totalStars  = repos.reduce((s, r) => s + r.stars, 0);
    const totalForks  = repos.reduce((s, r) => s + r.forks, 0);
    const totalIssues = repos.reduce((s, r) => s + r.issues, 0);
    return {
      totalRepos:   profile.public_repos,
      totalStars,
      totalForks,
      totalCommits: commits.length,
      followers:    profile.followers,
      following:    profile.following,
      totalIssues,
      pullRequests: 'N/A', // requires search API
    };
  },
};

/* ============================================================
   INSIGHTS ENGINE (Gemini)
   ============================================================ */
const InsightsEngine = {
  async analyze(analysisData) {
    if (!CONFIG.GEMINI_API_KEY) {
      return this._fallbackInsights(analysisData);
    }
    const prompt = this._buildPrompt(analysisData);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: 1500 },
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return this._parseResponse(text, analysisData);
    } catch (e) {
      console.warn('Gemini error, using fallback:', e);
      return this._fallbackInsights(analysisData);
    }
  },

  _buildPrompt(d) {
    return `You are a developer analytics engine.

Analyze ONLY the GitHub metrics provided below.

Rules:
- Do not invent statistics.
- Do not assume missing information.
- Do not make claims about intelligence, personality, income, employment, or career success.
- Focus only on measurable development activity.
- Every insight must be supported by the provided metrics.
- Avoid generic motivational language.

Metrics:
${JSON.stringify(d, null, 2)}

Return a JSON array of insight objects, each with these fields:
{
  "id": "unique_id",
  "title": "Insight title (2-4 words)",
  "body": "1-2 sentence insight supported by the data.",
  "chips": ["metric chip 1", "metric chip 2"]
}

Generate insights for:
1. Activity Consistency
2. Recent Momentum
3. Technology Focus
4. Repository Health
5. Open Source Activity
6. Development Pattern

Return only the JSON array. No markdown. No explanations.`;
  },

  _parseResponse(text, fallbackData) {
    try {
      const clean = text.replace(/```json?/g, '').replace(/```/g, '').trim();
      const arr = JSON.parse(clean);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (_) {}
    return this._fallbackInsights(fallbackData);
  },

  _fallbackInsights(d) {
    const { totalCommits, currentStreak, longestStreak, topLanguages,
            totalRepos, totalStars, activeDays, recentCommits90 } = d;

    return [
      {
        id: 'consistency',
        title: 'Activity Consistency',
        body: activeDays > 0
          ? `This developer has been active on ${activeDays} unique calendar days with a longest streak of ${longestStreak} days. ${currentStreak > 0 ? `Currently on a ${currentStreak}-day streak.` : 'No active streak at this time.'}`
          : 'Not enough public commit data to measure activity consistency.',
        chips: [`${activeDays} active days`, `${longestStreak}d longest streak`],
      },
      {
        id: 'momentum',
        title: 'Recent Momentum',
        body: recentCommits90 > 0
          ? `${recentCommits90} commits recorded in the past 90 days, averaging ${(recentCommits90 / 90).toFixed(1)} commits per day during that window.`
          : 'No commits detected in the last 90 days in the analyzed repositories.',
        chips: [`${recentCommits90} commits (90d)`],
      },
      {
        id: 'tech_focus',
        title: 'Technology Focus',
        body: topLanguages.length > 0
          ? `Primary language is ${topLanguages[0].name} at ${topLanguages[0].pct.toFixed(1)}% of total code. ${topLanguages.length > 1 ? `Also active in ${topLanguages.slice(1, 3).map(l => l.name).join(' and ')}.` : ''}`
          : 'Language data not available.',
        chips: topLanguages.slice(0, 3).map(l => `${l.name} ${l.pct.toFixed(0)}%`),
      },
      {
        id: 'repo_health',
        title: 'Repository Health',
        body: `${totalRepos} public repositories with ${totalStars} total stars and ${totalCommits} analyzed commits across the top repositories.`,
        chips: [`${totalRepos} repos`, `${totalStars} stars`, `${totalCommits} commits`],
      },
      {
        id: 'open_source',
        title: 'Open Source Activity',
        body: totalStars > 0
          ? `Public work has received ${totalStars} stars, indicating external recognition of open contributions.`
          : 'Repositories have not received stars yet, or are primarily private/forked.',
        chips: [`${totalStars} stars`],
      },
      {
        id: 'pattern',
        title: 'Development Pattern',
        body: totalCommits > 0
          ? `Activity spans ${topLanguages.length} languages across ${totalRepos} repositories. Commit data suggests a ${currentStreak > 7 ? 'consistent, daily' : currentStreak > 0 ? 'periodic' : 'intermittent'} development cadence.`
          : 'Insufficient commit data to determine development patterns.',
        chips: [`${topLanguages.length} languages`, `${totalRepos} repos`],
      },
    ];
  },
};

/* ============================================================
   UI HELPERS
   ============================================================ */
function $(id) { return document.getElementById(id); }

function showEl(el)  { if (el) { el.hidden = false; } }
function hideEl(el)  { if (el) { el.hidden = true; } }

function formatNumber(n) {
  if (n === 'N/A' || n === null || n === undefined) return 'N/A';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function formatDate(d) {
  if (!d) return 'N/A';
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(d));
}

function relativeDate(d) {
  const diff = Date.now() - new Date(d).getTime();
  const days  = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months= Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (days === 0)   return 'today';
  if (days === 1)   return 'yesterday';
  if (days < 7)    return `${days}d ago`;
  if (weeks < 4)   return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

/* Tooltip */
const tooltip = $('tooltip');
function showTooltip(html, x, y) {
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  tooltip.style.left = Math.min(x + 10, window.innerWidth - tw - 10) + 'px';
  tooltip.style.top  = Math.max(y - th - 10, 10) + 'px';
}
function hideTooltip() { tooltip.classList.remove('visible'); }

/* Progress steps */
const STEPS = ['profile', 'repos', 'languages', 'activity', 'insights'];

function setStep(step, done = false) {
  const el = document.querySelector(`.loading-step[data-step="${step}"]`);
  if (!el) return;
  STEPS.forEach(s => {
    const e = document.querySelector(`.loading-step[data-step="${s}"]`);
    if (e) {
      e.classList.remove('active', 'done');
      if (e.dataset.step === step) e.classList.add(done ? 'done' : 'active');
    }
  });
}

function setStatus(msg) {
  const el = $('loading-status');
  if (el) el.textContent = msg;
}

/* ============================================================
   RENDER — Overview
   ============================================================ */
function renderProfile(profile) {
  $('profile-avatar').src = profile.avatar_url;
  $('profile-avatar').alt = `${profile.login}'s avatar`;
  $('profile-name').textContent = profile.name || profile.login;
  $('profile-username').textContent = profile.login;
  $('profile-bio').textContent = profile.bio || '';

  // Meta
  const metas = [];
  if (profile.location) metas.push({ icon: '📍', text: profile.location });
  if (profile.company)  metas.push({ icon: '🏢', text: profile.company });
  if (profile.blog)     metas.push({ icon: '🔗', text: profile.blog });
  const joined = new Date(profile.created_at).getFullYear();
  metas.push({ icon: '📅', text: `Joined ${joined}` });

  $('profile-meta').innerHTML = metas.map(m =>
    `<span class="meta-item"><span>${m.icon}</span><span>${m.text}</span></span>`
  ).join('');

  // Stats
  const stats = [
    { value: profile.public_repos, label: 'Repositories' },
    { value: profile.followers,    label: 'Followers' },
    { value: profile.following,    label: 'Following' },
  ];
  $('profile-stats').innerHTML = stats.map(s =>
    `<div class="profile-stat-item">
      <span class="profile-stat-value">${formatNumber(s.value)}</span>
      <span class="profile-stat-label">${s.label}</span>
    </div>`
  ).join('');

  const link = $('profile-link');
  link.href = profile.html_url;
}

function renderStats(stats) {
  const items = [
    { label: 'Repositories',  value: stats.totalRepos,   icon: '📁', color: '#5b6af0' },
    { label: 'Total Stars',   value: stats.totalStars,   icon: '⭐', color: '#f79824' },
    { label: 'Total Forks',   value: stats.totalForks,   icon: '🍴', color: '#38c97a' },
    { label: 'Commits',       value: stats.totalCommits, icon: '📦', color: '#9f7aea' },
    { label: 'Followers',     value: stats.followers,    icon: '👥', color: '#38b2ac' },
    { label: 'Following',     value: stats.following,    icon: '➡️', color: '#ed64a6' },
    { label: 'Open Issues',   value: stats.totalIssues,  icon: '🐛', color: '#e85b5b' },
    { label: 'Pull Requests', value: stats.pullRequests, icon: '🔀', color: '#f79824' },
  ];

  $('stats-grid').innerHTML = items.map(item =>
    `<div class="stat-card" role="listitem">
      <div class="stat-icon" style="color:${item.color}">${item.icon}</div>
      <div class="stat-value">${formatNumber(item.value)}</div>
      <div class="stat-label">${item.label}</div>
    </div>`
  ).join('');
}

function renderScore(scoreData) {
  const { total, factors } = scoreData;
  $('score-value').textContent = total;

  // Animate ring
  const circle = $('score-circle');
  const circumference = 2 * Math.PI * 50;
  const offset = circumference - (total / 100) * circumference;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference;

  // Color based on score
  const color = total >= 70 ? '#38c97a' : total >= 40 ? '#f79824' : '#e85b5b';
  circle.style.stroke = color;
  $('score-value').style.color = color;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      circle.style.strokeDashoffset = offset;
    });
  });

  $('score-breakdown').innerHTML = Object.values(factors).map(f =>
    `<div class="score-factor">
      <div class="score-factor-header">
        <span class="score-factor-label">${f.label}</span>
        <span class="score-factor-pts">${f.pts}/${f.max}</span>
      </div>
      <div class="score-factor-bar">
        <div class="score-factor-fill" style="width:${(f.pts / f.max) * 100}%"></div>
      </div>
    </div>`
  ).join('');
}

function renderStreakMini(streaks) {
  $('mini-current-streak').textContent = streaks.current;
  $('mini-longest-streak').textContent = streaks.longest;
}

/* ============================================================
   RENDER — Activity
   ============================================================ */
function renderActivity(commits, period) {
  const filtered = DataProcessor.filterByPeriod(commits, period);
  renderHeatmap(filtered, period);
  renderActivitySummary(filtered, commits);
  renderStreaks(DataProcessor.calculateStreaks(filtered));
  renderDayChart(DataProcessor.activityByDay(filtered));
  renderTimeGrid(DataProcessor.activityByHour(filtered));
  renderMonthlyChart(DataProcessor.monthlyCommits(filtered));
}

function renderActivitySummary(filtered, allCommits) {
  const streaks = DataProcessor.calculateStreaks(filtered);
  const byDay   = DataProcessor.activityByDay(filtered);
  const mostActiveDay = [...byDay].sort((a, b) => b.count - a.count)[0];
  const monthly = DataProcessor.monthlyCommits(filtered);
  const mostActiveMonth = [...monthly].sort((a, b) => b.count - a.count)[0];

  const items = [
    { label: 'Total Commits', value: filtered.length, sub: 'in period' },
    { label: 'Active Days',   value: streaks.totalActive, sub: 'unique days' },
    { label: 'Daily Average', value: filtered.length > 0 && streaks.totalActive > 0
        ? (filtered.length / streaks.totalActive).toFixed(1) : '0', sub: 'commits/day' },
    { label: 'Most Active',   value: mostActiveDay?.name.slice(0, 3) || 'N/A', sub: mostActiveDay ? `${mostActiveDay.count} commits` : '' },
    { label: 'Best Month',    value: mostActiveMonth ? mostActiveMonth.month.slice(5) : 'N/A',
      sub: mostActiveMonth ? `${mostActiveMonth.count} commits` : '' },
  ];

  $('activity-summary').innerHTML = items.map(i =>
    `<div class="activity-stat" role="listitem">
      <span class="activity-stat-label">${i.label}</span>
      <span class="activity-stat-value">${i.value}</span>
      <span class="activity-stat-sub">${i.sub}</span>
    </div>`
  ).join('');
}

function renderHeatmap(commits, period) {
  const grid = $('heatmap-grid');
  grid.innerHTML = '';

  // Build commit count map
  const countMap = {};
  commits.forEach(c => { countMap[c.dateStr] = (countMap[c.dateStr] || 0) + 1; });

  // Determine date range
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  let days = period === 'all' ? 365 : Number(period);
  if (days < 7) days = 7;

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days + 1);

  // Align to Sunday
  const firstSunday = new Date(startDate);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

  const maxCount = Math.max(1, ...Object.values(countMap));

  // Group by weeks
  const cursor = new Date(firstSunday);
  while (cursor <= endDate) {
    const weekEl = document.createElement('div');
    weekEl.className = 'heatmap-week';

    for (let d = 0; d < 7; d++) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const count   = countMap[dateStr] || 0;
      const inRange = cursor >= startDate && cursor <= endDate;

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';

      if (inRange && count > 0) {
        const level = count >= maxCount * 0.75 ? 4
                    : count >= maxCount * 0.5  ? 3
                    : count >= maxCount * 0.25 ? 2 : 1;
        cell.dataset.level = level;
      }

      if (inRange) {
        cell.addEventListener('mouseenter', e => {
          const repos = commits.filter(c => c.dateStr === dateStr)
                               .map(c => c.repo)
                               .filter(Boolean);
          const uniqueRepos = [...new Set(repos)];
          showTooltip(
            `<strong>${formatDate(dateStr)}</strong><br>
             ${count} commit${count !== 1 ? 's' : ''}${uniqueRepos.length > 0
               ? '<br>' + uniqueRepos.slice(0, 3).join('<br>')
               : ''}`,
            e.clientX, e.clientY
          );
        });
        cell.addEventListener('mouseleave', hideTooltip);
        cell.addEventListener('mousemove', e => {
          const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
          tooltip.style.left = Math.min(e.clientX + 10, window.innerWidth - tw - 10) + 'px';
          tooltip.style.top  = Math.max(e.clientY - th - 10, 10) + 'px';
        });
      }

      weekEl.appendChild(cell);
      cursor.setDate(cursor.getDate() + 1);
    }

    grid.appendChild(weekEl);
  }

  // Legend
  $('heatmap-legend').innerHTML = `
    <span>Less</span>
    <div class="legend-cell" style="background:var(--shadow-dark)"></div>
    <div class="legend-cell" data-level="1" style="background:rgba(91,106,240,0.25)"></div>
    <div class="legend-cell" data-level="2" style="background:rgba(91,106,240,0.5)"></div>
    <div class="legend-cell" data-level="3" style="background:rgba(91,106,240,0.75)"></div>
    <div class="legend-cell" data-level="4" style="background:var(--accent)"></div>
    <span>More</span>`;
}

function renderStreaks(streaks) {
  $('current-streak').textContent  = streaks.current;
  $('longest-streak').textContent  = streaks.longest;
  $('total-active-days').textContent = streaks.totalActive;
  $('avg-active-week').textContent  = streaks.avgPerWeek;
  $('longest-inactive').textContent = streaks.longestInactive;

  $('mini-current-streak').textContent = streaks.current;
  $('mini-longest-streak').textContent  = streaks.longest;
}

function renderDayChart(dayData) {
  const max = Math.max(1, ...dayData.map(d => d.count));
  const maxDay = dayData.reduce((a, b) => a.count > b.count ? a : b);

  $('day-bar-chart').innerHTML = dayData.map(d =>
    `<div class="bar-row">
      <span class="bar-day">${d.name.slice(0, 3)}</span>
      <div class="bar-track">
        <div class="bar-fill${d.name === maxDay.name ? ' highlight' : ''}" style="width:${(d.count / max) * 100}%"></div>
      </div>
      <span class="bar-count">${d.count}</span>
    </div>`
  ).join('');
}

function renderTimeGrid(timeData) {
  const max = Math.max(1, ...timeData.map(t => t.count));
  const total = timeData.reduce((s, t) => s + t.count, 0);
  const maxSlot = timeData.reduce((a, b) => a.count > b.count ? a : b);

  $('time-grid').innerHTML = timeData.map(t =>
    `<div class="time-quadrant${t.label === maxSlot.label ? ' highlight-time' : ''}">
      <span class="time-q-label">${t.emoji} ${t.label}</span>
      <span class="time-q-count">${t.count}</span>
      <span class="time-q-pct">${total > 0 ? ((t.count / total) * 100).toFixed(0) : 0}%</span>
    </div>`
  ).join('');
}

function renderMonthlyChart(monthly) {
  const container = $('monthly-chart');
  if (monthly.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No monthly data available.</p>';
    return;
  }
  const max = Math.max(1, ...monthly.map(m => m.count));
  const maxMonth = monthly.reduce((a, b) => a.count > b.count ? a : b);

  container.innerHTML = monthly.map(m => {
    const monthLabel = new Date(m.month + '-01').toLocaleString('default', { month: 'short', year: '2-digit' });
    const height = Math.max(4, (m.count / max) * 100);
    return `<div class="month-col" title="${m.month}: ${m.count} commits">
      <div class="month-bar-wrap" style="height:100%">
        <div class="month-bar${m.month === maxMonth.month ? ' highlight' : ''}" style="height:${height}%"></div>
      </div>
      <span class="month-label">${monthLabel}</span>
      <span class="month-count">${m.count}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   RENDER — Repositories
   ============================================================ */
function renderRepositories() {
  let repos = [...state.repos];

  // Filter by search
  if (state.repoQuery) {
    const q = state.repoQuery.toLowerCase();
    repos = repos.filter(r =>
      r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    );
  }

  // Filter by language
  if (state.repoLang) {
    repos = repos.filter(r => r.language === state.repoLang);
  }

  // Sort
  switch (state.repoSort) {
    case 'stars':   repos.sort((a, b) => b.stars - a.stars); break;
    case 'forks':   repos.sort((a, b) => b.forks - a.forks); break;
    case 'updated': repos.sort((a, b) => b.updatedAt - a.updatedAt); break;
    case 'name':    repos.sort((a, b) => a.name.localeCompare(b.name)); break;
  }

  // Pagination
  const total = repos.length;
  const totalPages = Math.max(1, Math.ceil(total / CONFIG.REPOS_PER_PAGE));
  if (state.repoPage > totalPages) state.repoPage = 1;
  const start = (state.repoPage - 1) * CONFIG.REPOS_PER_PAGE;
  const page  = repos.slice(start, start + CONFIG.REPOS_PER_PAGE);

  // Table rows
  const tbody = $('repo-tbody');
  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No repositories match your filters.</td></tr>`;
  } else {
    tbody.innerHTML = page.map(r => {
      const updatedStr = relativeDate(r.updatedAt);
      const actLevel = r.stars > 100 ? 5 : r.stars > 20 ? 4 : r.stars > 5 ? 3 : r.stars > 0 ? 2 : 1;
      const bars = Array.from({ length: 5 }, (_, i) =>
        `<div class="activity-bar${i < actLevel ? ' active' : ''}" style="height:${(i + 1) * 3 + 4}px"></div>`
      ).join('');

      return `<tr>
        <td>
          <div class="repo-name-cell">
            <a href="${r.url}" target="_blank" rel="noopener noreferrer" class="repo-name-link">${r.name}</a>
            ${r.description ? `<span class="repo-description">${r.description}</span>` : ''}
          </div>
        </td>
        <td>${r.language
          ? `<span><span class="lang-dot" style="background:${getLangColor(r.language)}"></span>${r.language}</span>`
          : `<span style="color:var(--text-muted)">—</span>`}</td>
        <td>${formatNumber(r.stars)}</td>
        <td>${formatNumber(r.forks)}</td>
        <td>${formatNumber(r.issues)}</td>
        <td title="${r.updatedAt.toLocaleString()}">${updatedStr}</td>
        <td><div class="activity-indicator">${bars}</div></td>
      </tr>`;
    }).join('');
  }

  // Pagination
  const pag = $('repo-pagination');
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goToPage(${state.repoPage - 1})" ${state.repoPage === 1 ? 'disabled' : ''}>&#8592;</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - state.repoPage) <= 2) {
      html += `<button class="page-btn${p === state.repoPage ? ' active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    } else if (Math.abs(p - state.repoPage) === 3) {
      html += `<span style="color:var(--text-muted)">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goToPage(${state.repoPage + 1})" ${state.repoPage === totalPages ? 'disabled' : ''}>&#8594;</button>`;
  pag.innerHTML = html;
}

window.goToPage = function(p) {
  state.repoPage = p;
  renderRepositories();
};

function renderRepoHighlights() {
  const sorted = [...state.repos];
  const mostStarred = [...sorted].sort((a, b) => b.stars - a.stars)[0];
  const mostActive  = [...sorted].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const mostForked  = [...sorted].sort((a, b) => b.forks - a.forks)[0];

  if (!mostStarred) return;

  $('repo-highlights').innerHTML = [
    { badge: 'Most Starred', repo: mostStarred, meta: `${mostStarred.stars} stars` },
    { badge: 'Most Recent',  repo: mostActive,  meta: `Updated ${relativeDate(mostActive.updatedAt)}` },
    { badge: 'Most Forked',  repo: mostForked,  meta: `${mostForked.forks} forks` },
  ].map(h =>
    `<div class="repo-highlight-card">
      <span class="rh-badge">${h.badge}</span>
      <span class="rh-name">${h.repo.name}</span>
      <span class="rh-meta">${h.meta}</span>
    </div>`
  ).join('');

  // Populate language filter
  const langs = [...new Set(state.repos.map(r => r.language).filter(Boolean))].sort();
  const sel = $('lang-filter');
  sel.innerHTML = `<option value="">All Languages</option>` +
    langs.map(l => `<option value="${l}">${l}</option>`).join('');
}

/* ============================================================
   RENDER — Languages
   ============================================================ */
function renderLanguages(langStats) {
  if (langStats.length === 0) return;

  // Donut chart (SVG)
  renderDonut(langStats.slice(0, 10));

  // Bar chart
  const bars = $('lang-bars');
  bars.innerHTML = langStats.slice(0, 12).map(l =>
    `<div class="lang-bar-row">
      <div class="lang-bar-header">
        <span class="lang-rank">#${l.rank}</span>
        <span class="lang-dot" style="background:${getLangColor(l.name)}"></span>
        <span class="lang-name-text">${l.name}</span>
        <span class="lang-pct-text">${l.pct.toFixed(1)}%</span>
      </div>
      <div class="lang-bar-track">
        <div class="lang-bar-fill" style="width:${l.pct}%;background:${getLangColor(l.name)}"></div>
      </div>
    </div>`
  ).join('');

  // Table
  $('lang-tbody').innerHTML = langStats.map(l =>
    `<tr>
      <td>${l.rank}</td>
      <td><span class="lang-dot" style="background:${getLangColor(l.name)}"></span>${l.name}</td>
      <td style="font-family:var(--font-mono)">${l.bytes.toLocaleString()}</td>
      <td style="font-family:var(--font-mono)">${l.pct.toFixed(2)}%</td>
      <td>${l.repoCount}</td>
    </tr>`
  ).join('');
}

function renderDonut(langStats) {
  const svg = $('donut-svg');
  const cx = 100, cy = 100, r = 80;
  const circumference = 2 * Math.PI * r;
  const total = langStats.reduce((s, l) => s + l.pct, 0) || 100;
  const gap = 2; // degrees gap between segments

  let currentAngle = -90; // start at top
  const segments = langStats.map(l => {
    const angle = (l.pct / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...l, startAngle, sweepAngle: Math.max(0, angle - gap) };
  });

  function polarToCartesian(cx, cy, r, angle) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, start, sweep) {
    if (sweep >= 360) sweep = 359.99;
    const s = polarToCartesian(cx, cy, r, start);
    const e = polarToCartesian(cx, cy, r, start + sweep);
    const large = sweep > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  svg.innerHTML = segments.map(seg =>
    `<path
      d="${describeArc(cx, cy, r, seg.startAngle, seg.sweepAngle)}"
      fill="none"
      stroke="${getLangColor(seg.name)}"
      stroke-width="22"
      class="donut-seg"
      data-lang="${seg.name}"
      data-pct="${seg.pct.toFixed(1)}"
      style="cursor:pointer;transition:stroke-width 0.2s ease"
    />`
  ).join('');

  // Hover interactions
  svg.querySelectorAll('.donut-seg').forEach(path => {
    path.addEventListener('mouseenter', () => {
      path.style.strokeWidth = '28';
      $('donut-lang-name').textContent = path.dataset.lang;
      $('donut-lang-pct').textContent  = path.dataset.pct + '%';
    });
    path.addEventListener('mouseleave', () => {
      path.style.strokeWidth = '22';
      $('donut-lang-name').textContent = 'Total';
      $('donut-lang-pct').textContent  = '100%';
    });
  });

  // Legend
  $('donut-legend').innerHTML = langStats.map(l =>
    `<div class="legend-item" role="listitem">
      <div class="legend-color" style="background:${getLangColor(l.name)}"></div>
      <span class="legend-name">${l.name}</span>
      <span class="legend-pct">${l.pct.toFixed(1)}%</span>
    </div>`
  ).join('');
}

/* ============================================================
   RENDER — Insights
   ============================================================ */
function renderInsights(insights) {
  const ICONS = {
    consistency: { emoji: '📊', color: '#5b6af0' },
    momentum:    { emoji: '🚀', color: '#38c97a' },
    tech_focus:  { emoji: '💻', color: '#9f7aea' },
    repo_health: { emoji: '🏗️', color: '#38b2ac' },
    open_source: { emoji: '🌐', color: '#f79824' },
    pattern:     { emoji: '🔄', color: '#ed64a6' },
  };

  $('insights-grid').innerHTML = insights.map((ins, i) => {
    const ico = ICONS[ins.id] || { emoji: '📌', color: '#5b6af0' };
    return `<div class="insight-card" style="animation-delay:${i * 80}ms">
      <div class="insight-header">
        <div class="insight-icon" style="color:${ico.color};font-size:1.2rem">${ico.emoji}</div>
        <span class="insight-title">${ins.title}</span>
      </div>
      <p class="insight-body">${ins.body}</p>
      ${ins.chips?.length ? `<div class="insight-metrics">
        ${ins.chips.map(c => `<span class="insight-metric-chip">${c}</span>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
}

/* ============================================================
   ERROR HANDLING
   ============================================================ */
function showError(code) {
  const messages = {
    not_found: 'GitHub profile not found. Please check the username and try again.',
    rate_limit: 'GitHub API rate limit reached. Please try again in a few minutes.',
    api_error:  'Could not reach the GitHub API. Please try again later.',
    default:    'An unexpected error occurred. Please try again.',
  };
  $('error-message').textContent = messages[code] || messages.default;
  showEl($('error-banner'));
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function showSection(name) {
  document.querySelectorAll('.content-section').forEach(s => { s.hidden = true; s.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const sec = $(`section-${name}`);
  const btn = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (sec) { sec.hidden = false; sec.classList.add('active'); }
  if (btn) btn.classList.add('active');
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      showSection(btn.dataset.section);
      closeSidebar();
    });
  });
}

function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sidebar-overlay')?.classList.remove('open');
  $('sidebar-toggle')?.setAttribute('aria-expanded', 'false');
}

/* ============================================================
   MAIN ANALYSIS FLOW
   ============================================================ */
async function analyzeProfile(username) {
  // Reset state
  Object.assign(state, { profile: null, repos: [], languages: {}, commits: [], repoPage: 1 });

  // Show loading
  hideEl($('landing'));
  showEl($('loading-screen'));
  hideEl($('dashboard'));

  try {
    /* ── Step 1: Profile ── */
    setStep('profile');
    setStatus('Fetching profile...');
    state.profile = await ApiClient.get(`/users/${username}`);
    setStep('profile', true);

    /* ── Step 2: Repositories ── */
    setStep('repos');
    setStatus('Loading repositories...');
    const rawRepos = await ApiClient.getPages(
      `/users/${username}/repos?type=owner&sort=updated`,
      Math.ceil(CONFIG.MAX_REPOS / 100)
    );
    state.repos = DataProcessor.processRepos(rawRepos);
    setStep('repos', true);

    /* ── Step 3: Languages ── */
    setStep('languages');
    setStatus('Analyzing languages...');
    const langPromises = state.repos
      .filter(r => !r.fork)
      .slice(0, 30)
      .map(r => ApiClient.get(`/repos/${username}/${r.name}/languages`)
                         .then(data => ({ repo: r.name, data }))
                         .catch(() => ({ repo: r.name, data: {} })));
    const langResults = await Promise.all(langPromises);
    state.languages = DataProcessor.aggregateLanguages(langResults);
    setStep('languages', true);

    /* ── Step 4: Commits ── */
    setStep('activity');
    setStatus('Calculating activity...');
    const topRepos = [...state.repos]
      .sort((a, b) => b.stars - a.stars || b.updatedAt - a.updatedAt)
      .slice(0, CONFIG.COMMIT_REPOS);

    const commitPromises = topRepos.map(r =>
      ApiClient.get(
        `/repos/${username}/${r.name}/commits?author=${username}&per_page=${CONFIG.COMMITS_PER_REPO}`
      ).then(data => data.map(c => ({ ...c, _repo: r.name })))
       .catch(() => [])
    );
    const rawCommitsArrays = await Promise.all(commitPromises);
    const rawCommits = rawCommitsArrays.flat();
    state.commits = DataProcessor.parseCommits(rawCommits);
    setStep('activity', true);

    /* ── Step 5: Insights ── */
    setStep('insights');
    setStatus('Generating insights...');
    const langStats   = DataProcessor.getLanguageStats(state.languages);
    const stats       = DataProcessor.computeStats(state.profile, state.repos, state.commits);
    const streaks     = DataProcessor.calculateStreaks(state.commits);
    const scoreData   = DataProcessor.calculateScore({ repos: state.repos, commits: state.commits, streaks, langStats, profile: state.profile });

    const cutoff90    = Date.now() - 90 * 86400000;
    const recentCommits90 = state.commits.filter(c => c.date > cutoff90).length;

    const analysisData = {
      totalRepos:    stats.totalRepos,
      totalStars:    stats.totalStars,
      totalForks:    stats.totalForks,
      totalCommits:  state.commits.length,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      activeDays:    streaks.totalActive,
      avgPerWeek:    streaks.avgPerWeek,
      recentCommits90,
      topLanguages:  langStats.slice(0, 5),
      activityScore: scoreData.total,
    };

    state.insights = await InsightsEngine.analyze(analysisData);
    setStep('insights', true);

    /* ── Render everything ── */
    setStatus('Rendering dashboard...');
    renderProfile(state.profile);
    renderStats(stats);
    renderScore(scoreData);
    renderStreakMini(streaks);
    renderActivity(state.commits, state.period);
    renderRepoHighlights();
    renderRepositories();
    renderLanguages(langStats);
    renderInsights(state.insights);

    // Init period buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.period = btn.dataset.period === 'all' ? 'all' : Number(btn.dataset.period);
        renderActivity(state.commits, state.period);
      });
    });

    // Init repo controls
    $('repo-search').addEventListener('input', e => {
      state.repoQuery = e.target.value.trim();
      state.repoPage = 1;
      renderRepositories();
    });
    $('lang-filter').addEventListener('change', e => {
      state.repoLang = e.target.value;
      state.repoPage = 1;
      renderRepositories();
    });
    $('sort-select').addEventListener('change', e => {
      state.repoSort = e.target.value;
      state.repoPage = 1;
      renderRepositories();
    });

    /* ── Switch screens ── */
    await new Promise(r => setTimeout(r, 500));
    hideEl($('loading-screen'));
    showEl($('dashboard'));
    showSection('overview');

  } catch (err) {
    console.error('Analysis error:', err);
    hideEl($('loading-screen'));
    showEl($('landing'));
    showError(err.code || 'default');
  }
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  initNavigation();

  // New search
  function resetToLanding() {
    hideEl($('dashboard'));
    showEl($('landing'));
    $('username-input').value = '';
    $('username-input').focus();
  }
  $('new-search-btn')?.addEventListener('click', resetToLanding);
  $('mobile-new-search')?.addEventListener('click', resetToLanding);

  // Analyze button
  $('analyze-btn').addEventListener('click', () => {
    const username = $('username-input').value.trim();
    if (!username) {
      $('username-input').focus();
      return;
    }
    analyzeProfile(username);
  });

  // Enter key
  $('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('analyze-btn').click();
  });

  // Example chips
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $('username-input').value = chip.dataset.user;
      analyzeProfile(chip.dataset.user);
    });
  });

  // Error close
  $('error-close')?.addEventListener('click', () => hideEl($('error-banner')));

  // Mobile sidebar
  $('sidebar-toggle')?.addEventListener('click', () => {
    const sidebar  = $('sidebar');
    const overlay  = $('sidebar-overlay');
    const isOpen   = sidebar.classList.contains('open');
    sidebar.classList.toggle('open', !isOpen);
    overlay.classList.toggle('open', !isOpen);
    $('sidebar-toggle').setAttribute('aria-expanded', !isOpen);
    if (!isOpen) showEl(overlay);
    else hideEl(overlay);
  });

  $('sidebar-overlay')?.addEventListener('click', closeSidebar);

  // Hide dashboard initially
  hideEl($('dashboard'));
  hideEl($('loading-screen'));
}

document.addEventListener('DOMContentLoaded', init);
