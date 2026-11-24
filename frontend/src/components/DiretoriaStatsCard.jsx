import React from 'react';
import {
  Collapse, Progress, Space, Typography,
} from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';
import { SEM_DIRETORIA_KEY } from '../utils/diretoria';

const { Text } = Typography;

function summaryOf(stats) {
  const diretorias = stats.filter((s) => s.key !== SEM_DIRETORIA_KEY);
  if (!diretorias.length) return null;
  const [top] = diretorias;
  const n = diretorias.length;
  return `${n} ${n === 1 ? 'diretoria' : 'diretorias'} · maior: ${top.label} (${top.percent}%)`;
}

// Rateio por Diretoria (ver CONTEXT.md): licenças atribuídas agrupadas pela
// Diretoria do AD. `stats` vem de buildDiretoriaStats (utils/diretoria.js).
// Começa recolhido — aberto, com uma linha por Diretoria, empurrava a tabela
// para baixo; o cabeçalho já traz o resumo.
export default function DiretoriaStatsCard({ stats, unknownCount = 0 }) {
  if (!stats.length) return null;

  const summary = summaryOf(stats);

  const header = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}
    >
      <Space size={8}>
        <ApartmentOutlined style={{ color: '#722ed1' }} />
        <Text strong>Licenças por Diretoria</Text>
      </Space>
      {summary && <Text type="secondary" style={{ fontSize: 12 }}>{summary}</Text>}
      {unknownCount > 0 && (
        <Text type="warning" style={{ fontSize: 12 }}>
          {`${unknownCount} ${unknownCount === 1 ? 'usuário' : 'usuários'} sem informação do AD — percentuais parciais`}
        </Text>
      )}
    </div>
  );

  const body = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      columnGap: 32,
      rowGap: 8,
    }}
    >
      {stats.map((s) => {
        const semDiretoria = s.key === SEM_DIRETORIA_KEY;
        return (
          <div key={s.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <Text
                type={semDiretoria ? 'secondary' : undefined}
                ellipsis={{ tooltip: s.label }}
                style={{ fontSize: 12 }}
              >
                {s.label}
              </Text>
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{`${s.count} (${s.percent}%)`}</Text>
            </div>
            <Progress
              percent={s.percent}
              showInfo={false}
              size="small"
              strokeColor={semDiretoria ? '#bfbfbf' : '#722ed1'}
              style={{ margin: 0 }}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <Collapse
      size="small"
      // Sem .stat-card: o hover dela (borda navy) é o sinal de card clicável
      // do Dashboard/Custos, e aqui escurecia a borda inteira do painel.
      style={{ borderRadius: 16, background: '#fff', overflow: 'hidden' }}
      items={[{ key: 'diretorias', label: header, children: body }]}
    />
  );
}
