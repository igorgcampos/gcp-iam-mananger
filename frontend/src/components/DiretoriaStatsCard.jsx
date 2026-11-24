import React from 'react';
import {
  Card, Progress, Space, Typography,
} from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';
import { SEM_DIRETORIA_KEY } from '../utils/diretoria';

const { Text } = Typography;

// Rateio por Diretoria (ver CONTEXT.md): licenças atribuídas agrupadas pela
// Diretoria do AD. `stats` vem de buildDiretoriaStats (utils/diretoria.js).
export default function DiretoriaStatsCard({ stats, unknownCount = 0 }) {
  if (!stats.length) return null;

  return (
    <Card
      size="small"
      bordered
      className="stat-card"
      style={{ borderRadius: 16 }}
      title={(
        <Space size={8}>
          <ApartmentOutlined style={{ color: '#722ed1' }} />
          Licenças por Diretoria
        </Space>
      )}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {stats.map((s) => {
          const semDiretoria = s.key === SEM_DIRETORIA_KEY;
          return (
            <div key={s.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Text type={semDiretoria ? 'secondary' : undefined} style={{ fontSize: 13 }}>{s.label}</Text>
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
        {unknownCount > 0 && (
          <Text type="warning" style={{ fontSize: 12 }}>
            {`${unknownCount} ${unknownCount === 1 ? 'usuário' : 'usuários'} sem informação do AD — percentuais parciais`}
          </Text>
        )}
      </Space>
    </Card>
  );
}
