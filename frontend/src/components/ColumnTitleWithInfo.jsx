import React from 'react';
import { Space, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

// Título de coluna com um ícone ⓘ que explica o dado ao passar o mouse —
// usado onde dois "últimos usos" de ferramentas diferentes ficam lado a lado.

// Espalhar na coluna ordenável que usa este título: sem isso o antd mostra o
// tooltip "clique para ordenar" no cabeçalho inteiro, junto com o do ⓘ. Assim
// ele fica só nas setas de ordenação.
export const INFO_COLUMN_SORTER_TOOLTIP = { showSorterTooltip: { target: 'sorter-icon' } };

export default function ColumnTitleWithInfo({ title, info }) {
  return (
    <Space size={4}>
      {title}
      <Tooltip title={info}>
        <InfoCircleOutlined style={{ color: '#94a3b8' }} />
      </Tooltip>
    </Space>
  );
}
