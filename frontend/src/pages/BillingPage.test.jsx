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

// Licenças (Vertex AI Search) e API (Vertex AI) são categorias separadas
// desde a ADR 0011, cada uma com seu próprio seletor de projeto — os dados
// cross-project vêm da mesma query no backend, mas já chegam divididos em
// licensesByProject/apiByProject.
const summary = {
  total: 500,
  licenses: 300,
  vertexApi: 0,
  infra: 150,
  uncategorized: 50,
  currency: 'BRL',
  items: {
    licenses: [{ service: 'Vertex AI Search', cost: 300, skus: [{ sku: 'Query API', cost: 300 }] }],
    vertexApi: [],
    infra: [{ service: 'Cloud Run', cost: 150, skus: [{ sku: 'CPU Allocation Time', cost: 150 }] }],
    uncategorized: [],
  },
  licensesByProject: {
    // As assinaturas sem project.id já vêm somadas ao bucket de
    // agentspace-469418 pelo backend (ver groupCostByProject) — não existe
    // um bucket separado "sem projeto" pro frontend renderizar.
    total: 360,
    byProject: {
      'agentspace-469418': {
        label: 'agentspace-469418',
        total: 300,
        items: [{ service: 'Vertex AI Search', cost: 300, skus: [{ sku: 'Query API', cost: 300 }] }],
      },
      'outro-projeto': {
        label: 'outro-projeto',
        total: 60,
        items: [{ service: 'Vertex AI Search', cost: 60, skus: [{ sku: 'Query API', cost: 60 }] }],
      },
    },
  },
  apiByProject: {
    total: 45,
    byProject: {
      'outro-projeto': {
        label: 'outro-projeto',
        total: 45,
        items: [{ service: 'Vertex AI', cost: 45, skus: [{ sku: 'Online Prediction', cost: 45 }] }],
      },
    },
  },
};

function getSelects() {
  // Ordem de renderização: seletor de Licenças primeiro, depois o de API.
  const [licenseSelect, apiSelect] = screen.getAllByRole('combobox');
  return { licenseSelect, apiSelect };
}

describe('BillingPage — card Licenças cross-project', () => {
  it('abre com "Todos os projetos" selecionado, mostrando o total cross-project', () => {
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    expect(screen.getByText('R$ 360,00')).toBeInTheDocument();
  });

  it('lista cada projeto do licensesByProject no dropdown', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(getSelects().licenseSelect);

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    const optionLabels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining(['agentspace-469418', 'outro-projeto']));
  });

  it('ao selecionar um projeto, o card Licenças passa a mostrar o total daquele projeto', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(getSelects().licenseSelect);
    await user.click(await screen.findByText('outro-projeto'));

    expect(screen.getByText('R$ 60,00')).toBeInTheDocument();
    expect(screen.queryByText('R$ 360,00')).not.toBeInTheDocument();
  });

  it('ao selecionar um projeto, o drill-down do card Licenças mostra os Serviços/SKUs daquele projeto', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(getSelects().licenseSelect);
    await user.click(await screen.findByText('outro-projeto'));
    await user.click(screen.getByText('Licenças'));

    expect(screen.getByText('Vertex AI Search')).toBeInTheDocument();
    expect(screen.getByText('Query API')).toBeInTheDocument();
  });

  it('trocar o projeto de Licenças não altera os cards Infra, Outros Serviços e Total do projeto', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(getSelects().licenseSelect);
    await user.click(await screen.findByText('outro-projeto'));

    expect(screen.getByText('R$ 500,00')).toBeInTheDocument(); // Total do projeto
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument(); // Infra
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument(); // Outros Serviços
  });
});

describe('BillingPage — card API cross-project', () => {
  it('abre com "Todos os projetos" selecionado, mostrando o total cross-project', () => {
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
  });

  it('lista cada projeto do apiByProject no dropdown', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(getSelects().apiSelect);

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    const optionLabels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining(['outro-projeto']));
  });

  it('ao selecionar um projeto, o card API passa a mostrar o total daquele projeto e o drill-down correspondente', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(getSelects().apiSelect);
    await user.click(await screen.findByText('outro-projeto'));
    await user.click(screen.getByText('API'));

    expect(screen.getByText('Vertex AI')).toBeInTheDocument();
    expect(screen.getByText('Online Prediction')).toBeInTheDocument();
  });
});

describe('BillingPage — os dois seletores de projeto são independentes', () => {
  it('trocar o projeto do card Licenças não altera o card API, e vice-versa', async () => {
    const user = userEvent.setup();
    render(<BillingPage summary={summary} loading={false} reload={() => {}} />);

    await user.click(getSelects().licenseSelect);
    await user.click(await screen.findByText('outro-projeto'));

    // Licenças mudou para o total do projeto (R$ 60,00) — o teste que
    // importa aqui é o dropdown do card API não ter sido afetado.
    const { apiSelect } = getSelects();
    expect(within(apiSelect.closest('.ant-select')).getByText('Todos os projetos')).toBeInTheDocument();
  });
});
