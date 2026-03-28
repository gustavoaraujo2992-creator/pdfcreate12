import config from './config.mjs';

const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173'
    ? `http://localhost:${config.server.port}`
    : ''; // In production, API is on the same host

async function login(username, password) {
  const response = await fetch(`${SERVER_URL}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function extract(formData) {
  const response = await fetch(`${SERVER_URL}/api/extract`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

export default {
  extract,
};
