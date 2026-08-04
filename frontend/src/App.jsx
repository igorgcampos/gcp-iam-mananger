import React, {
  useCallback, useEffect, useState,
} from 'react';
import {
  Layout, Menu, Typography, theme, Button, Spin, Result, Space, Avatar, Tooltip,
} from 'antd';
import {
  KeyOutlined, RobotOutlined, LogoutOutlined, UserOutlined, SafetyCertificateOutlined,
  LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import IAMPage from './pages/IAMPage';
import GeminiPage from './pages/GeminiPage';
import { getMe, logout } from './api/auth';
import './App.css';

const { Sider, Content, Header } = Layout;
const { Title, Text } = Typography;

const CENTERED_SCREEN_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
};

const hasAccessDeniedError = () => new URLSearchParams(window.location.search).get('error') === 'access_denied';

const SIDER_COLLAPSED_KEY = 'gcpAdminSiderCollapsed';

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function LoginScreen() {
  const [signingIn, setSigningIn] = useState(false);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-band">
          <div className="login-card-badge">
            <KeyOutlined />
          </div>
        </div>
        <div className="login-card-body">
          <Title level={4} style={{ marginBottom: 4 }}>GCP Admin</Title>
          <Text style={{ color: '#64748b', fontSize: 14, display: 'block', marginBottom: 32 }}>
            EdGlobo — Painel Interno
          </Text>

          <div className="login-card-intro">
            <Title level={5} style={{ marginBottom: 8 }}>Bem-vindo</Title>
            <Text style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
              Entre com sua conta corporativa Microsoft para acessar o painel de gestão de acessos e licenças.
            </Text>
          </div>

          {/* Navegação real de página inteira — o fluxo de login é um
              redirect OIDC, não uma chamada de API via fetch/axios. */}
          <Button
            className="ms-signin-btn"
            size="large"
            href="/auth/login"
            loading={signingIn}
            icon={<MicrosoftLogo />}
            onClick={() => setSigningIn(true)}
          >
            Entrar com Microsoft
          </Button>

          <div className="login-feature-list">
            <div className="login-feature-item">
              <SafetyCertificateOutlined className="login-feature-icon" />
              <span>Gerenciamento de acesso IAM — Discovery Engine</span>
            </div>
            <div className="login-feature-item">
              <RobotOutlined className="login-feature-icon" />
              <span>Gestão de licenças — Gemini Enterprise</span>
            </div>
          </div>

          <Text className="login-footer-note">
            Acesso restrito a colaboradores autorizados via Microsoft Entra ID.
          </Text>
        </div>
      </div>
    </div>
  );
}

function AccessDeniedScreen() {
  return (
    <div style={CENTERED_SCREEN_STYLE}>
      <Result
        status="403"
        title="Acesso negado"
        subTitle="Sua conta não tem permissão para acessar este painel. Solicite ao time de AD a inclusão no grupo de acesso ao GCP Admin."
      />
    </div>
  );
}

export default function App() {
  const [selected, setSelected] = useState('iam');
  const { token } = theme.useToken();
  // 'loading' | 'login' | 'denied' | 'authenticated'
  const [authState, setAuthState] = useState('loading');
  const [operator, setOperator] = useState(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDER_COLLAPSED_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(SIDER_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    if (hasAccessDeniedError()) {
      setAuthState('denied');
      return;
    }
    getMe()
      .then((data) => {
        setOperator(data);
        setAuthState('authenticated');
      })
      .catch(() => {
        setAuthState('login');
      });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      window.location.reload();
    }
  }, []);

  if (authState === 'loading') {
    return (
      <div style={CENTERED_SCREEN_STYLE}>
        <Spin size="large" />
      </div>
    );
  }

  if (authState === 'denied') {
    return <AccessDeniedScreen />;
  }

  if (authState === 'login') {
    return <LoginScreen />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={220}
        style={{ boxShadow: '2px 0 8px rgba(0,0,0,.15)', position: 'relative' }}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', height: '100%',
        }}
        >
          <div style={{
            padding: collapsed ? '20px 0 12px' : '20px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,.1)',
            textAlign: collapsed ? 'center' : 'left',
          }}
          >
            {collapsed ? (
              <Title level={5} style={{ color: '#fff', margin: 0 }}>GA</Title>
            ) : (
              <>
                <Title level={5} style={{ color: '#fff', margin: 0 }}>GCP Admin</Title>
                <Text style={{ color: 'rgba(255,255,255,.45)', fontSize: 12 }}>{import.meta.env.VITE_GCP_PROJECT_ID}</Text>
              </>
            )}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selected]}
            onSelect={({ key }) => setSelected(key)}
            style={{ marginTop: 8, flex: 1 }}
            items={[
              {
                key: 'iam',
                icon: <KeyOutlined />,
                label: 'IAM',
              },
              {
                key: 'gemini',
                icon: <RobotOutlined />,
                label: 'Gemini Enterprise',
              },
            ]}
          />
          <div style={{
            padding: collapsed ? '12px 0' : '12px 16px',
            borderTop: '1px solid rgba(255,255,255,.1)',
          }}
          >
            {collapsed ? (
              <Space direction="vertical" size={12} style={{ width: '100%', alignItems: 'center' }}>
                <Tooltip title={operator?.name || operator?.email} placement="right">
                  <Avatar size="small" icon={<UserOutlined />} />
                </Tooltip>
                <Tooltip title="Sair" placement="right">
                  <Button
                    type="text"
                    size="small"
                    icon={<LogoutOutlined />}
                    onClick={handleLogout}
                    aria-label="Sair"
                    style={{ color: 'rgba(255,255,255,.65)' }}
                  />
                </Tooltip>
              </Space>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space size={8} align="center">
                  <Avatar size="small" icon={<UserOutlined />} />
                  <Text
                    style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, maxWidth: 140 }}
                    ellipsis={{ tooltip: operator?.email }}
                  >
                    {operator?.name || operator?.email}
                  </Text>
                </Space>
                <Button
                  type="text"
                  size="small"
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  style={{ color: 'rgba(255,255,255,.65)', paddingLeft: 0 }}
                >
                  Sair
                </Button>
              </Space>
            )}
          </div>
        </div>
        <button
          type="button"
          className="sider-toggle-hit"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          <span className="sider-toggle-visual">
            {collapsed ? <RightOutlined style={{ fontSize: 10 }} /> : <LeftOutlined style={{ fontSize: 10 }} />}
          </span>
        </button>
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Title level={5} style={{ margin: 0, color: token.colorTextSecondary }}>
            {selected === 'iam' ? 'Gerenciamento de Acesso — Discovery Engine' : 'Gemini Enterprise — Gestão de Licenças'}
          </Title>
        </Header>
        <Content style={{ background: token.colorBgLayout }}>
          {selected === 'iam' ? <IAMPage /> : <GeminiPage />}
        </Content>
      </Layout>
    </Layout>
  );
}
