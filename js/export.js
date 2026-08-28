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
      alert("Export library is still loading or failed to load. Please try again in a moment.");
      return;
    }

    const btn = document.getElementById('export-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="btn-text">Exporting...</span>`;
    btn.disabled = true;

    try {
      const target = document.getElementById('section-overview');
      // Create a canvas from the target element
      const canvas = await html2canvas(target, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        scale: 2, // Higher resolution
        useCORS: true,
      });

      // Convert canvas to image URL
      const imgData = canvas.toDataURL('image/png');
      
      // Create download link
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `github_stats_${document.getElementById('profile-username').textContent || 'export'}.png`;
      a.click();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export dashboard.");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
};
