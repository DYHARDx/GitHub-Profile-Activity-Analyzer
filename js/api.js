import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export class AppError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export const ApiClient = {
  _headers() {
    const token = CONFIG.GITHUB_TOKEN;
    const h = { Accept: 'application/vnd.github+json' };
    if (token && token.trim()) {
      h['Authorization'] = `Bearer ${token.trim()}`;
    }
    return h;
  },

  async get(path) {
    const url = path.startsWith('http') ? path : `${CONFIG.GITHUB_API}${path}`;
    
    // Check Cache
    const cached = Storage.getCached(url);
    if (cached) return cached;

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
    
    const data = await resp.json();
    Storage.setCache(url, data); // Save to cache
    return data;
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

  async graphql(query, variables = {}) {
    const url = 'https://api.github.com/graphql';
    
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ query, variables })
      });
    } catch (networkErr) {
      throw new AppError('network_error', networkErr.message);
    }

    if (resp.status === 401) throw new AppError('invalid_token');
    if (resp.status === 403) throw new AppError('rate_limit');
    if (!resp.ok) throw new AppError('api_error', resp.status);
    
    const data = await resp.json();
    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      throw new AppError('api_error', data.errors[0].message);
    }
    return data.data;
  },
};

export const InsightsEngine = {
  async analyze(analysisData) {
    const apiKey = CONFIG.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim() || apiKey.startsWith('AQ.')) {
      return this._fallbackInsights(analysisData);
    }

    const prompt = this._buildPrompt(analysisData);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || 'gemini-3.7-flash'}:generateContent?key=${apiKey.trim()}`;
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

  async generateJobs(state) {
    const apiKey = CONFIG.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return [
        { title: "Frontend Developer", match: "85%", reason: "Solid experience with web technologies." },
        { title: "Backend Engineer", match: "80%", reason: "Experience building server-side applications." },
        { title: "Full Stack Developer", match: "90%", reason: "Balanced contributions across the stack." }
      ];
    }

    const langNames = Object.keys(state.languages || {}).slice(0, 5).join(', ');
    const stack = (state.techStack || []).join(', ');
    const loc = state.profile?.location || 'Remote';
    const repos = state.profile?.public_repos || 0;
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || 'gemini-3.7-flash'}:generateContent?key=${apiKey.trim()}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 200 },
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
      
      const clean = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
      return [{ title: "Software Engineer", match: "80%", reason: "General software development experience." }];
    } catch (e) {
      console.warn('Job generation failed:', e);
      return [{ title: "Software Engineer", match: "80%", reason: "General software development experience." }];
    }
  },

  async generateRepoRanking(reposSubset) {
    const apiKey = CONFIG.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return reposSubset.slice(0, 3).map(r => ({
        repo: r.name,
        tier: "A",
        analysis: `Solid ${r.language || 'code'} repository with ${r.stargazers_count} stars.`
      }));
    }

    const repoData = reposSubset.map(r => ({
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || 'gemini-3.7-flash'}:generateContent?key=${apiKey.trim()}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, topP: 0.8, maxOutputTokens: 500 },
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
      
      const clean = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
      return JSON.parse(clean);
    } catch (e) {
      console.warn('Repo ranking failed:', e);
      return reposSubset.slice(0, 3).map(r => ({
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
      {
        id: 'career_advice',
        title: 'Career & Growth',
        body: topLanguages && topLanguages.length > 0
          ? `Consider contributing to major open-source projects in ${topLangName} to expand your portfolio. Exploring related frameworks can also boost your profile's visibility.`
          : 'Start building a consistent contribution history by pushing small, regular updates to public repositories.',
        chips: ['Growth Tip'],
      },
    ];
  }
};
