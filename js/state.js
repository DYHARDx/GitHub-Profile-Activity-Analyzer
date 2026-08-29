export const state = {
  profile: null,
  repos: [],
  languages: {},   // { lang: { bytes, repoCount, repos } }
  commits: [],     // flat list of { sha, date, dateStr, hour, day, month, repo }
  repoPage: 1,
  repoQuery: '',
  repoLang: '',
  repoSort: 'stars',
  period: 'all',
  insights: null,
  techStack: [],
};
