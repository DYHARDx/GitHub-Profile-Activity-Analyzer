import { CONFIG } from './config.js';
import { $ } from './utils.js';

export const ChatEngine = {
  history: [],
  contextData: null,
  isOpen: false,

  init() {
    this.bindUI();
  },

  setContext(data) {
    this.contextData = data;
    this.history = [];
    this._renderMessages();
    this.addSystemMessage(`I'm your AI Career Advisor! I've analyzed **${data.profile?.login || 'this developer'}**'s GitHub profile. Ask me anything about their tech stack, open-source presence, or how they can improve their career!`);
  },

  bindUI() {
    $('chat-fab')?.addEventListener('click', () => this.toggle());
    $('chat-close')?.addEventListener('click', () => this.close());
    
    const input = $('chat-input');
    const sendBtn = $('chat-send');

    const handleSend = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this.sendMessage(text);
    };

    sendBtn?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSend();
    });
  },

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      $('chat-panel')?.classList.add('open');
      $('chat-fab')?.classList.add('hidden');
      $('chat-input')?.focus();
    } else {
      this.close();
    }
  },

  close() {
    this.isOpen = false;
    $('chat-panel')?.classList.remove('open');
    $('chat-fab')?.classList.remove('hidden');
  },

  addSystemMessage(text) {
    this.history.push({ role: 'model', parts: [{ text }] });
    this._renderMessages();
  },

  addUserMessage(text) {
    this.history.push({ role: 'user', parts: [{ text }] });
    this._renderMessages();
  },

  _renderMessages() {
    const container = $('chat-messages');
    if (!container) return;
    
    container.innerHTML = this.history.map(msg => {
      const isUser = msg.role === 'user';
      // Simple markdown formatting for bold and line breaks
      const formattedText = msg.parts[0].text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      return `
        <div class="chat-message ${isUser ? 'user' : 'bot'}">
          <div class="chat-bubble neu-card">
            ${formattedText}
          </div>
        </div>
      `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
  },

  async sendMessage(text) {
    this.addUserMessage(text);
    
    const apiKey = CONFIG.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim() ) {
      setTimeout(() => {
        this.addSystemMessage("⚠️ **API Key Required**<br>Please add a valid Google Gemini API Key in `env.js` to enable the AI Chat Assistant.");
      }, 500);
      return;
    }

    const loaderId = Date.now();
    this.history.push({ role: 'model', parts: [{ text: '<div class="chat-typing">Typing<span>.</span><span>.</span><span>.</span></div>' }], _id: loaderId });
    this._renderMessages();

    try {
      const systemPrompt = `You are a helpful AI Career Advisor & GitHub Profile Analyzer.
Context about the user being analyzed:
Username: ${this.contextData?.profile?.login || 'Unknown'}
Total Repos: ${this.contextData?.totalRepos || 0}
Total Commits (analyzed): ${this.contextData?.totalCommits || 0}
Top Languages: ${JSON.stringify(this.contextData?.topLanguages?.slice(0,3) || [])}
Streak: ${this.contextData?.currentStreak || 0} days

Answer the user's question concisely based on this data. Offer actionable career advice if asked. Keep responses short and friendly. Use markdown.`;

      const messages = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will help the user based on this profile.' }] },
        ...this.history.filter(m => !m._id)
      ];

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey.trim()}`;
      
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages,
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        })
      });

      if (!resp.ok) throw new Error('API Error');
      const data = await resp.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't process that.";
      
      // Replace loader
      this.history = this.history.filter(m => m._id !== loaderId);
      this.addSystemMessage(reply);

    } catch (e) {
      this.history = this.history.filter(m => m._id !== loaderId);
      this.addSystemMessage("❌ Sorry, I encountered an error communicating with the AI. Please check your API key and connection.");
      console.error(e);
    }
  }
};
