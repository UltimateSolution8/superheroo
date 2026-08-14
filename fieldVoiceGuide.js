/**
 * Superherooo Field Voice Guide - Standalone Vanilla JS Module for Static HTML pages
 * Provides real-time field-level audio & visual guidance on input cursor focus & click.
 */
(function () {
  if (typeof window === 'undefined') return;

  const MUTE_KEY = 'superherooo_voice_guide_muted';
  let isMuted = localStorage.getItem(MUTE_KEY) === 'true';
  let speechDebounceTimer = null;
  let activeElementId = null;

  const FIELD_MAP = {
    email: {
      label: 'Email Address',
      instruction: 'Please enter a valid email address (e.g. user@domain.com) to receive confirmation and updates.',
    },
    phone: {
      label: 'Mobile Number',
      instruction: 'Enter your 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
    },
    password: {
      label: 'Password',
      instruction: 'Enter a secure password with at least 8 characters, including a letter and a number.',
    },
    name: {
      label: 'Full Name',
      instruction: 'Enter your full legal name matching your government identity documents.',
    },
    message: {
      label: 'Support Message',
      instruction: 'Type your message or inquiry in detail for our support team.',
    },
  };

  function getFieldInstruction(inputEl) {
    if (!inputEl) return null;

    const customGuide = inputEl.getAttribute('data-voice-guide');
    if (customGuide) {
      return {
        label: inputEl.getAttribute('data-voice-label') || 'Input Field',
        instruction: customGuide,
      };
    }

    const id = (inputEl.id || '').toLowerCase();
    const type = (inputEl.type || '').toLowerCase();
    const name = (inputEl.name || '').toLowerCase();
    const placeholder = (inputEl.placeholder || '').toLowerCase();

    if (type === 'email' || id.includes('email') || name.includes('email') || placeholder.includes('email')) {
      return FIELD_MAP.email;
    }

    if (type === 'tel' || id.includes('mobile') || id.includes('phone') || name.includes('phone') || placeholder.includes('mobile')) {
      return FIELD_MAP.phone;
    }

    if (type === 'password' || id.includes('password') || name.includes('password')) {
      return FIELD_MAP.password;
    }

    if (id.includes('name') || name.includes('name') || placeholder.includes('name')) {
      return FIELD_MAP.name;
    }

    if (inputEl.tagName.toLowerCase() === 'textarea' || id.includes('message') || name.includes('message') || placeholder.includes('message')) {
      return FIELD_MAP.message;
    }

    if (placeholder) {
      return {
        label: placeholder.charAt(0).toUpperCase() + placeholder.slice(1),
        instruction: `Enter or update details for ${placeholder}.`,
      };
    }

    return null;
  }

  function speakText(text) {
    if (isMuted || !('speechSynthesis' in window) || !text) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.88;
    utterance.lang = 'en-IN';

    const voices = window.speechSynthesis.getVoices();
    const bestVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('hi-IN')) || voices.find(v => v.lang.startsWith('en'));
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  function injectBannerCard() {
    if (document.getElementById('staticVoiceGuideCard')) return;

    const card = document.createElement('div');
    card.id = 'staticVoiceGuideCard';
    card.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(109, 93, 252, 0.3);
      border-radius: 14px;
      padding: 12px 16px;
      box-shadow: 0 10px 25px rgba(109, 93, 252, 0.2);
      max-width: 340px;
      font-family: inherit;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: all 0.3s ease;
    `;

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-weight:700; font-size:0.85rem; color:#0f172a; display:flex; align-items:center; gap:6px;">
          ✨ Field Assistant
        </span>
        <span id="staticVoiceFieldBadge" style="font-size:0.72rem; font-weight:700; background:rgba(16,185,129,0.15); color:#047857; padding:2px 8px; border-radius:12px;">
          Ready
        </span>
      </div>
      <p id="staticVoiceInstructionText" style="margin:0; font-size:0.82rem; color:#334155; line-height:1.35;">
        Click or focus any form field to hear step-by-step guidance.
      </p>
    `;

    document.body.appendChild(card);
  }

  function updateBanner(fieldInfo) {
    injectBannerCard();
    const badge = document.getElementById('staticVoiceFieldBadge');
    const textEl = document.getElementById('staticVoiceInstructionText');

    if (badge && textEl) {
      badge.textContent = `📍 ${fieldInfo.label}`;
      textEl.innerHTML = `<strong>${fieldInfo.label}:</strong> ${fieldInfo.instruction}`;
    }
  }

  function initListeners() {
    const handleHoverOrFocus = (e) => {
      const target = e.target;
      if (!target) return;

      const inputEl = target.closest('input, select, textarea, button, label, .form-group, [data-voice-guide]');
      if (!inputEl) return;

      let targetForGuide = inputEl;
      if (inputEl.tagName.toLowerCase() === 'label') {
        const forId = inputEl.getAttribute('for') || inputEl.getAttribute('htmlFor');
        if (forId) {
          const linkedInput = document.getElementById(forId);
          if (linkedInput) targetForGuide = linkedInput;
        } else {
          const childInput = inputEl.querySelector('input, select, textarea');
          if (childInput) targetForGuide = childInput;
        }
      } else if (inputEl.classList.contains('form-group')) {
        const childInput = inputEl.querySelector('input, select, textarea, [data-voice-guide]');
        if (childInput) targetForGuide = childInput;
      }

      const fieldInfo = getFieldInstruction(targetForGuide);
      if (!fieldInfo) return;

      const elId = targetForGuide.id || targetForGuide.name || fieldInfo.label;
      if (activeElementId === elId) return;
      activeElementId = elId;

      // Visual focus outline
      document.querySelectorAll('.voice-focus-highlight').forEach(el => el.classList.remove('voice-focus-highlight'));
      targetForGuide.classList.add('voice-focus-highlight');

      updateBanner(fieldInfo);

      if (speechDebounceTimer) clearTimeout(speechDebounceTimer);
      speechDebounceTimer = setTimeout(() => {
        speakText(fieldInfo.instruction);
      }, 250);
    };

    window.addEventListener('mouseenter', handleHoverOrFocus, true);
    window.addEventListener('mouseover', handleHoverOrFocus, true);
    window.addEventListener('focusin', handleHoverOrFocus, true);
    window.addEventListener('click', handleHoverOrFocus, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initListeners);
  } else {
    initListeners();
  }
})();
