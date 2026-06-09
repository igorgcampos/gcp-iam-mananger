import axios from 'axios';

export const listIAMUsers = () => axios.get('/api/iam/users').then((r) => r.data);

export const addIAMUser = (email) =>
  axios.post('/api/iam/users', { email }).then((r) => r.data);

export const removeIAMUser = (email) =>
  axios.delete(`/api/iam/users/${encodeURIComponent(email)}`);
