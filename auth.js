import api from './api.js';

const SESSION_KEY = 'nhce_session';

async function login(username, password) {
  try {
    await api.login(username, password);
    sessionStorage.setItem(SESSION_KEY, 'active');
    return true;
  } catch (error) {
    return false;
  }
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === 'active';
}

export default {
  login,
  logout,
  isLoggedIn,
};
