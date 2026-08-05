import React, {
  useCallback, useEffect, useState,
} from 'react';
import {
  Layout, Menu, Typography, theme, Button, Spin, Space, Avatar, Tooltip,
} from 'antd';
import {
  KeyOutlined, RobotOutlined, LogoutOutlined, UserOutlined, StopOutlined, MailOutlined,
  DashboardOutlined, LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import IAMPage from './pages/IAMPage';
import GeminiPage from './pages/GeminiPage';
import DashboardPage from './pages/DashboardPage';
import { getMe, logout } from './api/auth';
import { useIamData } from './hooks/useIamData';
import { useGeminiData } from './hooks/useGeminiData';
// Versão otimizada (192×192, ~30KB) do arquivo original enviado — o badge é
// exibido a 64px, então não faz sentido carregar o PNG de 1024px/1,4MB.
import logo from './assets/logo-192.png';
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
        <div className="login-card-badge">
          <img src={logo} alt="Logo" className="login-card-badge-img" />
        </div>
        <div className="login-card-brand">
          <span className="login-card-brand-name">EDITORA GLOBO</span>
          <span className="login-card-brand-dot" />
          <span className="login-card-brand-tag">Painel interno</span>
        </div>

        <div className="login-card-intro">
          <Title level={2} className="login-card-intro-title">Bem-vindo</Title>
          <Text className="login-card-intro-text">
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

        <Text className="login-footer-note">
          Acesso restrito a colaboradores autorizados via Microsoft Entra ID.
        </Text>
      </div>
    </div>
  );
}

function AccessDeniedScreen() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-badge">
          <img src={logo} alt="Logo" className="login-card-badge-img" />
        </div>
        <div className="login-card-brand">
          <span className="login-card-brand-name">EDITORA GLOBO</span>
          <span className="login-card-brand-dot" style={{ background: '#f87171' }} />
          <span className="login-card-brand-tag">GCP Admin</span>
        </div>

        <div className="denied-icon">
          <StopOutlined />
        </div>
        <Title level={2} className="denied-title">Acesso negado</Title>
        <Text className="denied-text">
          Sua conta não possui as permissões necessárias para acessar este painel.
          <span className="denied-text-secondary">
            Solicite ao time de AD a inclusão do seu usuário no grupo de acesso ao <strong>GCP Admin</strong>.
          </span>
        </Text>

        <div className="denied-actions">
          <Button className="denied-btn-primary" href="/" block>
            Voltar para o início
          </Button>
          <Button
            className="denied-btn-secondary"
            icon={<MailOutlined />}
            href="mailto:suporte@edglobo.com.br?subject=Solicitação de Acesso GCP Admin"
            block
          >
            Contactar Suporte TI
          </Button>
        </div>

        <span className="denied-status-badge">Error code: 403 forbidden</span>
      </div>
    </div>
  );
}

const PAGE_TITLES = {
  dashboard: 'Visão Geral',
  iam: 'Gerenciamento de Acesso — Discovery Engine',
  gemini: 'Gemini Enterprise — Gestão de Licenças',
};

export default function App() {
  const [selected, setSelected] = useState('dashboard');
  // Termo de busca vindo da busca global do Dashboard, repassado como valor
  // inicial do campo de busca da página de destino (iam/gemini). As páginas
  // ficam sempre montadas (só escondidas via CSS ao trocar de aba — veja
  // abaixo), por isso cada página também precisa de um efeito que reaja a
  // mudanças desse valor, e não só usá-lo como estado inicial.
  const [pendingSearch, setPendingSearch] = useState('');
  // Pedido para abrir o Relatório de Usuários Inativos já filtrado, vindo do
  // Dashboard. null quando não há pedido pendente.
  const [pendingInactivityReport, setPendingInactivityReport] = useState(null);
  const { token } = theme.useToken();
  // 'loading' | 'login' | 'denied' | 'authenticated'
  const [authState, setAuthState] = useState('loading');
  const [operator, setOperator] = useState(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDER_COLLAPSED_KEY) === '1');

  // Fonte única dos dados de IAM e Gemini Enterprise, compartilhada entre o
  // Dashboard e as respectivas páginas — evita buscar os mesmos dados duas
  // vezes e evita refazer a busca só porque o usuário trocou de aba e voltou.
  // `enabled` mantém as chamadas paradas até o login ser confirmado, pra não
  // bater nas APIs do GCP antes da hora (e gerar erro 401 na tela de login).
  const iam = useIamData({ enabled: authState === 'authenticated' });
  const gemini = useGeminiData({ enabled: authState === 'authenticated' });

  useEffect(() => {
    localStorage.setItem(SIDER_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Limpa a busca/relatório pendentes depois que a página de destino já leu
  // seus valores iniciais, para que uma troca de aba manual (sem passar
  // pelos atalhos do Dashboard) não reaplique um pedido antigo.
  useEffect(() => {
    if (pendingSearch) setPendingSearch('');
    if (pendingInactivityReport) setPendingInactivityReport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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
        className="gcp-sider"
        style={{ boxShadow: '2px 0 8px rgba(0,0,0,.15)', position: 'relative', background: '#192645' }}
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
            style={{ marginTop: 8, flex: 1, background: 'transparent' }}
            items={[
              {
                key: 'dashboard',
                icon: <DashboardOutlined />,
                label: 'Dashboard',
              },
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
            {PAGE_TITLES[selected]}
          </Title>
        </Header>
        <Content style={{ background: token.colorBgLayout }}>
          {/* As três páginas ficam sempre montadas — só escondidas via CSS —
              para preservar estado local (busca, filtros, ordenação) ao
              trocar de aba e não recriar o "flash" de carregamento. Os dados
              em si (iam/gemini) vêm de fora, então trocar de aba nunca
              dispara uma busca nova. */}
          <div style={{ display: selected === 'dashboard' ? 'block' : 'none' }}>
            <DashboardPage
              iamUsers={iam.users}
              iamLoading={iam.loading}
              iamLastUpdated={iam.lastUpdated}
              reloadIam={iam.reload}
              geminiUsers={gemini.users}
              configs={gemini.configs}
              geminiLoading={gemini.loading}
              geminiLastUpdated={gemini.lastUpdated}
              reloadGemini={gemini.reload}
              onNavigate={setSelected}
              onSearchNavigate={(term, page) => {
                setPendingSearch(term);
                setSelected(page);
              }}
              onOpenInactivityReport={(thresholdMonths) => {
                setPendingInactivityReport({ thresholdMonths });
                setSelected('gemini');
              }}
            />
          </div>
          <div style={{ display: selected === 'iam' ? 'block' : 'none' }}>
            <IAMPage
              users={iam.users}
              loading={iam.loading}
              lastUpdated={iam.lastUpdated}
              reload={iam.reload}
              initialSearch={pendingSearch}
            />
          </div>
          <div style={{ display: selected === 'gemini' ? 'block' : 'none' }}>
            <GeminiPage
              users={gemini.users}
              configs={gemini.configs}
              loading={gemini.loading}
              lastUpdated={gemini.lastUpdated}
              reload={gemini.reload}
              initialSearch={pendingSearch}
              openInactivityReport={pendingInactivityReport}
            />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
