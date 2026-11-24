import React from 'react';
import { Tooltip, Typography } from 'antd';
import ColumnTitleWithInfo from '../components/ColumnTitleWithInfo';
import {
  ANTIGRAVITY_LAST_USE_INFO, formatSince, getAntigravityUse, semUsoText,
} from './antigravity';

const { Text } = Typography;

function lastUseMs(email, antigravity) {
  const use = getAntigravityUse(email, antigravity);
  return use ? new Date(use.lastUse).getTime() : 0;
}

// Coluna "Último uso Antigravity" — usada na tela Gemini e no Relatório de
// Inatividade. `antigravity` null (falha/carregando) mostra "—" e some com
// os filtros, que não teriam o que filtrar.
export function buildAntigravityColumn(antigravity) {
  return {
    title: <ColumnTitleWithInfo title="Último uso Antigravity" info={ANTIGRAVITY_LAST_USE_INFO} />,
    key: 'antigravityLastUse',
    render: (_, record) => {
      const use = getAntigravityUse(record.userPrincipal, antigravity);
      if (use === undefined) return <Text type="secondary">—</Text>;
      if (use === null) return <Text type="secondary">{semUsoText(antigravity)}</Text>;
      const dias = `${use.activeDays} ${use.activeDays === 1 ? 'dia' : 'dias'} com uso desde ${formatSince(antigravity.since)}`;
      return (
        <Tooltip title={dias}>
          <span>{new Date(use.lastUse).toLocaleDateString('pt-BR')}</span>
        </Tooltip>
      );
    },
    sorter: (a, b) => lastUseMs(a.userPrincipal, antigravity) - lastUseMs(b.userPrincipal, antigravity),
    filters: antigravity
      ? [{ text: 'Usou', value: 'usou' }, { text: 'Sem uso', value: 'sem-uso' }]
      : undefined,
    onFilter: (value, record) => {
      const usou = !!getAntigravityUse(record.userPrincipal, antigravity);
      return value === 'usou' ? usou : !usou;
    },
  };
}
