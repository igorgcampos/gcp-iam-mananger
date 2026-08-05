import React, { useMemo, useState } from 'react';
import {
  Card, Statistic, Typography, Space, Button, Tag, Empty, Alert, AutoComplete, Input, Spin,
} from 'antd';
import {
  KeyOutlined, ThunderboltOutlined, RobotOutlined, PieChartOutlined,
  ReloadOutlined, ClockCircleOutlined, SafetyCertificateOutlined, MailOutlined,
  RightOutlined, SearchOutlined, WarningOutlined,
} from '@ant-design/icons';
import { tierColor } from '../utils/licenseFormatting';
import { buildInactivityReport } from '../utils/inactivity';
import {
  buildConfigStats, sumAssigned, sumRemaining, getExpiringSoonConfigs,
} from '../utils/dashboardStats';

const { Title, Text } = Typography;

function StatCard({
  icon, iconBg, iconColor, label, value, hint, hintColor, onClick,
}) {
  return (
    <Card
      size="small"
      bordered
      className="stat-card"
      style={{ borderRadius: 16, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
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
        {hint && <Text style={{ fontSize: 12, fontWeight: 700, color: hintColor || '#94a3b8' }}>{hint}</Text>}
      </div>
    </Card>
  );
}

// Limiar usado pelo card/atalho de inatividade do Dashboard. Independente
// do limiar padrão do modal (utils/inactivity.js), que o usuário ajusta
// livremente pelo seletor quando abre o relatório a partir do Gemini Enterprise.
const DASHBOARD_INACTIVITY_MONTHS = 3;

function QuickLink({ icon, title, subtitle, onClick }) {
  return (
    <button type="button" onClick={onClick} className="dashboard-quick-link">
      <span className="dashboard-quick-link-icon">{icon}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>
        <Text strong style={{ display: 'block', fontSize: 13 }}>{title}</Text>
        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>{subtitle}</Text>
      </span>
      <RightOutlined style={{ color: '#cbd5e1', fontSize: 12 }} />
    </button>
  );
}

export default function DashboardPage({
  iamUsers, iamLoading, iamLastUpdated, reloadIam,
  geminiUsers, configs, geminiLoading, geminiLastUpdated, reloadGemini,
  onNavigate, onSearchNavigate, onOpenInactivityReport,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const loading = iamLoading || geminiLoading;

  const lastUpdated = useMemo(() => {
    const dates = [iamLastUpdated, geminiLastUpdated].filter(Boolean);
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [iamLastUpdated, geminiLastUpdated]);

  const reload = () => {
    reloadIam();
    reloadGemini();
  };

  const codeAssistCount = useMemo(
    () => iamUsers.filter((u) => u.codeAssist).length,
    [iamUsers]
  );

  const configStats = useMemo(
    () => buildConfigStats(configs, geminiUsers),
    [configs, geminiUsers]
  );

  const totalAssigned = useMemo(() => sumAssigned(configStats), [configStats]);
  const totalRemaining = useMemo(() => sumRemaining(configStats), [configStats]);
  const expiringSoon = useMemo(() => getExpiringSoonConfigs(configStats), [configStats]);

  const hasExpired = expiringSoon.some((c) => c.daysUntilEnd < 0);

  const inactiveReport = useMemo(
    () => buildInactivityReport(geminiUsers, DASHBOARD_INACTIVITY_MONTHS),
    [geminiUsers]
  );

  const handleOpenInactivityReport = () => {
    if (onOpenInactivityReport) {
      onOpenInactivityReport(DASHBOARD_INACTIVITY_MONTHS);
    } else {
      onNavigate?.('gemini');
    }
  };

  const searchOptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];

    const toOption = (email, page, tagColor, tagLabel) => ({
      value: `${page}:${email}`,
      term: email,
      targetPage: page,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text>{email}</Text>
          <Tag color={tagColor} style={{ margin: 0 }}>{tagLabel}</Tag>
        </Space>
      ),
    });

    const iamMatches = iamUsers
      .filter((u) => (u.email || '').toLowerCase().includes(term))
      .slice(0, 5)
      .map((u) => toOption(u.email, 'iam', 'blue', 'IAM'));

    const geminiMatches = geminiUsers
      .filter((u) => (u.userPrincipal || '').toLowerCase().includes(term))
      .slice(0, 5)
      .map((u) => toOption(u.userPrincipal, 'gemini', 'purple', 'Gemini'));

    return [...iamMatches, ...geminiMatches];
  }, [searchTerm, iamUsers, geminiUsers]);

  const handleSearchSelect = (_, option) => {
    onSearchNavigate?.(option.term, option.targetPage);
    setSearchTerm('');
  };

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start" wrap>
          <Space direction="vertical" size={0}>
            <Space>
              <PieChartOutlined style={{ fontSize: 20, color: '#192645' }} />
              <Title level={4} style={{ margin: 0 }}>Visão geral</Title>
            </Space>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Resumo ao vivo dos acessos IAM e das licenças Gemini Enterprise.
            </Text>
          </Space>
          <Space wrap>
            <AutoComplete
              style={{ width: 320 }}
              options={searchOptions}
              value={searchTerm}
              onChange={setSearchTerm}
              onSelect={handleSearchSelect}
              notFoundContent={searchTerm.trim() ? 'Nenhum resultado encontrado' : null}
            >
              <Input
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                allowClear
                placeholder="Buscar por email em IAM ou Gemini..."
              />
            </AutoComplete>
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
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {expiringSoon.length > 0 && (
              <Alert
                type={hasExpired ? 'error' : 'warning'}
                showIcon
                icon={<WarningOutlined />}
                message={hasExpired ? 'Licença Gemini expirada' : 'Licença Gemini expirando em breve'}
                description={(
                  <Space direction="vertical" size={2}>
                    {expiringSoon.map((c) => (
                      <Text key={c.name}>
                        <strong>{c.label}</strong>
                        {c.daysUntilEnd < 0
                          ? ` expirou há ${Math.abs(c.daysUntilEnd)} dia${Math.abs(c.daysUntilEnd) !== 1 ? 's' : ''} (${c.end}) — sem renovação automática.`
                          : ` expira em ${c.daysUntilEnd} dia${c.daysUntilEnd !== 1 ? 's' : ''} (${c.end}) — sem renovação automática.`}
                      </Text>
                    ))}
                  </Space>
                )}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <StatCard
                icon={<KeyOutlined />}
                iconBg="#eff6ff"
                iconColor="#2563eb"
                label="Usuários IAM"
                value={iamUsers.length}
                hint="Discovery Engine"
              />
              <StatCard
                icon={<ThunderboltOutlined />}
                iconBg="#eef2ff"
                iconColor="#4f46e5"
                label="Code Assist"
                value={codeAssistCount}
                hint={iamUsers.length ? `${Math.round((codeAssistCount / iamUsers.length) * 100)}% do total` : undefined}
              />
              <StatCard
                icon={<RobotOutlined />}
                iconBg="#f5f3ff"
                iconColor="#7c3aed"
                label="Licenças atribuídas"
                value={totalAssigned}
                hint="Gemini Enterprise"
              />
              <StatCard
                icon={<SafetyCertificateOutlined />}
                iconBg={totalRemaining === 0 ? '#fef2f2' : '#fff7ed'}
                iconColor={totalRemaining === 0 ? '#dc2626' : '#ea580c'}
                label="Slots livres"
                value={totalRemaining}
                hint={totalRemaining === 0 ? 'Sem disponibilidade' : undefined}
                hintColor="#dc2626"
              />
              <StatCard
                icon={<ClockCircleOutlined />}
                iconBg={inactiveReport.length > 0 ? '#fef2f2' : '#f0fdf4'}
                iconColor={inactiveReport.length > 0 ? '#dc2626' : '#16a34a'}
                label="Usuários inativos"
                value={inactiveReport.length}
                hint={`≥ ${DASHBOARD_INACTIVITY_MONTHS} meses sem uso`}
                hintColor={inactiveReport.length > 0 ? '#dc2626' : '#94a3b8'}
                onClick={handleOpenInactivityReport}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              <Card
                size="small"
                bordered
                style={{ borderRadius: 16, height: '100%' }}
                title={<Text strong>Atalhos</Text>}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <QuickLink
                    icon={<ClockCircleOutlined style={{ color: '#2563eb' }} />}
                    title="Relatório de inatividade"
                    subtitle="Otimização de custos"
                    onClick={handleOpenInactivityReport}
                  />
                  <QuickLink
                    icon={<KeyOutlined style={{ color: '#2563eb' }} />}
                    title="Gerenciar acessos IAM"
                    subtitle="Discovery Engine"
                    onClick={() => onNavigate?.('iam')}
                  />
                  <QuickLink
                    icon={<MailOutlined style={{ color: '#2563eb' }} />}
                    title="Abrir chamado"
                    subtitle="Suporte AD / GCP"
                    onClick={() => {
                      window.location.href = 'mailto:suporte@edglobo.com.br?subject=Suporte GCP Admin';
                    }}
                  />
                </Space>
              </Card>

              <Card
                size="small"
                bordered
                style={{ borderRadius: 16, height: '100%' }}
                title={<Text strong>Licenças por camada</Text>}
              >
                {configStats.length > 0 ? (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {configStats.map((c) => (
                      <div
                        key={c.name}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 10, background: '#f8fafc',
                        }}
                      >
                        <Space direction="vertical" size={2}>
                          <Tag color={tierColor(c.label)} style={{ margin: 0, width: 'fit-content' }}>{c.label}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {c.remaining} slot{c.remaining !== 1 ? 's' : ''} disponíve{c.remaining !== 1 ? 'is' : 'l'}
                            {c.end && (c.autoRenew ? ` · renova em ${c.end}` : ` · expira em ${c.end}`)}
                          </Text>
                        </Space>
                        <Text strong style={{ color: c.remaining === 0 ? '#dc2626' : '#16a34a' }}>
                          {c.assigned} / {c.total}
                        </Text>
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma configuração de licença encontrada" />
                )}
              </Card>
            </div>
          </Space>
        </Spin>
      </Space>
    </div>
  );
}
