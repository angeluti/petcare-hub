// Administração (arquivo 22): leituras, escritas e formatos de estoque.
// Regras ficam no banco: aqui só chamamos tabelas liberadas pela RLS e RPCs.
// O custo mora em tabelas próprias (produto_custos): só dono, gerente e
// estoquista conseguem ler; para os outros a consulta volta vazia.
import { useQuery } from '@tanstack/react-query';
import { supabase, dado } from './supabase';
import { mensagemDeErro, type ErroBanco } from './erros';

// ------------------------------------------------------------------ Tipos
export type UnidadeBase = 'ml' | 'g' | 'un' | 'cm';
export type TipoLocal = 'almoxarifado' | 'venda' | 'outro';

export interface Embalagem {
  id: string;
  rotulo: string;
  fator: number;
  eh_base: boolean;
  usa_compra: boolean;
  usa_requisicao: boolean;
  ativo: boolean;
}

export interface SaldoLocal { local_id: string; quantidade: number; minimo: number | null }

export interface Produto {
  id: string;
  nome: string;
  codigo: string | null;
  ean: string | null;
  categoria: string | null;
  marca: string | null;
  usa_como_insumo: boolean;
  usa_como_venda: boolean;
  unidade_base: UnidadeBase;
  unidade_rotulo: string | null;
  preco_venda: number | null;
  fornecedor_padrao_id: string | null;
  ativo: boolean;
  produto_unidades: Embalagem[];
  estoque_saldos: SaldoLocal[];
}

export interface Fornecedor {
  id: string;
  nome: string;
  documento: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  prazo_entrega_dias: number | null;
  observacao: string | null;
  ativo: boolean;
}

export interface Local {
  id: string;
  nome: string;
  tipo: TipoLocal;
  padrao_requisicao: boolean;
  padrao_entrada: boolean;
  ativo: boolean;
}

export const TIPOS_LOCAL: Record<TipoLocal, string> = {
  almoxarifado: 'Almoxarifado',
  venda: 'Venda (prateleira)',
  outro: 'Outro',
};

// ------------------------------------------------------------------ Papéis efetivos
// O contexto do painel conhece só o papel principal. As telas novas usam os
// papéis efetivos (principal + adicionais), os mesmos que a RLS usa.
export const PAPEIS_ESTOQUE = ['dono', 'gerente', 'estoquista', 'super_admin'];
export const PAPEIS_CONFIG = ['dono', 'gerente', 'super_admin'];

export function useMeusPapeis(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'meus_papeis'],
    queryFn: async () => dado<string[]>(await supabase.rpc('meus_papeis', { p_petshop: petshopId })),
    staleTime: 5 * 60_000,
  });
}

export function usePermissoesEstoque(petshopId: string) {
  const q = useMeusPapeis(petshopId);
  const papeis = q.data ?? [];
  return {
    carregando: q.isLoading,
    papeis,
    /** cadastra produtos e fornecedores, vê custo, define mínimo */
    estoque: papeis.some((p) => PAPEIS_ESTOQUE.includes(p)),
    /** cria e altera locais; aprova (dono e gerente) */
    config: papeis.some((p) => PAPEIS_CONFIG.includes(p)),
  };
}

/** Cria o almoxarifado e as categorias de sistema na primeira vez (idempotente). */
export function usePrepararAdministracao(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'administracao_preparar'],
    queryFn: async () => {
      dado(await supabase.rpc('administracao_preparar', { p_petshop: petshopId }));
      return true;
    },
    staleTime: Infinity,
  });
}

// ------------------------------------------------------------------ Leituras
const SELECT_PRODUTO = `
  id, nome, codigo, ean, categoria, marca, usa_como_insumo, usa_como_venda, unidade_base, unidade_rotulo,
  preco_venda, fornecedor_padrao_id, ativo,
  produto_unidades ( id, rotulo, fator, eh_base, usa_compra, usa_requisicao, ativo ),
  estoque_saldos ( local_id, quantidade, minimo )
`;

export function useProdutos(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'produtos'],
    queryFn: async () =>
      dado<Produto[]>(
        await supabase.from('produtos').select(SELECT_PRODUTO).eq('petshop_id', petshopId).order('nome'),
      ),
  });
}

/** Custo médio por produto (unidade base). Vazio para quem não pode ver custo. */
export function useCustos(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'produto_custos'],
    enabled: habilitado,
    queryFn: async () => {
      const linhas = dado<{ produto_id: string; custo_medio: number }[]>(
        await supabase.from('produto_custos').select('produto_id, custo_medio').eq('petshop_id', petshopId),
      );
      return new Map(linhas.map((l) => [l.produto_id, Number(l.custo_medio)]));
    },
  });
}

