import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  KeyRound,
  Power,
  Pencil,
  Check,
  X,
  Copy,
  Users,
  Search,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../hooks/useMe';
import { cn } from '../../lib/utils';
import { Empty } from '../../components/Empty';
import type { PerfilNome } from '@investimentos/shared';

type AdminUsuario = {
  id: string;
  login: string;
  nome: string;
  email: string;
  ativo: boolean;
  mustChangePwd: boolean;
  dtCriacao: string;
  perfis: PerfilNome[];
};

const PERFIL_LABELS: Record<PerfilNome, string> = {
  SOLICITANTE: 'Solicitante',
  APROVADOR: 'Aprovador',
  APROVADOR_FINAL: 'Aprovador Final',
  ADMIN: 'Admin',
  VIEWER: 'Viewer',
  SUPRIMENTOS: 'Suprimentos',
  CONTABILIDADE: 'Contabilidade',
};

const TODOS_PERFIS: PerfilNome[] = [
  'SOLICITANTE',
  'APROVADOR',
  'APROVADOR_FINAL',
  'ADMIN',
  'VIEWER',
  'SUPRIMENTOS',
  'CONTABILIDADE',
];

function perfilBadgeClass(p: PerfilNome): string {
  switch (p) {
    case 'ADMIN':
      return 'bg-red-100 text-red-800';
    case 'APROVADOR_FINAL':
      return 'bg-violet-100 text-violet-800';
    case 'APROVADOR':
      return 'bg-amber-100 text-amber-800';
    case 'VIEWER':
      return 'bg-sky-100 text-sky-800';
    case 'SUPRIMENTOS':
      return 'bg-teal-100 text-teal-800';
    case 'CONTABILIDADE':
      return 'bg-indigo-100 text-indigo-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function NovaSenhaAlerta({ senha, onClose }: { senha: string; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="card mb-4 border-2 border-brand">
      <div className="card-body flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-ink">Senha temporária gerada</div>
          <p className="text-sm text-ink-soft mt-1">
            Repasse esta senha ao usuário. Ela não será exibida novamente e o usuário
            precisará trocá-la no primeiro acesso.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="px-3 py-1.5 bg-surface-alt rounded-lg text-sm font-mono">
              {senha}
            </code>
            <button
              className="btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(senha);
                setCopiado(true);
              }}
            >
              <Copy className="w-4 h-4" /> {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
        <button className="btn-ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function AdminUsuariosPanel() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [novaSenha, setNovaSenha] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editandoPerfis, setEditandoPerfis] = useState<string | null>(null);
  const [perfisEdit, setPerfisEdit] = useState<PerfilNome[]>([]);
  const [form, setForm] = useState({
    login: '',
    nome: '',
    email: '',
    perfis: ['SOLICITANTE'] as PerfilNome[],
  });

  // ── Filtros da lista ──────────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'ALL' | 'ativo' | 'inativo'>('ALL');
  const [filtroPerfil, setFiltroPerfil] = useState<PerfilNome | 'ALL'>('ALL');

  const { data: usuarios = [], isLoading } = useQuery<AdminUsuario[]>({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => api.get('/admin/usuarios').then((r) => r.data),
  });

  const usuariosFiltrados = usuarios
    .filter((u) =>
      filtroStatus === 'ALL' ? true : filtroStatus === 'ativo' ? u.ativo : !u.ativo,
    )
    .filter((u) => (filtroPerfil === 'ALL' ? true : u.perfis.includes(filtroPerfil)))
    .filter((u) => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      return (
        u.nome.toLowerCase().includes(q) ||
        u.login.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });

  const temFiltroAtivo = busca.trim() !== '' || filtroStatus !== 'ALL' || filtroPerfil !== 'ALL';

  function limparFiltros() {
    setBusca('');
    setFiltroStatus('ALL');
    setFiltroPerfil('ALL');
  }

  const criar = useMutation({
    mutationFn: () => api.post('/admin/usuarios', form).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] });
      setNovaSenha(data.tempPassword);
      setShowForm(false);
      setForm({ login: '', nome: '', email: '', perfis: ['SOLICITANTE'] });
    },
  });

  const salvarPerfis = useMutation({
    mutationFn: (id: string) =>
      api.put(`/admin/usuarios/${id}/perfis`, { perfis: perfisEdit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] });
      setEditandoPerfis(null);
    },
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      api.put(`/admin/usuarios/${id}/ativo`, { ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  });

  const resetarSenha = useMutation({
    mutationFn: (id: string) => api.post(`/admin/usuarios/${id}/resetar-senha`).then((r) => r.data),
    onSuccess: (data) => setNovaSenha(data.tempPassword),
  });

  function abrirEdicaoPerfis(u: AdminUsuario) {
    setEditandoPerfis(u.id);
    setPerfisEdit(u.perfis);
  }

  function togglePerfilForm(p: PerfilNome) {
    setForm((f) => ({
      ...f,
      perfis: f.perfis.includes(p) ? f.perfis.filter((x) => x !== p) : [...f.perfis, p],
    }));
  }

  function togglePerfilEdit(p: PerfilNome) {
    setPerfisEdit((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const canSubmit = form.login.trim().length >= 3 && form.nome.trim().length >= 2 && form.email.includes('@');

  return (
    <>
      {novaSenha && <NovaSenhaAlerta senha={novaSenha} onClose={() => setNovaSenha(null)} />}

      <div className="flex justify-end mb-4">
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          <UserPlus className="w-4 h-4" /> {showForm ? 'Cancelar' : 'Novo usuário'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="font-semibold text-ink">Novo usuário</h3>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Login</label>
                <input
                  className="input"
                  value={form.login}
                  onChange={(e) => setForm((f) => ({ ...f, login: e.target.value.trim() }))}
                  placeholder="ex: jsilva"
                />
              </div>
              <div>
                <label className="label">Nome completo</label>
                <input
                  className="input"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.trim() }))}
                  placeholder="usuario@aacd.org.br"
                />
              </div>
            </div>

            <div>
              <label className="label">Perfis</label>
              <div className="flex flex-wrap gap-3">
                {TODOS_PERFIS.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-border cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.perfis.includes(p)}
                      onChange={() => togglePerfilForm(p)}
                    />
                    {PERFIL_LABELS[p]}
                  </label>
                ))}
              </div>
              <div className="help">Uma senha temporária será gerada e exibida uma única vez.</div>
            </div>

            {criar.isError && (
              <div className="err">
                {(criar.error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message ?? 'Erro ao criar usuário'}
              </div>
            )}

            <button
              className="btn-primary"
              disabled={!canSubmit || criar.isPending}
              onClick={() => criar.mutate()}
            >
              <UserPlus className="w-4 h-4" /> {criar.isPending ? 'Criando…' : 'Criar usuário'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : usuarios.length === 0 ? (
        <Empty icon={Users} title="Nenhum usuário cadastrado" />
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-body flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  className="input pl-9"
                  placeholder="Buscar por nome, login ou e-mail…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <select
                className="input lg:max-w-[12rem]"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as 'ALL' | 'ativo' | 'inativo')}
                aria-label="Filtrar por status"
              >
                <option value="ALL">Todos os status</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
              <select
                className="input lg:max-w-[12rem]"
                value={filtroPerfil}
                onChange={(e) => setFiltroPerfil(e.target.value as PerfilNome | 'ALL')}
                aria-label="Filtrar por perfil"
              >
                <option value="ALL">Todos os perfis</option>
                {TODOS_PERFIS.map((p) => (
                  <option key={p} value={p}>
                    {PERFIL_LABELS[p]}
                  </option>
                ))}
              </select>
              {temFiltroAtivo && (
                <button className="btn-ghost" onClick={limparFiltros} title="Limpar filtros">
                  <X className="w-4 h-4" /> Limpar
                </button>
              )}
            </div>
          </div>

          {usuariosFiltrados.length === 0 ? (
            <Empty
              icon={Users}
              title="Nenhum usuário encontrado"
              description="Ajuste a busca ou os filtros para ver mais resultados."
            />
          ) : (
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-ink">
                  {usuariosFiltrados.length}
                  {usuariosFiltrados.length === 1 ? ' usuário' : ' usuários'}
                  {temFiltroAtivo && ` de ${usuarios.length}`}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-border">
                      <th className="table-head">Nome</th>
                      <th className="table-head">Login</th>
                      <th className="table-head">E-mail</th>
                      <th className="table-head">Perfis</th>
                      <th className="table-head">Status</th>
                      <th className="table-head text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosFiltrados.map((u) => {
                  const isSelf = u.id === me?.id;
                  const editing = editandoPerfis === u.id;
                  return (
                    <tr key={u.id} className="table-row align-top">
                      <td className="table-cell font-medium">
                        {u.nome} {isSelf && <span className="text-xs text-ink-muted">(você)</span>}
                      </td>
                      <td className="table-cell text-ink-soft">{u.login}</td>
                      <td className="table-cell text-ink-soft">{u.email}</td>
                      <td className="table-cell">
                        {editing ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              {TODOS_PERFIS.map((p) => (
                                <label key={p} className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={perfisEdit.includes(p)}
                                    onChange={() => togglePerfilEdit(p)}
                                  />
                                  {PERFIL_LABELS[p]}
                                </label>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="btn-primary py-1 px-2 text-xs"
                                disabled={salvarPerfis.isPending}
                                onClick={() => salvarPerfis.mutate(u.id)}
                              >
                                <Check className="w-3.5 h-3.5" /> Salvar
                              </button>
                              <button
                                className="btn-ghost py-1 px-2 text-xs"
                                onClick={() => setEditandoPerfis(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                            {salvarPerfis.isError && (
                              <div className="err">
                                {(salvarPerfis.error as { response?: { data?: { message?: string } } })
                                  ?.response?.data?.message ?? 'Erro ao salvar perfis'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.perfis.length === 0 ? (
                              <span className="text-ink-muted text-xs">nenhum</span>
                            ) : (
                              u.perfis.map((p) => (
                                <span key={p} className={cn('badge', perfilBadgeClass(p))}>
                                  {PERFIL_LABELS[p]}
                                </span>
                              ))
                            )}
                          </div>
                        )}
                      </td>
                      <td className="table-cell">
                        <span
                          className={cn(
                            'badge',
                            u.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                        {u.mustChangePwd && (
                          <div className="text-xs text-ink-muted mt-1">Troca de senha pendente</div>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {!editing && (
                            <button
                              className="btn-ghost py-1 px-2 text-xs"
                              title="Editar perfis"
                              onClick={() => abrirEdicaoPerfis(u)}
                            >
                              <Pencil className="w-3.5 h-3.5" /> Perfis
                            </button>
                          )}
                          <button
                            className="btn-ghost py-1 px-2 text-xs"
                            title="Gerar nova senha temporária"
                            disabled={resetarSenha.isPending}
                            onClick={() => {
                              if (confirm(`Gerar nova senha temporária para ${u.login}?`)) {
                                resetarSenha.mutate(u.id);
                              }
                            }}
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Resetar senha
                          </button>
                          <button
                            className="btn-ghost py-1 px-2 text-xs"
                            title={isSelf ? 'Não é possível desativar seu próprio usuário' : undefined}
                            disabled={isSelf || toggleAtivo.isPending}
                            onClick={() => {
                              const acao = u.ativo ? 'desativar' : 'ativar';
                              if (confirm(`Deseja ${acao} o usuário ${u.login}?`)) {
                                toggleAtivo.mutate({ id: u.id, ativo: !u.ativo });
                              }
                            }}
                          >
                            <Power className="w-3.5 h-3.5" /> {u.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
