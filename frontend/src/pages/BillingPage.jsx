import React from 'react';
import {
  Card, Statistic, Typography, Space, Button, Spin, Empty,
} from 'antd';
import {
  WalletOutlined, RobotOutlined, CloudServerOutlined, QuestionCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { formatCurrency } from '../utils/billingFormatting';

const { Title, Text } = Typography;

function StatCard({
  icon, iconBg, iconColor, label, value, hint,
}) {
  return (
    <Card size="small" bordered className="stat-card" style={{ borderRadius: 16 }}>
      <Space align="center" size={12}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 12, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: iconBg, color: iconColor, fontSize: 18,
          }}
        >
          {icon}
        </div>
        <Text strong type="secondary" style={{ fontSize: 13 }}>{label}</Text>
      </Space>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Statistic value={value} valueStyle={{ fontSize: 28, fontWeight: 800, color: '#192645' }} />
        {hint && <Text style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{hint}</Text>}
      </div>
    </Card>
  );
}

export default function BillingPage({
  summary, loading, lastUpdated, reload,
}) {
  const currency = summary?.currency || 'BRL';

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start" wrap>
          <Space direction="vertical" size={0}>
            <Space>
              <WalletOutlined style={{ fontSize: 20, color: '#192645' }} />
              <Title level={4} style={{ margin: 0 }}>Custos</Title>
            </Space>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Gasto do projeto {import.meta.env.VITE_GCP_PROJECT_ID} no mês corrente, via BigQuery Billing Export.
            </Text>
          </Space>
          <Space wrap>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
              Atualizar
            </Button>
          </Space>
        </Space>

        <Spin spinning={loading}>
          {summary ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <StatCard
                icon={<WalletOutlined />}
                iconBg="#eff6ff"
                iconColor="#2563eb"
                label="Total do projeto"
                value={formatCurrency(summary.total, currency)}
                hint="Mês corrente"
              />
              <StatCard
                icon={<RobotOutlined />}
                iconBg="#f5f3ff"
                iconColor="#7c3aed"
                label="Gemini"
                value={formatCurrency(summary.gemini, currency)}
                hint="Vertex AI Search / licenças"
              />
              <StatCard
                icon={<CloudServerOutlined />}
                iconBg="#eef2ff"
                iconColor="#4f46e5"
                label="Infra"
                value={formatCurrency(summary.infra, currency)}
                hint="Cloud Run e afins"
              />
              <StatCard
                icon={<QuestionCircleOutlined />}
                iconBg="#f8fafc"
                iconColor="#64748b"
                label="Não categorizado"
                value={formatCurrency(summary.uncategorized, currency)}
                hint="Fora das listas conhecidas"
              />
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhum dado de custo carregado ainda" />
          )}
        </Spin>
      </Space>
    </div>
  );
}
