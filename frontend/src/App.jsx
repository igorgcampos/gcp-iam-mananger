import React, { useState } from 'react';
import { Layout, Menu, Typography, theme } from 'antd';
import { KeyOutlined, RobotOutlined } from '@ant-design/icons';
import IAMPage from './pages/IAMPage';
import GeminiPage from './pages/GeminiPage';

const { Sider, Content, Header } = Layout;
const { Title, Text } = Typography;

const PAGES = {
  iam: <IAMPage />,
  gemini: <GeminiPage />,
};

export default function App() {
  const [selected, setSelected] = useState('iam');
  const { token } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        collapsible
        width={220}
        style={{ boxShadow: '2px 0 8px rgba(0,0,0,.15)' }}
      >
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <Title level={5} style={{ color: '#fff', margin: 0 }}>GCP Admin</Title>
          <Text style={{ color: 'rgba(255,255,255,.45)', fontSize: 12 }}>agentspace-469418</Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          onSelect={({ key }) => setSelected(key)}
          style={{ marginTop: 8 }}
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
          {PAGES[selected]}
        </Content>
      </Layout>
    </Layout>
  );
}
