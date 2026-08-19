import React, { useMemo, useState } from 'react';
import {
  Typography, Space, Button, Spin, Empty, Alert,
} from 'antd';
import {
  WalletOutlined, SafetyCertificateOutlined, ApiOutlined, CloudServerOutlined, QuestionCircleOutlined, ReloadOutlined, WarningOutlined,
} from '@ant-design/icons';
import BillingCategoryCard from '../components/BillingCategoryCard';
import { formatCurrency, formatAlertMessage } from '../utils/billingFormatting';

const { Title, Text } = Typography;

const ALL_PROJECTS = 'all';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Agrega os items (por Serviço/SKU) de todos os projetos de um *ByProject
// (licensesByProject ou apiByProject) num único drill-down, pra vista "Todos
// os projetos" de cada card.
function mergeCostItems(byProject) {
  const byService = new Map();
  Object.values(byProject).forEach(({ items }) => {
    items.forEach(({ service, cost, skus }) => {
      if (!byService.has(service)) byService.set(service, { cost: 0, skus: new Map() });
      const entry = byService.get(service);
      entry.cost += cost;
      skus.forEach(({ sku, cost: skuCost }) => {
        entry.skus.set(sku, (entry.skus.get(sku) || 0) + skuCost);
      });
    });
  });

  return Array.from(byService.entries())
    .map(([service, { cost, skus }]) => ({
      service,
      cost: round2(cost),
      skus: Array.from(skus.entries())
        .map(([sku, skuCost]) => ({ sku, cost: round2(skuCost) }))
        .sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => b.cost - a.cost);
}

// Agrupa summary.alerts (Alerta de Custo, ver CONTEXT.md e ADR 0012) por
// category, pra cada BillingCategoryCard receber só os alertas dele. Não
// filtra por projeto selecionado no card — o badge inline aparece mesmo na
// visão mesclada "Todos os projetos" (ver ADR 0012).
const ALERT_CATEGORIES = ['licenses', 'vertexApi', 'infra', 'uncategorized'];

function groupAlertsByCategory(alerts) {
  const byCategory = Object.fromEntries(ALERT_CATEGORIES.map((c) => [c, []]));
  (alerts ?? []).forEach((alert) => {
    if (byCategory[alert.category]) byCategory[alert.category].push(alert);
  });
  return byCategory;
}

// Estado + derivação do card "por projeto" (Licenças ou API) — os dois cards
// têm seletor de projeto independente um do outro (ver ADR 0011), mas a
// mesma lógica de "Todos os projetos" vs. projeto específico.
function useProjectScopedCost(byProject) {
  const [project, setProject] = useState(ALL_PROJECTS);

  const options = useMemo(() => [
    { value: ALL_PROJECTS, label: 'Todos os projetos' },
    ...Object.entries(byProject?.byProject ?? {}).map(([key, p]) => ({ value: key, label: p.label })),
  ], [byProject]);

  const value = project === ALL_PROJECTS
    ? byProject?.total
    : byProject?.byProject[project]?.total;

  const items = project === ALL_PROJECTS
    ? mergeCostItems(byProject?.byProject ?? {})
    : byProject?.byProject[project]?.items ?? [];

  return {
    project, setProject, options, value, items,
  };
}

export default function BillingPage({
  summary, loading, lastUpdated, reload,
}) {
  const currency = summary?.currency || 'BRL';
  const licenses = useProjectScopedCost(summary?.licensesByProject);
  const api = useProjectScopedCost(summary?.apiByProject);
  const alerts = summary?.alerts ?? [];
  const alertsByCategory = useMemo(() => groupAlertsByCategory(alerts), [alerts]);

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
              Gasto do projeto {import.meta.env.VITE_GCP_PROJECT_ID} no mês corrente.
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

        {alerts.length > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message={alerts.length === 1 ? '1 Alerta de Custo' : `${alerts.length} Alertas de Custo`}
            description={(
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {alerts.map((alert) => (
                  <li key={`${alert.tipo}-${alert.projectId}-${alert.service}-${alert.sku}`}>
                    {formatAlertMessage(alert)}
                  </li>
                ))}
              </ul>
            )}
          />
        )}

        <Spin spinning={loading}>
          {summary ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'start',
            }}
            >
              <BillingCategoryCard
                icon={<WalletOutlined />}
                iconBg="#eff6ff"
                iconColor="#2563eb"
                label="Total do projeto"
                value={formatCurrency(summary.total, currency)}
                hint="Mês corrente"
              />
              <BillingCategoryCard
                icon={<SafetyCertificateOutlined />}
                iconBg="#f5f3ff"
                iconColor="#7c3aed"
                label="Licenças"
                value={formatCurrency(licenses.value, currency)}
                hint="Assinaturas Gemini Enterprise / Agentspace"
                currency={currency}
                items={licenses.items}
                filter={{ value: licenses.project, onChange: licenses.setProject, options: licenses.options }}
                alerts={alertsByCategory.licenses}
              />
              <BillingCategoryCard
                icon={<ApiOutlined />}
                iconBg="#e6f4ff"
                iconColor="#1677ff"
                label="API"
                value={formatCurrency(api.value, currency)}
                hint="Consumo de modelo (LLM)"
                currency={currency}
                items={api.items}
                filter={{ value: api.project, onChange: api.setProject, options: api.options }}
                alerts={alertsByCategory.vertexApi}
              />
              <BillingCategoryCard
                icon={<CloudServerOutlined />}
                iconBg="#eef2ff"
                iconColor="#4f46e5"
                label="Infra"
                value={formatCurrency(summary.infra, currency)}
                hint="Cloud Run e afins"
                currency={currency}
                items={summary.items?.infra ?? []}
                alerts={alertsByCategory.infra}
              />
              <BillingCategoryCard
                icon={<QuestionCircleOutlined />}
                iconBg="#f8fafc"
                iconColor="#64748b"
                label="Outros Serviços"
                value={formatCurrency(summary.uncategorized, currency)}
                hint="Fora das listas conhecidas"
                currency={currency}
                items={summary.items?.uncategorized ?? []}
                alerts={alertsByCategory.uncategorized}
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
