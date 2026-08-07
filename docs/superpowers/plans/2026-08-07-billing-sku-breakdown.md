# Drill-down por SKU nos cards de Custos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao clicar num card de categoria da página de Custos (Gemini, Infra ou Não Categorizado), expandir inline uma lista dos Serviços daquela categoria com os SKUs de cada um, ordenados do maior custo pro menor.

**Architecture:** Backend: `queryCostByService` (em `billingService.js`) passa a agrupar também por `sku.description` (além de `service.description`), e `categorizeCosts` passa a devolver, além dos totais já existentes, um campo `items` por categoria — lista de Serviços, cada um com seus SKUs (`{ service, cost, skus: [{ sku, cost }] }`), já ordenada por custo desc nos dois níveis. Nenhum endpoint novo: tudo trafega na mesma resposta cacheada de `GET /api/billing/summary`. Frontend: novo componente `BillingCategoryCard` (extraído do `StatCard` inline de `BillingPage.jsx`) guarda seu próprio estado de expandido/colapsado — clicar no card alterna a exibição da lista Serviço → SKUs, usando `formatCurrency` já existente. O card "Total do projeto" continua sem essa interação (não recebe `items`).

**Tech Stack:** Node/Express + Jest (backend, sem dependência nova — só amplia a query/`categorizeCosts` já existentes). React + Ant Design + Vitest + Testing Library (frontend, sem dependência nova — usa `Card`/`Space`/`Typography`/ícones do `@ant-design/icons` já em uso).

**Context docs already written (do not re-derive these decisions):** `CONTEXT.md` (seção "Billing (custos GCP)", entradas **Serviço** e **SKU**) e `docs/adr/0006-billing-export-como-fonte-de-custos.md`. As decisões de granularidade (SKU real), estrutura (Serviço → SKUs), ordenação (maior custo primeiro), carregamento (junto no `/api/billing/summary`), multi-expansão (independente por card) e categoria zerada (continua clicável, mostra vazio) já foram fechadas numa sessão de grill — implemente-as, não reabra.

---

## File Structure

- Modify: `backend/src/services/billingService.js` — query BigQuery com `sku.description`, `parseRows`, e `categorizeCosts` devolvendo `items` agrupado por Serviço → SKUs.
- Modify: `backend/src/services/billingService.test.js` — fixtures ganham campo `sku`; novos testes para `items`.
- Modify: `backend/src/routes/billing.test.js` — mock de `getBillingSummary` passa a incluir `items`, mantendo o teste de contrato fiel ao shape real.
- Create: `frontend/src/components/BillingCategoryCard.jsx` — card clicável com drill-down Serviço → SKUs (extraído do `StatCard` que hoje vive dentro de `BillingPage.jsx`).
- Create: `frontend/src/components/BillingCategoryCard.test.jsx`
- Modify: `frontend/src/pages/BillingPage.jsx` — remove o `StatCard` inline, passa a usar `BillingCategoryCard`, repassando `summary.items.<categoria>`.

---

### Task 1: `categorizeCosts` agrupa por Serviço → SKU

**Files:**
- Modify: `backend/src/services/billingService.js:8-39`
- Test: `backend/src/services/billingService.test.js:86-129`

- [ ] **Step 1: Atualizar as fixtures existentes de `categorizeCosts` para incluir `sku`, e escrever os testes novos (falhando)**

Substitua todo o bloco `describe('categorizeCosts', ...)` por:

