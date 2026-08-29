import { $, escapeHtml } from './utils.js';
import { state } from './state.js';

export const TradingCardManager = {
  init() {
    const btn = $('btn-trading-card');
    if (btn) {
      btn.addEventListener('click', () => this.generateCard());
    }
  },

  async generateCard() {
    if (!state.profile) {
      alert('Please analyze a profile first!');
      return;
    }
    
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas is still loading, please wait a moment and try again.');
      return;
    }

    const btn = $('btn-trading-card');
    const originalContent = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    try {
      // Setup DOM
      const card = $('tc-export-node');
      $('tc-avatar').src = state.profile.avatar_url;
      $('tc-name').textContent = state.profile.name || state.profile.login;
      $('tc-login').textContent = '@' + state.profile.login;
      
      const totalCommits = state.commits ? state.commits.length : 0;
      $('tc-commits').textContent = totalCommits;
      $('tc-repos').textContent = state.repos.length;
      
      const stars = state.repos.reduce((acc, r) => acc + r.stars, 0);
      $('tc-stars').textContent = stars;
      
      const activityScore = $('score-value')?.textContent || '0';
      $('tc-score').textContent = activityScore;
      
      // Setup Title
      let title = 'Code Alchemist';
      const scoreNum = parseInt(activityScore) || 0;
      if (scoreNum > 80) title = 'Grandmaster of Code';
      else if (scoreNum > 60) title = 'Senior Architect';
      else if (scoreNum > 40) title = 'Journeyman Developer';
      
      if (state.techStack.includes('React') || state.techStack.includes('Next.js')) title = 'Frontend Sorcerer';
      if (state.techStack.includes('Django') || state.techStack.includes('Go Modules') || state.techStack.includes('FastAPI')) title = 'Backend Warlock';
      
      $('tc-title-badge').textContent = title;
      
      // Setup Stack
      let allTech = [];
      const topLangs = Object.keys(state.languages).slice(0, 3);
      allTech = [...state.techStack.slice(0, 4), ...topLangs];
      
      // unique
      allTech = [...new Set(allTech)].slice(0, 6);
      
      $('tc-stack').innerHTML = allTech.map(t => 
        `<span style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-size: 11px;">${escapeHtml(t)}</span>`
      ).join('');
      
      // Render
      card.style.display = 'block';
      const canvas = await html2canvas(card, {
        backgroundColor: null,
        scale: 3,
        useCORS: true,
      });
      card.style.display = 'none';
      
      // Download
      const link = document.createElement('a');
      link.download = `${state.profile.login}-trading-card.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
    } catch (err) {
      console.error(err);
      alert('Failed to generate trading card.');
      $('tc-export-node').style.display = 'none';
    } finally {
      btn.innerHTML = originalContent;
      btn.disabled = false;
    }
  }
};
