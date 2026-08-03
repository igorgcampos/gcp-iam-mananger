import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';
import 'antd/dist/reset.css';

// Todas as chamadas axios (iam, gemini, auth/me, auth/logout) precisam
// enviar o cookie de sessão httpOnly emitido pelo backend após o login SSO.
axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
