// frontend/js/auth.js
// Real auth helper — calls the backend API for signup/login.
// On success, stores user in localStorage (same key used by all pages).
(function (window) {
  const API = window.API_BASE || 'http://localhost:5000';
  const USER_KEY = 'turontoo_user';

  async function signup(payload) {
    const res = await fetch(`${API}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Signup failed');

    // Store in localStorage so all pages see the user
    localStorage.setItem(USER_KEY, JSON.stringify({
      id: data.user.id,
      email: payload.email,
      phone: data.user.phone,
      full_name: data.user.full_name,
      full_name_bn: data.user.full_name_bn,
      city: data.user.city,
      area: data.user.area,
      verification_status: 'unverified',
      logged_in_at: new Date().toISOString()
    }));
    return data;
  }

  async function login(email, password) {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem(USER_KEY, JSON.stringify({
      id: data.user.id,
      email: email,
      phone: data.user.phone,
      full_name: data.user.full_name,
      full_name_bn: data.user.full_name_bn,
      city: data.user.city,
      area: data.user.area,
      verification_status: data.user.nid_verified ? 'verified' : 'unverified',
      logged_in_at: new Date().toISOString()
    }));
    return data;
  }

  function logout() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('turontoo_remember');
  }

  function currentUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (e) { return null; }
  }

  window.TurontooAuth = { signup, login, logout, currentUser };
})(window);