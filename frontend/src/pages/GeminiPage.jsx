import React, {
  useState, useMemo, useRef, useLayoutEffect, useEffect,
} from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Popconfirm,
  Typography, Space, Tag, message, Card, Row, Col, Statistic, Divider, Badge, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, RobotOutlined, SearchOutlined,
  UserAddOutlined, MailOutlined, AppstoreOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { addGeminiUser, removeGeminiUser } from '../api/gemini';
import { tierColor, stateTag, renderLicenseTag } from '../utils/licenseFormatting';
import { buildConfigStats, sumAssigned, getVisibleConfigs } from '../utils/dashboardStats';
import { notifyFetchError } from '../utils/apiError';
import InactivityReportModal from '../components/InactivityReportModal';
import CopyUsersReportButton from '../components/CopyUsersReportButton';

const { Title, Text } = Typography;

const CARD_SPAN = 8; // matches Col md={8} below

export default function GeminiPage({
  users, configs, loading, lastUpdated, reload, initialSearch = '', openInactivityReport = null,
}) {
  const contentRef = useRef(null);
  const firstCardRef = useRef(null);
  const [titleOffsetPx, setTitleOffsetPx] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  const [form] = Form.useForm();

  // A página fica sempre montada (só escondida via CSS ao trocar de aba),
  // então precisamos reagir a mudanças de initialSearch, não só usá-lo como
  // valor inicial do useState.
  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  // Mesmo cálculo usado pelo card "Licenças por camada" do Dashboard — ver
  // utils/dashboardStats.js, que também blinda licenseCount ausente/inválido
  // (vira total 0, não NaN).
  const configStats = useMemo(() => buildConfigStats(configs, users), [configs, users]);

  const totalAssigned = useMemo(() => sumAssigned(configStats), [configStats]);

  // Cards-resumo por camada e Select do modal: somem as licenças que já
  // passaram da Janela de Carência de expiração (ver CONTEXT.md). A tabela
  // de usuários e seu filtro de "Licença" continuam usando configStats
  // completo — servem para localizar quem ainda precisa migrar.
  const visibleConfigStats = useMemo(() => getVisibleConfigs(configStats), [configStats]);

  useLayoutEffect(() => {
    if (!visibleConfigStats.length || !contentRef.current || !firstCardRef.current) {
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
  }, [visibleConfigStats.length]);

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
      notifyFetchError(err);
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
      notifyFetchError(err);
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
          <Space wrap style={{ justifyContent: 'flex-end' }}>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
              Atualizar
            </Button>
            <InactivityReportModal
              users={users}
              configs={configs}
              onRemove={handleRemove}
              initialOpen={!!openInactivityReport}
              initialThreshold={openInactivityReport?.thresholdMonths}
            />
            <CopyUsersReportButton users={users} configs={configs} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Adicionar usuário
            </Button>
          </Space>
        </Space>

        {visibleConfigStats.length > 0 && (
          <Row gutter={16} justify="center">
            {visibleConfigStats.map((c, idx) => (
              <Col key={c.name} xs={24} sm={12} md={CARD_SPAN}>
                <Card
                  size="small"
                  bordered
                  className="stat-card"
                  ref={idx === 0 ? firstCardRef : undefined}
                >
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
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  search
                    ? `Nenhum resultado para "${search}"`
                    : 'Nenhum usuário com licença atribuída ainda'
                }
              >
                {!search && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Adicionar usuário
                  </Button>
                )}
              </Empty>
            ),
          }}
        />
      </Space>
      </div>

      <Modal
        title={(
          <Space size={10}>
            <span className="modal-icon-badge modal-icon-badge-blue"><UserAddOutlined /></span>
            Adicionar usuário ao Gemini Enterprise
          </Space>
        )}
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText="Adicionar"
        cancelText="Cancelar"
        okButtonProps={{ size: 'large' }}
        cancelButtonProps={{ size: 'large' }}
        styles={{ content: { borderRadius: 20 } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 20 }} requiredMark={false}>
          <Form.Item
            label={<Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>Endereço de email</Text>}
            name="email"
            rules={[
              { required: true, message: 'Informe o email' },
              { type: 'email', message: 'Email inválido' },
            ]}
          >
            <Input size="large" prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="usuario@edglobo.com.br" autoFocus />
          </Form.Item>
          <Form.Item
            label={<Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>Nível da licença</Text>}
            name="licenseConfig"
            rules={[{ required: true, message: 'Selecione uma licença' }]}
          >
            <Select size="large" prefix={<AppstoreOutlined style={{ color: '#94a3b8' }} />} placeholder="Selecione o plano...">
              {visibleConfigStats.map((c) => (
                <Select.Option key={c.name} value={c.name} disabled={c.remaining === 0}>
                  {c.label} — {c.remaining} slot{c.remaining !== 1 ? 's' : ''} disponível{c.remaining !== 1 ? 'eis' : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
        <div className="modal-info-banner">
          <InfoCircleOutlined style={{ marginTop: 2 }} />
          <span>
            O usuário receberá acesso imediato ao Gemini Enterprise assim que a licença for atribuída no IAM do projeto.
          </span>
        </div>
      </Modal>
    </div>
  );
}
