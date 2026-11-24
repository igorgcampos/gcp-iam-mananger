import { describe, expect, it } from 'vitest';
import {
  SEM_DIRETORIA, SEM_DIRETORIA_KEY, diretoriaKey, getDiretoria, userDiretoriaKey,
  buildDiretoriaStats, buildDiretoriaFilters,
} from './diretoria';

const assigned = (userPrincipal) => ({ userPrincipal, licenseAssignmentState: 'ASSIGNED' });

describe('diretoriaKey', () => {
  it('ignora acento, caixa e espaços', () => {
    expect(diretoriaKey(' Estrategia  Digital ')).toBe(diretoriaKey('ESTRATÉGIA DIGITAL'));
    expect(diretoriaKey('Audiencia')).toBe('AUDIENCIA');
  });

  it('não unifica nomes diferentes', () => {
    expect(diretoriaKey('AUDIÊNCIA ASSINATURAS')).not.toBe(diretoriaKey('AUDIÊNCIA'));
  });
});

describe('getDiretoria', () => {
  const m = { 'adriana.domingues@valor.com.br': 'DESENVOLVIMENTO COMERCIAL', 'x.rpa@edglobo.com.br': null };

  it('busca pelo e-mail em minúsculas', () => {
    expect(getDiretoria('Adriana.Domingues@valor.com.br', m)).toBe('DESENVOLVIMENTO COMERCIAL');
  });

  it('distingue Sem Diretoria (null) de desconhecido (undefined)', () => {
    expect(getDiretoria('x.rpa@edglobo.com.br', m)).toBeNull();
    expect(getDiretoria('outro@edglobo.com.br', m)).toBeUndefined();
    expect(getDiretoria('a@b.com', null)).toBeUndefined();
  });
});

describe('userDiretoriaKey', () => {
  const m = { 'a@x.com': 'Audiencia', 'b@x.com': null };

  it('devolve a chave normalizada, a chave de Sem Diretoria ou undefined', () => {
    expect(userDiretoriaKey('A@x.com', m)).toBe('AUDIENCIA');
    expect(userDiretoriaKey('b@x.com', m)).toBe(SEM_DIRETORIA_KEY);
    expect(userDiretoriaKey('c@x.com', m)).toBeUndefined();
  });
});

describe('buildDiretoriaStats', () => {
  const users = [
    assigned('a1@x.com'),
    assigned('a2@x.com'),
    assigned('A3@x.com'),
    assigned('as@x.com'),
    assigned('s1@x.com'),
    assigned('s2@x.com'),
    { userPrincipal: 'nl@x.com', licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN' },
  ];
  const m = {
    'a1@x.com': 'AUDIÊNCIA',
    'a2@x.com': 'AUDIÊNCIA',
    'a3@x.com': 'Audiencia',
    'as@x.com': 'AUDIÊNCIA ASSINATURAS',
    's1@x.com': null,
    's2@x.com': null,
    'nl@x.com': 'TECNOLOGIA',
  };

  it('agrupa grafias, usa a mais frequente como rótulo e põe Sem Diretoria por último', () => {
    expect(buildDiretoriaStats(users, m)).toEqual([
      { key: 'AUDIENCIA', label: 'AUDIÊNCIA', count: 3, percent: 50 },
      { key: 'AUDIENCIA ASSINATURAS', label: 'AUDIÊNCIA ASSINATURAS', count: 1, percent: 17 },
      { key: SEM_DIRETORIA_KEY, label: SEM_DIRETORIA, count: 2, percent: 33 },
    ]);
  });

  it('desempata o rótulo pela primeira grafia em ordem alfabética', () => {
    const stats = buildDiretoriaStats(
      [assigned('a@x.com'), assigned('b@x.com')],
      { 'a@x.com': 'Estrategia Digital', 'b@x.com': 'ESTRATÉGIA DIGITAL' },
    );
    expect(stats).toEqual([{ key: 'ESTRATEGIA DIGITAL', label: 'ESTRATÉGIA DIGITAL', count: 2, percent: 100 }]);
  });

  it('devolve [] quando o lookup falhou (diretorias null)', () => {
    expect(buildDiretoriaStats(users, null)).toEqual([]);
  });

  it('ignora usuários desconhecidos (fora do mapa) no total', () => {
    expect(buildDiretoriaStats([assigned('a@x.com'), assigned('fora@x.com')], { 'a@x.com': 'CBN' }))
      .toEqual([{ key: 'CBN', label: 'CBN', count: 1, percent: 100 }]);
  });

  it('devolve [] quando nenhum usuário tem Diretoria conhecida', () => {
    expect(buildDiretoriaStats([assigned('a@x.com')], {})).toEqual([]);
  });
});

describe('buildDiretoriaFilters', () => {
  it('inclui usuários de qualquer status, em ordem alfabética, com Sem Diretoria por último', () => {
    const users = [
      assigned('a@x.com'),
      { userPrincipal: 'b@x.com', licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN' },
      assigned('c@x.com'),
      assigned('d@x.com'),
    ];
    const m = {
      'a@x.com': 'TECNOLOGIA', 'b@x.com': 'CBN', 'c@x.com': null, 'd@x.com': 'Tecnologia',
    };
    expect(buildDiretoriaFilters(users, m)).toEqual([
      { text: 'CBN', value: 'CBN' },
      { text: 'TECNOLOGIA', value: 'TECNOLOGIA' },
      { text: SEM_DIRETORIA, value: SEM_DIRETORIA_KEY },
    ]);
  });

  it('devolve [] quando o lookup falhou', () => {
    expect(buildDiretoriaFilters([assigned('a@x.com')], null)).toEqual([]);
  });
});
