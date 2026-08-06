import axios from 'axios';

export const getBillingSummary = () => axios.get('/api/billing/summary').then((r) => r.data);
