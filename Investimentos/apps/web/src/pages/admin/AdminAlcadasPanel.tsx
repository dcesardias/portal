import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Shield, CheckSquare, Square, Repeat } from 'lucide-react';
import { api } from '../../lib/api';
import { useCatalog } from '../../hooks/useCatalog';
import { Empty } from '../../components/Empty';
import { cn } from '../../lib/utils';
import type { NivelAlcada } from '@investimentos/shared';

type RegraAlcadaRow = {
  id: string;
  estabelecimentoId: number;
  estabelecimentoNome: string;
  grupoId: number;
  grupoNome: string;
  nivel: NivelAlcada;
  usuarioLogin: string;
  usuarioNome: string | null;
  usuarioAtivo: boolean | null;
};

type AdminUsuarioLite = { id: string; login: string; nome: string; ativo: boolean };

const NIVEL_LABELS: Record<NivelAlcada, string> = {
  FOCAL: 'Focal',
  SUP: 'Supervisão',
  FINAL: 'Final',
};

function nivelBadgeClass(n: NivelAlcada): string {
  switch (n) {
    case 'FINAL':
      return 'bg-violet-100 text-violet-800';
    case 'SUP':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-brand-100 text-brand-800';
  }
}

export function AdminAlcadasPanel() {
  const qc = useQueryClient();
  const cat = useCatalog();
  const [filtroEstab, setFiltroEstab] = useState(0);
  const [filtroNivel, setFiltroNivel] = useState<'' | NivelAlcada>('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showSubstituir, setShowSubstituir] = useState(false);

  const [form, setForm] = useState({
    estabelecimentoIds: [] as number[],
    grupoIds: [] as number[],
    nivel: 'FOCAL' as NivelAlcada,
    usuarioLogin: '',
  });

  const [substituirForm, setSubstituirForm] = useState({
    origemLogin: '',
    destinoLogin: '',
    estabelecimentoId: 0,
  });

  const { data: usuarios = [] } = useQuery<AdminUsuarioLite[]>({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => api.get('/admin/usuarios').then((r) => r.data),
  });
  const usuariosAtivos = usuarios.filter((u) => u.ativo);

  const { data: regras = [], isLoading } = useQuery<RegraAlcadaRow[]>({
    queryKey: ['admin', 'alcadas', filtroEstab, filtroNivel],
    queryFn: () =>
      api
        .get('/admin/alcadas', {
          params: {
            estabelecimentoId: filtroEstab || undefined,
            nivel: filtroNivel || undefined,
          },
        })
        .then((r) => r.data),
  });

  const criarBulk = useMutation({
    mutationFn: () =>
      api
        .post('/admin/alcadas/bulk-matrix', {
          estabelecimentoIds: form.estabelecimentoIds,
          grupoIds: form.grupoIds,
          nivel: form.nivel,
          usuarioLogin: form.usuarioLogin,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'alcadas'] });
      setShowForm(false);
      setForm({ estabelecimentoIds: [], grupoIds: [], nivel: 'FOCAL', usuarioLogin: '' });
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/alcadas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'alcadas'] }),
  });

  // Só o aprovador é editável inline. Nível é fixo por regra (ver comentário no
  // schema compartilhado) — para mudar de nível, exclua a regra e crie outra
  // no formulário "Novas regras" com o nível correto.
  const editarInline = useMutation({
    mutationFn: (vars: { id: string; usuarioLogin: string }) =>
      api.put(`/admin/alcadas/${vars.id}`, { usuarioLogin: vars.usuarioLogin }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'alcadas'] }),
  });

  const substituir = useMutation({
    mutationFn: () =>
      api
        .post('/admin/alcadas/substituir-usuario', {
          origemLogin: substituirForm.origemLogin,
          destinoLogin: substituirForm.destinoLogin,
          estabelecimentoId: substituirForm.estabelecimentoId || undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'alcadas'] });
    },
  });

  function toggleEstab(id: number) {
    setForm((f) => ({
      ...f,
      estabelecimentoIds: f.estabelecimentoIds.includes(id)
        ? f.estabelecimentoIds.filter((e) => e !== id)
        : [...f.estabelecimentoIds, id],
    }));
  }

  function toggleTodosEstabs() {
    setForm((f) => ({
      ...f,
      estabelecimentoIds:
        f.estabelecimentoIds.length === cat.estabelecimentos.length
          ? []
          : cat.estabelecimentos.map((e) => e.id),
    }));
  }

  function toggleGrupo(id: number) {
    setForm((f) => ({
      ...f,
      grupoIds: f.grupoIds.includes(id) ? f.grupoIds.filter((g) => g !== id) : [...f.grupoIds, id],
    }));
  }

  function toggleTodosGrupos() {
    setForm((f) => ({
      ...f,
      grupoIds: f.grupoIds.length === cat.grupos.length ? [] : cat.grupos.map((g) => g.id),
    }));
  }

  const totalCombinacoes = form.estabelecimentoIds.length * form.grupoIds.length;
  const canSubmit =
    form.estabelecimentoIds.length > 0 && form.grupoIds.length > 0 && form.usuarioLogin.length > 0;

  const canSubstituir =
    substituirForm.origemLogin.length > 0 &&
    substituirForm.destinoLogin.length > 0 &&
    substituirForm.origemLogin !== substituirForm.destinoLogin;

  // Filtro por aprovador é aplicado no client (compõe com estabelecimento/nível).
  const regrasFiltradas = filtroUsuario
    ? regras.filter((r) => r.usuarioLogin === filtroUsuario)
    : regras;

  return (
    <>
      <div className="card mb-4">
        <div className="card-body flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="sm:max-w-xs w-full">
              <label className="label">Estabelecimento</label>
              <select
                className="input"
                value={filtroEstab}
                onChange={(e) => setFiltroEstab(Number(e.target.value))}
              >
                <option value={0}>Todos</option>
                {cat.estabelecimentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:max-w-xs w-full">
              <label className="label">Nível</label>
              <select
                className="input"
                value={filtroNivel}
                onChange={(e) => setFiltroNivel(e.target.value as '' | NivelAlcada)}
              >
                <option value="">Todos</option>
                <option value="FOCAL">Focal</option>
                <option value="SUP">Supervisão</option>
                <option value="FINAL">Final</option>
              </select>
            </div>
            <div className="sm:max-w-xs w-full">
              <label className="label">Aprovador</label>
              <select
                className="input"
                value={filtroUsuario}
                onChange={(e) => setFiltroUsuario(e.target.value)}
              >
                <option value="">Todos</option>
                {[...usuarios]
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map((u) => (
                    <option key={u.id} value={u.login}>
                      {u.nome} ({u.login})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-ghost"
              onClick={() => {
                setShowSubstituir((s) => !s);
                setShowForm(false);
              }}
            >
              <Repeat className="w-4 h-4" /> Substituir usuário
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setShowForm((s) => !s);
                setShowSubstituir(false);
              }}
            >
              <Plus className="w-4 h-4" /> {showForm ? 'Cancelar' : 'Novas regras'}
            </button>
          </div>
        </div>
      </div>

      {showSubstituir && (
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="font-semibold text-ink">Substituir usuário nas regras de alçada</h3>
          </div>
          <div className="card-body space-y-4">
            <p className="text-sm text-ink-soft">
              Reatribui em massa todas as regras de um aprovador (origem) para outro (destino) —
              útil quando um gestor entra no lugar de outro, sem precisar recriar cada regra.
              Combinações onde o destino já tem uma regra própria não são sobrescritas: ficam
              listadas como conflito para você decidir manualmente.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">De (usuário atual)</label>
                <select
                  className="input"
                  value={substituirForm.origemLogin}
                  onChange={(e) =>
                    setSubstituirForm((f) => ({ ...f, origemLogin: e.target.value }))
                  }
                >
                  <option value="">Selecione…</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.login}>
                      {u.nome} ({u.login})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Para (novo usuário)</label>
                <select
                  className="input"
                  value={substituirForm.destinoLogin}
                  onChange={(e) =>
                    setSubstituirForm((f) => ({ ...f, destinoLogin: e.target.value }))
                  }
                >
                  <option value="">Selecione…</option>
                  {usuariosAtivos.map((u) => (
                    <option key={u.id} value={u.login}>
                      {u.nome} ({u.login})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Restringir a um estabelecimento (opcional)</label>
                <select
                  className="input"
                  value={substituirForm.estabelecimentoId}
                  onChange={(e) =>
                    setSubstituirForm((f) => ({
                      ...f,
                      estabelecimentoId: Number(e.target.value),
                    }))
                  }
                >
                  <option value={0}>Todos os estabelecimentos</option>
                  {cat.estabelecimentos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {substituir.isError && (
              <div className="err">
                {(substituir.error as { response?: { data?: { message?: string } } })?.response
                  ?.data?.message ?? 'Erro ao substituir usuário'}
              </div>
            )}

            {substituir.data && (
              <div className="p-3 bg-surface-alt rounded-lg text-sm">
                <div className="text-ink">
                  <strong>{substituir.data.substituidas}</strong> regra(s) reatribuída(s).
                </div>
                {substituir.data.conflitos.length > 0 && (
                  <div className="mt-2">
                    <div className="text-amber-700 font-medium">
                      {substituir.data.conflitos.length} conflito(s) — o destino já tinha regra
                      própria, então não foi sobrescrita:
                    </div>
                    <ul className="list-disc list-inside text-ink-soft mt-1">
                      {substituir.data.conflitos.map(
                        (
                          c: { estabelecimentoId: number; grupoId: number; nivel: string },
                          i: number,
                        ) => (
                          <li key={i}>
                            {cat.estabelecimentos.find((e) => e.id === c.estabelecimentoId)?.nome ??
                              c.estabelecimentoId}{' '}
                            · {cat.grupos.find((g) => g.id === c.grupoId)?.nome ?? c.grupoId} ·{' '}
                            {NIVEL_LABELS[c.nivel as NivelAlcada] ?? c.nivel}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn-primary"
              disabled={!canSubstituir || substituir.isPending}
              onClick={() => substituir.mutate()}
            >
              <Repeat className="w-4 h-4" /> {substituir.isPending ? 'Substituindo…' : 'Substituir'}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="font-semibold text-ink">Novas regras de alçada (em lote)</h3>
          </div>
          <div className="card-body space-y-4">
            <p className="text-sm text-ink-soft">
              Defina quem aprova, em qual nível (Focal, Supervisão ou Final), para um ou mais
              estabelecimentos e um ou mais grupos de investimento — uma regra é criada para cada
              combinação (estabelecimento × grupo). Combinações já existentes são ignoradas.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Nível</label>
                <select
                  className="input"
                  value={form.nivel}
                  onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value as NivelAlcada }))}
                >
                  <option value="FOCAL">Focal</option>
                  <option value="SUP">Supervisão</option>
                  <option value="FINAL">Final</option>
                </select>
              </div>

              <div>
                <label className="label">Aprovador</label>
                <select
                  className="input"
                  value={form.usuarioLogin}
                  onChange={(e) => setForm((f) => ({ ...f, usuarioLogin: e.target.value }))}
                >
                  <option value="">Selecione…</option>
                  {usuariosAtivos.map((u) => (
                    <option key={u.id} value={u.login}>
                      {u.nome} ({u.login})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Estabelecimentos</label>
                <button
                  type="button"
                  className="text-xs text-brand-700 hover:underline flex items-center gap-1"
                  onClick={toggleTodosEstabs}
                >
                  {form.estabelecimentoIds.length === cat.estabelecimentos.length ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5" /> Desmarcar todos
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5" /> Selecionar todos
                    </>
                  )}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-surface-alt rounded-lg">
                {cat.estabelecimentos.map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-border bg-white cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.estabelecimentoIds.includes(e.id)}
                      onChange={() => toggleEstab(e.id)}
                    />
                    {e.nome}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Grupos de investimento</label>
                <button
                  type="button"
                  className="text-xs text-brand-700 hover:underline flex items-center gap-1"
                  onClick={toggleTodosGrupos}
                >
                  {form.grupoIds.length === cat.grupos.length ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5" /> Desmarcar todos
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5" /> Selecionar todos
                    </>
                  )}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-surface-alt rounded-lg">
                {cat.grupos.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-border bg-white cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.grupoIds.includes(g.id)}
                      onChange={() => toggleGrupo(g.id)}
                    />
                    {g.nome}
                  </label>
                ))}
              </div>
              <div className="help">
                {form.estabelecimentoIds.length} estabelecimento(s) × {form.grupoIds.length}{' '}
                grupo(s) = até {totalCombinacoes} regra(s) (combinações já existentes são
                ignoradas).
              </div>
            </div>

            {criarBulk.isError && (
              <div className="err">
                {(criarBulk.error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message ?? 'Erro ao criar regra'}
              </div>
            )}

            {criarBulk.data && (
              <div className="p-3 bg-surface-alt rounded-lg text-sm text-ink">
                {criarBulk.data.criadas} de {criarBulk.data.solicitadas} regra(s) criada(s) (as
                demais já existiam).
              </div>
            )}

            <button
              className="btn-primary"
              disabled={!canSubmit || criarBulk.isPending}
              onClick={() => criarBulk.mutate()}
            >
              <Plus className="w-4 h-4" />
              {criarBulk.isPending ? 'Criando…' : `Criar até ${totalCombinacoes} regra(s)`.trim()}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : regrasFiltradas.length === 0 ? (
        <Empty
          icon={Shield}
          title="Nenhuma regra de alçada encontrada"
          description="Ajuste os filtros ou cadastre uma nova regra de aprovação."
        />
      ) : (
        <div className="card">
          <p className="px-4 pt-3 text-xs text-ink-soft">
            O nível de cada regra é fixo (não é uma propriedade da pessoa, é a vaga estabelecimento
            × grupo × nível). Para trocar apenas quem aprova naquela vaga, edite o campo
            &quot;Aprovador&quot;. Para mudar de nível, exclua a regra e crie uma nova no nível
            correto em &quot;Novas regras&quot;.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head">Estabelecimento</th>
                  <th className="table-head">Grupo</th>
                  <th className="table-head">Nível</th>
                  <th className="table-head">Aprovador</th>
                  <th className="table-head text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {regrasFiltradas.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell">{r.estabelecimentoNome}</td>
                    <td className="table-cell">{r.grupoNome}</td>
                    <td className="table-cell">
                      <span
                        className={cn('badge border-0', nivelBadgeClass(r.nivel))}
                        title="Nível é fixo para essa regra. Para mudar, exclua e crie uma nova no nível correto."
                      >
                        {NIVEL_LABELS[r.nivel]}
                      </span>
                    </td>
                    <td className="table-cell">
                      <select
                        className="input py-1 text-sm max-w-[220px]"
                        value={r.usuarioLogin}
                        onChange={(e) =>
                          editarInline.mutate({ id: r.id, usuarioLogin: e.target.value })
                        }
                      >
                        {!usuarios.some((u) => u.login === r.usuarioLogin) && (
                          <option value={r.usuarioLogin}>
                            {r.usuarioLogin} (login não migrado)
                          </option>
                        )}
                        {usuarios.map((u) => (
                          <option key={u.id} value={u.login}>
                            {u.nome} ({u.login}){!u.ativo ? ' · inativo' : ''}
                          </option>
                        ))}
                      </select>
                      {r.usuarioAtivo === false && (
                        <div className="text-xs text-red-600 mt-0.5">usuário inativo</div>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <button
                        className="btn-ghost py-1 px-2 text-xs text-red-700"
                        onClick={() => {
                          if (
                            confirm(
                              `Remover a regra de alçada de ${r.usuarioLogin} para ${r.grupoNome}?`,
                            )
                          ) {
                            remover.mutate(r.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
