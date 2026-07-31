import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Workflow,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Sparkles,
  GripVertical,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Empty } from '../../components/Empty';
import { useCatalog } from '../../hooks/useCatalog';
import { formatBRL } from '../../lib/utils';
import type { FonteAprovador, PerfilNome } from '@investimentos/shared';

type Etapa = {
  id?: string;
  ordem?: number;
  nome: string;
  fonteAprovador: FonteAprovador;
  perfilAlvo: PerfilNome | null;
  usuarioAlvoId: string | null;
  obrigatoria: boolean;
  permiteRevisao: boolean;
  aprovacaoParalela: boolean;
};

type Fluxo = { id: string; nome: string; descricao: string | null; ativo: boolean; etapas: Etapa[] };
type Regra = {
  id: string;
  prioridade: number;
  estabelecimentoId: number | null;
  estabelecimentoNome: string | null;
  grupoId: number | null;
  grupoNome: string | null;
  tipoVerba: 'RP' | 'VP' | null;
  valorMin: number | null;
  valorMax: number | null;
  isDefault: boolean;
  fluxoId: string;
  nome: string;
  etapas: Etapa[];
};
type UsuarioLite = { id: string; login: string; nome: string; ativo: boolean };

const FONTES: { key: FonteAprovador; label: string; hint: string }[] = [
  { key: 'ALCADA_FOCAL', label: 'Alçada · Focal', hint: 'Aprovador Focal da tabela de alçadas (estab.×grupo)' },
  { key: 'ALCADA_SUP', label: 'Alçada · Supervisão', hint: 'Aprovador Supervisor da tabela de alçadas' },
  { key: 'ALCADA_FINAL', label: 'Alçada · Final', hint: 'Aprovador Final / GPE da tabela de alçadas' },
  { key: 'PERFIL', label: 'Perfil', hint: 'Qualquer usuário que tenha o perfil escolhido' },
  { key: 'USUARIO', label: 'Usuário específico', hint: 'Uma pessoa fixa, escolhida na lista' },
];
const FONTE_LABEL = (f: FonteAprovador) => FONTES.find((x) => x.key === f)?.label ?? f;
const PERFIS_ETAPA: PerfilNome[] = ['APROVADOR', 'APROVADOR_FINAL', 'ADMIN'];

function novaEtapa(): Etapa {
  return {
    nome: '',
    fonteAprovador: 'ALCADA_FOCAL',
    perfilAlvo: null,
    usuarioAlvoId: null,
    obrigatoria: true,
    permiteRevisao: true,
    aprovacaoParalela: false,
  };
}

export function AdminFluxosPanel() {
  const qc = useQueryClient();

  const { data: fluxos = [] } = useQuery<Fluxo[]>({
    queryKey: ['admin', 'fluxos', 'disponiveis'],
    queryFn: () => api.get('/admin/fluxos/fluxos-disponiveis').then((r) => r.data),
  });
  const { data: regras = [] } = useQuery<Regra[]>({
    queryKey: ['admin', 'fluxos'],
    queryFn: () => api.get('/admin/fluxos').then((r) => r.data),
  });
  const { data: usuarios = [] } = useQuery<UsuarioLite[]>({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => api.get('/admin/usuarios').then((r) => r.data),
  });

  return (
    <div className="space-y-8">
      <FluxosBuilder fluxos={fluxos} usuarios={usuarios} onChange={() => qc.invalidateQueries()} />
      <RegrasSelecao regras={regras} fluxos={fluxos} />
    </div>
  );
}

/* ──────────────────────────── Montador de fluxos ─────────────────────────── */