```js
describe('categorizeCosts', () => {
  test('soma Gemini, Infra e Não categorizado, e eles fecham com o total', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 1696.14, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'Cloud Run - CPU Allocation Time', cost: 42.5, currency: 'BRL' },
      { service: 'Artifact Registry', sku: 'Artifact Registry Storage', cost: 3.2, currency: 'BRL' },
      { service: 'Cloud Storage', sku: 'Standard Storage', cost: 7.1, currency: 'BRL' }, // não está em nenhuma lista
    ];

    const result = categorizeCosts(rows);

    expect(result.gemini).toBe(1696.14);
    expect(result.infra).toBe(45.7);
    expect(result.uncategorized).toBe(7.1);
    expect(result.total).toBeCloseTo(1748.94, 2);
    expect(result.total).toBeCloseTo(result.gemini + result.infra + result.uncategorized, 2);
  });

  test('usa a moeda da primeira linha', () => {
    const result = categorizeCosts([{ service: 'Cloud Run', sku: 'Cloud Run - CPU Allocation Time', cost: 10, currency: 'USD' }]);
    expect(result.currency).toBe('USD');
  });

  test('retorna zeros, moeda padrão BRL e items vazios para lista vazia', () => {
    const result = categorizeCosts([]);
    expect(result).toEqual({
      gemini: 0,
      infra: 0,
      uncategorized: 0,
      total: 0,
      currency: 'BRL',
      items: { gemini: [], infra: [], uncategorized: [] },
    });
  });

  test('arredonda para 2 casas decimais mesmo com soma de ponto flutuante imprecisa', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 0.1, currency: 'BRL' },
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 0.2, currency: 'BRL' },
    ];
    expect(categorizeCosts(rows).gemini).toBe(0.3);
  });

  test('categoriza "Vertex AI" (sem "Search") também como Gemini', () => {
    const result = categorizeCosts([{ service: 'Vertex AI', sku: 'Vertex AI Online Prediction', cost: 40.73, currency: 'BRL' }]);
    expect(result.gemini).toBe(40.73);
    expect(result.uncategorized).toBe(0);
  });

  test('agrupa items por Serviço e, dentro de cada um, por SKU', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
      { service: 'Vertex AI Search', sku: 'Storage', cost: 50, currency: 'BRL' },
      { service: 'Vertex AI', sku: 'Online Prediction', cost: 30, currency: 'BRL' },
    ];

    const { items } = categorizeCosts(rows);

    expect(items.gemini).toEqual([
      {
        service: 'Vertex AI Search',
        cost: 150,
        skus: [
          { sku: 'Query API', cost: 100 },
          { sku: 'Storage', cost: 50 },
        ],
      },
      { service: 'Vertex AI', cost: 30, skus: [{ sku: 'Online Prediction', cost: 30 }] },
    ]);
    expect(items.infra).toEqual([]);
    expect(items.uncategorized).toEqual([]);
  });

  test('ordena Serviços e SKUs por custo decrescente', () => {
    const rows = [
      { service: 'Cloud Run', sku: 'Requests', cost: 5, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 20, currency: 'BRL' },
      { service: 'BigQuery', sku: 'Analysis', cost: 40, currency: 'BRL' },
    ];

    const { items } = categorizeCosts(rows);

    expect(items.infra.map((s) => s.service)).toEqual(['BigQuery', 'Cloud Run']);
    expect(items.infra[1].skus.map((s) => s.sku)).toEqual(['CPU Allocation Time', 'Requests']);
  });

  test('soma linhas repetidas do mesmo Serviço+SKU (defesa contra duplicidade)', () => {
    const rows = [
      { service: 'Cloud Run', sku: 'Requests', cost: 5, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'Requests', cost: 2.5, currency: 'BRL' },
    ];

    const { items } = categorizeCosts(rows);

    expect(items.infra).toEqual([{ service: 'Cloud Run', cost: 7.5, skus: [{ sku: 'Requests', cost: 7.5 }] }]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest billingService.test.js -t categorizeCosts`
Expected: FAIL — `result.items` é `undefined` (a implementação atual não devolve esse campo).

- [ ] **Step 3: Implementar o agrupamento em `billingService.js`**

Substitua a função `categorizeCosts` (linhas 15-39) por:

```js
function groupByServiceAndSku(rows) {
  const byService = new Map();
  rows.forEach(({ service, sku, cost }) => {
    if (!byService.has(service)) byService.set(service, new Map());
    const skuMap = byService.get(service);
    skuMap.set(sku, (skuMap.get(sku) || 0) + cost);
  });

  return Array.from(byService.entries())
    .map(([service, skuMap]) => {
      const skus = Array.from(skuMap.entries())
        .map(([sku, cost]) => ({ sku, cost: round2(cost) }))
        .sort((a, b) => b.cost - a.cost);
      const cost = round2(skus.reduce((sum, s) => sum + s.cost, 0));
      return { service, cost, skus };
    })
    .sort((a, b) => b.cost - a.cost);
}

function categorizeCosts(rows) {
  const buckets = { gemini: [], infra: [], uncategorized: [] };
  let currency = null;

  rows.forEach((row) => {
    currency = currency || row.currency;
    if (GEMINI_SERVICES.includes(row.service)) {
      buckets.gemini.push(row);
    } else if (INFRA_SERVICES.includes(row.service)) {
      buckets.infra.push(row);
    } else {
      buckets.uncategorized.push(row);
    }
  });

  const items = {
    gemini: groupByServiceAndSku(buckets.gemini),
    infra: groupByServiceAndSku(buckets.infra),
    uncategorized: groupByServiceAndSku(buckets.uncategorized),
  };

  const gemini = round2(items.gemini.reduce((sum, s) => sum + s.cost, 0));
  const infra = round2(items.infra.reduce((sum, s) => sum + s.cost, 0));
  const uncategorized = round2(items.uncategorized.reduce((sum, s) => sum + s.cost, 0));

  return {
    gemini,
    infra,
    uncategorized,
    total: round2(gemini + infra + uncategorized),
    currency: currency || 'BRL',
    items,
  };
}
```

