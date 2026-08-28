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

export function renderStats(stats) {
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

export function renderActivity(commits, period) {
  const filtered = DataProcessor.filterByPeriod(commits, period);
  renderHeatmap(filtered, period);
  renderActivitySummary(filtered);
  renderStreaks(DataProcessor.calculateStreaks(filtered));
  renderDayChart(DataProcessor.activityByDay(filtered));
  renderTimeGrid(DataProcessor.activityByHour(filtered));
  renderMonthlyChart(DataProcessor.monthlyCommits(filtered));
}

export function renderActivitySummary(filtered) {
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

export function renderHeatmap(commits, period) {
  const grid = $('heatmap-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const now = new Date();
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let days = period === 'all' ? 365 : Number(period);
  if (isNaN(days) || days < 7) days = 7;

  const startUtc = new Date(endUtc.getTime() - (days - 1) * 86400000);

  const countMap = {};
  commits.forEach(c => {
    if (c && c.dateStr) {
      const d = new Date(c.dateStr + 'T00:00:00Z');
      if (d >= startUtc && d <= endUtc) {
        countMap[c.dateStr] = (countMap[c.dateStr] || 0) + 1;
      }
    }
  });

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
    scrollEl.scrollLeft = scrollEl.scrollWidth;
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
