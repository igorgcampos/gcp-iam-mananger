import React from 'react';
import { Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { buildUsersReport, buildUsersReportClipboard } from '../utils/usersReport';
import { copyTableToClipboard } from '../utils/clipboardTable';

export default function CopyUsersReportButton({ users, configs }) {
  const handleCopy = async () => {
    const report = buildUsersReport(users);
    try {
      await copyTableToClipboard(buildUsersReportClipboard(report, configs));
      message.success(`${report.length} usuários copiados!`);
    } catch {
      message.error('Não foi possível copiar a tabela.');
    }
  };

  return (
    <Button icon={<CopyOutlined />} onClick={handleCopy}>
      Copiar Relatório de Usuários
    </Button>
  );
}
