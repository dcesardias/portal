import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, X, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { MaterialTasy, ContaContabil } from '@investimentos/shared';

/**
 * Autocomplete de material do Tasy (view dbo.vw_materiais_tasy). `searchPath`
 * permite reusar o mesmo componente com endpoints diferentes por perfil
 * (admin: /admin/itens/materiais-tasy · contabilidade: /contabilidade/materiais-tasy).
 */
export function MaterialTasyPicker({
  cd,
  ds,
  onPick,
  onClear,
  searchPath = '/admin/itens/materiais-tasy',
}: {
  cd: string;
  ds: string;
  onPick: (cd: string, ds: string) => void;
  onClear: () => void;
  searchPath?: string;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [], isFetching } = useQuery<MaterialTasy[]>({
    queryKey: ['materiais-tasy', searchPath, debounced],
    queryFn: () => api.get(searchPath, { params: { q: debounced } }).then((r) => r.data),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  return (
    <div>
      {cd ? (
        <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <Link2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-medium text-emerald-900 truncate" title={ds}>
              {ds || '(sem descrição)'}
            </div>
            <div className="text-xs text-emerald-700">Código Tasy: {cd}</div>
          </div>
          <button type="button" className="btn-ghost py-1 px-2 text-xs" onClick={onClear} title="Remover vínculo">
            <X className="w-3.5 h-3.5" /> Remover
          </button>
        </div>
      ) : (
        <div className="text-xs text-ink-muted mb-2">Nenhum material do Tasy vinculado.</div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          className="input pl-9"
          placeholder="Buscar material do Tasy por nome ou código…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
        />
        {aberto && debounced.length >= 2 && (
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-lg">
            {isFetching ? (
              <div className="px-3 py-2 text-sm text-ink-muted">Buscando…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-ink-muted">Nenhum material encontrado.</div>
            ) : (
              results.map((m) => (
                <button
                  type="button"
                  key={m.cdMaterial}
                  className="w-full text-left px-3 py-2 hover:bg-surface-alt border-b border-surface-border last:border-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(m.cdMaterial, m.dsMaterial);
                    setTerm('');
                    setAberto(false);
                  }}
                >
                  <div className="text-sm text-ink truncate">{m.dsMaterial}</div>
                  <div className="text-xs text-ink-muted">
                    Cód {m.cdMaterial}
                    {m.dsClasse ? ` · ${m.dsClasse}` : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="help">
        Vínculo com o material do Tasy (dbo.vw_materiais_tasy). Um mesmo material pode
        estar em mais de um item do catálogo.
      </div>
    </div>
  );
}

/**
 * Autocomplete de conta contábil (view dbo.VW_CONTA_CONTABIL_PESSOAL).
 */
export function ContaContabilPicker({
  cd,
  ds,
  onPick,
  onClear,
  searchPath = '/admin/itens/contas-contabeis',
}: {
  cd: string;
  ds: string;
  onPick: (cd: string, ds: string) => void;
  onClear: () => void;
  searchPath?: string;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [], isFetching } = useQuery<ContaContabil[]>({
    queryKey: ['contas-contabeis', searchPath, debounced],
    queryFn: () => api.get(searchPath, { params: { q: debounced } }).then((r) => r.data),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  return (
    <div>
      {cd ? (
        <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-sky-50 border border-sky-200">
          <Link2 className="w-4 h-4 text-sky-700 shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-medium text-sky-900 truncate" title={ds}>
              {ds || '(sem descrição)'}
            </div>
            <div className="text-xs text-sky-700">Conta: {cd}</div>
          </div>
          <button type="button" className="btn-ghost py-1 px-2 text-xs" onClick={onClear} title="Remover vínculo">
            <X className="w-3.5 h-3.5" /> Remover
          </button>
        </div>
      ) : (
        <div className="text-xs text-ink-muted mb-2">Nenhuma conta contábil vinculada.</div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          className="input pl-9"
          placeholder="Buscar conta contábil por código ou descrição…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
        />
        {aberto && debounced.length >= 2 && (
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-lg">
            {isFetching ? (
              <div className="px-3 py-2 text-sm text-ink-muted">Buscando…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-ink-muted">Nenhuma conta encontrada.</div>
            ) : (
              results.map((c) => (
                <button
                  type="button"
                  key={c.cdContaContabil}
                  className="w-full text-left px-3 py-2 hover:bg-surface-alt border-b border-surface-border last:border-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(c.cdContaContabil, c.dsContaContabil);
                    setTerm('');
                    setAberto(false);
                  }}
                >
                  <div className="text-sm text-ink truncate">{c.dsContaContabil}</div>
                  <div className="text-xs text-ink-muted">Cód {c.cdContaContabil}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="help">Fonte: view VW_CONTA_CONTABIL_PESSOAL.</div>
    </div>
  );
}
