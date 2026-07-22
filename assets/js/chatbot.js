(function () {
  'use strict';

  // API Backend URL (supports local dev & production)
  const API_ENDPOINT = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8081/api/public/chatbot/chat'
    : '/api/public/chatbot/chat';

  // Chat History Array
  let chatHistory = [];

  // Inject HTML Shell into Page
  function injectChatbotShell() {
    const fab = document.createElement('button');
    fab.id = 'hb-chat-fab';
    fab.setAttribute('aria-label', 'Open AI Assistant');
    fab.innerHTML = '🤖<span id="hb-chat-badge">1</span>';

    const win = document.createElement('div');
    win.id = 'hb-chat-window';
    win.innerHTML = `
      <div class="hb-header">
        <div class="hb-header-title">
          <div class="hb-avatar">🤖</div>
          <div>
            <h4 class="hb-bot-name">HeroBot AI</h4>
            <div class="hb-status-dot"><span>●</span> Online • Powered by Kimi K3</div>
          </div>
        </div>
        <button class="hb-close-btn" id="hb-chat-close">✕</button>
      </div>

      <div class="hb-messages" id="hb-messages"></div>

      <div class="hb-pills" id="hb-pills">
        <button class="hb-pill" data-prompt="How do I book an electrician or plumber?">⚡ Book a Service</button>
        <button class="hb-pill" data-prompt="What tasks are illegal or prohibited?">📜 Restricted Tasks</button>
        <button class="hb-pill" data-prompt="How do I register as a Hero to earn money?">👥 Become a Hero</button>
        <button class="hb-pill" data-prompt="What is the Superherooo insurance policy?">🛡️ Insurance Info</button>
      </div>

      <form class="hb-input-area" id="hb-chat-form">
        <input type="text" id="hb-chat-input" class="hb-input" placeholder="Ask HeroBot anything..." required autocomplete="off" />
        <button type="submit" class="hb-send-btn">Send</button>
      </form>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(win);
  }

  // Markdown parsing helper
  function parseMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    const lines = html.split('\n');
    let formatted = '';
    let inList = false;

    lines.forEach(line => {
      let trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!inList) { formatted += '<ul>'; inList = true; }
        formatted += `<li>${trimmed.substring(2)}</li>`;
      } else {
        if (inList) { formatted += '</ul>'; inList = false; }
        if (trimmed.length > 0) {
          formatted += `<p>${trimmed}</p>`;
        }
      }
    });

    if (inList) formatted += '</ul>';
    return formatted;
  }

  function appendMessage(role, text) {
    const container = document.getElementById('hb-messages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `hb-msg ${role === 'user' ? 'hb-msg-user' : 'hb-msg-bot'}`;

    if (role === 'user') {
      msgDiv.textContent = text;
    } else {
      msgDiv.innerHTML = parseMarkdown(text);
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  function showTypingIndicator() {
    const container = document.getElementById('hb-messages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'hb-typing-indicator';
    typingDiv.className = 'hb-msg hb-msg-bot hb-typing';
    typingDiv.innerHTML = '<div class="hb-dot"></div><div class="hb-dot"></div><div class="hb-dot"></div>';
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
  }

  function hideTypingIndicator() {
    const el = document.getElementById('hb-typing-indicator');
    if (el) el.remove();
  }

  async function sendMessage(userText) {
    if (!userText || !userText.trim()) return;

    const input = document.getElementById('hb-chat-input');
    if (input) input.value = '';

    // Remove badge on first user interaction
    const badge = document.getElementById('hb-chat-badge');
    if (badge) badge.remove();

    appendMessage('user', userText);
    showTypingIndicator();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: chatHistory
        })
      });

      hideTypingIndicator();

      if (response.ok) {
        const data = await response.json();
        appendMessage('bot', data.reply);
        chatHistory.push({ role: 'user', content: userText });
        chatHistory.push({ role: 'assistant', content: data.reply });
      } else {
        appendMessage('bot', 'Sorry! Our AI assistant is currently updating. Please try again in a moment or visit our [Contact Page](/contact.html).');
      }
    } catch (err) {
      hideTypingIndicator();
      appendMessage('bot', 'Superherooo AI Assistant connects you with verified local heroes. Please log in or register to post a task directly!');
    }
  }

  // Initialize Event Listeners
  function initChatbot() {
    injectChatbotShell();

    const fab = document.getElementById('hb-chat-fab');
    const win = document.getElementById('hb-chat-window');
    const closeBtn = document.getElementById('hb-chat-close');
    const form = document.getElementById('hb-chat-form');
    const input = document.getElementById('hb-chat-input');
    const pills = document.getElementById('hb-pills');

    fab.addEventListener('click', () => {
      win.classList.toggle('hb-active');
      const badge = document.getElementById('hb-chat-badge');
      if (badge) badge.remove();
      if (win.classList.contains('hb-active') && document.getElementById('hb-messages').children.length === 0) {
        appendMessage('bot', 'Welcome to **Superherooo**! ⚡ I am HeroBot, your AI Assistant powered by Kimi K3.\n\nHow can I assist you today? You can ask about our service directory, task pricing, or becoming a verified Hero!');
      }
    });

    closeBtn.addEventListener('click', () => {
      win.classList.remove('hb-active');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage(input.value);
    });

    pills.addEventListener('click', (e) => {
      const target = e.target.closest('.hb-pill');
      if (target) {
        const prompt = target.getAttribute('data-prompt');
        sendMessage(prompt);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }
})();
