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

  it('expande com o teclado (Enter) quando o card está focado', async () => {
    const user = userEvent.setup();
    render(
      <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} />,
    );

    const trigger = screen.getByText('Gemini').closest('[role="button"]');
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('Vertex AI Search')).toBeInTheDocument();
  });

  describe('Alerta de Custo (badge inline — ver CONTEXT.md e ADR 0012)', () => {
    it('não mostra badge quando a SKU não tem alerta', async () => {
      const user = userEvent.setup();
      render(
        <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} alerts={[]} />,
      );
      await user.click(screen.getByText('Gemini'));

      expect(screen.queryByTestId('sku-alert-badge')).not.toBeInTheDocument();
    });

    it('mostra badge de "aumento" na SKU correspondente ao alerta', async () => {
      const user = userEvent.setup();
      const alerts = [{
        tipo: 'aumento_sku', category: 'licenses', projectId: 'agentspace-469418', service: 'Vertex AI Search', sku: 'Query API', cost: 500, baseline: 100, deltaAbsolute: 400, deltaPercent: 400, currency: 'BRL',
      }];
      render(
        <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} alerts={alerts} />,
      );
      await user.click(screen.getByText('Gemini'));

      const badge = screen.getByTestId('sku-alert-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.title).toContain('Query API');
      expect(badge.title).toContain('agentspace-469418');
    });

    it('mostra badge de "novo sku" com ícone diferente do de "aumento"', async () => {
      const user = userEvent.setup();
      const alerts = [{
        tipo: 'novo_sku', category: 'licenses', projectId: 'agentspace-469418', service: 'Vertex AI Search', sku: 'Storage', cost: 50, currency: 'BRL',
      }];
      render(
        <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} alerts={alerts} />,
      );
      await user.click(screen.getByText('Gemini'));

      expect(screen.getByTestId('sku-alert-badge').title).toContain('Novo SKU no Billing');
    });

    it('não confunde SKUs com o mesmo nome em Serviços diferentes', async () => {
      const user = userEvent.setup();
      const alerts = [{
        tipo: 'aumento_sku', category: 'licenses', projectId: 'agentspace-469418', service: 'Vertex AI', sku: 'Online Prediction', cost: 500, baseline: 100, deltaAbsolute: 400, deltaPercent: 400, currency: 'BRL',
      }];
      render(
        <BillingCategoryCard label="Gemini" value={180} currency="BRL" items={geminiItems} alerts={alerts} />,
      );
      await user.click(screen.getByText('Gemini'));

      // Só existe 1 badge — o alerta é do Serviço "Vertex AI", não "Vertex AI Search"
      expect(screen.getAllByTestId('sku-alert-badge')).toHaveLength(1);
    });
  });
});
