import { $ } from './utils.js';
import { state } from './state.js';
import { CONFIG } from './config.js';

export const ResumeManager = {
  async generate() {
    if (!state.profile) {
      alert('Please analyze a profile first!');
      return;
    }

    let container = $('resume-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'resume-container';
      document.body.appendChild(container);
    }

    const btn = $('btn-resume');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    try {
      const summary = await this.generateSummary();
      const html = this.buildHTML(summary);
      container.innerHTML = html;
      
      setTimeout(() => window.print(), 500);
    } catch (err) {
      console.error(err);
      alert('Failed to generate resume.');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  },

  async generateSummary() {
    const apiKey = CONFIG.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim() || apiKey.startsWith('AQ.')) {
      return state.profile.bio || 'A passionate software developer building open-source projects.';
    }

    const prompt = `Write a professional 2-3 sentence resume summary for a developer.
Details:
- Name: ${state.profile.name || state.profile.login}
- Top Languages: ${Object.keys(state.languages).slice(0, 4).join(', ')}
- Total Repos: ${state.repos.length}
- GitHub Bio: ${state.profile.bio || 'None'}
Keep it strictly professional and concise. Don't use markdown formatting like asterisks.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL || 'gemini-1.5-flash'}:generateContent?key=${apiKey.trim()}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await resp.json();
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        return data.candidates[0].content.parts[0].text.trim();
      }
    } catch (e) {
      console.error('Gemini error:', e);
    }
    return state.profile.bio || 'A passionate software developer building open-source projects.';
  },

  buildHTML(summary) {
    const p = state.profile;
    const topLangs = Object.keys(state.languages).slice(0, 5);
    const topRepos = state.repos
      .filter(r => !r.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 4);

    return `
      <div class="resume-paper">
        <header class="resume-header">
          <h1>${p.name || p.login}</h1>
          <div class="contact-info">
            <span>github.com/${p.login}</span>
            ${p.location ? `<span>• ${p.location}</span>` : ''}
            ${p.blog ? `<span>• ${p.blog}</span>` : ''}
          </div>
        </header>

        <section class="resume-section">
          <h2>Professional Summary</h2>
          <p>${summary}</p>
        </section>

        <section class="resume-section">
          <h2>Technical Skills</h2>
          <p><strong>Top Languages:</strong> ${topLangs.join(', ')}</p>
          <p><strong>GitHub Metrics:</strong> ${state.repos.length} Repositories, ${state.commits.length} Analyzed Commits</p>
        </section>

        <section class="resume-section">
          <h2>Featured Open Source Projects</h2>
          <div class="resume-projects">
            ${topRepos.map(repo => `
              <div class="resume-project">
                <div class="project-title-row">
                  <h3>${repo.name}</h3>
                  <span class="project-meta">${repo.stargazers_count} Stars • ${repo.language || 'N/A'}</span>
                </div>
                <p>${repo.description || 'No description provided.'}</p>
              </div>
            `).join('')}
          </div>
        </section>
      </div>
    `;
  }
};
