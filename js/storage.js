export const Storage = {
  // --- Keys ---
  getToken() {
    return localStorage.getItem('gh_analyzer_token') || '';
  },
  setToken(val) {
    if (val) localStorage.setItem('gh_analyzer_token', val);
    else localStorage.removeItem('gh_analyzer_token');
  },

  getGeminiKey() {
    return localStorage.getItem('gh_analyzer_gemini_key') || '';
  },
  setGeminiKey(val) {
    if (val) localStorage.setItem('gh_analyzer_gemini_key', val);
    else localStorage.removeItem('gh_analyzer_gemini_key');
  },

  // --- Theme ---
  getTheme() {
    return localStorage.getItem('gh_analyzer_theme') || 'light';
  },
  setTheme(theme) {
    localStorage.setItem('gh_analyzer_theme', theme);
  },

  // --- Recent Searches ---
  getRecentSearches() {
    try {
      const stored = localStorage.getItem('gh_analyzer_recent');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
  addRecentSearch(username) {
    if (!username) return;
    let searches = this.getRecentSearches();
    searches = searches.filter(u => u.toLowerCase() !== username.toLowerCase());
    searches.unshift(username);
    if (searches.length > 5) searches = searches.slice(0, 5);
    localStorage.setItem('gh_analyzer_recent', JSON.stringify(searches));
  },

  // --- API Cache (sessionStorage) ---
  getCached(key) {
    try {
      const stored = sessionStorage.getItem(`gh_cache_${key}`);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Expiration set to 10 minutes (600,000 ms)
      if (Date.now() - parsed.timestamp > 600000) {
        sessionStorage.removeItem(`gh_cache_${key}`);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  },
  setCache(key, data) {
    try {
      const payload = {
        timestamp: Date.now(),
        data: data
      };
      sessionStorage.setItem(`gh_cache_${key}`, JSON.stringify(payload));
    } catch (e) {
      console.warn("Session storage full, unable to cache.", e);
    }
  }
};
