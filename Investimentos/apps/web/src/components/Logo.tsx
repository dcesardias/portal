import { useState } from 'react';
import type { ReactNode } from 'react';

// A logo é servida da pasta public/ da SPA -> /investfacil/logo-aacd.png.
// Coloque o arquivo em: apps/web/public/logo-aacd.png
const LOGO_URL = `${import.meta.env.BASE_URL}logo-aacd.png`;

/**
 * Renderiza a logo da AACD. Enquanto o arquivo não existir (ou falhar),
 * mostra um fallback (por padrão, a letra "A") — nada quebra.
 */
export function Logo({
  className,
  fallback,
}: {
  className?: string;
  fallback?: ReactNode;
}) {
  const [erro, setErro] = useState(false);
  if (erro) return <>{fallback ?? <span className="font-bold">A</span>}</>;
  return (
    <img
      src={LOGO_URL}
      alt="AACD"
      className={className}
      onError={() => setErro(true)}
    />
  );
}
