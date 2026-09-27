// frontend/js/ui.js
// Shared UI helpers: theme, notifications
(function () {
  const THEME_KEY = 'turontoo_theme';

  // ---------- THEME ----------
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(saved);
  }

  async function toggleTheme() {
    const current = localStorage.getItem(THEME_KEY) || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);

    try {
      const u = JSON.parse(localStorage.getItem('turontoo_user') || 'null');
      if (u && u.id && window.API_BASE) {
        await fetch(`${window.API_BASE}/api/users/${u.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: next })
        });
      }
    } catch (e) {}
  }

  // ---------- NOTIFICATIONS ----------
  // IMPORTANT: This function is intentionally empty.
  //
  // Previously this function attached a global click handler to EVERY element
  // with aria-label="Notifications" and forced a redirect to activity.html.
  // That behavior broke the notification bell dropdown on every page.
  //
  // Each page now owns its own notification bell behavior (see the inline
  // <script> in activity.html, index.html, browse.html, profile.html,
  // job-details.html, post-job.html, chat.html).
  //
  // Do NOT add global notification click handlers here. If you want a shared
  // helper, expose it via window.TurontooUI so pages can opt in explicitly.
  function initNotifications() {
    // Intentionally empty.
  }

  // ---------- THEME TOGGLE BUTTON ----------
  function initThemeToggle() {
    let toggle = document.getElementById('theme-toggle');

    // Auto-inject a theme toggle if the page doesn't have one
    if (!toggle) {
      const header = document.querySelector('header');
      const notifBtn = header?.querySelector('[aria-label="Notifications"]');
      if (header && notifBtn) {
        toggle = document.createElement('button');
        toggle.id = 'theme-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Toggle theme');
        toggle.className = 'w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60 transition-colors';
        toggle.innerHTML = '<span class="material-symbols-outlined text-[22px]" id="theme-icon">dark_mode</span>';
        // Insert before the notification bell
        notifBtn.parentNode.insertBefore(toggle, notifBtn);
      }
    }

    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = 'true';
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        toggleTheme();
      });
    }
  }

  // ---------- DARK MODE CSS ----------
  function injectDarkCSS() {
    if (document.getElementById('turontoo-dark-css')) return;
    const style = document.createElement('style');
    style.id = 'turontoo-dark-css';
    style.textContent = `
      .dark body { background: #1a1a17 !important; color: #f3f0eb !important; }
      .dark .bg-surface { background: #1a1a17 !important; }
      .dark .bg-surface-container-lowest { background: #232320 !important; }
      .dark .bg-surface-container-low { background: #2b2b28 !important; }
      .dark .bg-surface-container { background: #31302d !important; }
      .dark .bg-surface-container-high { background: #3a3a36 !important; }
      .dark .bg-surface-container-highest { background: #42423d !important; }
      .dark .text-on-surface { color: #f3f0eb !important; }
      .dark .text-on-surface-variant { color: #b0aca3 !important; }
      .dark .text-outline { color: #8a857b !important; }
      .dark .border-outline-variant\\/30 { border-color: #4a4a44 !important; }
      .dark .border-outline-variant\\/50 { border-color: #4a4a44 !important; }
      .dark header { background: rgba(26, 26, 23, 0.85) !important; }
      .dark footer { background: #2b2b28 !important; }
      .dark input, .dark textarea, .dark select {
        color: #f3f0eb !important;
        background-color: #31302d !important;
      }
      .dark input::placeholder, .dark textarea::placeholder {
        color: #8a857b !important;
      }
      .dark .skeleton {
        background: linear-gradient(90deg, #2b2b28 25%, #31302d 50%, #2b2b28 75%) !important;
        background-size: 200% 100% !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- INITIALIZE ----------
  document.addEventListener('DOMContentLoaded', () => {
    injectDarkCSS();
    initTheme();
    initNotifications();   // No-op — kept for backward compatibility
    initThemeToggle();
  });

  // ---------- PUBLIC API ----------
  window.TurontooUI = {
    applyTheme,
    toggleTheme
  };
})();