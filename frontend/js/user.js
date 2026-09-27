// frontend/js/user.js
// Avatar helper — reads real user from localStorage, no fake defaults
(function (window) {
  const USER_KEY = 'turontoo_user';

  function getCurrentUser() {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function paintAvatar(el, user) {
    if (!el) return;

    // No user → show "?"
    if (!user || !user.id) {
      el.innerHTML = '';
      el.textContent = '?';
      el.style.fontSize = '';
      return;
    }

    // User has photo → show it
    if (user.avatar_url) {
      el.innerHTML = `<img src="${user.avatar_url}" alt="Profile" class="w-full h-full rounded-full object-cover"/>`;
      return;
    }

    // Otherwise show initials
    const name = user.full_name_bn || user.full_name || '';
    el.innerHTML = '';
    el.textContent = getInitials(name) || '?';
  }

  function applyAvatar() {
    const user = getCurrentUser();
    // Support both #nav-avatar (legacy) and any [data-avatar]
    const targets = new Set();
    const legacy = document.getElementById('nav-avatar');
    if (legacy) targets.add(legacy);
    document.querySelectorAll('[data-avatar]').forEach(el => targets.add(el));
    targets.forEach(el => paintAvatar(el, user));
  }

  window.TurontooUser = {
    getCurrentUser,
    getInitials,
    applyAvatar
  };

  // Auto-run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAvatar);
  } else {
    applyAvatar();
  }

  // Update if another tab logs in/out
  window.addEventListener('storage', (e) => {
    if (e.key === USER_KEY) applyAvatar();
  });
})(window);