import React, { useState, useMemo, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Checkbox, Popconfirm,
  Typography, Space, Tag, message, Tooltip, Badge, Empty, theme,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, KeyOutlined, SearchOutlined, UserAddOutlined, MailOutlined,
} from '@ant-design/icons';
import { addIAMUser, removeIAMUser, addCodeAssist, removeCodeAssist } from '../api/iam';
import { notifyFetchError } from '../utils/apiError';

const { Title, Text } = Typography;

export default function IAMPage({
  users, loading, lastUpdated, reload, initialSearch = '',
}) {
  const { token } = theme.useToken();
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  const [codeAssistLoading, setCodeAssistLoading] = useState(() => new Set());
  const [form] = Form.useForm();

  // A página fica sempre montada (só escondida via CSS ao trocar de aba),
  // então precisamos reagir a mudanças de initialSearch, não só usá-lo como
  // valor inicial do useState.
  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  const handleAdd = async () => {
    try {
      const { email, codeAssist } = await form.validateFields();
      setSubmitting(true);
      const normalizedEmail = email.trim().toLowerCase();
      const result = await addIAMUser(normalizedEmail, !!codeAssist);
      message.success(`${normalizedEmail} adicionado com sucesso`);
      if (codeAssist && result.codeAssist?.granted === false) {
        message.warning(`Falha ao conceder Code Assist para ${normalizedEmail}: ${result.codeAssist.error}`);
      }
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

  const handleRemove = async (email) => {
    try {
      await removeIAMUser(email);
      message.success(`${email} removido`);
      reload();
    } catch (err) {
      notifyFetchError(err);
    }
  };

  const handleGrantCodeAssist = async (email) => {
    setCodeAssistLoading((prev) => new Set(prev).add(email));
    try {
      await addCodeAssist(email);
      message.success(`Code Assist concedido a ${email}`);
      reload();
    } catch (err) {
      notifyFetchError(err, 'Code Assist');
    } finally {
      setCodeAssistLoading((prev) => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  const handleRevokeCodeAssist = async (email) => {
    setCodeAssistLoading((prev) => new Set(prev).add(email));
    try {
      await removeCodeAssist(email);
      message.success(`Code Assist revogado de ${email}`);
      reload();
    } catch (err) {
      notifyFetchError(err, 'Code Assist');
    } finally {
      setCodeAssistLoading((prev) => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  const filteredUsers = useMemo(
    () => users.filter((u) => (u.email || '').toLowerCase().includes(search.toLowerCase())),
    [users, search]
  );

  const columns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 260,
      render: (v) => <Text strong style={{ whiteSpace: 'nowrap' }}>{v}</Text>,
      sorter: (a, b) => a.email.localeCompare(b.email),
    },
    {
      title: 'Principal (IAM)',
      dataIndex: 'principal',
      key: 'principal',
      width: 280,
      ellipsis: true,
      render: (v) => (
        <Tooltip title={v}>
          <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Role',
      key: 'role',
      width: 150,
      align: 'center',
      render: () => <Tag color="blue">discoveryengine.user</Tag>,
    },
    {
      title: 'Code Assist',
      key: 'codeAssist',
      width: 120,
      align: 'center',
      render: (_, record) =>
        record.codeAssist ? (
          <Popconfirm
            title={`Revogar Code Assist de ${record.email}?`}
            onConfirm={() => handleRevokeCodeAssist(record.email)}
            okText="Revogar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true, loading: codeAssistLoading.has(record.email) }}
          >
            <Button
              size="small"
              type="text"
              style={{ color: '#389e0d' }}
              loading={codeAssistLoading.has(record.email)}
            >
              Code Assist
            </Button>
          </Popconfirm>
        ) : (
          <Button
            size="small"
            type="link"
            loading={codeAssistLoading.has(record.email)}
            onClick={() => handleGrantCodeAssist(record.email)}
          >
            Conceder
          </Button>
        ),
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 110,
      align: 'center',
      render: (_, record) => (
        <Popconfirm
          title={`Remover ${record.email}?`}
          description={
            record.codeAssist
              ? 'discoveryengine.user e Code Assist serão revogados no IAM do projeto.'
              : 'A role será revogada no IAM do projeto.'
          }
          onConfirm={() => handleRemove(record.email)}
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
            <KeyOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <Title level={4} style={{ margin: 0 }}>IAM — Discovery Engine User</Title>
            <Badge count={users.length} showZero color={token.colorPrimary} />
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Adicionar ao IAM
            </Button>
          </Space>
        </Space>

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
          rowKey="email"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          bordered
          size="small"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  search
                    ? `Nenhum resultado para "${search}"`
                    : 'Nenhum usuário com acesso ao Discovery Engine ainda'
                }
              >
                {!search && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Adicionar ao IAM
                  </Button>
                )}
              </Empty>
            ),
          }}
        />
      </Space>

      <Modal
        title={(
          <Space size={10}>
            <span className="modal-icon-badge modal-icon-badge-blue"><UserAddOutlined /></span>
            Adicionar usuário ao IAM
          </Space>
        )}
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText="Adicionar usuário"
        cancelText="Cancelar"
        okButtonProps={{ size: 'large' }}
        cancelButtonProps={{ size: 'large' }}
        styles={{ content: { borderRadius: 20 } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 20 }} requiredMark={false}>
          <Form.Item
            label={<Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>Email corporativo</Text>}
            name="email"
            rules={[
              { required: true, message: 'Informe o email' },
              { type: 'email', message: 'Email inválido' },
            ]}
          >
            <Input size="large" prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="usuario@edglobo.com.br" autoFocus />
          </Form.Item>
          <Form.Item name="codeAssist" valuePropName="checked" initialValue={false} style={{ marginBottom: 0 }}>
            <Checkbox className="modal-checkbox-card">
              <div>
                <Text strong style={{ display: 'block', fontSize: 14 }}>Adicionar também ao Code Assist</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Concede acesso às ferramentas de assistência de código de IA.
                </Text>
              </div>
            </Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
