import React, { useState } from 'react';
import {
  Card, Statistic, Typography, Space, Select, Tooltip,
} from 'antd';
import {
  DownOutlined, UpOutlined, ArrowUpOutlined, PlusCircleOutlined,
} from '@ant-design/icons';
import { formatCurrency, formatAlertMessage } from '../utils/billingFormatting';

const { Text } = Typography;

// Badge inline de Alerta de Custo (Alerta de Aumento do SKU / Novo SKU no
// Billing — ver CONTEXT.md e ADR 0012) ao lado do nome da SKU. Aparece mesmo
// na visão mesclada "Todos os projetos" (o match é só por Serviço+SKU, sem
// considerar projeto) — por isso o tooltip nomeia o(s) projeto(s) explicitamente,
// já que o valor exibido na linha pode estar somado de vários projetos.
function SkuAlertBadge({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  const isNovo = alerts.some((a) => a.tipo === 'novo_sku');
  const title = alerts.map(formatAlertMessage).join('\n');
  const Icon = isNovo ? PlusCircleOutlined : ArrowUpOutlined;
  return (
    <span title={title} data-testid="sku-alert-badge">
      <Tooltip title={title}>
        <Icon style={{ color: isNovo ? '#1677ff' : '#d4380d', fontSize: 12 }} />
      </Tooltip>
    </span>
  );
}

export default function BillingCategoryCard({
  icon, iconBg, iconColor, label, value, hint, items, currency, filter, alerts,
}) {
  const [expanded, setExpanded] = useState(false);
  const expandable = Array.isArray(items);

  return (
    <Card
      size="small"
      bordered
      // .stat-card traz o hover (borda navy + sombra) que sinaliza "isso é
      // clicável" — antes ele era aplicado a TODOS os cards, inclusive o
      // não-expansível ("Total do projeto"), convidando a um clique que não
      // faz nada. Só os cards clicáveis ganham a classe agora; o não-clicável
      // recebe um fundo levemente diferente pra se diferenciar já em repouso,
      // sem depender de hover.
      className={expandable ? 'stat-card' : undefined}
      style={{
        borderRadius: 16, cursor: expandable ? 'pointer' : 'default', background: expandable ? undefined : '#fafbfc',
      }}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      onClick={expandable ? () => setExpanded((v) => !v) : undefined}
      onKeyDown={expandable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); }
      } : undefined}
    >
      {/* Grid de 3 colunas com larguras próprias — não flexbox — pra que a
          seta de expandir (coluna 3) sempre tenha seu espaço garantido.
          Rótulo (coluna 1) e seta (coluna 3) são `auto` (tamanho de
          conteúdo); só a coluna do seletor (2) é elástica e pode encolher
          até 0, truncando com reticências (ver maxWidth/minWidth abaixo).
          Cada item fixa seu `gridColumn` explicitamente porque nem todo
          card tem `filter` — sem isso, a ausência de um filho deslocaria os
          seguintes pra coluna errada. */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12, width: '100%',
        }}
      >
        <Space align="center" size={12} style={{ gridColumn: 1, minWidth: 0 }}>
          {icon && (
            <div
              style={{
                width: 40, height: 40, borderRadius: 12, display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: iconBg, color: iconColor, fontSize: 18,
              }}
            >
              {icon}
            </div>
          )}
          <Text strong type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{label}</Text>
        </Space>
        {filter && (
          // Seletor de projeto embutido no card (não fora dele) pra não
          // desalinhar os cards vizinhos que não têm filtro — ver ADR 0011.
          // stopPropagation pra abrir o dropdown sem também expandir/recolher
          // o drill-down do card (o Card inteiro tem onClick de expandir).
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
            style={{
              gridColumn: 2, width: '100%', minWidth: 0, maxWidth: 160, justifySelf: 'end',
            }}
          >
            <Select
              size="small"
              variant="borderless"
              virtual={false}
              popupMatchSelectWidth={false}
              suffixIcon={null}
              value={filter.value}
              onChange={filter.onChange}
              options={filter.options}
              className="billing-filter-select"
              style={{ width: '100%', minWidth: 0 }}
            />
          </div>
        )}
        {expandable && (
          expanded
            ? <UpOutlined data-testid="billing-category-chevron" style={{ gridColumn: 3, color: '#94a3b8', fontSize: 12 }} />
            : <DownOutlined data-testid="billing-category-chevron" style={{ gridColumn: 3, color: '#94a3b8', fontSize: 12 }} />
        )}
      </div>

      <div style={{
        marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      }}
      >
        <Statistic
          value={value}
          valueStyle={{
            fontSize: 28, fontWeight: 800, color: '#192645', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
          }}
        />
        {hint && <Text style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{hint}</Text>}
      </div>

      {/* Antes o único sinal de "isso abre detalhes" era a seta de 12px no
          canto — fácil de não notar. Agora o card diz isso já em repouso,
          sem depender de hover. Some quando expandido, porque o próprio
          conteúdo do drill-down já deixa claro o que aconteceu. */}
      {expandable && !expanded && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em',
        }}
        >
          Clique para detalhar
          <DownOutlined style={{ fontSize: 10 }} />
        </div>
      )}

      {expandable && expanded && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          {items.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>Nenhum custo neste período</Text>
          ) : (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {items.map((service) => (
                <div key={service.service}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <Text strong style={{ fontSize: 12, flex: '1 1 auto', minWidth: 0 }}>{service.service}</Text>
                    <Text
                      strong
                      style={{
                        fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatCurrency(service.cost, currency)}
                    </Text>
                  </div>
                  <Space direction="vertical" size={2} style={{ width: '100%', marginTop: 4, paddingLeft: 12 }}>
                    {service.skus.map((sku) => {
                      const skuAlerts = alerts?.filter(
                        (a) => a.service === service.service && a.sku === sku.sku,
                      );
                      return (
                        <div key={sku.sku} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <Space size={4} style={{ flex: '1 1 auto', minWidth: 0 }}>
                            <Text type="secondary" style={{ fontSize: 12, minWidth: 0 }}>{sku.sku}</Text>
                            <SkuAlertBadge alerts={skuAlerts} />
                          </Space>
                          <Text
                            type="secondary"
                            style={{
                              fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatCurrency(sku.cost, currency)}
                          </Text>
                        </div>
                      );
                    })}
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </div>
      )}
    </Card>
  );
}
