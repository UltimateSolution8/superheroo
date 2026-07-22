(function () {
  'use strict';

  // API Backend URL (supports local dev, custom ports & production)
  let API_ENDPOINT = 'http://localhost:8081/api/public/chatbot/chat';
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      API_ENDPOINT = '/api/public/chatbot/chat';
    }
  }

  function getLocalAnswer(query) {
    const q = (query || '').toLowerCase();
    if (q.includes('hero') || q.includes('register') || q.includes('earn') || q.includes('join') || q.includes('work')) {
      return 'To register as a **Hero** and start earning money:\n\n1. Visit our [Become a Hero Page](/become-a-hero.html).\n2. Fill out your basic details (Name, Phone & City).\n3. Complete your live selfie & Aadhaar KYC verification.\n\nOnce verified, you will immediately start receiving nearby task alerts and keep **100% of your task earnings**!';
    }
    if (q.includes('electrician') || q.includes('plumber') || q.includes('clean') || q.includes('book') || q.includes('service')) {
      return 'To book a service helper:\n\n1. Click [Log In / Sign Up](/login.html) or open our mobile app.\n2. Post your task (e.g., Grocery delivery, queue standing, moving boxes, basic house help).\n3. Verified local Heroes near you will be dispatched within minutes!';
    }
    if (q.includes('illegal') || q.includes('policy') || q.includes('prohibited') || q.includes('restricted')) {
      return 'Superherooo strictly prohibits:\n- Illegal drugs, weapons, alcohol delivery without license.\n- Adult/escort services or harassment.\n- SIM cloning, CCTV tampering, theft, or exam cheating.\n\nWe focus strictly on safe, everyday no-skill help & errands!';
    }
    return 'Superherooo connects you with verified local service heroes in minutes. You can [Post a Task](/login.html) or [Become a Hero](/become-a-hero.html) to start earning!';
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
      } else {
        appendMessage('bot', getLocalAnswer(userText));
      }
    } catch (err) {
      hideTypingIndicator();
      appendMessage('bot', getLocalAnswer(userText));
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
