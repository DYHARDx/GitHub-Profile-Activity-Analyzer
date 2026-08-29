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
      const commitsEl = $('tc-commits');
      if (commitsEl) commitsEl.innerHTML = `<span style="position: relative; top: -4px; display: inline-block;">${totalCommits}</span>`;
      
      const reposEl = $('tc-repos');
      if (reposEl) reposEl.innerHTML = `<span style="position: relative; top: -4px; display: inline-block;">${state.repos.length}</span>`;
      
      const stars = state.repos.reduce((acc, r) => acc + r.stars, 0);
      const starsEl = $('tc-stars');
      if (starsEl) starsEl.innerHTML = `<span style="position: relative; top: -4px; display: inline-block;">${stars}</span>`;
      
      const activityScore = $('score-value')?.textContent || '0';
      const scoreEl = $('tc-score');
      if (scoreEl) scoreEl.innerHTML = `<span style="position: relative; top: -4px; display: inline-block;">${activityScore}</span>`;
      
      // Setup Title & Tier
      const scoreNum = parseInt(activityScore) || 0;
      let title = '⚡ Code Alchemist';
      let tier = 'EPIC DEV';
      
      if (scoreNum >= 80) {
        title = '👑 Grandmaster of Code';
        tier = 'MYTHIC DEV';
      } else if (scoreNum >= 60) {
        title = '🔮 Senior Architect';
        tier = 'LEGENDARY DEV';
      } else if (scoreNum >= 40) {
        title = '⚔️ Journeyman Developer';
        tier = 'EPIC DEV';
      } else {
        title = '🌱 Rising Coder';
        tier = 'RARE DEV';
      }
      
      if (state.techStack && (state.techStack.includes('React') || state.techStack.includes('Next.js'))) title = '✨ Frontend Sorcerer';
      if (state.techStack && (state.techStack.includes('Django') || state.techStack.includes('Go Modules') || state.techStack.includes('FastAPI'))) title = '🛡️ Backend Warlock';
      if (state.techStack && (state.techStack.includes('Docker') || state.techStack.includes('Kubernetes'))) title = '🚀 DevOps Commander';
      
      const tierBadge = $('tc-tier-badge');
      if (tierBadge) tierBadge.textContent = tier;
      
      const levelEl = $('tc-level');
      if (levelEl) {
        const computedLvl = Math.max(1, Math.min(99, Math.floor(scoreNum * 0.8 + Math.min(totalCommits, 100) * 0.2)));
        levelEl.textContent = `LVL. ${computedLvl}`;
      }
      
      const serialEl = $('tc-serial');
      if (serialEl) {
        serialEl.textContent = `#DEV-${(state.profile.login || 'USER').toUpperCase().slice(0, 8)}-2026`;
      }
      
      const titleBadge = $('tc-title-badge');
      if (titleBadge) titleBadge.textContent = title;
      
      // Setup Stack
      let allTech = [];
      const topLangs = state.languages ? Object.keys(state.languages).slice(0, 3) : [];
      const stackList = state.techStack || [];
      allTech = [...stackList.slice(0, 4), ...topLangs];
      
      // unique
      allTech = [...new Set(allTech)].slice(0, 6);
      
      $('tc-stack').innerHTML = allTech.map(t => 
        `<table style="display: inline-table; vertical-align: middle; border-collapse: collapse; background: #141224; border: 1px solid rgba(255,255,255,0.16); border-radius: 10px; margin-right: 8px; margin-bottom: 6px;"><tr><td style="padding: 3px 16px 10px 16px; font-size: 13px; font-weight: 700; color: #ffffff; line-height: 1.1; text-align: center;">${escapeHtml(t)}</td></tr></table>`
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
