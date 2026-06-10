/**
 * Superherooo — Main Website JavaScript
 * Handles: scroll animations, counter animation, navbar behavior, mobile menu
 */
(function () {
  'use strict';

  // ============ DOM Ready ============
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initScrollReveal();
    initCounters();
    initNavbar();
    initMobileMenu();
    initSmoothScroll();
    initYear();
  }

  // ============ Scroll Reveal (IntersectionObserver) ============
  function initScrollReveal() {
    var selectors = '.reveal, .reveal-left, .reveal-right, .reveal-scale, .stagger';
    var elements = document.querySelectorAll(selectors);
    if (!elements.length) return;

    // Check for IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
      // Fallback: show all elements immediately
      elements.forEach(function (el) { el.classList.add('visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    elements.forEach(function (el) { observer.observe(el); });
  }

  // ============ Animated Counters ============
  function initCounters() {
    var counters = document.querySelectorAll('.stats-bar__value[data-count]');
    if (!counters.length) return;

    if (!('IntersectionObserver' in window)) {
      counters.forEach(function (el) { showFinalValue(el); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function (el) { observer.observe(el); });
  }

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var isDecimal = el.hasAttribute('data-decimal');
    var duration = 2000; // ms
    var start = performance.now();

    function update(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = eased * target;

      if (isDecimal) {
        el.textContent = current.toFixed(1) + '/5';
      } else if (target >= 1000000) {
        el.textContent = (current / 1000000).toFixed(1) + 'M';
      } else if (target >= 1000) {
        el.textContent = Math.floor(current / 1000) + 'K+';
      } else {
        el.textContent = Math.floor(current) + 'K+';
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        showFinalValue(el);
      }
    }

    requestAnimationFrame(update);
  }

  function showFinalValue(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var isDecimal = el.hasAttribute('data-decimal');

    if (isDecimal) {
      el.textContent = target.toFixed(1) + '/5';
    } else if (target >= 1000000) {
      el.textContent = (target / 1000000).toFixed(1) + 'M';
    } else if (target >= 1000) {
      el.textContent = Math.floor(target / 1000) + 'K+';
    } else {
      el.textContent = target + 'K+';
    }
  }

  // ============ Navbar Scroll Behavior ============
  function initNavbar() {
    var header = document.getElementById('header');
    if (!header) return;

    var scrollThreshold = 50;
    var ticking = false;

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          if (window.scrollY > scrollThreshold) {
            header.classList.add('scrolled');
          } else {
            header.classList.remove('scrolled');
          }
          updateActiveNav();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ============ Active Nav Link Highlight ============
  function updateActiveNav() {
    var sections = document.querySelectorAll('section[id]');
    var navLinks = document.querySelectorAll('.header__nav a');
    var scrollPos = window.scrollY + 100;

    sections.forEach(function (section) {
      var top = section.offsetTop;
      var height = section.offsetHeight;
      var id = section.getAttribute('id');

      if (scrollPos >= top && scrollPos < top + height) {
        navLinks.forEach(function (link) {
          link.classList.remove('active');
          if (link.getAttribute('href') === '#' + id) {
            link.classList.add('active');
          }
        });
      }
    });
  }

  // ============ Mobile Hamburger Menu ============
  function initMobileMenu() {
    var hamburger = document.getElementById('hamburger');
    var nav = document.getElementById('mainNav');
    if (!hamburger || !nav) return;

    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('open');
      nav.classList.toggle('open');
      var isOpen = nav.classList.contains('open');
      hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close menu when a nav link is clicked
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('open');
        nav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  // ============ Smooth Scroll ============
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var targetId = this.getAttribute('href');
        if (targetId === '#') return;
        var target = document.querySelector(targetId);
        if (!target) return;
        e.preventDefault();

        var headerOffset = 80;
        var elementPosition = target.getBoundingClientRect().top;
        var offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      });
    });
  }

  // ============ Year ============
  function initYear() {
    var yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }
})();
