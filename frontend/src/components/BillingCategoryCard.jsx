import React, { useState } from 'react';
import {
  Card, Statistic, Typography, Space,
} from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { formatCurrency } from '../utils/billingFormatting';

const { Text } = Typography;

export default function BillingCategoryCard({
  icon, iconBg, iconColor, label, value, hint, items, currency,
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
        <Space align="center" size={12}>
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
          <Text strong type="secondary" style={{ fontSize: 13 }}>{label}</Text>
        </Space>
        {expandable && (
          expanded
            ? <UpOutlined data-testid="billing-category-chevron" style={{ color: '#94a3b8', fontSize: 12 }} />
            : <DownOutlined data-testid="billing-category-chevron" style={{ color: '#94a3b8', fontSize: 12 }} />
        )}
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
