import { $, showEl, hideEl } from './utils.js';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { Storage } from './storage.js';
import { ThemeManager } from './theme.js';
import { ExportManager } from './export.js';
import { ApiClient, InsightsEngine } from './api.js';
import { DataProcessor } from './data.js';
import {
  setStep, setStatus, renderProfile, renderStats, renderScore, renderStreakMini,
  renderActivity, renderRepoHighlights, renderRepositories, renderLanguages, renderInsights
} from './ui.js';

function showError(code, customMessage) {
  const messages = {
    not_found: 'GitHub profile not found. Please check the username and try again.',
    invalid_token: 'Invalid GitHub Personal Access Token. Please update or clear the token in your env.js file.',
    rate_limit: 'GitHub API rate limit reached (60 req/hr). Tip: Add a free GitHub token in env.js to increase the limit to 5,000 req/hr.',
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

function updateRecentSearchesUI() {
  const container = $('recent-searches-container');
  if (!container) return;
  const recent = Storage.getRecentSearches();
  
  if (recent.length > 0) {
    container.innerHTML = `
      <span class="examples-label">Recent:</span>
      ${recent.map(u => `<button class="example-chip recent-chip" data-user="${u}" type="button">${u}</button>`).join('')}
    `;
    container.querySelectorAll('.recent-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const user = chip.dataset.user;
        if ($('username-input')) $('username-input').value = user;
        analyzeProfile(user);
      });
    });
    showEl(container);
  } else {
    hideEl(container);
  }
}

async function analyzeProfile(rawUsername) {
  const username = rawUsername ? rawUsername.trim() : '';
  if (!username) return;

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('user', username);
  window.history.pushState({}, '', url);

  Storage.addRecentSearch(username);

  Object.assign(state, { profile: null, repos: [], languages: {}, commits: [], repoPage: 1 });
  hideEl($('error-banner'));
  hideEl($('landing'));
  showEl($('loading-screen'));
  hideEl($('dashboard'));

  try {
    setStep('profile');
    setStatus('Fetching profile info...');
    state.profile = await ApiClient.get(`/users/${encodeURIComponent(username)}`);
    setStep('profile', true);

    const actualLogin = state.profile.login || username;

    setStep('repos');
    setStatus('Loading repository portfolio...');
    const rawRepos = await ApiClient.getPages(
      `/users/${encodeURIComponent(actualLogin)}/repos?sort=pushed&type=all`,
      Math.ceil(CONFIG.MAX_REPOS / 100)
    );
    state.repos = DataProcessor.processRepos(rawRepos);
    setStep('repos', true);

    setStep('languages');
    setStatus('Aggregating languages & code stats...');
    const nonForkRepos = state.repos.filter(r => !r.fork);
    const langCandidates = (nonForkRepos.length > 0 ? nonForkRepos : state.repos).slice(0, 10);

    const langPromises = langCandidates.map(r =>
      ApiClient.get(`/repos/${encodeURIComponent(r.fullName)}/languages`)
        .then(data => ({ repo: r.name, data }))
        .catch(() => ({ repo: r.name, data: {} }))
    );
    const langResults = await Promise.all(langPromises);
    state.languages = DataProcessor.aggregateLanguages(langResults);
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

    setStep('activity');
    setStatus('Analyzing commit activity & streak metrics...');
    const topRepos = [...state.repos]
      .sort((a, b) => (b.stars || 0) - (a.stars || 0) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, CONFIG.COMMIT_REPOS);
    const commitPromises = topRepos.map(r =>
      ApiClient.get(`/repos/${encodeURIComponent(r.fullName)}/commits?per_page=${CONFIG.COMMITS_PER_REPO}`)
        .then(data => Array.isArray(data) ? data.map(c => ({ ...c, _repo: r.name })) : [])
        .catch(() => [])
    );
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

function init() {
  ThemeManager.init();
  ExportManager.init();
  initNavigation();
  updateRecentSearchesUI();

  // Check URL Routing
  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  if (userParam) {
    if ($('username-input')) $('username-input').value = userParam;
    analyzeProfile(userParam);
  }

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.period = btn.dataset.period === 'all' ? 'all' : Number(btn.dataset.period);
      renderActivity(state.commits, state.period);
    });
  });
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
    window.history.pushState({}, '', window.location.pathname);
    updateRecentSearchesUI();
  }

  $('new-search-btn')?.addEventListener('click', resetToLanding);
  $('mobile-new-search')?.addEventListener('click', resetToLanding);
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
  document.querySelectorAll('.example-chip').forEach(chip => {
    if (chip.classList.contains('recent-chip')) return;
    chip.addEventListener('click', () => {
      const user = chip.dataset.user;
      if ($('username-input')) $('username-input').value = user;
      analyzeProfile(user);
    });
  });
  $('error-close')?.addEventListener('click', () => hideEl($('error-banner')));
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

  hideEl($('dashboard'));
  hideEl($('loading-screen'));
  hideEl($('error-banner'));
}

document.addEventListener('DOMContentLoaded', init);
