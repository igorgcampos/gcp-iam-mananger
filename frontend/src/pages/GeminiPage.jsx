import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Popconfirm,
  Typography, Space, Tag, message, Card, Row, Col, Statistic, Divider, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, RobotOutlined, SearchOutlined,
} from '@ant-design/icons';
import { listLicenseConfigs, listGeminiUsers, addGeminiUser, removeGeminiUser } from '../api/gemini';
import { tierName, tierColor, stateTag, renderLicenseTag } from '../utils/licenseFormatting';
import { formatDate } from '../utils/gemini';
import { usePollingFetch } from '../hooks/usePollingFetch';
import InactivityReportModal from '../components/InactivityReportModal';

const { Title, Text } = Typography;

function onFetchError(err) {
  message.error(err.response?.data?.error || err.message);
}

const CARD_SPAN = 8; // matches Col md={8} below

export default function GeminiPage() {
  const contentRef = useRef(null);
  const firstCardRef = useRef(null);
  const [titleOffsetPx, setTitleOffsetPx] = useState(0);
  const [users, setUsers] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const { loading, lastUpdated, reload } = usePollingFetch(
    async () => {
      const [u, c] = await Promise.all([listGeminiUsers(), listLicenseConfigs()]);
      setUsers(u);
      setConfigs(c);
    },
    { onError: onFetchError }
  );

  const assignedByConfig = useMemo(() => {
    const map = {};
    for (const u of users) {
      if (u.licenseAssignmentState === 'ASSIGNED') {
        map[u.licenseConfig] = (map[u.licenseConfig] || 0) + 1;
      }
    }
    return map;
  }, [users]);

  const totalAssigned = useMemo(
    () => Object.values(assignedByConfig).reduce((a, b) => a + b, 0),
    [assignedByConfig]
  );

  const configStats = useMemo(
    () => configs.map((c) => {
      const total = parseInt(c.licenseCount, 10);
      const assigned = assignedByConfig[c.name] || 0;
      const label = tierName(c.subscriptionTier);
      return { ...c, total, assigned, remaining: total - assigned, label, end: formatDate(c.endDate) };
    }),
    [configs, assignedByConfig]
  );

  useLayoutEffect(() => {
    if (!configStats.length || !contentRef.current || !firstCardRef.current) {
      setTitleOffsetPx(0);
      return undefined;
    }
    const measure = () => {
      const containerLeft = contentRef.current.getBoundingClientRect().left;
      const cardLeft = firstCardRef.current.getBoundingClientRect().left;
      setTitleOffsetPx(Math.max(0, cardLeft - containerLeft));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(contentRef.current);
    observer.observe(firstCardRef.current);
    return () => observer.disconnect();
  }, [configStats.length]);

  const filteredUsers = useMemo(
    () => users.filter((u) => (u.userPrincipal || '').toLowerCase().includes(search.toLowerCase())),
    [users, search]
  );

  const handleAdd = async () => {
    try {
      const { email, licenseConfig } = await form.validateFields();
      setSubmitting(true);
      const normalizedEmail = email.trim().toLowerCase();
      await addGeminiUser(normalizedEmail, licenseConfig);
      message.success(`${normalizedEmail} adicionado com licença atribuída`);
      form.resetFields();
      setModalOpen(false);
      reload();
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
      reload();
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
    },
    {
      title: 'Licença',
      dataIndex: 'licenseConfig',
      key: 'licenseConfig',
      render: (v) => renderLicenseTag(v, configs),
      filters: configStats.map((c) => ({ text: c.label, value: c.name })),
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
      <div ref={contentRef}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space style={{ marginLeft: titleOffsetPx, flexShrink: 0 }}>
            <RobotOutlined style={{ fontSize: 20, color: '#722ed1' }} />
            <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>Gemini Enterprise — Licenças</Title>
            <Badge count={totalAssigned} showZero color="#722ed1" />
          </Space>
          <Space>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
              Atualizar
            </Button>
            <InactivityReportModal users={users} configs={configs} onRemove={handleRemove} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Adicionar usuário
            </Button>
          </Space>
        </Space>

        {configStats.length > 0 && (
          <Row gutter={16} justify="center">
            {configStats.map((c, idx) => (
              <Col key={c.name} xs={24} sm={12} md={CARD_SPAN}>
                <Card size="small" bordered ref={idx === 0 ? firstCardRef : undefined}>
                  <Statistic
                    title={<Tag color={tierColor(c.label)}>{c.label}</Tag>}
                    value={c.assigned}
                    suffix={`/ ${c.total}`}
                    valueStyle={{ color: c.remaining === 0 ? '#cf1322' : '#3f8600' }}
                  />
                  <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {c.remaining} slot{c.remaining !== 1 ? 's' : ''} disponível{c.remaining !== 1 ? 'eis' : ''}
                    </Text>
                    {c.end && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {c.autoRenew ? `Renova em ${c.end}` : `Expira em ${c.end}`}
                      </Text>
                    )}
                  </Space>
                </Card>
              </Col>
            ))}
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
          dataSource={filteredUsers}
          columns={columns}
          rowKey="userPrincipal"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          bordered
          size="middle"
          locale={{ emptyText: 'Nenhum usuário encontrado' }}
        />
      </Space>
      </div>

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
              {configStats.map((c) => (
                <Select.Option key={c.name} value={c.name} disabled={c.remaining === 0}>
                  {c.label} — {c.remaining} slot{c.remaining !== 1 ? 's' : ''} disponível{c.remaining !== 1 ? 'eis' : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
