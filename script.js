'use strict';

/* ============================================================
   CONFIGURATION
   ============================================================ */
const CONFIG = {
  // Read token from localStorage if provided by user, else unauthenticated
  GITHUB_TOKEN: localStorage.getItem('gh_analyzer_token') || '',
  GITHUB_API: 'https://api.github.com',

  GEMINI_API_KEY: localStorage.getItem('gh_analyzer_gemini_key') || '',
  GEMINI_MODEL: 'gemini-1.5-flash',

  MAX_REPOS: 100,        // Max repos to fetch
  COMMIT_REPOS: 10,      // Top repos to fetch commits for
  COMMITS_PER_REPO: 100, // Commits per repo
  REPOS_PER_PAGE: 15,    // Table pagination
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
  Vue: '#41b883', Svelte: '#ff3e00', Jupyter: '#da5b0b', Other: '#8a95a5',
};

function getLangColor(lang) {
  return LANG_COLORS[lang] || LANG_COLORS.Other;
}

/* ============================================================
   HELPERS & UTILITIES
   ============================================================ */
function $(id) { return document.getElementById(id); }

function showEl(el) { if (el) { el.hidden = false; } }
function hideEl(el) { if (el) { el.hidden = true; } }

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getUtcDateStr(d) {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatNumber(n) {
  if (n === 'N/A' || n === null || n === undefined) return 'N/A';
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toLocaleString();
}

function formatDate(d) {
  if (!d) return 'N/A';
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dateObj);
}

