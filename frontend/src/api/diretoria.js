import axios from 'axios';

export const lookupDiretorias = (emails) =>
  axios.post('/api/diretoria/lookup', { emails }).then((r) => r.data.diretorias);
