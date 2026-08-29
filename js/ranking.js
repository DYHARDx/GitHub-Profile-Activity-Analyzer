import { $, escapeHtml } from './utils.js';
import { state } from './state.js';
import { InsightsEngine } from './api.js';

export const RankingManager = {
  async runRankingAnalysis() {
    const container = $('repo-ranking-container');
    const list = $('repo-ranking-list');
    
    if (!container || !list || !state.repos || state.repos.length === 0) return;
    
    container.style.display = 'block';
    
    // Sort and filter top 10 repos (based on stars, forks, and size)
    const sortedRepos = [...state.repos].sort((a, b) => {
      const scoreA = (a.stargazers_count * 10) + (a.forks_count * 5) + (a.size / 1000);
      const scoreB = (b.stargazers_count * 10) + (b.forks_count * 5) + (b.size / 1000);
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
        switch(tier.toUpperCase()) {
          case 'S': return 'background: linear-gradient(135deg, #FFD700, #FFA500); color: #000;'; // Gold
          case 'A': return 'background: linear-gradient(135deg, #00C9FF, #92FE9D); color: #000;'; // Cyan/Green
          case 'B': return 'background: linear-gradient(135deg, #8E2DE2, #4A00E0); color: #fff;'; // Purple
          case 'C': return 'background: linear-gradient(135deg, #3a3a3a, #5a5a5a); color: #fff;'; // Gray
          default: return 'background: #333; color: #fff;';
        }
      };

      list.innerHTML = rankings.map(r => `
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
      `).join('');
      
    } catch (err) {
      console.error(err);
      list.innerHTML = `<div style="text-align: center; opacity: 0.6; padding: 10px; color: #ff6b81;">Failed to generate repository rankings. Please try again later.</div>`;
    }
  }
};
