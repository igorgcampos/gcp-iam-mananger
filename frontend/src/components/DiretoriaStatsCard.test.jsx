import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DiretoriaStatsCard from './DiretoriaStatsCard';

const stats = [
  { key: 'TECNOLOGIA', label: 'TECNOLOGIA', count: 9, percent: 60 },
  { key: 'CBN', label: 'CBN', count: 3, percent: 20 },
  { key: '__SEM_DIRETORIA__', label: 'Sem Diretoria', count: 3, percent: 20 },
];

const expand = () => fireEvent.click(screen.getByText('Licenças por Diretoria'));

describe('DiretoriaStatsCard', () => {
  it('começa recolhido, com o resumo no cabeçalho', () => {
    render(<DiretoriaStatsCard stats={stats} />);

    expect(screen.getByText('Licenças por Diretoria')).toBeInTheDocument();
    // Sem Diretoria não conta como diretoria; a maior é a primeira de verdade.
    expect(screen.getByText('2 diretorias · maior: TECNOLOGIA (60%)')).toBeInTheDocument();
    expect(screen.queryByText('9 (60%)')).not.toBeInTheDocument();
  });

  it('ao expandir mostra uma linha por Diretoria com contagem e percentual', () => {
    render(<DiretoriaStatsCard stats={stats} />);
    expand();

    expect(screen.getByText('TECNOLOGIA')).toBeInTheDocument();
    expect(screen.getByText('9 (60%)')).toBeInTheDocument();
    expect(screen.getByText('Sem Diretoria')).toBeInTheDocument();
    expect(screen.getAllByText('3 (20%)')).toHaveLength(2);
  });

  it('resumo no singular com uma diretoria', () => {
    render(<DiretoriaStatsCard stats={[{ key: 'CBN', label: 'CBN', count: 1, percent: 100 }]} />);
    expect(screen.getByText('1 diretoria · maior: CBN (100%)')).toBeInTheDocument();
  });

  it('avisa no cabeçalho, mesmo recolhido, que os percentuais são parciais', () => {
    render(<DiretoriaStatsCard stats={[{ key: 'CBN', label: 'CBN', count: 90, percent: 100 }]} unknownCount={10} />);
    expect(screen.getByText('10 usuários sem informação do AD — percentuais parciais')).toBeInTheDocument();
  });

  it('não mostra aviso quando todos têm informação', () => {
    render(<DiretoriaStatsCard stats={[{ key: 'CBN', label: 'CBN', count: 1, percent: 100 }]} unknownCount={0} />);
    expect(screen.queryByText(/sem informação do AD/)).not.toBeInTheDocument();
  });

  it('não renderiza nada com stats vazio', () => {
    const { container } = render(<DiretoriaStatsCard stats={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
