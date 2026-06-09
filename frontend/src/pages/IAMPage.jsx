import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Popconfirm,
  Typography, Space, Tag, message, Tooltip, Badge,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, KeyOutlined, SearchOutlined } from '@ant-design/icons';
import { listIAMUsers, addIAMUser, removeIAMUser } from '../api/iam';

const { Title, Text } = Typography;
const POLL_INTERVAL = 30_000;
const WORKFORCE_PREFIX =
  'principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/';

export default function IAMPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const fetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listIAMUsers();
      setUsers(data);
      setLastUpdated(new Date());
    } catch (err) {
      message.error('Erro ao carregar usuários: ' + (err.response?.data?.error || err.message));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(() => fetch(true), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  const handleAdd = async () => {
    try {
      const { email } = await form.validateFields();
      setSubmitting(true);
      await addIAMUser(email);
      message.success(`${email} adicionado com sucesso`);
      form.resetFields();
      setModalOpen(false);
      fetch();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (email) => {
    try {
      await removeIAMUser(email);
      message.success(`${email} removido`);
      fetch();
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    }
  };

  const columns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 280,
      render: (v) => <Text strong>{v}</Text>,
      sorter: (a, b) => a.email.localeCompare(b.email),
    },
    {
      title: 'Principal (IAM)',
      dataIndex: 'principal',
      key: 'principal',
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
      width: 200,
      render: () => <Tag color="blue">discoveryengine.user</Tag>,
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 110,
      align: 'center',
      render: (_, record) => (
        <Popconfirm
          title={`Remover ${record.email}?`}
          description="A role será revogada no IAM do projeto."
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
            <KeyOutlined style={{ fontSize: 20, color: '#1677ff' }} />
            <Title level={4} style={{ margin: 0 }}>IAM — Discovery Engine User</Title>
            <Badge count={users.length} showZero color="#1677ff" />
          </Space>
          <Space>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetch()} loading={loading}>
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
          dataSource={users.filter((u) =>
            u.email.toLowerCase().includes(search.toLowerCase())
          )}
          columns={columns}
          rowKey="email"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          bordered
          size="small"
          locale={{ emptyText: 'Nenhum usuário com essa role' }}
        />
      </Space>

      <Modal
        title="Adicionar usuário ao IAM"
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
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Será adicionado como:<br />
                <code>{WORKFORCE_PREFIX}<b>email@dominio.com</b></code>
              </Text>
            }
          >
            <Input placeholder="usuario@edglobo.com.br" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
