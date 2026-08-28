import { $, showEl, hideEl } from './utils.js';
import { state } from './state.js';
import { ApiClient } from './api.js';

export const BattlesManager = {
  init() {
    $('btn-fight')?.addEventListener('click', () => this.startBattle());
  },

  async startBattle() {
    const oppInput = $('battle-opponent-input');
    const opponent = oppInput.value.trim();

    if (!opponent) {
      alert("Please enter an opponent's username!");
      return;
    }
    if (!state.profile) {
      alert("Please search your own profile first in the Overview tab!");
      return;
    }

    const btn = $('btn-fight');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="btn-text">FIGHTING...</span>`;
    btn.disabled = true;

    try {
      // Fetch Opponent Profile
      const oppProfile = await ApiClient.get(`/users/${opponent}`);
      // Fetch Opponent Repos (first page just for stars count)
      const oppRepos = await ApiClient.getPages(`/users/${opponent}/repos`, 1, 100);

      this.renderBattle(state.profile, state.repos, oppProfile, oppRepos);
    } catch (e) {
      console.error(e);
      alert("Failed to find opponent. Please check the username.");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  },

  renderBattle(p1, r1, p2, r2) {
    const p1Stars = r1.reduce((acc, r) => acc + r.stargazers_count, 0);
    const p2Stars = r2.reduce((acc, r) => acc + r.stargazers_count, 0);

    const f1Html = `
      <img src="${p1.avatar_url}" style="width:100px; border-radius:50%; border: 3px solid #ff4757;">
      <h3>${p1.name || p1.login}</h3>
      <p>Followers: <strong>${p1.followers}</strong></p>
      <p>Public Repos: <strong>${p1.public_repos}</strong></p>
      <p>Total Stars: <strong>${p1Stars}</strong></p>
    `;

    const f2Html = `
      <img src="${p2.avatar_url}" style="width:100px; border-radius:50%; border: 3px solid #1e90ff;">
      <h3>${p2.name || p2.login}</h3>
      <p>Followers: <strong>${p2.followers}</strong></p>
      <p>Public Repos: <strong>${p2.public_repos}</strong></p>
      <p>Total Stars: <strong>${p2Stars}</strong></p>
    `;

    $('fighter1').innerHTML = f1Html;
    $('fighter2').innerHTML = f2Html;

    // Determine winner
    let p1Score = 0;
    let p2Score = 0;

    if (p1.followers > p2.followers) p1Score++;
    else if (p2.followers > p1.followers) p2Score++;

    if (p1.public_repos > p2.public_repos) p1Score++;
    else if (p2.public_repos > p1.public_repos) p2Score++;

    if (p1Stars > p2Stars) p1Score++;
    else if (p2Stars > p1Stars) p2Score++;

    let winnerText = "It's a TIE! Both are legendary!";
    if (p1Score > p2Score) winnerText = `🏆 ${p1.name || p1.login} WINS!`;
    else if (p2Score > p1Score) winnerText = `🏆 ${p2.name || p2.login} WINS!`;

    $('battle-results').innerHTML = `<h1 style="font-size:36px; margin:0;">${winnerText}</h1><p>Score: ${p1Score} - ${p2Score}</p>`;

    $('battle-arena').style.display = 'grid';
    $('battle-results').style.display = 'block';
  }
};
