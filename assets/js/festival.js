/**
 * SUPERHEROOO DYNAMIC FESTIVAL ENGINE
 * Fixed Top Banner + Dynamic Header Offset (Industry Standard Layout)
 */
(function() {
  'use strict';

  // Configured Festival Calendar & Pre-Festival Warmup Lead Times
  const FESTIVAL_CALENDAR = [
    {
      id: 'independence',
      name: 'Independence Day',
      themeClass: 'festival-theme--independence',
      flag: '🇮🇳',
      bannerText: 'Wishing Everyone a Happy 80th Independence Day! SuperHerooo — Freedom from Everyday Chores! 🎉',
      badgeText: '🇮🇳 Happy 80th Independence Day — Get Helper in Minutes',
      // Aug 13 to Aug 16 (Lead time: 2 days prior to Aug 15)
      startMonth: 7, startDate: 13, // August 13
      endMonth: 7, endDate: 16     // August 16
    },
    {
      id: 'navratri',
      name: 'Navratri & Dussehra',
      themeClass: 'festival-theme--navratri',
      flag: '🌺',
      bannerText: 'Wishing Everyone Happy Navratri & Dussehra! Celebrate joyfully while SuperHerooo handles your chores! 🌺',
      badgeText: '🌺 Happy Navratri & Dussehra — Get Helper in Minutes',
      startMonth: 8, startDate: 20, // September 20
      endMonth: 9, endDate: 5        // October 5
    },
    {
      id: 'diwali',
      name: 'Diwali & Dhanteras',
      themeClass: 'festival-theme--diwali',
      flag: '🪔',
      bannerText: 'Wishing Everyone a Bright & Prosperous Diwali! Light up your home with SuperHerooo services! ✨',
      badgeText: '🪔 Happy Diwali — Get Helper in Minutes',
      startMonth: 9, startDate: 25, // October 25
      endMonth: 10, endDate: 5       // November 5
    },
    {
      id: 'republic',
      name: 'Republic Day',
      themeClass: 'festival-theme--republic',
      flag: '🇮🇳',
      bannerText: 'Happy Republic Day! Freedom to relax while SuperHerooo manages your daily tasks! 🇮🇳',
      badgeText: '🇮🇳 Happy Republic Day — Get Helper in Minutes',
      startMonth: 0, startDate: 24, // January 24
      endMonth: 0, endDate: 27      // January 27
    },
    {
      id: 'holi',
      name: 'Holi',
      themeClass: 'festival-theme--holi',
      flag: '🎨',
      bannerText: 'Wishing Everyone a Joyous & Colorful Holi! SuperHerooo wishes you happiness & peace of mind! 🎨',
      badgeText: '🎨 Happy Holi — Get Helper in Minutes',
      startMonth: 2, startDate: 20, // March 20
      endMonth: 2, endDate: 26      // March 26
    }
  ];

  function getActiveFestival() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramFestival = urlParams.get('festival');
    
    // Explicit disable
    if (paramFestival === 'none') {
      return null;
    }

    // URL override for testing
    if (paramFestival) {
      const matched = FESTIVAL_CALENDAR.find(f => f.id === paramFestival);
      if (matched) return matched;
    }

    const today = new Date();
    const currentMonth = today.getMonth(); // 0-indexed
    const currentDate = today.getDate();

    // Check calendar windows
    for (let i = 0; i < FESTIVAL_CALENDAR.length; i++) {
      const f = FESTIVAL_CALENDAR[i];
      if (currentMonth >= f.startMonth && currentMonth <= f.endMonth) {
        if (currentMonth === f.startMonth && currentDate < f.startDate) continue;
        if (currentMonth === f.endMonth && currentDate > f.endDate) continue;
        return f;
      }
    }

    // Default to Independence Day during August 12-16 window
    if (currentMonth === 7 && currentDate >= 12 && currentDate <= 16) {
      return FESTIVAL_CALENDAR[0]; // Independence Day
    }

    // Normal Day -> Return null (Clean website without festival overlays)
    return null;
  }

  function initFestivalEngine() {
    const festival = getActiveFestival();
    if (!festival) return; // Normal day mode

    // Check if dismissed in current session
    if (sessionStorage.getItem('dismiss_festival_' + festival.id) === 'true') {
      return;
    }

    // Mark body so CSS offsets fixed header properly
    document.body.classList.add('has-festival-banner');
    document.body.classList.add(festival.themeClass);

    // 1. Inject Top Announcement Banner
    const bannerEl = document.createElement('div');
    bannerEl.className = 'festival-banner ' + festival.themeClass;
    bannerEl.id = 'festivalBanner';
    bannerEl.innerHTML = `
      <div class="festival-banner__content">
        <span class="festival-banner__flag">${festival.flag}</span>
        <span class="festival-banner__text">${festival.bannerText}</span>
      </div>
      <button class="festival-banner__close" id="closeFestivalBanner" aria-label="Close Announcement">✕</button>
    `;

    document.body.insertBefore(bannerEl, document.body.firstChild);

    document.getElementById('closeFestivalBanner').addEventListener('click', function() {
      bannerEl.style.display = 'none';
      document.body.classList.remove('has-festival-banner');
      sessionStorage.setItem('dismiss_festival_' + festival.id, 'true');
    });

    // 2. Inject Subtle Hero Wish Badge (if on landing page hero section)
    const heroContent = document.querySelector('.hero__content');
    if (heroContent && !document.querySelector('.festival-hero-badge')) {
      const heroBadge = document.createElement('div');
      heroBadge.className = 'festival-hero-badge ' + festival.themeClass;
      
      let badgeDots = '';
      if (festival.id === 'independence' || festival.id === 'republic') {
        badgeDots = `
          <span class="tricolor-dot saffron"></span>
          <span class="tricolor-dot white"></span>
          <span class="tricolor-dot green"></span>
        `;
      } else {
        badgeDots = `<span class="festival-icon-dot">${festival.flag}</span>`;
      }

      heroBadge.innerHTML = `
        ${badgeDots}
        <span>${festival.badgeText}</span>
      `;
      heroContent.insertBefore(heroBadge, heroContent.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFestivalEngine);
  } else {
    initFestivalEngine();
  }
})();
