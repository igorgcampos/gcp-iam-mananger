import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { ConfigProvider } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import App from './App';
import { themeConfig } from './theme';
import 'antd/dist/reset.css';

// Todas as chamadas axios (iam, gemini, auth/me, auth/logout) precisam
// enviar o cookie de sessão httpOnly emitido pelo backend após o login SSO.
axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={themeConfig} locale={ptBR}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
