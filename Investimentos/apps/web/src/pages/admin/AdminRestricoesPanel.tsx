import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Trash2, ShieldOff } from 'lucide-react';
import { api } from '../../lib/api';
import { useCatalog } from '../../hooks/useCatalog';
import { Empty } from '../../components/Empty';
import { SearchableSelect } from '../../components/SearchableSelect';
import { formatCentroCusto } from '../../lib/utils';

type Restricao = {
  id: string;
  userId: string;
  usuarioLogin: string;
  usuarioNome: string;
  centroCustoCodigo: string | null;
  centroCustoDescricao: string | null;
  contaContabil: string | null;
  criadoEm: string;
};
type UsuarioLite = { id: string; login: string; nome: string; ativo: boolean };

export function AdminRestricoesPanel() {
  const qc = useQueryClient();
  const cat = useCatalog();
  const [userId, setUserId] = useState('');
  const [centroCustoCodigo, setCentroCustoCodigo] = useState('');
  const [contaContabil, setContaContabil] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const { data: usuarios = [] } = useQuery<UsuarioLite[]>({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => api.get('/admin/usuarios').then((r) => r.data),
  });
  const { data: restricoes = [], isLoading } = useQuery<Restricao[]>({
    queryKey: ['admin', 'restricoes'],
    queryFn: () => api.get('/admin/restricoes').then((r) => r.data),
  });

  // Contas contábeis disponíveis a partir dos grupos (cada grupo tem uma conta).
  const contas = useMemo(() => {
    const set = new Map<string, string>();
    cat.grupos.forEach((g) => {
      if (g.contaContabil) set.set(g.contaContabil, `${g.contaContabil} · ${g.nome}`);
    });
    return [...set.entries()].map(([codigo, label]) => ({ codigo, label }));
  }, [cat.grupos]);

  const criar = useMutation({
    mutationFn: () =>
      api.post('/admin/restricoes', {
        userId,
        centroCustoCodigo: centroCustoCodigo || null,
        contaContabil: contaContabil || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'restricoes'] });
      setCentroCustoCodigo('');
      setContaContabil('');
      setErro(null);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setErro(e?.response?.data?.message ?? 'Erro ao criar restrição'),
  });
  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/restricoes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'restricoes'] }),
  });

  const podeCriar = !!userId && (!!centroCustoCodigo || !!contaContabil);

  // Agrupa restrições por usuário para leitura.
  const porUsuario = useMemo(() => {
    const map = new Map<string, Restricao[]>();
    restricoes.forEach((r) => {
      const arr = map.get(r.userId) ?? [];
      arr.push(r);
      map.set(r.userId, arr);
    });
    return [...map.entries()];
  }, [restricoes]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-50 border border-brand-100">
        <ShieldOff className="w-5 h-5 text-brand-700 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-ink">
          Por padrão <strong>todo solicitante pode pedir em qualquer centro de custo e conta</strong>.
          Adicione uma restrição abaixo apenas para limitar um usuário a centros de custo e/ou contas
          específicas — a partir daí ele só conseguirá abrir solicitações que casem com o que estiver
          listado para ele.
        </p>
      </div>

      {/* Formulário de nova restrição */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold text-ink">Nova restrição</h3>
        </div>
        <div className="card-body space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Usuário *</label>
              <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Selecione…</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.login})
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="label">Centro de custo</label>
              <SearchableSelect
                value={centroCustoCodigo || null}
                options={cat.centros.map((c) => ({
                  id: c.codigo,
                  label: formatCentroCusto(c.codigo, c.descricao),
                }))}
                onChange={(v) => setCentroCustoCodigo(v ? String(v) : '')}
                placeholder="Qualquer centro (opcional)"
                emptyText="Nenhum centro"
              />
            </div>
            <div>
              <label className="label">Conta contábil</label>
              <select
                className="input"
                value={contaContabil}
                onChange={(e) => setContaContabil(e.target.value)}
              >
                <option value="">— qualquer —</option>
                {contas.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="help">Informe centro de custo e/ou conta contábil (ao menos um).</div>
          {erro && <div className="err">{erro}</div>}
          <button className="btn-primary" disabled={!podeCriar || criar.isPending} onClick={() => criar.mutate()}>
            <Plus className="w-4 h-4" /> {criar.isPending ? 'Adicionando…' : 'Adicionar restrição'}
          </button>
        </div>
      </div>

      {/* Lista agrupada por usuário */}
      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : porUsuario.length === 0 ? (
        <Empty
          icon={Lock}
          title="Nenhuma restrição cadastrada"
          description="Todos os solicitantes estão liberados para qualquer centro de custo/conta."
        />
      ) : (
        <div className="space-y-3">
          {porUsuario.map(([uid, lista]) => (
            <div key={uid} className="card">
              <div className="card-body">
                <div className="font-medium text-ink mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-brand" /> {lista[0].usuarioNome}{' '}
                  <span className="text-ink-soft font-normal">({lista[0].usuarioLogin})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lista.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-lg bg-surface-alt border border-surface-border text-sm"
                    >
                      <span className="text-ink">
                        {r.centroCustoCodigo
                          ? `CC ${r.centroCustoCodigo}${r.centroCustoDescricao ? ` · ${r.centroCustoDescricao}` : ''}`
                          : 'qualquer CC'}
                        {' · '}
                        {r.contaContabil ? `conta ${r.contaContabil}` : 'qualquer conta'}
                      </span>
                      <button
                        className="p-1 rounded hover:bg-red-50 text-red-600"
                        onClick={() => remover.mutate(r.id)}
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
