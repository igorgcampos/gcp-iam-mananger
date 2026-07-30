import axios from 'axios';

export const listIAMUsers = () => axios.get('/api/iam/users').then((r) => r.data);

export const addIAMUser = (email, codeAssist = false) =>
  axios.post('/api/iam/users', { email, codeAssist }).then((r) => r.data);

export const removeIAMUser = (email) =>
  axios.delete(`/api/iam/users/${encodeURIComponent(email)}`);

export const addCodeAssist = (email) =>
  axios.post(`/api/iam/users/${encodeURIComponent(email)}/code-assist`).then((r) => r.data);

export const removeCodeAssist = (email) =>
  axios.delete(`/api/iam/users/${encodeURIComponent(email)}/code-assist`);
