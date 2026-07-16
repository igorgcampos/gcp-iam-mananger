import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Popconfirm,
  Typography, Space, Tag, message, Card, Row, Col, Statistic, Divider, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, RobotOutlined, SearchOutlined,
} from '@ant-design/icons';
import { listLicenseConfigs, listGeminiUsers, addGeminiUser, removeGeminiUser } from '../api/gemini';
import { tierName, tierColor, stateTag, renderLicenseTag } from '../utils/licenseFormatting';

const { Title, Text } = Typography;
const POLL_INTERVAL = 30_000;

function formatDate(d) {
  if (!d || !d.year) return null;
  return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
}

function assignedCount(config, users) {
  return users.filter(
    (u) => u.licenseConfig === config.name && u.licenseAssignmentState === 'ASSIGNED'
  ).length;
}

export default function GeminiPage() {
  const [users, setUsers] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [u, c] = await Promise.all([listGeminiUsers(), listLicenseConfigs()]);
      setUsers(u);
      setConfigs(c);
      setLastUpdated(new Date());
    } catch (err) {
      message.error('Erro ao carregar dados: ' + (err.response?.data?.error || err.message));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => fetchAll(true), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleAdd = async () => {
    try {
      const { email, licenseConfig } = await form.validateFields();
      setSubmitting(true);
      await addGeminiUser(email, licenseConfig);
      message.success(`${email} adicionado com licença atribuída`);
      form.resetFields();
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (userPrincipal) => {
    try {
      await removeGeminiUser(userPrincipal);
      message.success(`Licença de ${userPrincipal} removida`);
      fetchAll();
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    }
  };

  const columns = [
    {
      title: 'Email',
      dataIndex: 'userPrincipal',
      key: 'userPrincipal',
      render: (v) => <Text strong>{v}</Text>,
      sorter: (a, b) => (a.userPrincipal || '').localeCompare(b.userPrincipal || ''),
      filterSearch: true,
    },
    {
      title: 'Licença',
      dataIndex: 'licenseConfig',
      key: 'licenseConfig',
      render: (v) => renderLicenseTag(v, configs),
      filters: configs.map((c) => ({
        text: tierName(c.subscriptionTier),
        value: c.name,
      })),
      onFilter: (value, record) => record.licenseConfig === value,
    },
    {
      title: 'Status',
      dataIndex: 'licenseAssignmentState',
      key: 'licenseAssignmentState',
      render: (v) => stateTag(v),
      filters: [
        { text: 'Atribuída', value: 'ASSIGNED' },
        { text: 'Sem licença', value: 'NO_LICENSE_ATTEMPTED_LOGIN' },
      ],
      onFilter: (value, record) => record.licenseAssignmentState === value,
    },
    {
      title: 'Atribuída em',
      dataIndex: 'createTime',
      key: 'createTime',
      render: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—',
      sorter: (a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0),
    },
    {
      title: 'Último acesso',
      dataIndex: 'lastLoginTime',
      key: 'lastLoginTime',
      render: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—',
      sorter: (a, b) => new Date(a.lastLoginTime || 0) - new Date(b.lastLoginTime || 0),
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Popconfirm
          title={`Remover licença de ${record.userPrincipal}?`}
          description="A licença será desatribuída e o slot ficará disponível."
          onConfirm={() => handleRemove(record.userPrincipal)}
          okText="Remover"
          cancelText="Cancelar"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} size="small">Remover</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <RobotOutlined style={{ fontSize: 20, color: '#722ed1' }} />
            <Title level={4} style={{ margin: 0 }}>Gemini Enterprise — Licenças</Title>
            <Badge count={users.filter(u => u.licenseAssignmentState === 'ASSIGNED').length} showZero color="#722ed1" />
          </Space>
          <Space>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetchAll()} loading={loading}>
              Atualizar
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Adicionar usuário
            </Button>
          </Space>
        </Space>

        {configs.length > 0 && (
          <Row gutter={16}>
            {configs.map((c) => {
              const total = parseInt(c.licenseCount, 10);
              const assigned = assignedCount(c, users);
              const remaining = total - assigned;
              const label = tierName(c.subscriptionTier);
              const end = formatDate(c.endDate);
              const renews = c.autoRenew;

              return (
                <Col key={c.name} xs={24} sm={12} md={8}>
                  <Card size="small" bordered>
                    <Statistic
                      title={<Tag color={tierColor(label)}>{label}</Tag>}
                      value={assigned}
                      suffix={`/ ${total}`}
                      valueStyle={{ color: remaining === 0 ? '#cf1322' : '#3f8600' }}
                    />
                    <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {remaining} slot{remaining !== 1 ? 's' : ''} disponível{remaining !== 1 ? 'eis' : ''}
                      </Text>
                      {end && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {renews ? `Renova em ${end}` : `Expira em ${end}`}
                        </Text>
                      )}
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}

        <Divider style={{ margin: '8px 0' }} />

        <Input
          placeholder="Pesquisar por email..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />

        <Table
          dataSource={users.filter((u) =>
            (u.userPrincipal || '').toLowerCase().includes(search.toLowerCase())
          )}
          columns={columns}
          rowKey="userPrincipal"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          bordered
          size="middle"
          locale={{ emptyText: 'Nenhum usuário encontrado' }}
        />
      </Space>

      <Modal
        title="Adicionar usuário ao Gemini Enterprise"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText="Adicionar"
        cancelText="Cancelar"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Informe o email' },
              { type: 'email', message: 'Email inválido' },
            ]}
          >
            <Input placeholder="usuario@edglobo.com.br" autoFocus />
          </Form.Item>
          <Form.Item
            label="Licença"
            name="licenseConfig"
            rules={[{ required: true, message: 'Selecione uma licença' }]}
          >
            <Select placeholder="Selecione a licença">
              {configs.map((c) => {
                const total = parseInt(c.licenseCount, 10);
                const assigned = assignedCount(c, users);
                const remaining = total - assigned;
                const label = tierName(c.subscriptionTier);
                return (
                  <Select.Option key={c.name} value={c.name} disabled={remaining === 0}>
                    {label} — {remaining} slot{remaining !== 1 ? 's' : ''} disponível{remaining !== 1 ? 'eis' : ''}
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
