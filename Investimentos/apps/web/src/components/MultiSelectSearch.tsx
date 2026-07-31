import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import type { OptId, Opt } from './SearchableSelect';

/**
 * Multisseleção com busca — mesmo visual do SearchableSelect, mas permite marcar
 * vários. Mostra um resumo (chips/contagem) no gatilho, tem "Todos"/"Limpar" e
 * mantém o dropdown aberto ao marcar. Seguro para listas grandes (trunca/limita).
 */
export function MultiSelectSearch({
  value,
  options,
  onChange,
  placeholder = 'Todos',
  disabled = false,
  emptyText = 'Nenhum resultado',
}: {
  value: OptId[];
  options: Opt[];
  onChange: (ids: OptId[]) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const LIMITE = 50;

  const selecionadas = useMemo(() => new Set(value), [value]);
  const selecionadasLabels = useMemo(
    () => options.filter((o) => selecionadas.has(o.id)).map((o) => o.label),
    [options, selecionadas],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return base.slice(0, LIMITE);
  }, [options, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle(id: OptId) {
    if (selecionadas.has(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  }

  const resumo =
    selecionadasLabels.length === 0
      ? placeholder
      : selecionadasLabels.length <= 2
        ? selecionadasLabels.join(', ')
        : `${selecionadasLabels.length} selecionados`;

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'input flex items-center justify-between gap-2 text-left w-full',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <span className={cn('truncate', selecionadasLabels.length === 0 && 'text-ink-muted')}>
          {resumo}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {value.length > 0 && (
            <X
              className="w-4 h-4 text-ink-muted hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            />
          )}
          <ChevronDown className="w-4 h-4 text-ink-muted" />
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-surface-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-surface-border flex items-center gap-2">
            <Search className="w-4 h-4 text-ink-muted flex-shrink-0" />
            <input
              autoFocus
              className="w-full min-w-0 outline-none text-sm bg-transparent"
              placeholder="Pesquisar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-border text-xs">
            <span className="text-ink-muted">
              {value.length > 0 ? `${value.length} selecionado(s)` : 'Nenhum selecionado'}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-brand-700 hover:underline disabled:opacity-40"
                disabled={filtered.length === 0}
                onClick={() => {
                  const novos = new Set(value);
                  for (const o of filtered) novos.add(o.id);
                  onChange([...novos]);
                }}
              >
                Marcar visíveis
              </button>
              <button
                type="button"
                className="text-ink-soft hover:underline disabled:opacity-40"
                disabled={value.length === 0}
                onClick={() => onChange([])}
              >
                Limpar
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-ink-muted">{emptyText}</div>
            ) : (
              filtered.map((o) => {
                const marcada = selecionadas.has(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-surface-alt flex items-center gap-2 min-w-0',
                      marcada && 'bg-brand-50',
                    )}
                  >
                    <span
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                        marcada ? 'bg-brand border-brand text-white' : 'border-surface-border',
                      )}
                    >
                      {marcada && <Check className="w-3 h-3" />}
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{o.label}</span>
                      {o.hint && <span className="text-xs text-ink-muted truncate">{o.hint}</span>}
                    </span>
                  </button>
                );
              })
            )}
            {!query && options.length > LIMITE && (
              <div className="px-3 py-1.5 text-xs text-ink-muted border-t border-surface-border">
                Mostrando {LIMITE} de {options.length}. Digite para pesquisar.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
