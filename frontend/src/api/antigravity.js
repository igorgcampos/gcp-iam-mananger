import axios from 'axios';

export const getAntigravityUsage = () => axios.get('/api/antigravity/usage').then((r) => r.data);
