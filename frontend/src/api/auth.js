import axios from 'axios';

// Chamadas de API (não a navegação de login em si) precisam enviar o cookie
// de sessão para o backend. /auth/login e /auth/callback são acessados via
// navegação real do browser (window.location), não por aqui.
export const getMe = () => axios.get('/auth/me').then((r) => r.data);

export const logout = () => axios.post('/auth/logout');
