import React from 'react';
import { Space, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

// Título de coluna com um ícone ⓘ que explica o dado ao passar o mouse —
// usado onde dois "últimos usos" de ferramentas diferentes ficam lado a lado.
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
