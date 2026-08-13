import React, { useState } from 'react';
import {
  Card, Statistic, Typography, Space, Select,
} from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { formatCurrency } from '../utils/billingFormatting';

const { Text } = Typography;

export default function BillingCategoryCard({
  icon, iconBg, iconColor, label, value, hint, items, currency, filter,
}) {
  const [expanded, setExpanded] = useState(false);
  const expandable = Array.isArray(items);

  return (
    <Card
      size="small"
      bordered
      className="stat-card"
      style={{ borderRadius: 16, cursor: expandable ? 'pointer' : 'default' }}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      onClick={expandable ? () => setExpanded((v) => !v) : undefined}
      onKeyDown={expandable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); }
      } : undefined}
    >
      <Space align="center" size={12} style={{ width: '100%', justifyContent: 'space-between' }}>
        {/* flexShrink: 0 — o rótulo nunca deve ceder espaço pro seletor; sem
            isso, um nome de projeto longo no filter espreme o rótulo até ele
            quebrar linha (ex: "Licen/ças"). Quem cede é o seletor, truncando
            com reticências (ver maxWidth/minWidth abaixo). */}
        <Space align="center" size={12} style={{ flexShrink: 0 }}>
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
        <Space align="center" size={8} style={{ minWidth: 0, flex: '1 1 auto', justifyContent: 'flex-end' }}>
          {filter && (
            // Seletor de projeto embutido no card (não fora dele) pra não
            // desalinhar os cards vizinhos que não têm filtro — ver ADR 0011.
            // stopPropagation pra abrir o dropdown sem também expandir/recolher
            // o drill-down do card (o Card inteiro tem onClick de expandir).
            // minWidth: 0 no wrapper é o que permite o Select encolher abaixo
            // do tamanho do texto e truncar com reticências, em vez de
            // estourar a largura do card (comportamento padrão de flex item).
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
              style={{ minWidth: 0, maxWidth: 160 }}
            >
              <Select
                size="small"
                variant="borderless"
                virtual={false}
                popupMatchSelectWidth={false}
                value={filter.value}
                onChange={filter.onChange}
                options={filter.options}
                style={{ width: '100%', minWidth: 0 }}
              />
            </div>
          )}
          {expandable && (
            expanded
              ? <UpOutlined data-testid="billing-category-chevron" style={{ color: '#94a3b8', fontSize: 12 }} />
              : <DownOutlined data-testid="billing-category-chevron" style={{ color: '#94a3b8', fontSize: 12 }} />
          )}
        </Space>
      </Space>

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
                    {service.skus.map((sku) => (
                      <div key={sku.sku} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, flex: '1 1 auto', minWidth: 0 }}>{sku.sku}</Text>
                        <Text
                          type="secondary"
                          style={{
                            fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatCurrency(sku.cost, currency)}
                        </Text>
                      </div>
                    ))}
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