function FluxosBuilder({
  fluxos,
  usuarios,
  onChange,
}: {
  fluxos: Fluxo[];
  usuarios: UsuarioLite[];
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null | 'novo'>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [etapas, setEtapas] = useState<Etapa[]>([novaEtapa()]);
  const [erro, setErro] = useState<string | null>(null);

  const usuariosAtivos = usuarios.filter((u) => u.ativo);

  function abrirNovo() {
    setEditId('novo');
    setNome('');
    setDescricao('');
    setEtapas([novaEtapa()]);
    setErro(null);
  }
  function abrirEdicao(f: Fluxo) {
    setEditId(f.id);
    setNome(f.nome);
    setDescricao(f.descricao ?? '');
    setEtapas(
      f.etapas.length
        ? f.etapas.map((e) => ({
            nome: e.nome,
            fonteAprovador: e.fonteAprovador,
            perfilAlvo: e.perfilAlvo,
            usuarioAlvoId: e.usuarioAlvoId,
            obrigatoria: e.obrigatoria,
            permiteRevisao: e.permiteRevisao,
            aprovacaoParalela: e.aprovacaoParalela,
          }))
        : [novaEtapa()],
    );
    setErro(null);
  }
  function fechar() {
    setEditId(null);
    setErro(null);
  }

  const salvar = useMutation({
    mutationFn: () => {
      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        etapas: etapas.map((e) => ({
          nome: e.nome.trim(),
          fonteAprovador: e.fonteAprovador,
          perfilAlvo: e.fonteAprovador === 'PERFIL' ? e.perfilAlvo : null,
          usuarioAlvoId: e.fonteAprovador === 'USUARIO' ? e.usuarioAlvoId : null,
          obrigatoria: e.obrigatoria,
          permiteRevisao: e.permiteRevisao,
          aprovacaoParalela: e.aprovacaoParalela,
        })),
      };
      return editId === 'novo'
        ? api.post('/admin/fluxos/fluxos', payload)
        : api.put(`/admin/fluxos/fluxos/${editId}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'fluxos'] });
      onChange();
      fechar();
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setErro(e?.response?.data?.message ?? 'Erro ao salvar fluxo'),
  });

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/fluxos/fluxos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'fluxos'] });
      onChange();
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      alert(e?.response?.data?.message ?? 'Erro ao remover fluxo'),
  });

  function updateEtapa(i: number, patch: Partial<Etapa>) {
    setEtapas((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function moverEtapa(i: number, dir: -1 | 1) {
    setEtapas((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  const podeSalvar =
    nome.trim().length > 0 &&
    etapas.length > 0 &&
    etapas.every(
      (e) =>
        e.nome.trim().length > 0 &&
        (e.fonteAprovador !== 'PERFIL' || !!e.perfilAlvo) &&
        (e.fonteAprovador !== 'USUARIO' || !!e.usuarioAlvoId),
    );

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-ink text-lg">Fluxos de aprovação</h3>
          <p className="text-sm text-ink-soft">
            Um fluxo é a sequência de etapas de aprovação. Monte as etapas e depois use uma regra
            (abaixo) para dizer <em>quando</em> cada fluxo se aplica.
          </p>
        </div>
        {editId === null && (
          <button className="btn-primary" onClick={abrirNovo}>
            <Plus className="w-4 h-4" /> Novo fluxo
          </button>
        )}
      </div>

      {editId !== null && (
        <div className="card mb-4 border-2 border-brand-200">
          <div className="card-header flex items-center justify-between">
            <h4 className="font-semibold text-ink">
              {editId === 'novo' ? 'Novo fluxo' : 'Editar fluxo'}
            </h4>
            <button className="btn-ghost py-1 px-2" onClick={fechar}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="card-body space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Nome do fluxo *</label>
                <input
                  className="input"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: 3 Níveis, GPE Direto…"
                />
              </div>
              <div>
                <label className="label">Descrição</label>
                <input
                  className="input"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            {/* Etapas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Etapas (na ordem de aprovação)</label>
                <button
                  className="text-xs text-brand-700 hover:underline flex items-center gap-1"
                  onClick={() => setEtapas((p) => [...p, novaEtapa()])}
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar etapa
                </button>
              </div>

              <div className="space-y-3">
                {etapas.map((e, i) => (
                  <div key={i} className="rounded-xl border border-surface-border bg-surface-alt p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center pt-1.5 text-ink-muted">
                        <GripVertical className="w-4 h-4" />
                        <span className="text-xs font-semibold">{i + 1}</span>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Nome da etapa</label>
                          <input
                            className="input"
                            value={e.nome}
                            onChange={(ev) => updateEtapa(i, { nome: ev.target.value })}
                            placeholder="Ex.: Aprovação Focal"
                          />
                        </div>
                        <div>
                          <label className="label">Quem aprova</label>
                          <select
                            className="input"
                            value={e.fonteAprovador}
                            onChange={(ev) =>
                              updateEtapa(i, {
                                fonteAprovador: ev.target.value as FonteAprovador,
                                perfilAlvo: null,
                                usuarioAlvoId: null,
                              })
                            }
                          >
                            {FONTES.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                          <div className="help">
                            {FONTES.find((f) => f.key === e.fonteAprovador)?.hint}
                          </div>
                        </div>

                        {e.fonteAprovador === 'PERFIL' && (
                          <div>
                            <label className="label">Perfil</label>
                            <select
                              className="input"
                              value={e.perfilAlvo ?? ''}
                              onChange={(ev) =>
                                updateEtapa(i, { perfilAlvo: ev.target.value as PerfilNome })
                              }
                            >
                              <option value="">Selecione…</option>
                              {PERFIS_ETAPA.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {e.fonteAprovador === 'USUARIO' && (
                          <div>
                            <label className="label">Usuário</label>
                            <select
                              className="input"
                              value={e.usuarioAlvoId ?? ''}
                              onChange={(ev) => updateEtapa(i, { usuarioAlvoId: ev.target.value })}
                            >
                              <option value="">Selecione…</option>
                              {usuariosAtivos.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nome} ({u.login})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="sm:col-span-2 flex flex-wrap gap-4 pt-1">
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={e.obrigatoria}
                              onChange={(ev) => updateEtapa(i, { obrigatoria: ev.target.checked })}
                            />
                            Obrigatória
                          </label>
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={e.permiteRevisao}
                              onChange={(ev) => updateEtapa(i, { permiteRevisao: ev.target.checked })}
                            />
                            Permite devolver p/ revisão
                          </label>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          className="btn-ghost py-1 px-1.5"
                          disabled={i === 0}
                          onClick={() => moverEtapa(i, -1)}
                          title="Mover para cima"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="btn-ghost py-1 px-1.5"
                          disabled={i === etapas.length - 1}
                          onClick={() => moverEtapa(i, 1)}
                          title="Mover para baixo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        {etapas.length > 1 && (
                          <button
                            className="btn-ghost py-1 px-1.5 text-red-600"
                            onClick={() => setEtapas((p) => p.filter((_, idx) => idx !== i))}
                            title="Remover etapa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {erro && <div className="err">{erro}</div>}

            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={!podeSalvar || salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                {salvar.isPending ? 'Salvando…' : 'Salvar fluxo'}
              </button>
              <button className="btn-ghost" onClick={fechar}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {fluxos.length === 0 && editId === null ? (
        <Empty icon={Workflow} title="Nenhum fluxo cadastrado" description="Crie o primeiro fluxo." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fluxos.map((f) => (
            <div key={f.id} className="card">
              <div className="card-body">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ink flex items-center gap-2">
                      <Workflow className="w-4 h-4 text-brand" /> {f.nome}
                    </div>
                    {f.descricao && <div className="text-xs text-ink-soft mt-0.5">{f.descricao}</div>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="btn-ghost py-1 px-2 text-xs" onClick={() => abrirEdicao(f)}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-ghost py-1 px-2 text-xs text-red-700"
                      onClick={() => {
                        if (confirm(`Remover o fluxo "${f.nome}"?`)) remover.mutate(f.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  {f.etapas.map((et, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="badge bg-brand-50 text-brand-800 border-0">
                        {et.nome} · {FONTE_LABEL(et.fonteAprovador)}
                      </span>
                      {i < f.etapas.length - 1 && <ArrowRight className="w-3 h-3 text-ink-muted" />}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────── Regras de seleção + simulador ───────────────────── */

const emptyRegra = {
  id: null as string | null,
  fluxoId: '',
  prioridade: 10,
  estabelecimentoId: 0,
  grupoId: 0,
  tipoVerba: '' as '' | 'RP' | 'VP',
  vlMin: '' as number | '',
  vlMax: '' as number | '',
  isDefault: false,
};

function RegrasSelecao({ regras, fluxos }: { regras: Regra[]; fluxos: Fluxo[] }) {
  const qc = useQueryClient();
  const cat = useCatalog();
  const [form, setForm] = useState(emptyRegra);
  const [showForm, setShowForm] = useState(false);

  const salvar = useMutation({
    mutationFn: () => {
      const payload = {
        fluxoId: form.fluxoId,
        prioridade: form.prioridade,
        estabelecimentoId: form.estabelecimentoId || null,
        grupoId: form.grupoId || null,
        tipoVerba: form.tipoVerba || null,
        vlMin: form.vlMin === '' ? null : Number(form.vlMin),
        vlMax: form.vlMax === '' ? null : Number(form.vlMax),
        isDefault: form.isDefault,
      };
      return form.id
        ? api.put(`/admin/fluxos/${form.id}`, payload)
        : api.post('/admin/fluxos', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'fluxos'] });
      setShowForm(false);
      setForm(emptyRegra);
    },
  });
  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/fluxos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'fluxos'] }),
  });

  const [sim, setSim] = useState({ estabelecimentoId: 0, grupoId: 0, tipoVerba: '' as '' | 'RP' | 'VP', valor: 20000 });
  const simular = useMutation<{ regra: Regra; alternativas: Regra[] }>({
    mutationFn: () =>
      api
        .post('/admin/fluxos/simular', {
          estabelecimentoId: sim.estabelecimentoId || undefined,
          grupoId: sim.grupoId || undefined,
          tipoVerba: sim.tipoVerba || undefined,
          valor: sim.valor,
        })
        .then((r) => r.data),
  });

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-ink text-lg">Regras de seleção</h3>
            <p className="text-sm text-ink-soft">
              Dizem qual fluxo usar conforme o contexto. Maior prioridade vence; sem match, usa a
              regra <strong>default</strong>.
            </p>
          </div>
          <button
            className="btn-primary py-1.5 px-3 text-sm"
            onClick={() => {
              setForm(emptyRegra);
              setShowForm((s) => !s);
            }}
          >
            <Plus className="w-4 h-4" /> Nova regra
          </button>
        </div>

        {showForm && (
          <div className="card border-2 border-brand-200">
            <div className="card-body space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Fluxo *</label>
                  <select
                    className="input"
                    value={form.fluxoId}
                    onChange={(e) => setForm((f) => ({ ...f, fluxoId: e.target.value }))}
                  >
                    <option value="">Selecione…</option>
                    {fluxos.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome} ({f.etapas.length} etapas)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Prioridade</label>
                  <input
                    type="number"
                    className="input"
                    value={form.prioridade}
                    onChange={(e) => setForm((f) => ({ ...f, prioridade: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="label">Estabelecimento</label>
                  <select
                    className="input"
                    value={form.estabelecimentoId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, estabelecimentoId: Number(e.target.value) }))
                    }
                  >
                    <option value={0}>Qualquer</option>
                    {cat.estabelecimentos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Grupo</label>
                  <select
                    className="input"
                    value={form.grupoId}
                    onChange={(e) => setForm((f) => ({ ...f, grupoId: Number(e.target.value) }))}
                  >
                    <option value={0}>Qualquer</option>
                    {cat.grupos.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Valor mínimo</label>
                  <input
                    type="number"
                    className="input"
                    value={form.vlMin}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vlMin: e.target.value === '' ? '' : Number(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className="label">Valor máximo</label>
                  <input
                    type="number"
                    className="input"
                    value={form.vlMax}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vlMax: e.target.value === '' ? '' : Number(e.target.value) }))
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  />
                  Regra default (fallback quando nenhuma outra casar)
                </label>
              </div>
              {salvar.isError && (
                <div className="err">
                  {(salvar.error as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Erro ao salvar regra'}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  disabled={!form.fluxoId || salvar.isPending}
                  onClick={() => salvar.mutate()}
                >
                  {salvar.isPending ? 'Salvando…' : form.id ? 'Salvar' : 'Criar regra'}
                </button>
                <button className="btn-ghost" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {regras.length === 0 && !showForm ? (
          <Empty icon={Workflow} title="Nenhuma regra de seleção" description="Crie uma regra." />
        ) : (
          regras
            .slice()
            .sort((a, b) => b.prioridade - a.prioridade)
            .map((r) => (
              <div key={r.id} className="card">
                <div className="card-body flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink">{r.nome}</span>
                      {r.isDefault && <span className="badge bg-slate-100 text-slate-600">default</span>}
                      <span className="badge bg-brand-100 text-brand-800">prio {r.prioridade}</span>
                    </div>
                    <div className="text-xs text-ink-soft mt-1 flex gap-3 flex-wrap">
                      <span>Estab.: {r.estabelecimentoNome ?? 'qualquer'}</span>
                      <span>Grupo: {r.grupoNome ?? 'qualquer'}</span>
                      {r.tipoVerba && <span>Verba: {r.tipoVerba}</span>}
                      {r.valorMin != null && <span>Mín: {formatBRL(r.valorMin)}</span>}
                      {r.valorMax != null && <span>Máx: {formatBRL(r.valorMax)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="btn-ghost py-1 px-2 text-xs"
                      onClick={() => {
                        setForm({
                          id: r.id,
                          fluxoId: r.fluxoId,
                          prioridade: r.prioridade,
                          estabelecimentoId: r.estabelecimentoId ?? 0,
                          grupoId: r.grupoId ?? 0,
                          tipoVerba: r.tipoVerba ?? '',
                          vlMin: r.valorMin ?? '',
                          vlMax: r.valorMax ?? '',
                          isDefault: r.isDefault,
                        });
                        setShowForm(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-ghost py-1 px-2 text-xs text-red-700"
                      onClick={() => {
                        if (confirm(`Remover a regra "${r.nome}" (prio ${r.prioridade})?`))
                          remover.mutate(r.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>

      {/* Simulador */}
      <div>
        <div className="card sticky top-20">
          <div className="card-header flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand" />
            <h3 className="font-semibold text-ink">Simulador</h3>
          </div>
          <div className="card-body space-y-3">
            <p className="text-sm text-ink-soft">Veja qual fluxo se aplica a um contexto.</p>
            <div>
              <label className="label">Estabelecimento</label>
              <select
                className="input"
                value={sim.estabelecimentoId || ''}
                onChange={(e) => setSim((s) => ({ ...s, estabelecimentoId: Number(e.target.value) }))}
              >
                <option value="">Qualquer</option>
                {cat.estabelecimentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Grupo</label>
              <select
                className="input"
                value={sim.grupoId || ''}
                onChange={(e) => setSim((s) => ({ ...s, grupoId: Number(e.target.value) }))}
              >
                <option value="">Qualquer</option>
                {cat.grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Valor</label>
              <input
                type="number"
                min="0"
                className="input"
                value={sim.valor}
                onChange={(e) => setSim((s) => ({ ...s, valor: Number(e.target.value) }))}
              />
            </div>
            <button className="btn-primary w-full" onClick={() => simular.mutate()} disabled={simular.isPending}>
              <Sparkles className="w-4 h-4" /> {simular.isPending ? 'Simulando…' : 'Simular'}
            </button>
            {simular.isError && (
              <div className="err">
                {(simular.error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message ?? 'Nenhuma regra casa'}
              </div>
            )}
            {simular.data && (
              <div className="pt-3 border-t border-surface-border">
                <div className="text-xs uppercase tracking-wide text-ink-soft mb-1">Fluxo aplicado</div>
                <div className="p-3 bg-brand-50 border-2 border-brand rounded-lg">
                  <div className="font-medium text-ink">{simular.data.regra.nome}</div>
                  <div className="text-xs text-ink-soft mt-1">
                    {simular.data.regra.etapas.map((e) => e.nome).join(' → ')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
