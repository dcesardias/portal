import { useEffect, useRef, useState } from 'react';
import { GuidedTour, type TourStep } from './GuidedTour';
import { usePermissions } from '../hooks/usePermissions';
import { useTourRegistry } from './TourContext';

/**
 * Tour dedicado de uma página. Comportamento:
 *  - Abre automaticamente na PRIMEIRA vez que o usuário abre a tela (marca em
 *    localStorage por usuário + página: `investfacil_tour_<pageKey>_v1_<id>`).
 *  - Registra-se no TourContext para que o botão de ajuda (?) do cabeçalho
 *    reabra o passo a passo desta tela sob demanda.
 *
 * Os passos são montados pela própria página (condicionais a perfil/estado),
 * então nunca há referência a algo que o usuário não vê.
 */
export function PageTour({
  pageKey,
  steps,
  autoStart = true,
  delay = 700,
  onOpen,
  onClose,
}: {
  pageKey: string;
  steps: TourStep[];
  autoStart?: boolean;
  delay?: number;
  /** Efeito ao abrir o tour (auto ou via botão ?) — ex.: fotografar o estado atual. */
  onOpen?: () => void;
  /** Efeito ao fechar/concluir — ex.: restaurar o passo do wizard. */
  onClose?: () => void;
}) {
  const { me, simulando } = usePermissions();
  const { register } = useTourRegistry();
  const [run, setRun] = useState(false);
  const hasSteps = steps.length > 0;
  const storeKey = me ? `investfacil_tour_${pageKey}_v1_${me.id}` : null;

  // Mantém os callbacks atuais sem reassinar o replay a cada render.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const startRef = useRef(() => {
    onOpenRef.current?.();
    setRun(true);
  });

  // Registra o replay desta página para o botão (?) do AppShell.
  useEffect(() => {
    if (!hasSteps) return;
    register(() => startRef.current());
    return () => register(null);
  }, [register, hasSteps]);

  // Abre automaticamente no primeiro acesso desta tela.
  // Em modo simulação NÃO dispara: o `me` efetivo é o usuário simulado, que
  // "nunca viu" o tour — sem esse guard, simular abriria o tutorial.
  useEffect(() => {
    if (!autoStart || !me || simulando || !storeKey || !hasSteps) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(storeKey);
    } catch {
      seen = true;
    }
    if (seen) return;
    const t = setTimeout(() => startRef.current(), delay);
    return () => clearTimeout(t);
  }, [autoStart, me, simulando, storeKey, hasSteps, delay]);

  function close() {
    setRun(false);
    if (storeKey) {
      try {
        localStorage.setItem(storeKey, '1');
      } catch {
        /* localStorage indisponível — ignora */
      }
    }
    onCloseRef.current?.();
  }

  if (!hasSteps) return null;
  return <GuidedTour steps={steps} run={run} onClose={close} />;
}
