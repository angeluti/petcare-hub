// ES-01 · Produtos (insumo e/ou venda) · ES-12 embalagens · ES-05 mínimo por local.
// Arquivo 23: a unidade de controle é como o produto é contado.
//   Unitário (padrão): inteiro, com nome; embalagem = N unidades inteiras.
//   Fracionado: só por medida (L, kg, m), guardado em ml, g, cm.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import {
  MEDIDAS, abaixoDoMinimo, alterarEmbalagem, apagarEmbalagem, criarEmbalagem, custoUnitario, definirMinimo,
  erroAdm, escreverNumero, lerNumero, nomeUnidade, quantidade, saldoTotal, salvarProduto,
  useCustos, useFornecedores, useLocais, useProdutos,
  type Produto, type ProdutoForm, type UnidadeBase,
} from '../../lib/administracao';
import { normalizar } from '../../lib/formato';
import { Campo, Carregando, Modal, Vazio, useAvisos } from '../../componentes/ui';
import { QtdInput } from './QtdInput';

type Filtro = 'todos' | 'insumo' | 'venda' | 'minimo' | 'inativos';

interface Perm { estoque: boolean; config: boolean }

export function AbaProdutos({ perm }: { perm: Perm }) {
  const { petshop } = usePetshop();
  const produtosQ = useProdutos(petshop.id);
  const custosQ = useCustos(petshop.id, perm.estoque);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [aberto, setAberto] = useState<string | 'novo' | null>(null);

  const produtos = produtosQ.data ?? [];
  const custos = custosQ.data;

  const lista = useMemo(() => {
    const q = normalizar(busca.trim());
    return produtos.filter((p) => {
      if (filtro === 'inativos' ? p.ativo : !p.ativo) return false;
      if (filtro === 'insumo' && !p.usa_como_insumo) return false;
      if (filtro === 'venda' && !p.usa_como_venda) return false;
      if (filtro === 'minimo' && abaixoDoMinimo(p).length === 0) return false;
      if (!q) return true;
      return [p.nome, p.marca, p.categoria, p.codigo, p.ean].some((x) => x && normalizar(x).includes(q));
    });
  }, [produtos, busca, filtro]);

  const nAbaixo = produtos.filter((p) => p.ativo && abaixoDoMinimo(p).length > 0).length;
  const produtoAberto = produtos.find((p) => p.id === aberto) ?? null;

  if (produtosQ.isLoading) return <Carregando />;

  return (
    <div className="aba-corpo adm-larga">
      <div className="barra">
        <input className="busca larga" placeholder="Buscar por nome, marca, categoria, código ou EAN…" value={busca}
               onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" />
        <div className="segmentado pequeno" role="group" aria-label="Filtro">
          {([['todos', 'Todos'], ['insumo', 'Insumos'], ['venda', 'Venda'], ['minimo', `Abaixo do mínimo${nAbaixo ? ` (${nAbaixo})` : ''}`], ['inativos', 'Inativos']] as [Filtro, string][])
            .map(([v, r]) => <button key={v} className={filtro === v ? 'ativo' : ''} onClick={() => setFiltro(v)}>{r}</button>)}
        </div>
        {perm.estoque && <button className="btn primario adm-direita" onClick={() => setAberto('novo')}>+ Novo produto</button>}
      </div>

      {lista.length === 0 ? (
        <Vazio>{produtos.length === 0 ? 'Nenhum produto cadastrado.' : 'Nada encontrado com esse filtro.'}</Vazio>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Produto</th><th>Uso</th><th>Controle</th><th>Embalagens</th><th className="num">Saldo</th>
                {perm.estoque && <th className="num">Custo médio</th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const abaixo = abaixoDoMinimo(p).length > 0;
                const extras = p.produto_unidades.filter((u) => u.ativo && !u.eh_base).sort((a, b) => a.fator - b.fator);
                const cm = custos?.get(p.id);
                return (
                  <tr key={p.id} className={`clicavel${p.ativo ? '' : ' inativo'}`} onClick={() => setAberto(p.id)}>
                    <td>
                      <b>{p.nome}</b>
                      {(p.marca || p.categoria) && <div className="mudo adm-pequeno">{[p.marca, p.categoria].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td>
                      {p.usa_como_insumo && <span className="adm-uso">insumo</span>}
                      {p.usa_como_venda && <span className="adm-uso venda">venda</span>}
                    </td>
                    <td className="adm-pequeno">
                      {p.unidade_base === 'un' ? <>por {nomeUnidade(p)}</> : <>por medida ({MEDIDAS[p.unidade_base].sigla})</>}
                    </td>
                    <td className="adm-pequeno">
                      {extras.map((u) => (
                        <span key={u.id} className="adm-emb">{u.rotulo} <span className="mudo">= {quantidade(u.fator, p)}</span></span>
                      ))}
                      {extras.length === 0 && <span className="mudo">—</span>}
                    </td>
                    <td className="num">
                      {abaixo && <span className="adm-alerta" title="Abaixo do mínimo em algum local">⚠ </span>}
                      {quantidade(saldoTotal(p), p)}
                    </td>
                    {perm.estoque && (
                      <td className="num adm-pequeno">
                        {cm === undefined || cm === 0 ? <span className="mudo">—</span> : custoUnitario(cm, p)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota">Saldo somado de todos os locais. Clique no produto para ver o saldo por local, as embalagens e os mínimos.</p>

      {aberto && (
        <ProdutoModal
          key={aberto}
          produto={aberto === 'novo' ? null : produtoAberto}
          perm={perm}
          custo={produtoAberto ? custos?.get(produtoAberto.id) : undefined}
          aoCriar={(id) => setAberto(id)}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
}

// ================================================================ Modal do produto
function formDe(p: Produto | null): ProdutoForm {
  return {
    nome: p?.nome ?? '',
    codigo: p?.codigo ?? '',
    ean: p?.ean ?? '',
    categoria: p?.categoria ?? '',
    marca: p?.marca ?? '',
    usa_como_insumo: p?.usa_como_insumo ?? true,
    usa_como_venda: p?.usa_como_venda ?? false,
    unidade_base: p?.unidade_base ?? 'un',
    unidade_rotulo: p?.unidade_rotulo ?? '',
    preco_venda: p?.preco_venda ?? null,
    fornecedor_padrao_id: p?.fornecedor_padrao_id ?? null,
    ativo: p?.ativo ?? true,
  };
}

function ProdutoModal(props: {
  produto: Produto | null;
  perm: Perm;
  custo: number | undefined;
  aoCriar: (id: string) => void;
  aoFechar: () => void;
}) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const fornecedoresQ = useFornecedores(petshop.id, props.perm.estoque);
  const p = props.produto;
  const leitura = !props.perm.estoque;
  const [f, setF] = useState<ProdutoForm>(() => formDe(p));
  const [precoTxt, setPrecoTxt] = useState(escreverNumero(p?.preco_venda));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const muda = <K extends keyof ProdutoForm>(k: K, v: ProdutoForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const unitario = f.unidade_base === 'un';

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('Informe o nome do produto.');
    if (unitario && !f.unidade_rotulo.trim()) return setErro('Informe o nome da unidade, como o produto é contado na prateleira.');
    if (!f.usa_como_insumo && !f.usa_como_venda) return setErro('Marque se o produto é insumo, venda ou os dois.');
    const preco = lerNumero(precoTxt);
    if (precoTxt.trim() && (preco === null || preco < 0)) return setErro('Preço de venda inválido.');
    const ean = f.ean.replace(/\D/g, '');
    if (ean && (ean.length < 8 || ean.length > 14)) return setErro('O EAN deve ter de 8 a 14 dígitos.');
    setSalvando(true);
    try {
      const id = await salvarProduto(petshop.id, { ...f, preco_venda: preco }, p?.id);
      await qc.invalidateQueries({ queryKey: [petshop.id, 'produtos'] });
      if (!p) {
        avisar(`${f.nome.trim()} cadastrado. Inclua as embalagens, se houver.`);
        props.aoCriar(id);
      } else {
        avisar('Produto salvo.');
      }
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  const fornecedores = (fornecedoresQ.data ?? []).filter((x) => x.ativo || x.id === f.fornecedor_padrao_id);

  return (
    <Modal
      titulo={p ? p.nome : 'Novo produto'}
      aberto
      largo
      aoFechar={props.aoFechar}
      rodape={
        <>
          {p && props.perm.estoque && props.custo !== undefined && props.custo > 0 && (
            <span className="rodape-resumo mudo">Custo médio: <b>{custoUnitario(props.custo, p)}</b></span>
          )}
          <button className="btn" onClick={props.aoFechar}>Fechar</button>
          {!leitura && (
            <button className="btn primario" disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : p ? 'Salvar dados' : 'Cadastrar produto'}
            </button>
          )}
        </>
      }
    >
      <div className="adm-secoes">
        <section>
          <div className="linha-campos">
            <Campo rotulo="Nome">
              <input value={f.nome} onChange={(e) => muda('nome', e.target.value)} disabled={leitura} autoFocus={!p} />
            </Campo>
            <Campo rotulo="Marca (opcional)">
              <input value={f.marca} onChange={(e) => muda('marca', e.target.value)} disabled={leitura} />
            </Campo>
            <Campo rotulo="Categoria (opcional)">
              <input value={f.categoria} onChange={(e) => muda('categoria', e.target.value)} disabled={leitura} />
            </Campo>
          </div>

          <div className="adm-controle">
            <Campo rotulo="Como este produto é controlado?" dica={p ? 'O tipo de controle não muda depois do cadastro.' : undefined}>
              <div className="segmentado pequeno" role="group" aria-label="Tipo de controle">
                <button type="button" className={unitario ? 'ativo' : ''} disabled={!!p || leitura}
                        onClick={() => setF((x) => ({ ...x, unidade_base: 'un' }))}>Por unidade</button>
                <button type="button" className={!unitario ? 'ativo' : ''} disabled={!!p || leitura}
                        onClick={() => setF((x) => ({ ...x, unidade_base: x.unidade_base === 'un' ? 'ml' : x.unidade_base }))}>Por medida</button>
              </div>
            </Campo>
            {unitario ? (
              <Campo rotulo="Nome da unidade" dica="Como o produto é contado na prateleira. O estoque é sempre em unidades inteiras.">
                <input value={f.unidade_rotulo} onChange={(e) => muda('unidade_rotulo', e.target.value)} disabled={leitura} />
              </Campo>
            ) : (
              <Campo rotulo="Medida" dica="Para produto usado em quantidade medida.">
                <select value={f.unidade_base} disabled={!!p || leitura} onChange={(e) => muda('unidade_base', e.target.value as UnidadeBase)}>
                  {(Object.keys(MEDIDAS) as Exclude<UnidadeBase, 'un'>[]).map((u) => (
                    <option key={u} value={u}>{MEDIDAS[u].nome} ({MEDIDAS[u].sigla})</option>
                  ))}
                </select>
              </Campo>
            )}
          </div>

          <div className="linha-campos">
            <Campo rotulo="Uso">
              <div className="checks adm-checks">
                <label className="check"><input type="checkbox" checked={f.usa_como_insumo} disabled={leitura}
                  onChange={(e) => muda('usa_como_insumo', e.target.checked)} /> Insumo (salão)</label>
                <label className="check"><input type="checkbox" checked={f.usa_como_venda} disabled={leitura}
                  onChange={(e) => muda('usa_como_venda', e.target.checked)} /> Venda (prateleira)</label>
              </div>
            </Campo>
            {f.usa_como_venda && (
              <Campo rotulo="Preço de venda (opcional)" dica="Usado quando a Loja entrar">
                <input inputMode="decimal" value={precoTxt} onChange={(e) => setPrecoTxt(e.target.value)} disabled={leitura} placeholder="0,00" />
              </Campo>
            )}
          </div>
          <div className="linha-campos">
            <Campo rotulo="Código interno (opcional)">
              <input value={f.codigo} onChange={(e) => muda('codigo', e.target.value)} disabled={leitura} />
            </Campo>
            <Campo rotulo="EAN / código de barras (opcional)">
              <input inputMode="numeric" value={f.ean} onChange={(e) => muda('ean', e.target.value)} disabled={leitura} />
            </Campo>
            {props.perm.estoque && (
              <Campo rotulo="Fornecedor padrão (opcional)">
                <select value={f.fornecedor_padrao_id ?? ''} disabled={leitura}
                        onChange={(e) => muda('fornecedor_padrao_id', e.target.value || null)}>
                  <option value="">—</option>
                  {fornecedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </Campo>
            )}
          </div>
          {p && !leitura && (
            <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => muda('ativo', e.target.checked)} /> Produto ativo</label>
          )}
          {erro && <p className="erro-texto">{erro}</p>}
        </section>

        {p && <Embalagens produto={p} podeEditar={!leitura} />}
        {p && <SaldosLocais produto={p} podeEditar={!leitura} />}
      </div>
    </Modal>
  );
}

// ================================================================ Embalagens (ES-12)
function Embalagens({ produto, podeEditar }: { produto: Produto; podeEditar: boolean }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [rotulo, setRotulo] = useState('');
  const [fator, setFator] = useState<number | null>(null);
  const [compra, setCompra] = useState(true);
  const [requisicao, setRequisicao] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [versao, setVersao] = useState(0);   // limpa o campo de quantidade depois de incluir
  const unitario = produto.unidade_base === 'un';
  const embalagens = [...produto.produto_unidades].sort((a, b) => Number(b.eh_base) - Number(a.eh_base) || a.fator - b.fator);

  async function executar(acao: () => Promise<void>, mensagem?: string) {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
      await qc.invalidateQueries({ queryKey: [petshop.id, 'produtos'] });
      if (mensagem) avisar(mensagem);
      return true;
    } catch (e) {
      setErro(erroAdm(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function adicionar() {
    if (!rotulo.trim()) return setErro('Dê um nome à embalagem.');
    if (!fator || fator < 1 || !Number.isInteger(fator)) {
      return setErro(unitario
        ? `A embalagem tem de conter um número inteiro de ${nomeUnidade(produto)}, de 1 para cima.`
        : `A embalagem tem de fechar em ${produto.unidade_base} inteiros.`);
    }
    if (!compra && !requisicao) return setErro('Marque se a embalagem é usada na compra, na requisição ou nas duas.');
    const ok = await executar(() => criarEmbalagem(petshop.id, produto.id, { rotulo, fator, usa_compra: compra, usa_requisicao: requisicao }),
                              `Embalagem ${rotulo.trim()} incluída.`);
    if (ok) { setRotulo(''); setFator(null); setCompra(true); setRequisicao(true); setVersao((v) => v + 1); }
  }

  return (
    <section>
      <h3 className="adm-subtitulo">Embalagens</h3>
      <p className="nota">
        {unitario
          ? `A unidade de controle é ${nomeUnidade(produto)}. Cada embalagem contém um número inteiro dela e entra no estoque como essa quantidade de unidades.`
          : `O estoque é guardado em ${produto.unidade_base} e mostrado em ${MEDIDAS[produto.unidade_base].sigla}.`}
        {' '}Cada compra e requisição guarda a embalagem do momento: mudar aqui não altera o histórico.
      </p>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Embalagem</th><th className="num">Contém</th><th>Compra</th><th>Requisição</th><th></th></tr></thead>
          <tbody>
            {embalagens.map((e) => (
              <tr key={e.id} className={e.ativo ? '' : 'inativo'}>
                <td><b>{e.rotulo}</b>{e.eh_base && <span className="tag">unidade de controle</span>}{!e.ativo && <span className="tag">inativa</span>}</td>
                <td className="num">{e.eh_base ? '—' : quantidade(e.fator, produto)}</td>
                <td>
                  <input type="checkbox" checked={e.usa_compra} aria-label={`${e.rotulo} na compra`}
                         disabled={!podeEditar || ocupado || e.eh_base}
                         onChange={(x) => executar(() => alterarEmbalagem(e.id, { usa_compra: x.target.checked }))} />
                </td>
                <td>
                  <input type="checkbox" checked={e.usa_requisicao} aria-label={`${e.rotulo} na requisição`}
                         disabled={!podeEditar || ocupado || e.eh_base}
                         onChange={(x) => executar(() => alterarEmbalagem(e.id, { usa_requisicao: x.target.checked }))} />
                </td>
                <td className="acoes-celula">
                  {podeEditar && !e.eh_base && (
                    <>
                      <button className="btn-link" disabled={ocupado}
                              onClick={() => executar(() => alterarEmbalagem(e.id, { ativo: !e.ativo }), e.ativo ? 'Embalagem desativada.' : 'Embalagem reativada.')}>
                        {e.ativo ? 'desativar' : 'reativar'}
                      </button>
                      <button className="btn-link" disabled={ocupado}
                              onClick={() => executar(() => apagarEmbalagem(e.id), 'Embalagem apagada.')}>apagar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {podeEditar && (
        <div className="subform">
          <div className="linha-campos">
            <Campo rotulo="Nova embalagem">
              <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
            </Campo>
            <Campo rotulo="Contém">
              <QtdInput key={versao} produto={produto} valor={fator} aoMudar={setFator} rotulo="Quantidade da embalagem" />
            </Campo>
            <Campo rotulo="Usada na">
              <div className="checks adm-checks">
                <label className="check"><input type="checkbox" checked={compra} onChange={(e) => setCompra(e.target.checked)} /> compra</label>
                <label className="check"><input type="checkbox" checked={requisicao} onChange={(e) => setRequisicao(e.target.checked)} /> requisição</label>
              </div>
            </Campo>
          </div>
          <div className="acoes-linha">
            <button className="btn" disabled={ocupado} onClick={adicionar}>Incluir embalagem</button>
          </div>
        </div>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
      <p className="nota">Para mudar quanto uma embalagem contém, inclua uma nova e desative a antiga. Apagar só funciona se ela nunca foi usada.</p>
    </section>
  );
}

// ================================================================ Saldo e mínimo por local (ES-05, ES-13)
function SaldosLocais({ produto, podeEditar }: { produto: Produto; podeEditar: boolean }) {
  const { petshop } = usePetshop();
  const locaisQ = useLocais(petshop.id);
  const locais = (locaisQ.data ?? []).filter((l) => l.ativo || produto.estoque_saldos.some((s) => s.local_id === l.id && Number(s.quantidade) > 0));
  return (
    <section>
      <h3 className="adm-subtitulo">Saldo e mínimo por local</h3>
      <p className="nota">O mínimo não bloqueia nada: quando o saldo chega nele, o local aparece no aviso de reposição.</p>
      {locaisQ.isLoading ? <Carregando /> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Local</th><th className="num">Saldo</th><th>Mínimo</th></tr></thead>
            <tbody>
              {locais.map((l) => {
                const s = produto.estoque_saldos.find((x) => x.local_id === l.id);
                return <LinhaSaldo key={l.id} produto={produto} localId={l.id} localNome={l.nome}
                                   saldo={Number(s?.quantidade ?? 0)} minimo={s?.minimo ?? null} podeEditar={podeEditar} />;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LinhaSaldo(props: {
  produto: Produto; localId: string; localNome: string; saldo: number; minimo: number | null; podeEditar: boolean;
}) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const atual = props.minimo === null ? null : Number(props.minimo);
  const [valor, setValor] = useState<number | null>(atual);
  const [salvando, setSalvando] = useState(false);
  const mudou = valor !== atual;
  const valido = valor === null || (valor >= 0 && Number.isInteger(valor));
  const abaixo = atual !== null && props.saldo <= atual;

  async function salvar() {
    setSalvando(true);
    try {
      await definirMinimo(props.produto.id, props.localId, valor);
      await qc.invalidateQueries({ queryKey: [petshop.id, 'produtos'] });
      avisar(valor === null ? `Mínimo removido em ${props.localNome}.` : `Mínimo em ${props.localNome}: ${quantidade(valor, props.produto)}.`);
    } catch (e) {
      avisar(erroAdm(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <tr>
      <td>{props.localNome}</td>
      <td className="num">{abaixo && <span className="adm-alerta" title="Abaixo do mínimo">⚠ </span>}{quantidade(props.saldo, props.produto)}</td>
      <td>
        {props.podeEditar ? (
          <div className="input-com-botao adm-minimo">
            <QtdInput produto={props.produto} valor={valor} aoMudar={setValor} rotulo={`Mínimo em ${props.localNome}`} vazioPermitido />
            <button className="btn" disabled={!mudou || !valido || salvando} onClick={salvar}>{salvando ? '…' : 'Salvar'}</button>
          </div>
        ) : atual === null ? <span className="mudo">—</span> : quantidade(atual, props.produto)}
      </td>
    </tr>
  );
}

