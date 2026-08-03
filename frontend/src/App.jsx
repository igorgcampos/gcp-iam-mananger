import React, {
  useCallback, useEffect, useState,
} from 'react';
import {
  Layout, Menu, Typography, theme, Button, Spin, Result, Space, Avatar,
} from 'antd';
import {
  KeyOutlined, RobotOutlined, LogoutOutlined, UserOutlined,
} from '@ant-design/icons';
import IAMPage from './pages/IAMPage';
import GeminiPage from './pages/GeminiPage';
import { getMe, logout } from './api/auth';

const { Sider, Content, Header } = Layout;
const { Title, Text } = Typography;

const CENTERED_SCREEN_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
};

const hasAccessDeniedError = () => new URLSearchParams(window.location.search).get('error') === 'access_denied';

function LoginScreen() {
  return (
    <div style={CENTERED_SCREEN_STYLE}>
      <Result
        icon={<UserOutlined />}
        title="GCP Admin"
        subTitle="Entre com sua conta corporativa (Microsoft) para acessar o painel."
        extra={(
          // Navegação real de página inteira — o fluxo de login é um
          // redirect OIDC, não uma chamada de API via fetch/axios.
          <Button type="primary" size="large" href="/auth/login">
            Entrar com Microsoft
          </Button>
        )}
      />
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
        width={220}
        style={{ boxShadow: '2px 0 8px rgba(0,0,0,.15)' }}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', height: '100%',
        }}
        >
          <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>GCP Admin</Title>
            <Text style={{ color: 'rgba(255,255,255,.45)', fontSize: 12 }}>{import.meta.env.VITE_GCP_PROJECT_ID}</Text>
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
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.1)' }}>
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
          </div>
        </div>
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
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
