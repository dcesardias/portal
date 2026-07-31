import { useEffect, useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';

export type TourStep = {
  /** Seletor CSS do elemento a destacar (ex.: '[data-tour="nova"]'). Sem alvo = passo centralizado. */
  target?: string;
  title: string;
  body: string;
  /**
   * Efeito colateral disparado ao ENTRAR neste passo (ex.: avançar um wizard,
   * abrir uma aba) para que o alvo passe a existir no DOM. Como a medição do
   * alvo faz polling, não importa que o elemento só apareça um tick depois.
   */
  onEnter?: () => void;
};

const TIP_W = 320;

export function GuidedTour({
  steps,
  run,
  onClose,
}: {
  steps: TourStep[];
  run: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Reinicia no começo sempre que o tour é (re)aberto.
  useEffect(() => {
    if (run) setI(0);
  }, [run]);

  const step = steps[i];

  // Dispara o efeito de entrada do passo (ex.: avançar o wizard) UMA vez ao
  // entrar. A medição abaixo faz polling, então o alvo pode surgir depois.
  useEffect(() => {
    if (!run || !step) return;
    step.onEnter?.();
    // Depende só de [run, i]: reexecuta a cada troca de passo, não a cada
    // recriação do array `steps` (que muda de identidade a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, i]);

  useLayoutEffect(() => {
    if (!run || !step) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    let cancelled = false;
    function update() {
      if (cancelled) return;
      clearTimeout(timer);
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        setRect(el.getBoundingClientRect());
        return;
      }
      // Alvo ainda não existe (dados carregando, wizard trocando de passo…).
      // Tenta de novo por ~2s; se nunca aparecer, cai para balão centralizado.
      if (tries < 20) {
        tries += 1;
        timer = setTimeout(update, 100);
      } else {
        setRect(null);
      }
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [run, i, step]);

  if (!run || !step) return null;

  const last = i === steps.length - 1;
  const pad = 6;

  // Posiciona o balão: à direita do alvo (bom p/ menu lateral), senão abaixo, senão acima.
  let tip: CSSProperties;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right + TIP_W + 16 < vw) {
      tip = { top: Math.max(12, Math.min(rect.top, vh - 240)), left: rect.right + 14 };
    } else if (rect.bottom + 220 < vh) {
      tip = { top: rect.bottom + 14, left: Math.min(rect.left, vw - TIP_W - 16) };
    } else {
      tip = { top: Math.max(12, rect.top - 220), left: Math.min(rect.left, vw - TIP_W - 16) };
    }
  } else {
    tip = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Escurece a tela; abre um "buraco" (spotlight) no alvo via box-shadow. */}
      {rect ? (
        <div
          className="absolute rounded-lg"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.65)',
            pointerEvents: 'none',
            transition: 'all .2s ease',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/65" onClick={onClose} />
      )}

      {/* Balão */}
      <div
        className="absolute w-[320px] max-w-[calc(100vw-24px)] bg-white rounded-xl shadow-2xl p-4"
        style={tip}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-semibold text-ink">{step.title}</h4>
          <button
            className="text-ink-muted hover:text-ink"
            onClick={onClose}
            aria-label="Fechar tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-ink-muted tabular-nums">
            {i + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button className="btn-ghost py-1 px-2 text-sm" onClick={() => setI(i - 1)}>
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            {last ? (
              <button className="btn-primary py-1 px-3 text-sm" onClick={onClose}>
                <Check className="w-4 h-4" /> Concluir
              </button>
            ) : (
              <button className="btn-primary py-1 px-3 text-sm" onClick={() => setI(i + 1)}>
                Próximo <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {i === 0 && (
          <button className="text-xs text-ink-muted hover:underline mt-2" onClick={onClose}>
            Pular tutorial
          </button>
        )}
      </div>
    </div>
  );
}
