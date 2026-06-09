import axios from 'axios';

export const listLicenseConfigs = () =>
  axios.get('/api/gemini/license-configs').then((r) => r.data);

export const listGeminiUsers = () =>
  axios.get('/api/gemini/users').then((r) => r.data);

export const addGeminiUser = (email, licenseConfig) =>
  axios.post('/api/gemini/users', { email, licenseConfig }).then((r) => r.data);

export const removeGeminiUser = (email) =>
  axios.delete(`/api/gemini/users/${encodeURIComponent(email)}`);
