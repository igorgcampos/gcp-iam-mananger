import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Select, Table, Tag, Typography, Space, Popconfirm, message } from 'antd';
import { ClockCircleOutlined, CopyOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { renderLicenseTag, stateTag } from '../utils/licenseFormatting';
import {
  DEFAULT_INACTIVITY_MONTHS,
  INACTIVITY_MONTH_OPTIONS,
  buildInactivityReport,
  buildInactivityReportClipboard,
  formatDatePtBr,
  formatMonthsInactive,
} from '../utils/inactivity';
import { copyTableToClipboard } from '../utils/clipboardTable';

const { Text } = Typography;

export default function InactivityReportModal({
  users, configs, onRemove, initialOpen = false, initialThreshold,
}) {
  const [open, setOpen] = useState(initialOpen);
  const [thresholdMonths, setThresholdMonths] = useState(initialThreshold ?? DEFAULT_INACTIVITY_MONTHS);

  // GeminiPage agora fica sempre montada (só escondida via CSS ao trocar de
  // aba), então um pedido vindo do Dashboard (initialOpen/initialThreshold)
  // só chega como mudança de prop, não como um novo mount — precisa de um
  // efeito reagindo a ela, e não só do valor inicial do useState acima.
  useEffect(() => {
    if (initialOpen) {
      setOpen(true);
      if (initialThreshold) setThresholdMonths(initialThreshold);
    }
  }, [initialOpen, initialThreshold]);

  const assignedTotal = useMemo(
    () => users.filter((u) => u.licenseAssignmentState === 'ASSIGNED').length,
    [users]
  );

  const report = useMemo(
    () => buildInactivityReport(users, thresholdMonths),
    [users, thresholdMonths]
  );

  const handleCopy = async () => {
    try {
      await copyTableToClipboard(buildInactivityReportClipboard(report, configs));
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
      // Todo mundo nesta tabela já passou do limiar — sem isso, a mesma tag
      // vermelha aparecia em 100% das linhas e não dizia nada sobre
      // gravidade. Passa a escalonar: perto do limiar (< 2x) fica âmbar,
      // bem além dele fica vermelho.
      render: (v) => (
        <Tag color={v >= thresholdMonths * 2 ? 'red' : 'orange'} icon={<WarningOutlined />}>
          {formatMonthsInactive(v)}
        </Tag>
      ),
      // buildInactivityReport já entrega os dados ordenados por
      // monthsInactive decrescente (utils/inactivity.js) — o sorter aqui não
      // muda a ordem inicial, só dá o controle/indicador interativo que
      // faltava (sem ele não dava pra confirmar visualmente que a ordem era
      // intencional, nem pra inverter/limpar).
      sorter: (a, b) => (a.monthsInactive ?? 0) - (b.monthsInactive ?? 0),
      defaultSortOrder: 'descend',
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
        title={(
          <Space size={10}>
            <span className="modal-icon-badge modal-icon-badge-blue"><ClockCircleOutlined /></span>
            Relatório de Usuários Inativos
          </Space>
        )}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width="90vw"
        style={{ maxWidth: 1200 }}
        styles={{ content: { borderRadius: 20 } }}
        centered
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Filtro (ação primária) à esquerda; contagem + "Copiar tabela"
              (secundários) agrupados à direita — antes os três ficavam
              soltos numa fileira só, sem separação nenhuma. */}
          <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
            <Space>
              <Text>Inativo há mais de</Text>
              <Select
                value={thresholdMonths}
                onChange={setThresholdMonths}
                size="large"
                style={{ width: 160 }}
                options={INACTIVITY_MONTH_OPTIONS.map((m) => ({
                  value: m,
                  label: `${m} ${m === 1 ? 'mês' : 'meses'}`,
                }))}
              />
            </Space>
            <Space size={12}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {report.length} de {assignedTotal} usuários inativos
              </Text>
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopy}
                disabled={report.length === 0}
              >
                Copiar tabela
              </Button>
            </Space>
          </Space>
          <Table
            dataSource={report}
            columns={columns}
            rowKey="userPrincipal"
            pagination={{ pageSize: 10 }}
            size="small"
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'Nenhum usuário inativo neste período' }}
          />
        </Space>
      </Modal>
    </>
  );
}
