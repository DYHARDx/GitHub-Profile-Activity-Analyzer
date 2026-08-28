import { getUtcDateStr } from './utils.js';

export const DataProcessor = {
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
          day: d.getUTCDay(),
          month: `${y}-${m}`,
          repo: c._repo || c.repo?.name || '',
        };
      })
      .filter(Boolean);
  },

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
    const gaps = [];
    for (let i = 1; i < dateSets.length; i++) {
      const d1 = new Date(dateSets[i - 1] + 'T00:00:00Z');
      const d2 = new Date(dateSets[i] + 'T00:00:00Z');
      const gap = Math.round((d2 - d1) / 86400000);
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
        const dNext = new Date(dateSets[i + 1] + 'T00:00:00Z');
        const dCur = new Date(dateSets[i] + 'T00:00:00Z');
        const diff = Math.round((dNext - dCur) / 86400000);
        if (diff === 1) current++;
        else break;
      }
    }
    let longestInactive = 0;
    for (const g of gaps) {
      if (g - 1 > longestInactive) longestInactive = g - 1;
    }
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

  calculateScore(data) {
    const { repos = [], commits = [], streaks = {}, langStats = [] } = data;
    const MAX = { consistency: 20, recentActivity: 20, repoActivity: 15, openSource: 15, streak: 15, langDiversity: 15 };
    const factors = {};
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
    const cutoff90 = Date.now() - 90 * 86400000;
    const recentCommits = commits.filter(c => c.date && c.date.getTime() > cutoff90).length;
    const recentScore = Math.min(MAX.recentActivity, Math.round((recentCommits / 30) * MAX.recentActivity));
    factors.recentActivity = { label: 'Recent Activity', pts: recentScore, max: MAX.recentActivity };
    const starsTotal = repos.reduce((s, r) => s + (r.stars || 0), 0);
    const forksTotal = repos.reduce((s, r) => s + (r.forks || 0), 0);
    const repoScore = Math.min(MAX.repoActivity,
      Math.round((Math.log10(starsTotal + forksTotal + 1) / 3.5) * MAX.repoActivity));
    factors.repoActivity = { label: 'Repository Engagement', pts: repoScore, max: MAX.repoActivity };
    const ownRepos = repos.filter(r => !r.fork);
    const osScore = Math.min(MAX.openSource,
      Math.round((Math.min(ownRepos.length, 20) / 20) * MAX.openSource));
    factors.openSource = { label: 'Original Repositories', pts: osScore, max: MAX.openSource };
    const streakScore = Math.min(MAX.streak,
      Math.round((Math.min(streaks.longest || 0, 30) / 30) * MAX.streak));
    factors.streak = { label: 'Commit Streak', pts: streakScore, max: MAX.streak };
    const langCount = langStats.length;
    const langScore = Math.min(MAX.langDiversity,
      Math.round((Math.min(langCount, 6) / 6) * MAX.langDiversity));
    factors.langDiversity = { label: 'Language Diversity', pts: langScore, max: MAX.langDiversity };

    const total = Object.values(factors).reduce((s, f) => s + f.pts, 0);
    return { total: Math.min(100, Math.max(0, total)), factors };
  },

  filterByPeriod(commits, period) {
    if (period === 'all') return commits;
    const numDays = Number(period);
    if (isNaN(numDays) || numDays <= 0) return commits;
    const cutoff = Date.now() - numDays * 86400000;
    return commits.filter(c => c.date && c.date.getTime() >= cutoff);
  },

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