export function useFornecedores(petshopId: string, habilitado = true) {
  return useQuery({
    queryKey: [petshopId, 'fornecedores'],
    enabled: habilitado,
    queryFn: async () =>
      dado<Fornecedor[]>(
        await supabase
          .from('fornecedores')
          .select('id, nome, documento, contato, telefone, email, prazo_entrega_dias, observacao, ativo')
          .eq('petshop_id', petshopId)
          .order('nome'),
      ),
  });
}

export function useLocais(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'estoque_locais'],
    queryFn: async () =>
      dado<Local[]>(
        await supabase
          .from('estoque_locais')
          .select('id, nome, tipo, padrao_requisicao, padrao_entrada, ativo')
          .eq('petshop_id', petshopId)
          .order('ativo', { ascending: false })
          .order('nome'),
      ),
  });
}

// ------------------------------------------------------------------ Escritas
export interface ProdutoForm {
  nome: string;
  codigo: string;
  ean: string;
  categoria: string;
  marca: string;
  usa_como_insumo: boolean;
  usa_como_venda: boolean;
  unidade_base: UnidadeBase;
  unidade_rotulo: string;
  preco_venda: number | null;
  fornecedor_padrao_id: string | null;
  ativo: boolean;
}

function limpo(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

export async function salvarProduto(petshopId: string, f: ProdutoForm, id?: string): Promise<string> {
  const comum = {
    nome: f.nome.trim(),
    codigo: limpo(f.codigo),
    ean: limpo(f.ean.replace(/\D/g, '')),
    categoria: limpo(f.categoria),
    marca: limpo(f.marca),
    usa_como_insumo: f.usa_como_insumo,
    usa_como_venda: f.usa_como_venda,
    unidade_rotulo: f.unidade_base === 'un' ? f.unidade_rotulo.trim() : null,
    preco_venda: f.usa_como_venda ? f.preco_venda : null,
    fornecedor_padrao_id: f.fornecedor_padrao_id || null,
    ativo: f.ativo,
  };
  if (id) {
    dado(await supabase.from('produtos').update(comum).eq('id', id));
    return id;
  }
  const novo = dado<{ id: string }>(
    await supabase
      .from('produtos')
      .insert({ ...comum, petshop_id: petshopId, unidade_base: f.unidade_base })
      .select('id')
      .single(),
  );
  return novo.id;
}

export async function criarEmbalagem(
  petshopId: string, produtoId: string, e: { rotulo: string; fator: number; usa_compra: boolean; usa_requisicao: boolean },
) {
  dado(
    await supabase.from('produto_unidades').insert({
      petshop_id: petshopId, produto_id: produtoId, rotulo: e.rotulo.trim(), fator: e.fator,
      usa_compra: e.usa_compra, usa_requisicao: e.usa_requisicao,
    }),
  );
}

export async function alterarEmbalagem(id: string, patch: Partial<Pick<Embalagem, 'usa_compra' | 'usa_requisicao' | 'ativo'>>) {
  dado(await supabase.from('produto_unidades').update(patch).eq('id', id));
}

export async function apagarEmbalagem(id: string) {
  dado(await supabase.from('produto_unidades').delete().eq('id', id));
}

/** Mínimo por local, na unidade base. null = sem mínimo. */
export async function definirMinimo(produtoId: string, localId: string, minimo: number | null) {
  dado(
    await supabase.rpc('estoque_definir_minimo', {
      p_produto: produtoId, p_local: localId, p_minimo: minimo as number,
    }),
  );
}

export type FornecedorForm = Omit<Fornecedor, 'id'>;

export async function salvarFornecedor(petshopId: string, f: FornecedorForm, id?: string) {
  const linha = {
    nome: f.nome.trim(),
    documento: limpo(f.documento ?? ''),
    contato: limpo(f.contato ?? ''),
    telefone: limpo(f.telefone ?? ''),
    email: limpo(f.email ?? ''),
    prazo_entrega_dias: f.prazo_entrega_dias,
    observacao: limpo(f.observacao ?? ''),
    ativo: f.ativo,
  };
  if (id) dado(await supabase.from('fornecedores').update(linha).eq('id', id));
  else dado(await supabase.from('fornecedores').insert({ ...linha, petshop_id: petshopId }));
}

export type LocalForm = Omit<Local, 'id'>;

export async function salvarLocal(petshopId: string, f: LocalForm, id?: string) {
  const linha = {
    nome: f.nome.trim(),
    tipo: f.tipo,
    padrao_requisicao: f.tipo === 'venda' ? false : f.padrao_requisicao,
    padrao_entrada: f.padrao_entrada,
    ativo: f.ativo,
  };
  if (id) dado(await supabase.from('estoque_locais').update(linha).eq('id', id));
  else dado(await supabase.from('estoque_locais').insert({ ...linha, petshop_id: petshopId }));
}

// ------------------------------------------------------------------ Quantidades
// Arquivo 23: a unidade de controle é como o produto é contado.
// Unitário: inteiro, com nome próprio (unidade_rotulo). Fracionado: só por
// medida, guardado em ml, g ou cm (inteiros) e mostrado em L, kg ou m.
export const MEDIDAS: Record<Exclude<UnidadeBase, 'un'>, { nome: string; sigla: string; fator: number }> = {
  ml: { nome: 'Litro', sigla: 'L', fator: 1000 },
  g: { nome: 'Quilo', sigla: 'kg', fator: 1000 },
  cm: { nome: 'Metro', sigla: 'm', fator: 100 },
};

const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const moedaFina = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function numero(v: number): string {
  return numFmt.format(v);
}

/** Nome da unidade de controle: "ml"/"g"/"cm" no fracionado; o nome dado no unitário. */
export function nomeUnidade(p: Pick<Produto, 'unidade_base' | 'unidade_rotulo'>): string {
  return p.unidade_base === 'un' ? (p.unidade_rotulo || 'unidade') : p.unidade_base;
}

/** Quantidade na unidade de controle, para leitura: unitário "12 <nome>"; fracionado em L, kg ou m. */
export function quantidade(v: number | null | undefined, p: Pick<Produto, 'unidade_base' | 'unidade_rotulo'>): string {
  const n = Number(v ?? 0);
  if (p.unidade_base === 'un') return `${numFmt.format(n)} ${nomeUnidade(p)}`;
  const m = MEDIDAS[p.unidade_base];
  return `${numFmt.format(n / m.fator)} ${m.sigla}`;
}

/** Custo por unidade de controle; no fracionado, por L, kg ou m. */
export function custoUnitario(v: number, p: Pick<Produto, 'unidade_base' | 'unidade_rotulo'>): string {
  if (p.unidade_base === 'un') return `${moedaFina.format(v)} / ${nomeUnidade(p)}`;
  const m = MEDIDAS[p.unidade_base];
  return `${moedaFina.format(v * m.fator)} / ${m.sigla}`;
}

/** "5.000" ou "2,5" → número; vazio ou inválido → null */
export function lerNumero(txt: string): number | null {
  const t = txt.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function escreverNumero(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).replace('.', ',');
}

export function saldoTotal(p: Produto): number {
  return p.estoque_saldos.reduce((s, x) => s + Number(x.quantidade), 0);
}

export function abaixoDoMinimo(p: Produto): SaldoLocal[] {
  return p.estoque_saldos.filter((s) => s.minimo !== null && Number(s.quantidade) <= Number(s.minimo));
}

// ------------------------------------------------------------------ Erros
// As mensagens das regras do arquivo 22 já vêm em português; as da RLS e das
// constraints de tabela, não. Mostra a do banco quando é nossa.
const CONSTRAINTS: Record<string, string> = {
  produtos_check: 'Marque se o produto é insumo, venda ou os dois.',
  produtos_ean_check: 'O EAN deve ter de 8 a 14 dígitos.',
  produtos_preco_venda_check: 'O preço de venda não pode ser negativo.',
  produto_unidades_fator_check: 'A quantidade da embalagem deve ser maior que zero.',
  produto_unidades_fator_inteiro: 'A embalagem tem de conter um número inteiro da unidade de controle, de 1 para cima.',
  produtos_unidade_rotulo_check: 'Informe o nome da unidade (só no controle por unidade).',
  estoque_saldos_inteiro: 'O mínimo tem de ser um número inteiro na unidade de controle.',
  inventario_itens_inteiro: 'A contagem tem de fechar em número inteiro na unidade de controle.',
  estoque_locais_check: 'Local de venda não pode ser a origem padrão das requisições.',
  produtos_nome_uq: 'Já existe um produto com esse nome.',
  produtos_codigo_uq: 'Já existe um produto com esse código.',
  produtos_ean_uq: 'Já existe um produto com esse EAN.',
  produto_unidades_produto_id_rotulo_key: 'Este produto já tem uma embalagem com esse nome.',
  fornecedores_nome_uq: 'Já existe um fornecedor com esse nome.',
  estoque_locais_nome_uq: 'Já existe um local com esse nome.',
};

export function erroAdm(e: unknown): string {
  const err = (e ?? {}) as ErroBanco;
  const msg = err.message ?? '';
  for (const [nome, texto] of Object.entries(CONSTRAINTS)) {
    if (msg.includes(`"${nome}"`)) return texto;
  }
  if (err.code === '23503' && msg.includes('produto_unidades')) {
    return 'Esta embalagem já foi usada em compras ou requisições. Desative em vez de apagar.';
  }
  if (err.code === '23503' && msg.includes('estoque_locais')) {
    return 'Este local já tem movimentos. Desative em vez de apagar.';
  }
  // Mensagens das funções e triggers do arquivo 22 (em português)
  if ((err.code === '42501' || err.code === '23514') && msg && !/row-level security|permission denied|violates check constraint/i.test(msg)) {
    return msg;
  }
  return mensagemDeErro(e);
}
