import React, { useMemo, useState } from 'react';
import { Button, Modal, Select, Table, Tag, Typography, Space, Popconfirm, message } from 'antd';
import { ClockCircleOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { renderLicenseTag, stateTag } from '../utils/licenseFormatting';
import {
  DEFAULT_INACTIVITY_MONTHS,
  INACTIVITY_MONTH_OPTIONS,
  buildInactivityReport,
  buildInactivityReportClipboard,
  formatDatePtBr,
  formatMonthsInactive,
} from '../utils/inactivity';

const { Text } = Typography;

export default function InactivityReportModal({ users, configs, onRemove }) {
  const [open, setOpen] = useState(false);
  const [thresholdMonths, setThresholdMonths] = useState(DEFAULT_INACTIVITY_MONTHS);

  const assignedTotal = useMemo(
    () => users.filter((u) => u.licenseAssignmentState === 'ASSIGNED').length,
    [users]
  );

  const report = useMemo(
    () => buildInactivityReport(users, thresholdMonths),
    [users, thresholdMonths]
  );

  const handleCopy = async () => {
    const { html, text } = buildInactivityReportClipboard(report, configs);
    try {
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      message.success('Tabela copiada!');
    } catch {
      message.error('Não foi possível copiar a tabela.');
    }
  };

  const columns = [
    {
      title: 'Email',
      dataIndex: 'userPrincipal',
      key: 'userPrincipal',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: 'Licença',
      dataIndex: 'licenseConfig',
      key: 'licenseConfig',
      render: (v) => renderLicenseTag(v, configs),
    },
    {
      title: 'Status',
      dataIndex: 'licenseAssignmentState',
      key: 'licenseAssignmentState',
      render: (v) => stateTag(v),
    },
    {
      title: 'Atribuída em',
      dataIndex: 'createTime',
      key: 'createTime',
      render: (v) => formatDatePtBr(v),
    },
    {
      title: 'Último acesso',
      dataIndex: 'lastLoginTime',
      key: 'lastLoginTime',
      render: (v) => formatDatePtBr(v),
    },
    {
      title: 'Tempo inativo',
      dataIndex: 'monthsInactive',
      key: 'monthsInactive',
      render: (v) => <Tag color="red">{formatMonthsInactive(v)}</Tag>,
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Popconfirm
          title={`Remover licença de ${record.userPrincipal}?`}
          description="A licença será desatribuída e o slot ficará disponível."
          onConfirm={() => onRemove(record.userPrincipal)}
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
    <>
      <Button icon={<ClockCircleOutlined />} onClick={() => setOpen(true)}>
        Relatório de Inatividade
      </Button>
      <Modal
        title="Relatório de Usuários Inativos"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width="90vw"
        style={{ maxWidth: 1200 }}
        centered
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space>
            <Text>Inativo há mais de</Text>
            <Select
              value={thresholdMonths}
              onChange={setThresholdMonths}
              style={{ width: 140 }}
              options={INACTIVITY_MONTH_OPTIONS.map((m) => ({
                value: m,
                label: `${m} ${m === 1 ? 'mês' : 'meses'}`,
              }))}
            />
          </Space>
          <Space>
            <Text type="secondary">
              {report.length} de {assignedTotal} usuários inativos
            </Text>
            <Button
              icon={<CopyOutlined />}
              size="small"
              onClick={handleCopy}
              disabled={report.length === 0}
            >
              Copiar tabela
            </Button>
          </Space>
          <Table
            dataSource={report}
            columns={columns}
            rowKey="userPrincipal"
            pagination={{ pageSize: 10 }}
            size="small"
            scroll={{ x: 'max-content', y: 'calc(100vh - 380px)' }}
            locale={{ emptyText: 'Nenhum usuário inativo neste período' }}
          />
        </Space>
      </Modal>
    </>
  );
}
