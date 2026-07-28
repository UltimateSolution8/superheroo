(function () {
  'use strict';

  // API Backend URL (supports local dev, custom ports & production)
  let API_ENDPOINT = 'http://localhost:8081/api/public/chatbot/chat';
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      API_ENDPOINT = '/api/public/chatbot/chat';
    }
  }

  // Load persistent Session History
  let chatHistory = [];
  try {
    const saved = sessionStorage.getItem('superherooo_ai_chat_history');
    if (saved) chatHistory = JSON.parse(saved);
  } catch (e) {
    chatHistory = [];
  }

  function saveHistory() {
    try {
      sessionStorage.setItem('superherooo_ai_chat_history', JSON.stringify(chatHistory.slice(-20)));
    } catch (e) {}
  }

  // Inject HTML Shell into Page
  function injectChatbotShell() {
    if (document.getElementById('hb-chat-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'hb-chat-fab';
    fab.setAttribute('aria-label', 'Open Superherooo AI Assistant');
    fab.innerHTML = `
      <div class="hb-fab-icon hb-fab-bolt">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="url(#fab-bolt-grad)" stroke="#0A192F" stroke-width="1.2" stroke-linejoin="round"/>
          <defs>
            <linearGradient id="fab-bolt-grad" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#FFFFFF" />
              <stop offset="1" stop-color="#FFF3C4" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div class="hb-fab-icon hb-fab-close">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FCB61A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>
      <span id="hb-chat-badge">1</span>
    `;

    const win = document.createElement('div');
    win.id = 'hb-chat-window';
    win.innerHTML = `
      <div class="hb-header">
        <div class="hb-header-title">
          <div class="hb-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#0A192F" stroke="#0A192F" stroke-width="1" stroke-linejoin="round"/>
            </svg>
          </div>
          <div>
            <h4 class="hb-bot-name">Superherooo AI</h4>
            <div class="hb-status-dot"><span>●</span> Online • Powered by Superherooo AI</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="hb-close-btn" id="hb-chat-clear" title="Clear Conversation">🧹</button>
          <button class="hb-close-btn" id="hb-chat-close" title="Close Chat">✕</button>
        </div>
      </div>

      <div class="hb-messages" id="hb-messages"></div>

      <div class="hb-pills" id="hb-pills">
        <button class="hb-pill" data-prompt="How do I book a helper for errands or queue standing?">⚡ Book a Service</button>
        <button class="hb-pill" data-prompt="What tasks are prohibited or restricted?">📜 Restricted Tasks</button>
        <button class="hb-pill" data-prompt="How do I register as a Hero to earn money?">👥 Become a Hero</button>
        <button class="hb-pill" data-prompt="What is the Superherooo insurance policy?">🛡️ Insurance Info</button>
      </div>

      <form class="hb-input-area" id="hb-chat-form">
        <input type="text" id="hb-chat-input" class="hb-input" placeholder="Ask Superherooo AI anything..." required autocomplete="off" />
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

      // Add Text-To-Speech (TTS) button for bot messages
      if ('speechSynthesis' in window) {
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'hb-tts-btn';
        ttsBtn.innerHTML = '🔊';
        ttsBtn.title = 'Listen to response';
        ttsBtn.addEventListener('click', () => {
          const plainText = text.replace(/\[(.*?)\]\((.*?)\)/g, '$1').replace(/[*#]/g, '');
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(plainText);
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        });
        msgDiv.appendChild(ttsBtn);
      }
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  function showTypingIndicator() {
    const container = document.getElementById('hb-messages');
    if (!container) return;
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

  function getLocalAnswer(query) {
    const q = (query || '').trim().toLowerCase();
    if (q === 'hi' || q === 'hello' || q === 'hey' || q === 'namaste' || q.startsWith('hi ') || q.startsWith('hello ') || q.startsWith('hey ') || q.includes('good morning') || q.includes('good afternoon') || q.includes('how are you')) {
      return 'Hello! 👋 Warm greetings from **Superherooo AI**!\n\nI am your intelligent AI Assistant. How can I assist you today?\n\n• Looking to post a task? Click [⚡ Post a Task](/login.html)\n• Want to earn as a Hero? Click [👥 Become a Hero](/become-a-hero.html)\n• Explore services? Click [📜 View Services](/services.html)';
    }
    if (q.includes('hero') || q.includes('register') || q.includes('earn') || q.includes('join') || q.includes('work') || q.includes('job')) {
      return 'To register as a **Hero** and start earning money:\n\n1. Visit our [👥 Become a Hero Page](/become-a-hero.html).\n2. Fill out your basic profile (Name, Phone & City).\n3. Complete your live selfie & Aadhaar KYC verification.\n\nOnce verified, you will receive nearby task alerts and keep **100% of your task earnings**!';
    }
    if (q.includes('book') || q.includes('errand') || q.includes('queue') || q.includes('clean') || q.includes('service') || q.includes('post') || q.includes('task')) {
      return 'To book a verified local helper:\n\n1. Click [⚡ Log In / Post a Task](/login.html) or open our mobile app.\n2. Describe your request (Grocery pickup, queue standing, moving boxes, balcony cleaning).\n3. Verified Heroes near you will be dispatched within minutes!\n\nCheck out our full [📜 Services Directory](/services.html).';
    }
    if (q.includes('illegal') || q.includes('policy') || q.includes('prohibited') || q.includes('restricted') || q.includes('safety')) {
      return 'Superherooo strictly prohibits:\n- Illegal drugs, weapons, alcohol delivery without license.\n- Adult/escort services or harassment.\n- SIM cloning, CCTV tampering, theft, or exam cheating.\n\nWe focus strictly on safe, everyday no-skill help & errands! Read our [🛡️ Insurance Policy](/insurance.html) & [📋 Terms of Service](/terms.html).';
    }
    if (q.includes('support') || q.includes('contact') || q.includes('help') || q.includes('agent')) {
      return 'Need assistance from a human support agent?\n\nYou can reach our 24/7 Support Team directly on our [📞 Contact Support Page](/contact.html) or open a ticket in your account dashboard!';
    }
    return 'Superherooo AI connects you with verified local service heroes in minutes. You can [⚡ Post a Task](/login.html), explore our [📜 Services](/services.html), or [👥 Become a Hero](/become-a-hero.html) to start earning!';
  }

  async function sendMessage(userText) {
    if (!userText || !userText.trim()) return;

    const input = document.getElementById('hb-chat-input');
    if (input) input.value = '';

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
        saveHistory();
      } else {
        const fallback = getLocalAnswer(userText);
        appendMessage('bot', fallback);
        chatHistory.push({ role: 'user', content: userText });
        chatHistory.push({ role: 'assistant', content: fallback });
        saveHistory();
      }
    } catch (err) {
      hideTypingIndicator();
      const fallback = getLocalAnswer(userText);
      appendMessage('bot', fallback);
      chatHistory.push({ role: 'user', content: userText });
      chatHistory.push({ role: 'assistant', content: fallback });
      saveHistory();
    }
  }

  // Initialize Event Listeners
  function initChatbot() {
    injectChatbotShell();

    const fab = document.getElementById('hb-chat-fab');
    const win = document.getElementById('hb-chat-window');
    const closeBtn = document.getElementById('hb-chat-close');
    const clearBtn = document.getElementById('hb-chat-clear');
    const form = document.getElementById('hb-chat-form');
    const input = document.getElementById('hb-chat-input');
    const pills = document.getElementById('hb-pills');

    if (!fab || !win) return;

    // Render stored session history
    const container = document.getElementById('hb-messages');
    if (container && container.children.length === 0) {
      if (chatHistory.length > 0) {
        chatHistory.forEach(item => {
          appendMessage(item.role === 'assistant' ? 'bot' : 'user', item.content);
        });
      } else {
        appendMessage('bot', 'Welcome to **Superherooo**! ⚡ I am **Superherooo AI**, your intelligent assistant.\n\nHow can I help you today? You can ask about our service directory, task pricing, or becoming a verified Hero!');
      }
    }

    fab.addEventListener('click', () => {
      win.classList.toggle('hb-active');
      fab.classList.toggle('hb-open');
      const badge = document.getElementById('hb-chat-badge');
      if (badge) badge.remove();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        win.classList.remove('hb-active');
        fab.classList.remove('hb-open');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        chatHistory = [];
        sessionStorage.removeItem('superherooo_ai_chat_history');
        if (container) container.innerHTML = '';
        appendMessage('bot', 'Conversation cleared! 👋 I am **Superherooo AI**. How can I help you today?');
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage(input.value);
      });
    }

    if (pills) {
      pills.addEventListener('click', (e) => {
        const target = e.target.closest('.hb-pill');
        if (target) {
          const prompt = target.getAttribute('data-prompt');
          sendMessage(prompt);
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }
})();
