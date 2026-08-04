import React from 'react';
import { Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { buildUsersReport, buildUsersReportClipboard } from '../utils/usersReport';

export default function CopyUsersReportButton({ users, configs }) {
  const handleCopy = async () => {
    const report = buildUsersReport(users);
    const { html, text } = buildUsersReportClipboard(report, configs);
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