function formatMonthYear(monthStr) {
  if (!monthStr || !monthStr.includes('-')) return monthStr || 'N/A';
  const [year, month] = monthStr.split('-');
  const dateObj = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function relativeDate(d) {
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return 'N/A';
  const diff = Date.now() - dateObj.getTime();
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  profile: null,
  repos: [],
  languages: {},   // { lang: { bytes, repoCount, repos } }
  commits: [],     // flat list of { sha, date, dateStr, hour, day, month, repo }
  repoPage: 1,
  repoQuery: '',
  repoLang: '',
  repoSort: 'stars',
  period: 7,
  insights: null,
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
   API CLIENT
   ============================================================ */
const ApiClient = {
  _headers() {
    const token = localStorage.getItem('gh_analyzer_token') || CONFIG.GITHUB_TOKEN;
    const h = { Accept: 'application/vnd.github+json' };
    if (token && token.trim()) {
      h['Authorization'] = `Bearer ${token.trim()}`;
    }
    return h;
  },

  async get(path) {
    const url = path.startsWith('http') ? path : `${CONFIG.GITHUB_API}${path}`;
    let resp;
    try {
      resp = await fetch(url, { headers: this._headers() });
    } catch (networkErr) {
      throw new AppError('network_error', networkErr.message);
    }

    if (resp.status === 404) throw new AppError('not_found');
    if (resp.status === 401) throw new AppError('invalid_token');
    if (resp.status === 403) throw new AppError('rate_limit');
    if (!resp.ok) throw new AppError('api_error', resp.status);
    return resp.json();
  },

  async getPages(path, maxPages = 3, perPage = 100) {
    const results = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes('?') ? '&' : '?';
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
};

/* ============================================================
   DATA PROCESSOR
   ============================================================ */
const DataProcessor = {
  // ─── Repositories ──────────────────────────────────────────
  processRepos(repos) {
    if (!Array.isArray(repos)) return [];
    return repos.map(r => ({
      name: r.name,
      fullName: r.full_name || `${r.owner?.login || ''}/${r.name}`,
      description: r.description || '',
      language: r.language || null,
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      issues: r.open_issues_count || 0,
      updatedAt: new Date(r.pushed_at || r.updated_at),
      createdAt: new Date(r.created_at),
      url: r.html_url || `https://github.com/${r.full_name}`,
      fork: !!r.fork,
      size: r.size || 0,
    }));
  },

  // ─── Languages ─────────────────────────────────────────────
  aggregateLanguages(langDataArray) {
    const agg = {};
    if (Array.isArray(langDataArray)) {
      for (const item of langDataArray) {
        if (!item || !item.data) continue;
        const repo = item.repo;
        for (const [lang, bytes] of Object.entries(item.data)) {
          if (typeof bytes !== 'number' || bytes <= 0) continue;
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
    return Object.entries(langMap)
      .filter(([, info]) => info.bytes > 0)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([name, info], i) => ({
        rank: i + 1,
        name,
        bytes: info.bytes,
        repoCount: info.repoCount,
        pct: total > 0 ? (info.bytes / total) * 100 : 0,
      }));
  },

  // ─── Commits & Events ──────────────────────────────────────
  parseCommits(rawCommits) {
    if (!Array.isArray(rawCommits)) return [];
    const seen = new Set();
    return rawCommits
      .map(c => {
        if (!c) return null;
        const dateRaw = c.commit?.author?.date || c.commit?.committer?.date || c.created_at;
        if (!dateRaw) return null;
        const d = new Date(dateRaw);
        if (isNaN(d.getTime())) return null;

        const sha = c.sha || c.id || `${d.getTime()}-${c._repo || ''}`;
        if (seen.has(sha)) return null;
        seen.add(sha);

        const dateStr = getUtcDateStr(d);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');

        return {
          sha,
          date: d,
          dateStr,
          hour: d.getUTCHours(),
          day: d.getUTCDay(), // 0=Sun
          month: `${y}-${m}`,
          repo: c._repo || c.repo?.name || '',
        };
      })
      .filter(Boolean);
  },

  // ─── Streaks ───────────────────────────────────────────────
  calculateStreaks(commits) {
    if (!Array.isArray(commits) || commits.length === 0) {
      return { current: 0, longest: 0, totalActive: 0, longestInactive: 0, avgPerWeek: 0 };
    }
    const dateSets = [...new Set(commits.map(c => c.dateStr).filter(Boolean))].sort();
    if (dateSets.length === 0) {
      return { current: 0, longest: 0, totalActive: 0, longestInactive: 0, avgPerWeek: 0 };
    }

    const todayStr = getUtcDateStr(new Date());
    const yesterdayStr = getUtcDateStr(new Date(Date.now() - 86400000));

    // Build day gaps
    const gaps = [];
    for (let i = 1; i < dateSets.length; i++) {
      const d1 = new Date(dateSets[i - 1] + 'T00:00:00Z');
      const d2 = new Date(dateSets[i] + 'T00:00:00Z');
      const gap = Math.round((d2 - d1) / 86400000);
      gaps.push(gap);
    }

    // Longest streak
    let longest = 1, cur = 1;
    for (const g of gaps) {
      cur = g === 1 ? cur + 1 : 1;
      if (cur > longest) longest = cur;
    }

    // Current streak (walk backwards)
    let current = 0;
    const lastDate = dateSets[dateSets.length - 1];
    if (lastDate === todayStr || lastDate === yesterdayStr) {
      current = 1;
      for (let i = dateSets.length - 2; i >= 0; i--) {
        const dNext = new Date(dateSets[i + 1] + 'T00:00:00Z');
        const dCur = new Date(dateSets[i] + 'T00:00:00Z');
        const diff = Math.round((dNext - dCur) / 86400000);
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
    const firstDateObj = new Date(dateSets[0] + 'T00:00:00Z');
    const lastDateObj = new Date(dateSets[dateSets.length - 1] + 'T00:00:00Z');
    const totalWeeks = Math.max(1, (lastDateObj - firstDateObj) / (7 * 86400000));
    const avgPerWeek = +(dateSets.length / totalWeeks).toFixed(1);

    return {
      current,
      longest,
      totalActive: dateSets.length,
      longestInactive: Math.round(longestInactive),
      avgPerWeek,
    };
  },

  // ─── Activity breakdown ────────────────────────────────────
  activityByDay(commits) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const counts = Array(7).fill(0);
    commits.forEach(c => {
      if (c && typeof c.day === 'number' && c.day >= 0 && c.day < 7) {
        counts[c.day]++;
      }
    });
    return days.map((name, i) => ({ name, count: counts[i] }));
  },

  activityByHour(commits) {
    const slots = [
      { label: 'Morning', emoji: '🌅', range: '06:00 - 12:00', count: 0 },
      { label: 'Afternoon', emoji: '☀️', range: '12:00 - 17:00', count: 0 },
      { label: 'Evening', emoji: '🌆', range: '17:00 - 21:00', count: 0 },
      { label: 'Night', emoji: '🌙', range: '21:00 - 06:00', count: 0 },
    ];
    commits.forEach(c => {
      if (!c || typeof c.hour !== 'number') return;
      const h = c.hour;
      if (h >= 6 && h < 12) slots[0].count++;
      else if (h >= 12 && h < 17) slots[1].count++;
      else if (h >= 17 && h < 21) slots[2].count++;
      else slots[3].count++;
    });
    return slots;
  },

  monthlyCommits(commits) {
    const map = {};
    commits.forEach(c => {
      if (c && c.month) {
        map[c.month] = (map[c.month] || 0) + 1;
      }
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  },

  // ─── Activity Score ─────────────────────────────────────────
  calculateScore(data) {
    const { repos = [], commits = [], streaks = {}, langStats = [] } = data;
    const MAX = { consistency: 20, recentActivity: 20, repoActivity: 15, openSource: 15, streak: 15, langDiversity: 15 };
    const factors = {};

    // 1. Consistency
    const firstCommit = commits.length > 0 ? commits[commits.length - 1].date : null;
    let consistencyScore = 0;
    if (firstCommit && streaks.totalActive) {
      const totalDays = Math.max(1, (Date.now() - firstCommit.getTime()) / 86400000);
      const ratio = Math.min(1, streaks.totalActive / (totalDays * 0.35));
      consistencyScore = Math.round(ratio * MAX.consistency);
    } else if (repos.length > 0) {
      consistencyScore = Math.min(MAX.consistency, repos.length * 2);
    }
    factors.consistency = { label: 'Consistency', pts: Math.min(MAX.consistency, consistencyScore), max: MAX.consistency };

    // 2. Recent activity (last 90 days)
    const cutoff90 = Date.now() - 90 * 86400000;
    const recentCommits = commits.filter(c => c.date && c.date.getTime() > cutoff90).length;
    const recentScore = Math.min(MAX.recentActivity, Math.round((recentCommits / 30) * MAX.recentActivity));
    factors.recentActivity = { label: 'Recent Activity', pts: recentScore, max: MAX.recentActivity };

    // 3. Repository activity
    const starsTotal = repos.reduce((s, r) => s + (r.stars || 0), 0);
    const forksTotal = repos.reduce((s, r) => s + (r.forks || 0), 0);
    const repoScore = Math.min(MAX.repoActivity,
      Math.round((Math.log10(starsTotal + forksTotal + 1) / 3.5) * MAX.repoActivity));
    factors.repoActivity = { label: 'Repository Engagement', pts: repoScore, max: MAX.repoActivity };

    // 4. Open source
    const ownRepos = repos.filter(r => !r.fork);
    const osScore = Math.min(MAX.openSource,
      Math.round((Math.min(ownRepos.length, 20) / 20) * MAX.openSource));
    factors.openSource = { label: 'Original Repositories', pts: osScore, max: MAX.openSource };

    // 5. Streak
    const streakScore = Math.min(MAX.streak,
      Math.round((Math.min(streaks.longest || 0, 30) / 30) * MAX.streak));
    factors.streak = { label: 'Commit Streak', pts: streakScore, max: MAX.streak };

    // 6. Language diversity
    const langCount = langStats.length;
    const langScore = Math.min(MAX.langDiversity,
      Math.round((Math.min(langCount, 6) / 6) * MAX.langDiversity));
    factors.langDiversity = { label: 'Language Diversity', pts: langScore, max: MAX.langDiversity };

    const total = Object.values(factors).reduce((s, f) => s + f.pts, 0);
    return { total: Math.min(100, Math.max(0, total)), factors };
  },

  // ─── Filter commits by period ────────────────────────────────
  filterByPeriod(commits, period) {
    if (period === 'all') return commits;
    const numDays = Number(period);
    if (isNaN(numDays) || numDays <= 0) return commits;
    const cutoff = Date.now() - numDays * 86400000;
    return commits.filter(c => c.date && c.date.getTime() >= cutoff);
  },

  // ─── Stats summary ──────────────────────────────────────────
  computeStats(profile, repos, commits) {
    const totalStars = repos.reduce((s, r) => s + (r.stars || 0), 0);
    const totalForks = repos.reduce((s, r) => s + (r.forks || 0), 0);
    const totalIssues = repos.reduce((s, r) => s + (r.issues || 0), 0);
    return {
      totalRepos: profile.public_repos || repos.length,
      totalStars,
      totalForks,
      totalCommits: commits.length,
      followers: profile.followers || 0,
      following: profile.following || 0,
      totalIssues,
      publicGists: profile.public_gists || 0,
    };
  },
};

/* ============================================================
   INSIGHTS ENGINE (Gemini with Fallback)
   ============================================================ */
const InsightsEngine = {
  async analyze(analysisData) {
    const apiKey = localStorage.getItem('gh_analyzer_gemini_key') || CONFIG.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim() || apiKey.startsWith('AQ.')) {
      return this._fallbackInsights(analysisData);
    }

    const prompt = this._buildPrompt(analysisData);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey.trim()}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: 1200 },
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return this._parseResponse(text, analysisData);
    } catch (e) {
      console.warn('Gemini API unavailable, using local insights generator:', e);
      return this._fallbackInsights(analysisData);
    }
  },

  _buildPrompt(d) {
    return `You are a GitHub developer activity analyzer.
Analyze ONLY the measurable GitHub metrics below. Return a valid JSON array of 6 insight objects.

Metrics:
${JSON.stringify(d, null, 2)}

Required Schema:
[
  {
    "id": "consistency|momentum|tech_focus|repo_health|open_source|pattern",
    "title": "Short Title",
    "body": "1-2 sentence evidence-based factual summary.",
    "chips": ["Metric 1", "Metric 2"]
  }
]

Return ONLY raw JSON. No markdown backticks.`;
  },

  _parseResponse(text, fallbackData) {
    try {
      const clean = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
      const arr = JSON.parse(clean);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (_) { }
    return this._fallbackInsights(fallbackData);
  },

  _fallbackInsights(d) {
    const { totalCommits, currentStreak, longestStreak, topLanguages,
      totalRepos, totalStars, activeDays, recentCommits90, activityScore } = d;

    const topLangName = topLanguages && topLanguages.length > 0 ? topLanguages[0].name : 'various languages';
    const topLangPct = topLanguages && topLanguages.length > 0 ? `${topLanguages[0].pct.toFixed(0)}%` : '';

    return [
      {
        id: 'consistency',
        title: 'Activity Consistency',
        body: activeDays > 0
          ? `Recorded active contributions across ${activeDays} unique days with a peak streak of ${longestStreak} continuous days. ${currentStreak > 0 ? `Currently maintaining an active streak of ${currentStreak} days.` : 'No current active streak.'}`
          : 'Profile shows periodic project releases with limited recorded public commit timestamps.',
        chips: [`${activeDays || 0} active days`, `${longestStreak || 0}d longest streak`],
      },
      {
        id: 'momentum',
        title: 'Recent Momentum',
        body: recentCommits90 > 0
          ? `${recentCommits90} commits logged over the past 90 days, demonstrating steady development velocity.`
          : 'Low commit activity detected within the last 90-day window on analyzed repositories.',
        chips: [`${recentCommits90 || 0} commits (90d)`],
      },
      {
        id: 'tech_focus',
        title: 'Technology Stack',
        body: topLanguages && topLanguages.length > 0
          ? `Primary focus is ${topLangName}${topLangPct ? ` (${topLangPct} of tracked code)` : ''}. ${topLanguages.length > 1 ? `Also actively develops with ${topLanguages.slice(1, 3).map(l => l.name).join(' and ')}.` : ''}`
          : 'Repository languages span multiple domains and tooling.',
        chips: topLanguages && topLanguages.length > 0
          ? topLanguages.slice(0, 3).map(l => `${l.name} ${l.pct.toFixed(0)}%`)
          : ['Polyglot'],
      },
      {
        id: 'repo_health',
        title: 'Repository Portfolio',
        body: `Maintains ${totalRepos} public repositories with ${totalStars} total stargazers and ${totalCommits} analyzed commit records.`,
        chips: [`${totalRepos} repos`, `${totalStars} stars`, `${totalCommits} commits`],
      },
      {
        id: 'open_source',
        title: 'Community Recognition',
        body: totalStars > 0
          ? `Public projects have gathered ${totalStars} stars across open repositories, reflecting community usage and interest.`
          : 'Public repositories are available for exploration and collaboration on GitHub.',
        chips: [`${totalStars} stars`, `Score: ${activityScore}/100`],
      },
      {
        id: 'pattern',
        title: 'Development Cadence',
        body: totalCommits > 0
          ? `Activity indicates ${currentStreak > 5 ? 'a daily active' : activeDays > 20 ? 'a regular weekly' : 'a milestone-based'} workflow across the analyzed repository portfolio.`
          : 'Activity follows episodic releases and project updates.',
        chips: [`${topLanguages ? topLanguages.length : 0} languages`, `${totalRepos} repos`],
      },
    ];
  },
};

/* ============================================================
   TOOLTIP
   ============================================================ */
let tooltipEl = null;
function getTooltip() {
  if (!tooltipEl) tooltipEl = $('tooltip');
  return tooltipEl;
}

function showTooltip(html, x, y) {
  const tip = getTooltip();
  if (!tip) return;
  tip.innerHTML = html;
  tip.classList.add('visible');
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  tip.style.left = Math.min(x + 12, window.innerWidth - tw - 12) + 'px';
  tip.style.top = Math.max(y - th - 10, 10) + 'px';
}

function hideTooltip() {
  const tip = getTooltip();
  if (tip) tip.classList.remove('visible');
}

/* ============================================================
   PROGRESS STEPS & STATUS
   ============================================================ */
const STEPS = ['profile', 'repos', 'languages', 'activity', 'insights'];

function setStep(step, done = false) {
  STEPS.forEach(s => {
    const el = document.querySelector(`.loading-step[data-step="${s}"]`);
    if (el) {
      el.classList.remove('active', 'done');
      if (s === step) el.classList.add(done ? 'done' : 'active');
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
  const avatar = $('profile-avatar');
  if (avatar) {
    avatar.src = profile.avatar_url || '';
    avatar.alt = `${escapeHtml(profile.login)}'s avatar`;
  }
  $('profile-name').textContent = profile.name || profile.login || '';
  $('profile-username').textContent = profile.login || '';
  $('profile-bio').textContent = profile.bio || '';

  // Meta
  const metas = [];
  if (profile.location) metas.push({ icon: '📍', text: profile.location });
  if (profile.company) metas.push({ icon: '🏢', text: profile.company });
  if (profile.blog) {
    const blogUrl = profile.blog.startsWith('http') ? profile.blog : `https://${profile.blog}`;
    metas.push({ icon: '🔗', text: profile.blog, isLink: true, url: blogUrl });
  }
  const joined = profile.created_at ? new Date(profile.created_at).getUTCFullYear() : '';
  if (joined) metas.push({ icon: '📅', text: `Joined ${joined}` });

  $('profile-meta').innerHTML = metas.map(m =>
    m.isLink
      ? `<span class="meta-item"><span>${m.icon}</span><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.text)}</a></span>`
      : `<span class="meta-item"><span>${m.icon}</span><span>${escapeHtml(m.text)}</span></span>`
  ).join('');

  // Stats in profile card
  const stats = [
    { value: profile.public_repos || 0, label: 'Repositories' },
    { value: profile.followers || 0, label: 'Followers' },
    { value: profile.following || 0, label: 'Following' },
  ];
  $('profile-stats').innerHTML = stats.map(s =>
    `<div class="profile-stat-item">
      <span class="profile-stat-value">${formatNumber(s.value)}</span>
      <span class="profile-stat-label">${s.label}</span>
    </div>`
  ).join('');

  const link = $('profile-link');
  if (link) link.href = profile.html_url || `https://github.com/${profile.login}`;
}

function renderStats(stats) {
  const items = [
    { label: 'Repositories', value: stats.totalRepos, icon: '📁', color: '#5b6af0' },
    { label: 'Total Stars', value: stats.totalStars, icon: '⭐', color: '#f79824' },
    { label: 'Total Forks', value: stats.totalForks, icon: '🍴', color: '#38c97a' },
    { label: 'Commits Analyzed', value: stats.totalCommits, icon: '📦', color: '#9f7aea' },
    { label: 'Followers', value: stats.followers, icon: '👥', color: '#38b2ac' },
    { label: 'Following', value: stats.following, icon: '➡️', color: '#ed64a6' },
    { label: 'Open Issues', value: stats.totalIssues, icon: '🐛', color: '#e85b5b' },
    { label: 'Public Gists', value: stats.publicGists, icon: '📝', color: '#f79824' },
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

  const circle = $('score-circle');
  const circumference = 2 * Math.PI * 50; // r=50 -> 314.159
  const offset = circumference - (Math.min(100, Math.max(0, total)) / 100) * circumference;

  if (circle) {
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;

    const color = total >= 70 ? '#38c97a' : total >= 40 ? '#f79824' : '#e85b5b';
    circle.style.stroke = color;
    $('score-value').style.color = color;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        circle.style.strokeDashoffset = `${offset}`;
      });
    });
  }

  $('score-breakdown').innerHTML = Object.values(factors).map(f =>
    `<div class="score-factor">
      <div class="score-factor-header">
        <span class="score-factor-label">${escapeHtml(f.label)}</span>
        <span class="score-factor-pts">${f.pts}/${f.max}</span>
      </div>
      <div class="score-factor-bar">
        <div class="score-factor-fill" style="width:${f.max > 0 ? (f.pts / f.max) * 100 : 0}%"></div>
      </div>
    </div>`
  ).join('');
}

function renderStreakMini(streaks) {
  $('mini-current-streak').textContent = streaks.current || 0;
  $('mini-longest-streak').textContent = streaks.longest || 0;
}

/* ============================================================
   RENDER — Activity
   ============================================================ */
function renderActivity(commits, period) {
  const filtered = DataProcessor.filterByPeriod(commits, period);
  renderHeatmap(filtered, period);
  renderActivitySummary(filtered);
  renderStreaks(DataProcessor.calculateStreaks(filtered));
  renderDayChart(DataProcessor.activityByDay(filtered));
  renderTimeGrid(DataProcessor.activityByHour(filtered));
  renderMonthlyChart(DataProcessor.monthlyCommits(filtered));
}

function renderActivitySummary(filtered) {
  const streaks = DataProcessor.calculateStreaks(filtered);
  const byDay = DataProcessor.activityByDay(filtered);
  const mostActiveDay = [...byDay].sort((a, b) => b.count - a.count)[0];
  const monthly = DataProcessor.monthlyCommits(filtered);
  const mostActiveMonth = [...monthly].sort((a, b) => b.count - a.count)[0];

  const items = [
    { label: 'Total Commits', value: filtered.length, sub: 'in period' },
    { label: 'Active Days', value: streaks.totalActive, sub: 'unique days' },
    {
      label: 'Daily Average',
      value: filtered.length > 0 && streaks.totalActive > 0
        ? (filtered.length / streaks.totalActive).toFixed(1) : '0',
      sub: 'commits/active day'
    },
    {
      label: 'Peak Day',
      value: mostActiveDay && mostActiveDay.count > 0 ? mostActiveDay.name.slice(0, 3) : 'N/A',
      sub: mostActiveDay && mostActiveDay.count > 0 ? `${mostActiveDay.count} commits` : ''
    },
    {
      label: 'Top Month',
      value: mostActiveMonth && mostActiveMonth.count > 0 ? formatMonthYear(mostActiveMonth.month) : 'N/A',
      sub: mostActiveMonth && mostActiveMonth.count > 0 ? `${mostActiveMonth.count} commits` : ''
    },
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
  if (!grid) return;
  grid.innerHTML = '';

  const countMap = {};
  commits.forEach(c => {
    if (c && c.dateStr) {
      countMap[c.dateStr] = (countMap[c.dateStr] || 0) + 1;
    }
  });

  // Calculate timeframe in UTC
  const now = new Date();
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let days = period === 'all' ? 365 : Number(period);
  if (isNaN(days) || days < 7) days = 7;

  const startUtc = new Date(endUtc.getTime() - (days - 1) * 86400000);
  const firstSunday = new Date(startUtc.getTime() - startUtc.getUTCDay() * 86400000);

  const counts = Object.values(countMap);
  const maxCount = counts.length > 0 ? Math.max(1, ...counts) : 1;

  const cursor = new Date(firstSunday.getTime());
  while (cursor <= endUtc) {
    const weekEl = document.createElement('div');
    weekEl.className = 'heatmap-week';

    for (let d = 0; d < 7; d++) {
      const dateStr = getUtcDateStr(cursor);
      const count = countMap[dateStr] || 0;
      const inRange = cursor >= startUtc && cursor <= endUtc;

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';

      if (inRange && count > 0) {
        const level = count >= maxCount * 0.75 ? 4
          : count >= maxCount * 0.5 ? 3
            : count >= maxCount * 0.25 ? 2 : 1;
        cell.dataset.level = String(level);
      }

      if (inRange) {
        cell.addEventListener('mouseenter', e => {
          const repos = commits
            .filter(c => c.dateStr === dateStr)
            .map(c => c.repo)
            .filter(Boolean);
          const uniqueRepos = [...new Set(repos)];
          showTooltip(
            `<strong>${formatDate(dateStr + 'T00:00:00Z')}</strong><br>
             ${count} commit${count !== 1 ? 's' : ''}${uniqueRepos.length > 0
              ? '<br><span style="color:#a0aec0">' + escapeHtml(uniqueRepos.slice(0, 3).join(', ')) + '</span>'
              : ''}`,
            e.clientX, e.clientY
          );
        });
        cell.addEventListener('mouseleave', hideTooltip);
        cell.addEventListener('mousemove', e => {
          const tip = getTooltip();
          if (tip) {
            const tw = tip.offsetWidth, th = tip.offsetHeight;
            tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tw - 12) + 'px';
            tip.style.top = Math.max(e.clientY - th - 10, 10) + 'px';
          }
        });
      } else {
        cell.style.opacity = '0.2';
      }

      weekEl.appendChild(cell);
      cursor.setTime(cursor.getTime() + 86400000);
    }

    grid.appendChild(weekEl);
  }

  // Legend
  const legend = $('heatmap-legend');
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
}

function renderStreaks(streaks) {
  $('current-streak').textContent = streaks.current || 0;
  $('longest-streak').textContent = streaks.longest || 0;
  $('total-active-days').textContent = streaks.totalActive || 0;
  $('avg-active-week').textContent = streaks.avgPerWeek || 0;
  $('longest-inactive').textContent = streaks.longestInactive || 0;

  $('mini-current-streak').textContent = streaks.current || 0;
  $('mini-longest-streak').textContent = streaks.longest || 0;
}

function renderDayChart(dayData) {
  const container = $('day-bar-chart');
  if (!container || !dayData || dayData.length === 0) return;
  const max = Math.max(1, ...dayData.map(d => d.count));
  const maxDay = dayData.reduce((a, b) => a.count > b.count ? a : b, dayData[0]);

  container.innerHTML = dayData.map(d =>
    `<div class="bar-row">
      <span class="bar-day">${escapeHtml(d.name.slice(0, 3))}</span>
      <div class="bar-track">
        <div class="bar-fill${d.name === maxDay.name && d.count > 0 ? ' highlight' : ''}" style="width:${(d.count / max) * 100}%"></div>
      </div>
      <span class="bar-count">${d.count}</span>
    </div>`
  ).join('');
}

function renderTimeGrid(timeData) {
  const container = $('time-grid');
  if (!container || !timeData || timeData.length === 0) return;
  const total = timeData.reduce((s, t) => s + t.count, 0);
  const maxSlot = timeData.reduce((a, b) => a.count > b.count ? a : b, timeData[0]);

  container.innerHTML = timeData.map(t =>
    `<div class="time-quadrant${t.label === maxSlot.label && t.count > 0 ? ' highlight-time' : ''}">
      <span class="time-q-label">${t.emoji} ${escapeHtml(t.label)}</span>
      <span class="time-q-count">${t.count}</span>
      <span class="time-q-pct">${total > 0 ? ((t.count / total) * 100).toFixed(0) : 0}%</span>
    </div>`
  ).join('');
}

function renderMonthlyChart(monthly) {
  const container = $('monthly-chart');
  if (!container) return;
  if (!monthly || monthly.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;margin:auto">No monthly commit data available.</p>';
    return;
  }
  const max = Math.max(1, ...monthly.map(m => m.count));
  const maxMonth = monthly.reduce((a, b) => a.count > b.count ? a : b, monthly[0]);

  container.innerHTML = monthly.map(m => {
    const monthLabel = formatMonthYear(m.month);
    const height = max > 0 && m.count > 0 ? Math.max(6, (m.count / max) * 100) : 4;
    return `<div class="month-col" title="${escapeHtml(monthLabel)}: ${m.count} commits">
      <div class="month-bar-wrap">
        <div class="month-bar${m.month === maxMonth.month && m.count > 0 ? ' highlight' : ''}" style="height:${height}%"></div>
      </div>
      <span class="month-label">${escapeHtml(monthLabel)}</span>
      <span class="month-count">${m.count}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   RENDER — Repositories
   ============================================================ */
function renderRepositories() {
  let repos = [...state.repos];

  // Filter by search query
  if (state.repoQuery) {
    const q = state.repoQuery.toLowerCase();
    repos = repos.filter(r =>
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.description && r.description.toLowerCase().includes(q))
    );
  }

  // Filter by language
  if (state.repoLang) {
    repos = repos.filter(r => r.language === state.repoLang);
  }

  // Sort
  switch (state.repoSort) {
    case 'stars': repos.sort((a, b) => (b.stars || 0) - (a.stars || 0)); break;
    case 'forks': repos.sort((a, b) => (b.forks || 0) - (a.forks || 0)); break;
    case 'updated': repos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); break;
    case 'name': repos.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
  }

  // Pagination
  const total = repos.length;
  const totalPages = Math.max(1, Math.ceil(total / CONFIG.REPOS_PER_PAGE));
  if (state.repoPage > totalPages) state.repoPage = 1;
  if (state.repoPage < 1) state.repoPage = 1;

  const start = (state.repoPage - 1) * CONFIG.REPOS_PER_PAGE;
  const page = repos.slice(start, start + CONFIG.REPOS_PER_PAGE);

  // Table rows
  const tbody = $('repo-tbody');
  if (tbody) {
    if (page.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No repositories match your criteria.</td></tr>`;
    } else {
      tbody.innerHTML = page.map(r => {
        const updatedStr = relativeDate(r.updatedAt);
        const actLevel = r.stars > 50 ? 5 : r.stars > 10 ? 4 : r.stars > 2 ? 3 : r.stars > 0 ? 2 : 1;
        const bars = Array.from({ length: 5 }, (_, i) =>
          `<div class="activity-bar${i < actLevel ? ' active' : ''}" style="height:${(i + 1) * 3 + 4}px"></div>`
        ).join('');

        return `<tr>
          <td>
            <div class="repo-name-cell">
              <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" class="repo-name-link">${escapeHtml(r.name)}</a>
              ${r.description ? `<span class="repo-description" title="${escapeHtml(r.description)}">${escapeHtml(r.description)}</span>` : ''}
            </div>
          </td>
          <td>${r.language
            ? `<span><span class="lang-dot" style="background:${getLangColor(r.language)}"></span>${escapeHtml(r.language)}</span>`
            : `<span style="color:var(--text-muted)">—</span>`}</td>
          <td>${formatNumber(r.stars)}</td>
          <td>${formatNumber(r.forks)}</td>
          <td>${formatNumber(r.issues)}</td>
          <td title="${r.updatedAt ? r.updatedAt.toLocaleString() : ''}">${escapeHtml(updatedStr)}</td>
          <td><div class="activity-indicator">${bars}</div></td>
        </tr>`;
      }).join('');
    }
  }

  // Pagination controls
  const pag = $('repo-pagination');
  if (pag) {
    if (totalPages <= 1) {
      pag.innerHTML = '';
      return;
    }

    let html = `<button class="page-btn" data-page="${state.repoPage - 1}" ${state.repoPage === 1 ? 'disabled' : ''} aria-label="Previous page">&#8592;</button>`;
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - state.repoPage) <= 2) {
        html += `<button class="page-btn${p === state.repoPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
      } else if (Math.abs(p - state.repoPage) === 3) {
        html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
      }
    }
    html += `<button class="page-btn" data-page="${state.repoPage + 1}" ${state.repoPage === totalPages ? 'disabled' : ''} aria-label="Next page">&#8594;</button>`;
    pag.innerHTML = html;
  }
}

function renderRepoHighlights() {
  const sorted = [...state.repos];
  const mostStarred = [...sorted].sort((a, b) => (b.stars || 0) - (a.stars || 0))[0];
  const mostActive = [...sorted].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const mostForked = [...sorted].sort((a, b) => (b.forks || 0) - (a.forks || 0))[0];

  const highlightsEl = $('repo-highlights');
  if (highlightsEl) {
    if (mostStarred && mostStarred.name) {
      highlightsEl.innerHTML = [
        { badge: 'Most Starred', repo: mostStarred, meta: `${mostStarred.stars} stars` },
        { badge: 'Most Recent', repo: mostActive, meta: `Updated ${relativeDate(mostActive.updatedAt)}` },
        { badge: 'Most Forked', repo: mostForked, meta: `${mostForked.forks} forks` },
      ].map(h =>
        `<div class="repo-highlight-card">
          <span class="rh-badge">${h.badge}</span>
          <span class="rh-name" title="${escapeHtml(h.repo.name)}">${escapeHtml(h.repo.name)}</span>
          <span class="rh-meta">${h.meta}</span>
        </div>`
      ).join('');
    } else {
      highlightsEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No repository data available.</p>';
    }
  }

  // Populate language filter
  const langs = [...new Set(state.repos.map(r => r.language).filter(Boolean))].sort();
  const sel = $('lang-filter');
  if (sel) {
    sel.innerHTML = `<option value="">All Languages</option>` +
      langs.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  }
}

/* ============================================================
   RENDER — Languages
   ============================================================ */
function renderLanguages(langStats) {
  const bars = $('lang-bars');
  const tbody = $('lang-tbody');
  const legend = $('donut-legend');
  const svg = $('donut-svg');

  if (!langStats || langStats.length === 0) {
    if (bars) bars.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No language data available.</p>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No language data available</td></tr>';
    if (legend) legend.innerHTML = '';
    if (svg) svg.innerHTML = '';
    return;
  }

  // Donut chart
  renderDonut(langStats.slice(0, 8));

  // Bar chart
  if (bars) {
    bars.innerHTML = langStats.slice(0, 10).map(l =>
      `<div class="lang-bar-row">
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
    ).join('');
  }

  // Table
  if (tbody) {
    tbody.innerHTML = langStats.map(l =>
      `<tr>
        <td>${l.rank}</td>
        <td><span class="lang-dot" style="background:${getLangColor(l.name)}"></span>${escapeHtml(l.name)}</td>
        <td style="font-family:var(--font-mono)">${l.bytes.toLocaleString()}</td>
        <td style="font-family:var(--font-mono)">${l.pct.toFixed(2)}%</td>
        <td>${l.repoCount}</td>
      </tr>`
    ).join('');
  }
}

function renderDonut(langStats) {
  const svg = $('donut-svg');
  if (!svg || !langStats || langStats.length === 0) return;

  const cx = 100, cy = 100, r = 75;
  const total = langStats.reduce((s, l) => s + l.pct, 0) || 100;
  const gap = langStats.length > 1 ? 2 : 0;

  let currentAngle = -90; // Start at top
  const segments = langStats.map(l => {
    const angle = (l.pct / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...l, startAngle, sweepAngle: Math.max(0.5, angle - gap) };
  });

  function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const rad = (angleInDegrees * Math.PI) / 180;
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

  svg.innerHTML = segments.map(seg =>
    `<path
      d="${describeArc(cx, cy, r, seg.startAngle, seg.sweepAngle)}"
      fill="none"
      stroke="${getLangColor(seg.name)}"
      stroke-width="22"
      class="donut-seg"
      data-lang="${escapeHtml(seg.name)}"
      data-pct="${seg.pct.toFixed(1)}"
      style="cursor:pointer;transition:stroke-width 0.2s ease"
    />`
  ).join('');

  // Hover interactions
  svg.querySelectorAll('.donut-seg').forEach(path => {
    path.addEventListener('mouseenter', () => {
      path.style.strokeWidth = '28';
      const nameEl = $('donut-lang-name');
      const pctEl = $('donut-lang-pct');
      if (nameEl) nameEl.textContent = path.dataset.lang;
      if (pctEl) pctEl.textContent = path.dataset.pct + '%';
    });
    path.addEventListener('mouseleave', () => {
      path.style.strokeWidth = '22';
      const nameEl = $('donut-lang-name');
      const pctEl = $('donut-lang-pct');
      if (nameEl) nameEl.textContent = 'Total';
      if (pctEl) pctEl.textContent = '100%';
    });
  });

  // Legend
  const legend = $('donut-legend');
  if (legend) {
    legend.innerHTML = langStats.map(l =>
      `<div class="legend-item" role="listitem">
        <div class="legend-color" style="background:${getLangColor(l.name)}"></div>
        <span class="legend-name">${escapeHtml(l.name)}</span>
        <span class="legend-pct">${l.pct.toFixed(1)}%</span>
      </div>`
    ).join('');
  }
}

/* ============================================================
   RENDER — Insights
   ============================================================ */
function renderInsights(insights) {
  const container = $('insights-grid');
  if (!container) return;

  const ICONS = {
    consistency: { emoji: '📊', color: '#5b6af0' },
    momentum: { emoji: '🚀', color: '#38c97a' },
    tech_focus: { emoji: '💻', color: '#9f7aea' },
    repo_health: { emoji: '🏗️', color: '#38b2ac' },
    open_source: { emoji: '🌐', color: '#f79824' },
    pattern: { emoji: '🔄', color: '#ed64a6' },
  };

  container.innerHTML = (insights || []).map((ins, i) => {
    const ico = ICONS[ins.id] || { emoji: '📌', color: '#5b6af0' };
    return `<div class="insight-card" style="animation-delay:${i * 70}ms">
      <div class="insight-header">
        <div class="insight-icon" style="color:${ico.color};font-size:1.2rem">${ico.emoji}</div>
        <span class="insight-title">${escapeHtml(ins.title)}</span>
      </div>
      <p class="insight-body">${escapeHtml(ins.body)}</p>
      ${ins.chips && ins.chips.length ? `<div class="insight-metrics">
        ${ins.chips.map(c => `<span class="insight-metric-chip">${escapeHtml(c)}</span>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
}

/* ============================================================
   ERROR HANDLING
   ============================================================ */
function showError(code, customMessage) {
  const messages = {
    not_found: 'GitHub profile not found. Please check the username and try again.',
    invalid_token: 'Invalid GitHub Personal Access Token. Please clear or update your token.',
    rate_limit: 'GitHub API rate limit reached. Tip: Add a free GitHub token in Settings (top right) to increase limit to 5,000 req/hr.',
    network_error: 'Network connection error. Please check your internet connection.',
    api_error: 'Could not reach GitHub API. Please try again later.',
    default: 'An unexpected error occurred. Please try again.',
  };
  const msgEl = $('error-message');
  if (msgEl) {
    msgEl.textContent = (code && messages[code]) || customMessage || messages.default;
  }
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
  hideEl($('sidebar-overlay'));
  $('sidebar-toggle')?.setAttribute('aria-expanded', 'false');
}

/* ============================================================
   MAIN ANALYSIS FLOW
   ============================================================ */
async function analyzeProfile(rawUsername) {
  const username = rawUsername ? rawUsername.trim() : '';
  if (!username) return;

  // Reset state
  Object.assign(state, { profile: null, repos: [], languages: {}, commits: [], repoPage: 1 });
  hideEl($('error-banner'));

  // Switch to loading
  hideEl($('landing'));
  showEl($('loading-screen'));
  hideEl($('dashboard'));

  try {
    /* ── Step 1: Profile ── */
    setStep('profile');
    setStatus('Fetching profile info...');
    state.profile = await ApiClient.get(`/users/${encodeURIComponent(username)}`);
    setStep('profile', true);

    const actualLogin = state.profile.login || username;

    /* ── Step 2: Repositories ── */
    setStep('repos');
    setStatus('Loading repository portfolio...');
    const rawRepos = await ApiClient.getPages(
      `/users/${encodeURIComponent(actualLogin)}/repos?sort=pushed&type=all`,
      Math.ceil(CONFIG.MAX_REPOS / 100)
    );
    state.repos = DataProcessor.processRepos(rawRepos);
    setStep('repos', true);

    /* ── Step 3: Languages ── */
    setStep('languages');
    setStatus('Aggregating languages & code stats...');
    // Query top 10 non-fork repos by pushed date/stars for detailed bytes
    const nonForkRepos = state.repos.filter(r => !r.fork);
    const langCandidates = (nonForkRepos.length > 0 ? nonForkRepos : state.repos).slice(0, 10);

    const langPromises = langCandidates.map(r =>
      ApiClient.get(`/repos/${encodeURIComponent(r.fullName)}/languages`)
        .then(data => ({ repo: r.name, data }))
        .catch(() => ({ repo: r.name, data: {} }))
    );
    const langResults = await Promise.all(langPromises);
    state.languages = DataProcessor.aggregateLanguages(langResults);

    // Fallback/enrichment with repo.language if detailed byte map is sparse
    state.repos.forEach(r => {
      if (r.language && !state.languages[r.language]) {
        state.languages[r.language] = {
          bytes: Math.max(1024, (r.size || 10) * 1024),
          repoCount: 1,
          repos: [r.name],
        };
      }
    });
    setStep('languages', true);

    /* ── Step 4: Commits & Events ── */
    setStep('activity');
    setStatus('Analyzing commit activity & streak metrics...');
    const topRepos = [...state.repos]
      .sort((a, b) => (b.stars || 0) - (a.stars || 0) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, CONFIG.COMMIT_REPOS);

    // Fetch commits from top repos
    const commitPromises = topRepos.map(r =>
      ApiClient.get(`/repos/${encodeURIComponent(r.fullName)}/commits?per_page=${CONFIG.COMMITS_PER_REPO}`)
        .then(data => Array.isArray(data) ? data.map(c => ({ ...c, _repo: r.name })) : [])
        .catch(() => [])
    );

    // Also fetch public user events to capture recent push events across all repos
    const eventsPromise = ApiClient.get(`/users/${encodeURIComponent(actualLogin)}/events/public?per_page=100`)
      .then(events => {
        if (!Array.isArray(events)) return [];
        const extracted = [];
        events.forEach(ev => {
          if (ev.type === 'PushEvent' && ev.payload?.commits) {
            ev.payload.commits.forEach(pc => {
              extracted.push({
                sha: pc.sha,
                commit: { author: { date: ev.created_at } },
                _repo: ev.repo?.name ? ev.repo.name.split('/')[1] || ev.repo.name : '',
              });
            });
          } else if (ev.created_at) {
            extracted.push({
              sha: ev.id,
              commit: { author: { date: ev.created_at } },
              _repo: ev.repo?.name ? ev.repo.name.split('/')[1] || ev.repo.name : '',
            });
          }
        });
        return extracted;
      })
      .catch(() => []);

    const [rawCommitsArrays, eventCommits] = await Promise.all([
      Promise.all(commitPromises),
      eventsPromise,
    ]);

    const allRawCommits = [...rawCommitsArrays.flat(), ...eventCommits];
    state.commits = DataProcessor.parseCommits(allRawCommits);
    setStep('activity', true);

    /* ── Step 5: Insights ── */
    setStep('insights');
    setStatus('Generating developer intelligence insights...');
    const langStats = DataProcessor.getLanguageStats(state.languages);
    const stats = DataProcessor.computeStats(state.profile, state.repos, state.commits);
    const streaks = DataProcessor.calculateStreaks(state.commits);
    const scoreData = DataProcessor.calculateScore({
      repos: state.repos,
      commits: state.commits,
      streaks,
      langStats,
      profile: state.profile
    });

    const cutoff90 = Date.now() - 90 * 86400000;
    const recentCommits90 = state.commits.filter(c => c.date && c.date.getTime() > cutoff90).length;

    const analysisData = {
      totalRepos: stats.totalRepos,
      totalStars: stats.totalStars,
      totalForks: stats.totalForks,
      totalCommits: state.commits.length,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      activeDays: streaks.totalActive,
      avgPerWeek: streaks.avgPerWeek,
      recentCommits90,
      topLanguages: langStats.slice(0, 5),
      activityScore: scoreData.total,
    };

    state.insights = await InsightsEngine.analyze(analysisData);
    setStep('insights', true);

    /* ── Render Everything ── */
    setStatus('Preparing dashboard presentation...');
    renderProfile(state.profile);
    renderStats(stats);
    renderScore(scoreData);
    renderStreakMini(streaks);
    renderActivity(state.commits, state.period);
    renderRepoHighlights();
    renderRepositories();
    renderLanguages(langStats);
    renderInsights(state.insights);

    /* ── Show Dashboard ── */
    await new Promise(r => setTimeout(r, 400));
    hideEl($('loading-screen'));
    showEl($('dashboard'));
    showSection('overview');

  } catch (err) {
    console.error('Analysis error:', err);
    hideEl($('loading-screen'));
    showEl($('landing'));
    showError(err.code, err.message);
  }
}

/* ============================================================
   INITIALIZATION
   ============================================================ */
function init() {
  initNavigation();

  // Period selector buttons
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.period = btn.dataset.period === 'all' ? 'all' : Number(btn.dataset.period);
      renderActivity(state.commits, state.period);
    });
  });

  // Repo search & filters
  $('repo-search')?.addEventListener('input', e => {
    state.repoQuery = e.target.value.trim();
    state.repoPage = 1;
    renderRepositories();
  });
  $('lang-filter')?.addEventListener('change', e => {
    state.repoLang = e.target.value;
    state.repoPage = 1;
    renderRepositories();
  });
  $('sort-select')?.addEventListener('change', e => {
    state.repoSort = e.target.value;
    state.repoPage = 1;
    renderRepositories();
  });

  // Repository table pagination event delegation
  $('repo-pagination')?.addEventListener('click', e => {
    const btn = e.target.closest('.page-btn');
    if (btn && btn.dataset.page) {
      const p = Number(btn.dataset.page);
      if (!isNaN(p) && p >= 1) {
        state.repoPage = p;
        renderRepositories();
        $('repo-table')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });

  // Reset to landing
  function resetToLanding() {
    hideEl($('dashboard'));
    hideEl($('loading-screen'));
    hideEl($('error-banner'));
    showEl($('landing'));
    const input = $('username-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
  $('new-search-btn')?.addEventListener('click', resetToLanding);
  $('mobile-new-search')?.addEventListener('click', resetToLanding);

  // Analyze button & input submit
  $('analyze-btn')?.addEventListener('click', () => {
    const username = $('username-input')?.value.trim();
    if (!username) {
      $('username-input')?.focus();
      return;
    }
    analyzeProfile(username);
  });

  $('username-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('analyze-btn')?.click();
  });

  // Example user chips
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const user = chip.dataset.user;
      if ($('username-input')) $('username-input').value = user;
      analyzeProfile(user);
    });
  });

  // Error banner close
  $('error-close')?.addEventListener('click', () => hideEl($('error-banner')));

  // Mobile sidebar toggle
  $('sidebar-toggle')?.addEventListener('click', () => {
    const sidebar = $('sidebar');
    const overlay = $('sidebar-overlay');
    const isOpen = sidebar?.classList.contains('open');
    if (sidebar) sidebar.classList.toggle('open', !isOpen);
    if (overlay) {
      overlay.classList.toggle('open', !isOpen);
      if (!isOpen) showEl(overlay);
      else hideEl(overlay);
    }
    $('sidebar-toggle')?.setAttribute('aria-expanded', String(!isOpen));
  });

  $('sidebar-overlay')?.addEventListener('click', closeSidebar);

  // Settings / Token configuration
  const setupSettings = () => {
    const openBtns = [$('settings-btn'), $('landing-settings-btn'), $('mobile-settings-btn')].filter(Boolean);
    const modal = $('settings-modal');
    const closeBtn = $('settings-close-btn');
    const saveBtn = $('settings-save-btn');
    const tokenInput = $('settings-gh-token');
    const geminiInput = $('settings-gemini-key');

    openBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (tokenInput) tokenInput.value = localStorage.getItem('gh_analyzer_token') || '';
        if (geminiInput) geminiInput.value = localStorage.getItem('gh_analyzer_gemini_key') || '';
        showEl(modal);
      });
    });
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => hideEl(modal));
    }
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) hideEl(modal);
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (tokenInput) {
          const val = tokenInput.value.trim();
          if (val) localStorage.setItem('gh_analyzer_token', val);
          else localStorage.removeItem('gh_analyzer_token');
        }
        if (geminiInput) {
          const val = geminiInput.value.trim();
          if (val) localStorage.setItem('gh_analyzer_gemini_key', val);
          else localStorage.removeItem('gh_analyzer_gemini_key');
        }
        hideEl(modal);
      });
    }
  };
  setupSettings();

  // Initial display setup
  hideEl($('dashboard'));
  hideEl($('loading-screen'));
  hideEl($('error-banner'));
}

document.addEventListener('DOMContentLoaded', init);

