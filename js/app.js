import { $, showEl, hideEl } from './utils.js';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { Storage } from './storage.js';
import { ThemeManager } from './theme.js';

import { ChatEngine } from './chat.js';
import { ResumeManager } from './resume.js';
import { TradingCardManager } from './trading-card.js';
import { JobsManager } from './jobs.js';
import { CareerMatcher } from './career.js';
import { RankingManager } from './ranking.js';
import { ApiClient, InsightsEngine } from './api.js';
import { DataProcessor } from './data.js';
import {
  setStep, setStatus, renderProfile, renderStats, renderScore, renderStreakMini,
  renderActivity, renderRepoHighlights, renderRepositories, renderLanguages, renderInsights, renderTechStack,
  renderCareerSection
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
  if (sec) { 
    sec.hidden = false; 
    sec.classList.add('active'); 
    
    if (name === 'activity') {
      const scrollEl = document.querySelector('.heatmap-scroll');
      if (scrollEl) {
        setTimeout(() => {
          scrollEl.scrollLeft = scrollEl.scrollWidth;
        }, 10);
      }
    }
  }
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
    setStatus('Fetching comprehensive profile data via GraphQL...');
    
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
    if (!gqlData || !gqlData.user) throw new AppError('not_found');
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
      following: u.following?.totalCount || 0,
    };
    setStep('profile', true);

    const actualLogin = u.login;

    setStep('repos');
    setStatus('Processing repositories...');
    const rawRepos = u.repositories?.nodes || [];
    state.repos = rawRepos.map(r => ({
      name: r.name,
      fullName: `${u.login}/${r.name}`,
      description: r.description || '',
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
    setStep('repos', true);

    setStep('languages');
    setStatus('Aggregating languages & code stats...');
    const langMap = {};
    state.repos.forEach(r => {
      if (r.fork) return;
      r._languages.forEach(edge => {
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
    setStep('languages', true);

    setStatus('Detecting tech stack...');
    const topReposForStack = state.repos.filter(r => !r.fork).sort((a, b) => b.stars - a.stars || b.updatedAt - a.updatedAt).slice(0, 10);
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
        const techSet = new Set();
        if (stackData && stackData.user) {
          Object.values(stackData.user).forEach(repoData => {
            if (!repoData) return;
            if (repoData.pkg?.text) {
              const text = repoData.pkg.text;
              if (text.includes('"react"')) techSet.add('React');
              if (text.includes('"next"')) techSet.add('Next.js');
              if (text.includes('"vue"')) techSet.add('Vue');
              if (text.includes('"svelte"')) techSet.add('Svelte');
              if (text.includes('"express"')) techSet.add('Express');
              if (text.includes('"tailwindcss"')) techSet.add('Tailwind CSS');
              if (text.includes('"@angular/core"')) techSet.add('Angular');
              techSet.add('Node.js');
            }
            if (repoData.req?.text) {
              const text = repoData.req.text.toLowerCase();
              if (text.includes('django')) techSet.add('Django');
              if (text.includes('flask')) techSet.add('Flask');
              if (text.includes('fastapi')) techSet.add('FastAPI');
              if (text.includes('pandas') || text.includes('numpy')) techSet.add('Data Science');
            }
            if (repoData.gomod?.text) {
              techSet.add('Go Modules');
            }
            if (repoData.pom?.text) {
              const text = repoData.pom.text.toLowerCase();
              if (text.includes('spring-boot')) techSet.add('Spring Boot');
            }
            if (repoData.composer?.text) {
              const text = repoData.composer.text.toLowerCase();
              if (text.includes('laravel/framework')) techSet.add('Laravel');
              if (text.includes('symfony/symfony')) techSet.add('Symfony');
            }
          });
        }
        state.techStack = Array.from(techSet);
      } catch (err) {
        console.warn('Failed to fetch tech stack:', err);
      }
    }

    setStep('activity');
    setStatus('Analyzing commit activity & streak metrics...');
    
    const years = u.contributionsCollection?.contributionYears || [];
    if (years.length > 0) {
      setStatus('Fetching lifetime contribution data...');
      let lifetimeQuery = `query($login: String!) { user(login: $login) { `;
      const currentYear = new Date().getFullYear();
      years.forEach(year => {
        const from = `${year}-01-01T00:00:00Z`;
        const to = year === currentYear ? new Date().toISOString() : `${year}-12-31T23:59:59Z`;
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
        sortedYears.forEach(year => {
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
    }
    
    state.commits = DataProcessor.parseCommits(extracted);
    setStep('activity', true);

    setStep('insights');
    setStatus('Generating developer intelligence insights...');
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

    const cutoff90 = Date.now() - 90 * 86400000;
    const recentCommits90 = state.commits.filter(c => c.date && c.date.getTime() > cutoff90).length;

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
      activityScore: scoreData.total,
    };

    state.insights = await InsightsEngine.analyze(analysisData);
    setStep('insights', true);

    state.career = CareerMatcher.analyzeCareer({
      profile: state.profile,
      repos: state.repos,
      langStats,
      commits: state.commits,
      streaks,
      techStack: state.techStack,
    });

    setStatus('Preparing dashboard presentation...');
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

async function handleGenerateStrategy(role) {
  const modal = $('ai-strategy-modal');
  const title = $('strategy-role-title');
  const sub = $('strategy-role-subtitle');
  const content = $('ai-strategy-content');
  if (!modal || !content) return;

  showEl(modal);
  if (title) title.innerHTML = `<span style="color:var(--accent)">AI Strategy:</span> ${role.title}`;
  if (sub) sub.textContent = `Targeting ${role.category} • Match ${role.matchPct}%`;

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
      repos: state.repos,
    });

    content.innerHTML = `
      <div class="strategy-block">
        <div class="strategy-block-title">🎯 Recruiter Elevator Pitch</div>
        <div class="strategy-box">
          <p>${strategy.elevatorPitch}</p>
        </div>
      </div>

      <div class="strategy-block">
        <div class="strategy-block-title">📄 High-Impact Resume Bullet Points</div>
        <div class="strategy-box">
          <ul class="strategy-bullet-list">
            ${(strategy.resumeBulletPoints || []).map(bp => `<li>${bp}</li>`).join('')}
          </ul>
        </div>
      </div>

      <div class="strategy-block">
        <div class="strategy-block-title">💬 Technical & Behavioral Interview Prep</div>
        <div class="strategy-box">
          ${(strategy.interviewQuestions || []).map(iq => `
            <div style="margin-bottom: 12px;">
              <strong style="color: var(--text-primary);">Q: ${iq.q}</strong>
              <p style="margin-top: 4px; color: var(--text-secondary); font-size: 0.82rem;">💡 <em>Strategy:</em> ${iq.tip}</p>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="strategy-block" style="margin-bottom: 0;">
        <div class="strategy-block-title">🚀 Fast-Track Action to Stand Out</div>
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
  $('btn-career-match')?.addEventListener('click', () => { JobsManager.runJobMatcher(); });
  $('btn-career-hub')?.addEventListener('click', () => { showSection('career'); });
  
  $('btn-repo-ranking')?.addEventListener('click', () => {
    RankingManager.runRankingAnalysis();
    $('repo-ranking-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  
  $('close-repo-ranking')?.addEventListener('click', () => {
    $('repo-ranking-container').style.display = 'none';
  });
  $('btn-career-ideas')?.addEventListener('click', () => { showSection('career'); });
  $('btn-career-ask-ai')?.addEventListener('click', () => {
    ChatEngine.isOpen = false;
    ChatEngine.toggle();
    ChatEngine.sendMessage('Based on my top languages and repositories, what specific software engineering jobs or internships should I apply for, and what portfolio projects will help me get hired?');
  });
  $('strategy-modal-close')?.addEventListener('click', () => { hideEl($('ai-strategy-modal')); });
  $('ai-strategy-modal')?.addEventListener('click', (e) => { if (e.target === $('ai-strategy-modal')) hideEl($('ai-strategy-modal')); });

  $('btn-roast')?.addEventListener('click', () => { ChatEngine.isOpen = false; ChatEngine.toggle(); ChatEngine.sendMessage('Please roast my GitHub profile based on my stats. Be extremely sarcastic, funny, and ruthless about my commits, languages, and repos. Do not hold back.'); });
  $('btn-career-pred')?.addEventListener('click', () => { ChatEngine.isOpen = false; ChatEngine.toggle(); ChatEngine.sendMessage('Based on my top programming languages and GitHub stats, predict what technology, framework, or language I should learn next to level up my career. Give me a structured learning path.'); });

  $('btn-resume')?.addEventListener('click', () => { ResumeManager.generate(); });
  ThemeManager.init();

  ChatEngine.init();
  TradingCardManager.init();
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

  $('desktop-sidebar-toggle')?.addEventListener('click', () => {
    $('sidebar')?.classList.remove('collapsed');
    $('main-content')?.classList.remove('expanded');
    const toggleBtn = $('desktop-sidebar-toggle');
    if (toggleBtn) toggleBtn.style.display = 'none';
  });

  $('close-sidebar-btn')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    } else {
      $('sidebar')?.classList.add('collapsed');
      $('main-content')?.classList.add('expanded');
      const toggleBtn = $('desktop-sidebar-toggle');
      if (toggleBtn) toggleBtn.style.display = 'inline-flex';
    }
  });

  $('sidebar-new-search')?.addEventListener('click', resetToLanding);

  hideEl($('dashboard'));
  hideEl($('loading-screen'));
  hideEl($('error-banner'));
}



document.addEventListener('DOMContentLoaded', init);









