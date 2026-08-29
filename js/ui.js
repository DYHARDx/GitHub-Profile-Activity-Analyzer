import { $, escapeHtml, formatNumber, formatDate, formatMonthYear, relativeDate, getUtcDateStr } from './utils.js';
import { CONFIG, getLangColor } from './config.js';
import { DataProcessor } from './data.js';
import { state } from './state.js';

let tooltipEl = null;
export function getTooltip() {
  if (!tooltipEl) tooltipEl = $('tooltip');
  return tooltipEl;
}

export function showTooltip(html, x, y) {
  const tip = getTooltip();
  if (!tip) return;
  tip.innerHTML = html;
  tip.classList.add('visible');
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  tip.style.left = Math.min(x + 12, window.innerWidth - tw - 12) + 'px';
  tip.style.top = Math.max(y - th - 10, 10) + 'px';
}

export function hideTooltip() {
  const tip = getTooltip();
  if (tip) tip.classList.remove('visible');
}

export const STEPS = ['profile', 'repos', 'languages', 'activity', 'insights'];

export function setStep(step, done = false) {
  STEPS.forEach(s => {
    const el = document.querySelector(`.loading-step[data-step="${s}"]`);
    if (el) {
      el.classList.remove('active', 'done');
      if (s === step) el.classList.add(done ? 'done' : 'active');
    }
  });
}

export function setStatus(msg) {
  const el = $('loading-status');
  if (el) el.textContent = msg;
}

