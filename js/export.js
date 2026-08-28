import { state } from './state.js';
export const ExportManager = {
  init() {
    const btn = document.getElementById('export-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        this.exportDashboard();
      });
    }
  },

  async exportDashboard() {
    if (typeof html2canvas === 'undefined') {
      alert('Export library is still loading or failed to load. Please try again in a moment.');
      return;
    }

    if (!state.profile) {
      alert('Please analyze a profile first!');
      return;
    }

    const btn = document.getElementById('export-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = \<span class="btn-text">Exporting...</span>\;
    btn.disabled = true;

    try {
      const card = document.getElementById('share-card');
      
      // Populate Card
      document.getElementById('sc-name').textContent = state.profile.name || state.profile.login;
      document.getElementById('sc-login').textContent = '@' + state.profile.login;
      document.getElementById('sc-commits').textContent = state.commits.length;
      document.getElementById('sc-repos').textContent = state.repos.length;
      document.getElementById('sc-langs').textContent = Object.keys(state.languages).length;

      // Temporarily show the card far off-screen for html2canvas
      card.style.left = '-9999px';
      card.style.display = 'block';

      const canvas = await html2canvas(card, {
        backgroundColor: '#2b5876', // Base gradient color
        scale: 3, 
        useCORS: true,
      });

      card.style.display = 'none';

      // Convert canvas to image URL
      const imgData = canvas.toDataURL('image/png');
      
      // Create download link
      const a = document.createElement('a');
      a.href = imgData;
      a.download = \	rading_card_\.png\;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export dashboard.');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
};