Essa função fica logo depois de `round2` (que continua igual) e antes do bloco de cache — só troca o corpo de `categorizeCosts` e adiciona `groupByServiceAndSku` acima dela.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest billingService.test.js -t categorizeCosts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/billingService.js backend/src/services/billingService.test.js
git commit -m "feat(billing): categorizeCosts agrupa custos por Serviço e SKU"
```

---

### Task 2: Query do BigQuery e `getBillingSummary` passam a trazer SKU

**Files:**
- Modify: `backend/src/services/billingService.js:44-82`
- Test: `backend/src/services/billingService.test.js:1-84`
- Test: `backend/src/routes/billing.test.js:28-39`

- [ ] **Step 1: Atualizar `mockQueryResult` e os testes de `getBillingSummary` (falhando)**

No topo do arquivo `billingService.test.js`, troque `mockQueryResult`:

```js
function mockQueryResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'service' }, { name: 'sku' }, { name: 'cost' }, { name: 'currency' }] },
      rows: rows.map(({
        service, sku, cost, currency,
      }) => ({
        f: [{ v: service }, { v: sku }, { v: String(cost) }, { v: currency }],
      })),
    },
  };
}
```

E ajuste as chamadas dentro de `describe('getBillingSummary', ...)` pra incluir `sku` em cada linha mockada, por exemplo:

```js
  test('consulta o BigQuery filtrando pelo projeto e devolve o resumo categorizado', async () => {
    queryMock.mockResolvedValue(mockQueryResult([
      { service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 10, currency: 'BRL' },
    ]));

    const summary = await getBillingSummary();

    expect(summary).toMatchObject({
      gemini: 100, infra: 10, uncategorized: 0, total: 110, currency: 'BRL',
    });
    expect(summary.items.gemini).toEqual([{ service: 'Vertex AI Search', cost: 100, skus: [{ sku: 'Query API', cost: 100 }] }]);
    expect(summary.updatedAt).toBeDefined();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [call] = queryMock.mock.calls[0];
    expect(call.projectId).toBe('agentspace-469418');
    expect(call.requestBody.queryParameters[0].parameterValue.value).toBe('agentspace-469418');
  });
```

As outras três (`usa o cache...`, `refaz a query...`, `chamadas concorrentes...`) só precisam de `sku: 'CPU Allocation Time'` adicionado à linha mockada de `Cloud Run` — sem mudança de asserção.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest billingService.test.js`
Expected: FAIL na query — `summary.items` indefinido / query real ainda não seleciona `sku`.

- [ ] **Step 3: Adicionar `sku.description` na query e no parse**

Em `queryCostByService` (linhas 58-67), mude a query para:

```js
  const query = `
    SELECT
      service.description AS service,
      sku.description AS sku,
      SUM(cost) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) AS c)), 0) AS cost,
      ANY_VALUE(currency) AS currency
    FROM \`${table}\`
    WHERE project.id = @projectId
      AND usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
    GROUP BY service, sku
  `;
