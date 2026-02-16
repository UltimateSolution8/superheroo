(function () {
  var toggle = document.getElementById('themeToggle');
  var year = document.getElementById('year');
  var msg = document.getElementById('formMsg');

  if (year) year.textContent = String(new Date().getFullYear());

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem('him.theme', t);
    } catch (_) {}
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var current = document.documentElement.dataset.theme || 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  window.himFormSubmit = function (ev) {
    try {
      ev.preventDefault();
      if (!msg) return false;
      msg.textContent = 'Thanks. We will contact you shortly.';
      msg.style.color = 'var(--text)';
      return false;
    } catch (_) {
      return false;
    }
  };
})();

