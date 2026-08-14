/**
 * SUPERHEROOO DYNAMIC FESTIVAL ENGINE
 * Ultra-Responsive Fixed Top Banner & Simplified Hero Wish Badge
 */
(function() {
  'use strict';

  // Configured Festival Calendar & Simplified Badges
  const FESTIVAL_CALENDAR = [
    {
      id: 'independence',
      name: 'Independence Day',
      themeClass: 'festival-theme--independence',
      flag: '🇮🇳',
      bannerTextDesktop: 'Wishing Everyone a Happy 80th Independence Day! SuperHerooo — Freedom from Everyday Chores! 🎉',
      bannerTextMobile: 'Happy 80th Independence Day! Freedom from Chores 🎉',
      badgeText: 'Happy Independence Day',
      // Aug 13 to Aug 16
      startMonth: 7, startDate: 13,
      endMonth: 7, endDate: 16
    },
    {
      id: 'navratri',
      name: 'Navratri & Dussehra',
      themeClass: 'festival-theme--navratri',
      flag: '🌺',
      bannerTextDesktop: 'Wishing Everyone Happy Navratri & Dussehra! Celebrate joyfully while SuperHerooo handles your chores! 🌺',
      bannerTextMobile: 'Happy Navratri & Dussehra! Get Helper in Minutes 🌺',
      badgeText: 'Happy Navratri & Dussehra',
      startMonth: 8, startDate: 20,
      endMonth: 9, endDate: 5
    },
    {
      id: 'diwali',
      name: 'Diwali & Dhanteras',
      themeClass: 'festival-theme--diwali',
      flag: '🪔',
      bannerTextDesktop: 'Wishing Everyone a Bright & Prosperous Diwali! Light up your home with SuperHerooo services! ✨',
      bannerTextMobile: 'Wishing Everyone a Happy & Bright Diwali! ✨',
      badgeText: 'Happy Diwali',
      startMonth: 9, startDate: 25,
      endMonth: 10, endDate: 5
    },
    {
      id: 'republic',
      name: 'Republic Day',
      themeClass: 'festival-theme--republic',
      flag: '🇮🇳',
      bannerTextDesktop: 'Happy Republic Day! Freedom to relax while SuperHerooo manages your daily tasks! 🇮🇳',
      bannerTextMobile: 'Happy Republic Day! Get Helper in Minutes 🇮🇳',
      badgeText: 'Happy Republic Day',
      startMonth: 0, startDate: 24,
      endMonth: 0, endDate: 27
    },
    {
      id: 'holi',
      name: 'Holi',
      themeClass: 'festival-theme--holi',
      flag: '🎨',
      bannerTextDesktop: 'Wishing Everyone a Joyous & Colorful Holi! SuperHerooo wishes you happiness & peace of mind! 🎨',
      bannerTextMobile: 'Wishing Everyone a Joyous & Colorful Holi! 🎨',
      badgeText: 'Happy Holi',
      startMonth: 2, startDate: 20,
      endMonth: 2, endDate: 26
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

    // Normal Day -> Return null (Clean website mode)
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

    const isMobile = window.innerWidth <= 640;
    const bannerText = isMobile ? festival.bannerTextMobile : festival.bannerTextDesktop;

    // 1. Inject Top Announcement Banner
    const bannerEl = document.createElement('div');
    bannerEl.className = 'festival-banner ' + festival.themeClass;
    bannerEl.id = 'festivalBanner';
    bannerEl.innerHTML = `
      <div class="festival-banner__content">
        <span class="festival-banner__flag">${festival.flag}</span>
        <span class="festival-banner__text">${bannerText}</span>
      </div>
      <button class="festival-banner__close" id="closeFestivalBanner" aria-label="Close Announcement">✕</button>
    `;

    document.body.insertBefore(bannerEl, document.body.firstChild);

    document.getElementById('closeFestivalBanner').addEventListener('click', function() {
      bannerEl.style.display = 'none';
      document.body.classList.remove('has-festival-banner');
      sessionStorage.setItem('dismiss_festival_' + festival.id, 'true');
    });

    // 2. Inject Simplified Hero Wish Badge (e.g. "🇮🇳 Happy Independence Day")
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
