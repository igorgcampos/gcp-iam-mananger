import React from 'react';
import { Tag, Typography } from 'antd';
import {
  SEM_DIRETORIA, buildDiretoriaFilters, getDiretoria, userDiretoriaKey,
} from './diretoria';

const { Text } = Typography;

// Coluna "Diretoria" das tabelas de usuários do Gemini (tela principal e
// Relatório de Usuários Inativos). `users` são as linhas da tabela — de onde
// saem as opções do filtro.
export function buildDiretoriaColumn(users, diretorias) {
  return {
    title: 'Diretoria',
    key: 'diretoria',
    render: (_, record) => {
      const value = getDiretoria(record.userPrincipal, diretorias);
      if (value === undefined) return <Text type="secondary">—</Text>;
      if (value === null) return <Tag>{SEM_DIRETORIA}</Tag>;
      return value;
    },
    filters: buildDiretoriaFilters(users, diretorias),
    onFilter: (value, record) => userDiretoriaKey(record.userPrincipal, diretorias) === value,
    sorter: (a, b) => (getDiretoria(a.userPrincipal, diretorias) ?? '')
      .localeCompare(getDiretoria(b.userPrincipal, diretorias) ?? ''),
  };
}
