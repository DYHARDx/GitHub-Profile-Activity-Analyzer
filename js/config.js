export const CONFIG = {
  GITHUB_TOKEN: (window.ENV && window.ENV.GITHUB_TOKEN) || '',
  GITHUB_API: 'https://api.github.com',

  GEMINI_API_KEY: (window.ENV && window.ENV.GEMINI_API_KEY) || '',
  GEMINI_MODEL: 'gemini-1.5-flash',

  MAX_REPOS: 100,
  COMMIT_REPOS: 10,
  COMMITS_PER_REPO: 100,
  REPOS_PER_PAGE: 15,
};

export const LANG_COLORS = {
  JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3572A5',
  Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
  Go: '#00add8', Rust: '#dea584', Ruby: '#701516', PHP: '#4f5d95',
  Swift: '#fa7343', Kotlin: '#A97BFF', Scala: '#c22d40', R: '#198ce7',
  Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c',
  Dart: '#00b4ab', Lua: '#000080', Haskell: '#5e5086', Elixir: '#6e4a7e',
  Clojure: '#db5855', 'Objective-C': '#438eff', Perl: '#0298c3',
  Vue: '#41b883', Svelte: '#ff3e00', Jupyter: '#da5b0b', Other: '#8a95a5',
};

export function getLangColor(lang) {
  return LANG_COLORS[lang] || LANG_COLORS.Other;
}