export function renderProfile(profile) {
  const avatar = $('profile-avatar');
  if (avatar) {
    avatar.src = profile.avatar_url || '';
    avatar.alt = `${escapeHtml(profile.login)}'s avatar`;
  }
  $('profile-name').textContent = profile.name || profile.login || '';
  $('profile-username').textContent = profile.login || '';
  $('profile-bio').textContent = profile.bio || '';
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

export function renderStats(stats, streaks = { current: 0, longest: 0 }) {
  const items = [
    { label: 'Total Stars', value: stats.totalStars, icon: '⭐', color: '#f79824' },
    { label: 'Total Forks', value: stats.totalForks, icon: '🍴', color: '#38c97a' },
    { label: 'Commits Analyzed', value: stats.totalCommits, icon: '📦', color: '#9f7aea' },
    { label: 'Current Streak', value: streaks.current + 'd', icon: '🔥', color: '#ff6b81' },
    { label: 'Longest Streak', value: streaks.longest + 'd', icon: '🏆', color: '#eab308' },
  ];
  $('stats-grid').innerHTML = items.map(item =>
    `<div class="stat-card neu-card" role="listitem">
      <div class="stat-icon" style="color:${item.color}">${item.icon}</div>
      <div class="stat-value">${typeof item.value === 'number' ? formatNumber(item.value) : escapeHtml(item.value)}</div>
      <div class="stat-label">${item.label}</div>
    </div>`
  ).join('');
}

export function renderScore(scoreData) {
  const { total, factors } = scoreData;
  $('score-value').textContent = total;

  const circle = $('score-circle');
  const circumference = 2 * Math.PI * 50; 
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

export function renderStreakMini(streaks) {
  $('mini-current-streak').textContent = streaks.current || 0;
  $('mini-longest-streak').textContent = streaks.longest || 0;
}

export function renderActivity(calendar, commits, period) {
  renderHeatmap(calendar, period);
  renderActivitySummary(calendar);
  renderStreaks(DataProcessor.calculateStreaks(calendar));
  renderDayChart(DataProcessor.activityByDay(calendar));
  renderTimeGrid(DataProcessor.activityByHour(commits));
  renderMonthlyChart(DataProcessor.monthlyCommits(calendar));
}

export function renderActivitySummary(calendar) {
  const streaks = DataProcessor.calculateStreaks(calendar);
  const byDay = DataProcessor.activityByDay(calendar);
  const mostActiveDay = [...byDay].sort((a, b) => b.count - a.count)[0];
  const monthly = DataProcessor.monthlyCommits(calendar);
  const mostActiveMonth = [...monthly].sort((a, b) => b.count - a.count)[0];
  
  const totalCommits = calendar && calendar.totalContributions ? calendar.totalContributions : 0;

  const items = [
    { label: 'Total Contributions', value: totalCommits, sub: 'last 365 days' },
    { label: 'Active Days', value: streaks.totalActive, sub: 'unique days' },
    {
      label: 'Daily Average',
      value: totalCommits > 0 && streaks.totalActive > 0
        ? (totalCommits / streaks.totalActive).toFixed(1) : '0',
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

export function renderHeatmap(calendar, period) {
  const grid = $('heatmap-grid');
  if (!grid || !calendar || !calendar.weeks) return;
  grid.innerHTML = '';
  
  let maxCount = 1;
  calendar.weeks.forEach(w => {
    w.contributionDays.forEach(d => {
      if (d.contributionCount > maxCount) maxCount = d.contributionCount;
    });
  });

  calendar.weeks.forEach(w => {
    const weekEl = document.createElement('div');
    weekEl.className = 'heatmap-week';
    
    // GraphQL provides up to 7 days. If a week is partial (e.g. at the start of the year),
    // it only contains the days within the year. We must pad the start so days align vertically.
    const firstDayDate = new Date(w.contributionDays[0].date + 'T00:00:00Z');
    const startPadding = firstDayDate.getUTCDay();
    
    const daysInWeek = Array(7).fill(null);
    w.contributionDays.forEach(d => {
      const date = new Date(d.date + 'T00:00:00Z');
      daysInWeek[date.getUTCDay()] = d;
    });

    daysInWeek.forEach(d => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      
      if (d) {
        const count = d.contributionCount;
        if (count > 0) {
          const level = count >= maxCount * 0.75 ? 4
            : count >= maxCount * 0.5 ? 3
              : count >= maxCount * 0.25 ? 2 : 1;
          cell.dataset.level = String(level);
        }
        
        cell.addEventListener('mouseenter', e => {
          showTooltip(
            `<strong>${formatDate(d.date + 'T00:00:00Z')}</strong><br>
             ${count} contribution${count !== 1 ? 's' : ''}`,
            e.clientX, e.clientY
          );
        });
        cell.addEventListener('mouseleave', hideTooltip);
      } else {
        cell.style.visibility = 'hidden';
      }

      weekEl.appendChild(cell);
    });
    
    grid.appendChild(weekEl);
  });
  
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
  
  // Auto-scroll to the rightmost (newest) part of the heatmap
  const scrollEl = document.querySelector('.heatmap-scroll');
  if (scrollEl) {
    setTimeout(() => {
      scrollEl.scrollLeft = scrollEl.scrollWidth;
    }, 100);

    let isDown = false;
    let startX;
    let scrollLeft;
    
    scrollEl.addEventListener('mousedown', (e) => {
      isDown = true;
      startX = e.pageX - scrollEl.offsetLeft;
      scrollLeft = scrollEl.scrollLeft;
    });
    
    scrollEl.addEventListener('mouseleave', () => { isDown = false; });
    scrollEl.addEventListener('mouseup', () => { isDown = false; });
    
    scrollEl.addEventListener('mousemove', (e) => {
      if(!isDown) return;
      e.preventDefault();
      const x = e.pageX - scrollEl.offsetLeft;
      const walk = (x - startX) * 2;
      scrollEl.scrollLeft = scrollLeft - walk;
    });
  }
}

export function renderStreaks(streaks) {
  $('current-streak').textContent = streaks.current || 0;
  $('longest-streak').textContent = streaks.longest || 0;
  $('total-active-days').textContent = streaks.totalActive || 0;
  $('avg-active-week').textContent = streaks.avgPerWeek || 0;
  $('longest-inactive').textContent = streaks.longestInactive || 0;
}

export function renderDayChart(dayData) {
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

export function renderTimeGrid(timeData) {
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

export function renderMonthlyChart(monthly) {
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

export function renderRepositories() {
  let repos = [...state.repos];
  if (state.repoQuery) {
    const q = state.repoQuery.toLowerCase();
    repos = repos.filter(r =>
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.description && r.description.toLowerCase().includes(q))
    );
  }
  if (state.repoLang) {
    repos = repos.filter(r => r.language === state.repoLang);
  }
  switch (state.repoSort) {
    case 'stars': repos.sort((a, b) => (b.stars || 0) - (a.stars || 0)); break;
    case 'forks': repos.sort((a, b) => (b.forks || 0) - (a.forks || 0)); break;
    case 'updated': repos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); break;
    case 'name': repos.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
  }
  const total = repos.length;
  const totalPages = Math.max(1, Math.ceil(total / CONFIG.REPOS_PER_PAGE));
  if (state.repoPage > totalPages) state.repoPage = 1;
  if (state.repoPage < 1) state.repoPage = 1;

  const start = (state.repoPage - 1) * CONFIG.REPOS_PER_PAGE;
  const page = repos.slice(start, start + CONFIG.REPOS_PER_PAGE);
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

export function renderRepoHighlights() {
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
  const langs = [...new Set(state.repos.map(r => r.language).filter(Boolean))].sort();
  const sel = $('lang-filter');
  if (sel) {
    sel.innerHTML = `<option value="">All Languages</option>` +
      langs.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  }
}

export function renderLanguages(langStats) {
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
  renderDonut(langStats.slice(0, 8));
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

export function renderDonut(langStats) {
  const svg = $('donut-svg');
  if (!svg || !langStats || langStats.length === 0) return;

  const cx = 100, cy = 100, r = 75;
  const total = langStats.reduce((s, l) => s + l.pct, 0) || 100;
  const gap = langStats.length > 1 ? 2 : 0;

  let currentAngle = -90;
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

export function renderInsights(insights) {
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

export function renderTechStack(techStack) {
  const container = $('tech-stack-container');
  const chips = $('tech-stack-chips');
  if (!container || !chips) return;

  if (techStack && techStack.length > 0) {
    chips.innerHTML = techStack.map(tech => 
      `<span style="background: var(--accent-bg); color: var(--accent); padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border: 1px solid rgba(91,106,240,0.2);">${escapeHtml(tech)}</span>`
    ).join('');
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}
