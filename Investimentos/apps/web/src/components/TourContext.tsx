import { createContext, useCallback, useContext, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Registro do tour da página atualmente montada. Cada página (via <PageTour>)
 * registra aqui uma função que reabre o seu próprio tour; o botão de ajuda (?)
 * no cabeçalho do AppShell chama `replayPage()` para reexibir o passo a passo
 * da tela em que o usuário está. Como só há uma rota montada por vez (Outlet),
 * há no máximo um replay registrado.
 */
type ReplayFn = () => void;

type TourRegistry = {
  register: (fn: ReplayFn | null) => void;
  /** Reabre o tour da página atual. Retorna false se a tela não tiver tour. */
  replayPage: () => boolean;
};

const TourCtx = createContext<TourRegistry | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const replayRef = useRef<ReplayFn | null>(null);

  const register = useCallback((fn: ReplayFn | null) => {
    replayRef.current = fn;
  }, []);

  const replayPage = useCallback(() => {
    if (replayRef.current) {
      replayRef.current();
      return true;
    }
    return false;
  }, []);

  return <TourCtx.Provider value={{ register, replayPage }}>{children}</TourCtx.Provider>;
}

export function useTourRegistry(): TourRegistry {
  const ctx = useContext(TourCtx);
  if (!ctx) {
    // Fallback inerte: permite usar <PageTour> fora do provider sem quebrar
    // (o replay via botão (?) simplesmente não estará disponível).
    return { register: () => {}, replayPage: () => false };
  }
  return ctx;
}