```

Em `parseRows` (linhas 44-52), inclua `sku` no objeto devolvido:

```js
function parseRows(data) {
  if (!data.rows) return [];
  const fields = data.schema.fields.map((f) => f.name);
  return data.rows.map((row) => {
    const obj = {};
    row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
    return {
      service: obj.service, sku: obj.sku, cost: parseFloat(obj.cost) || 0, currency: obj.currency,
    };
  });
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest billingService.test.js`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Atualizar o mock de contrato em `billing.test.js`**

Em `backend/src/routes/billing.test.js`, no primeiro teste, troque o objeto `summary` mockado por:

```js
    const summary = {
      gemini: 100,
      infra: 10,
      uncategorized: 0,
      total: 110,
      currency: 'BRL',
      items: {
        gemini: [{ service: 'Vertex AI Search', cost: 100, skus: [{ sku: 'Query API', cost: 100 }] }],
        infra: [{ service: 'Cloud Run', cost: 10, skus: [{ sku: 'CPU Allocation Time', cost: 10 }] }],
        uncategorized: [],
      },
      updatedAt: '2026-08-06T12:00:00.000Z',
    };
```

(A asserção `expect(res.body).toEqual(summary)` já existente continua igual — só o fixture fica mais realista.)

- [ ] **Step 6: Rodar a suíte inteira do backend**

Run: `cd backend && npm test`
Expected: PASS — todos os arquivos.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/billingService.js backend/src/services/billingService.test.js backend/src/routes/billing.test.js
git commit -m "feat(billing): agrupa a query do billing export por SKU além de Serviço"
```

---

### Task 3: `BillingCategoryCard` — card com drill-down Serviço → SKUs

**Files:**
- Create: `frontend/src/components/BillingCategoryCard.jsx`
- Test: `frontend/src/components/BillingCategoryCard.test.jsx`

- [ ] **Step 1: Escrever o teste do componente (falhando)**

```jsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillingCategoryCard from './BillingCategoryCard';

const geminiItems = [
  {
    service: 'Vertex AI Search',
    cost: 150,
    skus: [
      { sku: 'Query API', cost: 100 },
      { sku: 'Storage', cost: 50 },
    ],
  },
  { service: 'Vertex AI', cost: 30, skus: [{ sku: 'Online Prediction', cost: 30 }] },
];

describe('BillingCategoryCard', () => {
  it('não mostra a lista de SKUs antes de clicar', () => {
    render(
      <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} />,
    );
    expect(screen.queryByText('Vertex AI Search')).not.toBeInTheDocument();
  });

  it('expande e mostra Serviços com seus SKUs ao clicar no card', async () => {
    const user = userEvent.setup();
    render(
      <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} />,
    );

    await user.click(screen.getByText('Gemini'));

    expect(screen.getByText('Vertex AI Search')).toBeInTheDocument();
    expect(screen.getByText('Query API')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Vertex AI')).toBeInTheDocument();
    expect(screen.getByText('Online Prediction')).toBeInTheDocument();
  });

  it('recolhe de novo ao clicar uma segunda vez', async () => {
    const user = userEvent.setup();
    render(
      <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} />,
    );

    const trigger = screen.getByText('Gemini');
    await user.click(trigger);
    expect(screen.getByText('Vertex AI Search')).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByText('Vertex AI Search')).not.toBeInTheDocument();
  });

  it('categoria sem custo mostra mensagem de vazio ao expandir', async () => {
    const user = userEvent.setup();
    render(
      <BillingCategoryCard label="Não Categorizado" value={0} currency="BRL" items={[]} />,
    );

    await user.click(screen.getByText('Não Categorizado'));

    expect(screen.getByText('Nenhum custo neste período')).toBeInTheDocument();
  });

  it('sem a prop items, o card não é clicável nem tem seta de expandir', () => {
    render(<BillingCategoryCard label="Total do projeto" value={210} currency="BRL" />);
    expect(screen.queryByTestId('billing-category-chevron')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run BillingCategoryCard`
Expected: FAIL — `Failed to resolve import "./BillingCategoryCard"` (o componente ainda não existe).

- [ ] **Step 3: Implementar `BillingCategoryCard.jsx`**

```jsx
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
      onClick={expandable ? () => setExpanded((v) => !v) : undefined}
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

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Statistic value={value} valueStyle={{ fontSize: 28, fontWeight: 800, color: '#192645' }} />
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
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong style={{ fontSize: 12 }}>{service.service}</Text>
                    <Text strong style={{ fontSize: 12 }}>{formatCurrency(service.cost, currency)}</Text>
                  </div>
                  <Space direction="vertical" size={2} style={{ width: '100%', marginTop: 4, paddingLeft: 12 }}>
                    {service.skus.map((sku) => (
                      <div key={sku.sku} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{sku.sku}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{formatCurrency(sku.cost, currency)}</Text>
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run BillingCategoryCard`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BillingCategoryCard.jsx frontend/src/components/BillingCategoryCard.test.jsx
git commit -m "feat(billing): componente de card com drill-down por Serviço/SKU"
```

---

### Task 4: `BillingPage.jsx` usa `BillingCategoryCard`

**Files:**
- Modify: `frontend/src/pages/BillingPage.jsx`

- [ ] **Step 1: Substituir o `StatCard` inline por `BillingCategoryCard`**

Remova a função `StatCard` (linhas 12-34) e o import de `formatCurrency` deixa de ser necessário aqui (o componente novo já formata internamente) — mas `Card`/`Statistic` também deixam de ser usados diretamente nesta página. O arquivo final fica:

```jsx
import React from 'react';
import {
  Typography, Space, Button, Spin, Empty,
} from 'antd';
import {
  WalletOutlined, RobotOutlined, CloudServerOutlined, QuestionCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import BillingCategoryCard from '../components/BillingCategoryCard';
import { formatCurrency } from '../utils/billingFormatting';

const { Title, Text } = Typography;

export default function BillingPage({
  summary, loading, lastUpdated, reload,
}) {
  const currency = summary?.currency || 'BRL';

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start" wrap>
          <Space direction="vertical" size={0}>
            <Space>
              <WalletOutlined style={{ fontSize: 20, color: '#192645' }} />
              <Title level={4} style={{ margin: 0 }}>Custos</Title>
            </Space>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Gasto do projeto {import.meta.env.VITE_GCP_PROJECT_ID} no mês corrente, via BigQuery Billing Export.
            </Text>
          </Space>
          <Space wrap>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
              Atualizar
            </Button>
          </Space>
        </Space>

        <Spin spinning={loading}>
          {summary ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <BillingCategoryCard
                icon={<WalletOutlined />}
                iconBg="#eff6ff"
                iconColor="#2563eb"
                label="Total do projeto"
                value={formatCurrency(summary.total, currency)}
                hint="Mês corrente"
              />
              <BillingCategoryCard
                icon={<RobotOutlined />}
                iconBg="#f5f3ff"
                iconColor="#7c3aed"
                label="Gemini"
                value={formatCurrency(summary.gemini, currency)}
                hint="Vertex AI Search / licenças"
                currency={currency}
                items={summary.items?.gemini ?? []}
              />
              <BillingCategoryCard
                icon={<CloudServerOutlined />}
                iconBg="#eef2ff"
                iconColor="#4f46e5"
                label="Infra"
                value={formatCurrency(summary.infra, currency)}
                hint="Cloud Run e afins"
                currency={currency}
                items={summary.items?.infra ?? []}
              />
              <BillingCategoryCard
                icon={<QuestionCircleOutlined />}
                iconBg="#f8fafc"
                iconColor="#64748b"
                label="Não categorizado"
                value={formatCurrency(summary.uncategorized, currency)}
                hint="Fora das listas conhecidas"
                currency={currency}
                items={summary.items?.uncategorized ?? []}
              />
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhum dado de custo carregado ainda" />
          )}
        </Spin>
      </Space>
    </div>
  );
}
```

`value` recebe a string já formatada por `formatCurrency` — igual ao `StatCard` original — e é repassado direto pro `Statistic value={value} .../>` dentro de `BillingCategoryCard`, que não reformata nada. O card "Total do projeto" não recebe `items`, então continua sem a seta/clique de expandir (o teste "sem a prop items..." do Task 3 cobre esse caso). Note também que o `BillingCategoryCard.jsx` do Task 3 usa `value={value}` diretamente no `Statistic` — como `value` aqui já chega como string formatada (`"R$ 1.234,56"`), isso é consistente com o comportamento original do `StatCard`.

- [ ] **Step 2: Rodar a suíte de frontend inteira**

Run: `cd frontend && npm test`
Expected: PASS — nenhum teste existente quebra (não há teste próprio de `BillingPage.jsx` hoje).

- [ ] **Step 3: Verificar visualmente com `npm run dev`**

Suba o frontend (`cd frontend && npm run dev`), abra a página Custos, e confirme manualmente:
- Clicar em "Gemini" expande a lista de Serviços (Vertex AI / Vertex AI Search) com seus SKUs.
- Clicar em "Infra" expande independente do Gemini (os dois podem ficar abertos ao mesmo tempo).
- "Total do projeto" não reage a clique.
- Categoria sem custo no mês mostra "Nenhum custo neste período" ao expandir.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/BillingPage.jsx
git commit -m "feat(billing): página de Custos usa BillingCategoryCard com drill-down por SKU"
```

---

## Verificação final

- [ ] `cd backend && npm test` — tudo verde.
- [ ] `cd frontend && npm test` — tudo verde.
- [ ] Conferir que `CONTEXT.md` (seção Billing) já reflete os termos **Serviço** e **SKU** usados neste plano (já atualizado antes deste plano ser escrito — só checar, não precisa editar de novo).
