import { $, escapeHtml } from './utils.js';
import { state } from './state.js';
import { InsightsEngine } from './api.js';

export const JobsManager = {
  async runJobMatcher() {
    const container = $('career-matcher-container');
    const list = $('career-roles-list');
    
    if (!container || !list || !state.profile) return;
    
    container.style.display = 'block';
    list.innerHTML = `
      <div style="text-align: center; opacity: 0.6; padding: 20px;">
        <div class="insight-spinner" aria-hidden="true" style="margin: 0 auto 10px;"></div>
        Analyzing profile and finding best matches...
      </div>
    `;
    
    try {
      const roles = await InsightsEngine.generateJobs(state.profile, state.techStack, state.languages);
      
      if (!roles || roles.length === 0) {
        list.innerHTML = `<div style="text-align: center; opacity: 0.6; padding: 10px;">No specific matches found. Keep building!</div>`;
        return;
      }
      
      let loc = state.profile.location || 'Remote';
      
      list.innerHTML = roles.map(role => {
        const query = encodeURIComponent(`${role} jobs in ${loc}`);
        const linkedInQuery = encodeURIComponent(role);
        const linkedInLoc = encodeURIComponent(loc);
        
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 600; font-size: 1.05rem;">${escapeHtml(role)}</span>
              <span style="font-size: 0.8rem; opacity: 0.7;">📍 ${escapeHtml(loc)} / Remote</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <a href="https://www.google.com/search?q=${query}&ibp=htl;jobs" target="_blank" rel="noopener noreferrer" style="background: white; color: #1a1a1a; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                Google Jobs
              </a>
              <a href="https://www.linkedin.com/jobs/search/?keywords=${linkedInQuery}&location=${linkedInLoc}" target="_blank" rel="noopener noreferrer" style="background: #0a66c2; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </a>
            </div>
          </div>
        `;
      }).join('');
      
    } catch (err) {
      console.error(err);
      list.innerHTML = `<div style="text-align: center; opacity: 0.6; padding: 10px; color: #ff6b81;">Failed to generate career matches. Please try again later.</div>`;
    }
  }
};
