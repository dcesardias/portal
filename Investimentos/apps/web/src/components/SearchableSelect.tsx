import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type OptId = string | number;
export type Opt = { id: OptId; label: string; hint?: string };

/**
 * Combobox com busca, seguro para listas grandes (ex.: 900+ itens) e para
 * rótulos longos (trunca em vez de estourar a largura). O dropdown é absoluto
 * e w-full, então nunca empurra o layout.
 */
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Selecione…',
  disabled = false,
  disabledText,
  emptyText = 'Nenhum resultado',
}: {
  value: OptId | null;
  options: Opt[];
  onChange: (id: OptId | null) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledText?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const LIMITE = 50;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, LIMITE);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, LIMITE);
  }, [options, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

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
        <span className={cn('truncate', !selected && 'text-ink-muted')}>
          {disabled && disabledText ? disabledText : selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 flex-shrink-0 text-ink-muted" />
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
            {value != null && (
              <button
                type="button"
                title="Limpar seleção"
                onClick={() => {
                  onChange(null);
                  setQuery('');
                }}
              >
                <X className="w-4 h-4 text-ink-muted hover:text-ink" />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-ink-muted">{emptyText}</div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-surface-alt flex flex-col min-w-0',
                    o.id === value && 'bg-brand-50',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-ink-muted truncate">{o.hint}</span>}
                </button>
              ))
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
