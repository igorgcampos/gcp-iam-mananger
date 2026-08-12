import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillingPage from './BillingPage';

// jsdom não implementa matchMedia; o dropdown (rc-select) do Ant Design chama
// isso internamente ao abrir — mesmo polyfill usado em InactivityReportModal.test.jsx.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

const summary = {
  total: 500,
  gemini: 300,
  infra: 150,
  uncategorized: 50,
  currency: 'BRL',
  items: {
    gemini: [{ service: 'Vertex AI Search', cost: 300, skus: [{ sku: 'Query API', cost: 300 }] }],
    infra: [{ service: 'Cloud Run', cost: 150, skus: [{ sku: 'CPU Allocation Time', cost: 150 }] }],
    uncategorized: [],
  },
  geminiByProject: {
    // As assinaturas sem project.id já vêm somadas ao bucket de
    // agentspace-469418 pelo backend (ver groupGeminiByProject) — não existe
    // um bucket separado "sem projeto" pro frontend renderizar.
    total: 345,
    byProject: {
      'agentspace-469418': {
        label: 'agentspace-469418',
        total: 300,
        items: [{ service: 'Vertex AI Search', cost: 300, skus: [{ sku: 'Query API', cost: 300 }] }],
      },
      'outro-projeto': {
        label: 'outro-projeto',
        total: 45,
        items: [{ service: 'Vertex AI', cost: 45, skus: [{ sku: 'Online Prediction', cost: 45 }] }],
      },
    },
  },
};

describe('BillingPage — card Gemini cross-project', () => {
  it('abre com "Todos os projetos" selecionado, mostrando o total cross-project', () => {
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    expect(screen.getByText('R$ 345,00')).toBeInTheDocument();
  });

  it('lista cada projeto do geminiByProject no dropdown', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    const optionLabels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining(['agentspace-469418', 'outro-projeto']));
  });

  it('ao selecionar um projeto, o card Gemini passa a mostrar o total daquele projeto', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('outro-projeto'));

    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
    expect(screen.queryByText('R$ 345,00')).not.toBeInTheDocument();
  });

  it('ao selecionar um projeto, o drill-down do card Gemini mostra os Serviços/SKUs daquele projeto', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('outro-projeto'));
    await user.click(screen.getByText('Gemini'));

    expect(screen.getByText('Vertex AI')).toBeInTheDocument();
    expect(screen.getByText('Online Prediction')).toBeInTheDocument();
  });

  it('trocar o projeto do Gemini não altera os cards Infra, Outros Serviços e Total do projeto', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('outro-projeto'));

    expect(screen.getByText('R$ 500,00')).toBeInTheDocument(); // Total do projeto
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument(); // Infra
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument(); // Outros Serviços
  });

  it('sem itens de outros projetos ao abrir o drill-down agregado de "Todos os projetos"', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(screen.getByText('Gemini'));

    const geminiCard = screen.getByText('Gemini').closest('[role="button"]');
    expect(within(geminiCard).getByText('Vertex AI Search')).toBeInTheDocument();
    expect(within(geminiCard).getByText('Vertex AI')).toBeInTheDocument();
  });
});
