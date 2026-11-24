import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiretoriaStatsCard from './DiretoriaStatsCard';

describe('DiretoriaStatsCard', () => {
  it('mostra título, uma linha por Diretoria com contagem e percentual', () => {
    render(
      <DiretoriaStatsCard
        stats={[
          { key: 'TECNOLOGIA', label: 'TECNOLOGIA', count: 9, percent: 10 },
          { key: '__SEM_DIRETORIA__', label: 'Sem Diretoria', count: 6, percent: 6 },
        ]}
      />,
    );

    expect(screen.getByText('Licenças por Diretoria')).toBeInTheDocument();
    expect(screen.getByText('TECNOLOGIA')).toBeInTheDocument();
    expect(screen.getByText('9 (10%)')).toBeInTheDocument();
    expect(screen.getByText('Sem Diretoria')).toBeInTheDocument();
    expect(screen.getByText('6 (6%)')).toBeInTheDocument();
  });

  it('avisa que os percentuais são parciais quando há usuários sem informação do AD', () => {
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
