import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';

// Logo Microsoft (4 quadrados) — inline p/ não depender de asset externo.
function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Não foi possível carregar a biblioteca Microsoft.'));
    document.head.appendChild(s);
  });
}

// Troca uma credencial do Portal por um token do Investimentos (bridge de SSO).
async function abrirSessao(init: RequestInit): Promise<void> {
  const r = await fetch('/api/aacdinveste/session', init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.accessToken) {
    throw new Error(d.error || 'Sua conta não está habilitada no AACD Investe.');
  }
  sessionStorage.setItem('access_token', d.accessToken);
}

type Estado = 'checando' | 'pronto' | 'entrando';

export function LoginPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>('checando');
  const [erro, setErro] = useState('');

  // SSO silencioso: se o usuário já está logado no Portal (JWT em sessão),
  // entra direto sem mostrar botão. Senão, exibe o botão Microsoft.
  useEffect(() => {
    // Se veio de um logout explícito (?logout=1), NÃO tenta SSO silencioso —
    // mostra a tela de login para o usuário decidir reentrar.
    if (new URLSearchParams(window.location.search).get('logout') === '1') {
      setEstado('pronto');
      return;
    }
    const portalToken =
      sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    if (!portalToken) {
      setEstado('pronto');
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        await abrirSessao({ method: 'POST', headers: { Authorization: `Bearer ${portalToken}` } });
        if (!cancelado) navigate('/dashboard', { replace: true });
      } catch {
        if (!cancelado) setEstado('pronto'); // sessão do portal não serviu — cai pro botão
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [navigate]);

  async function entrarComMicrosoft() {
    setErro('');
    setEstado('entrando');
    try {
      await loadScript('/vendor/msal-browser/msal-browser.min.js');
      const cfg = await fetch(`/api/microsoft-auth/config?cb=${Date.now()}`, {
        cache: 'no-store',
      }).then((r) => r.json());
      if (!cfg.enabled) {
        throw new Error('Autenticação Microsoft não está habilitada. Contate bi@aacd.org.br.');
      }
      const msal = (window as unknown as { msal: any }).msal;
      const instance = new msal.PublicClientApplication({
        auth: {
          clientId: cfg.clientId,
          authority: cfg.authority,
          redirectUri: `${window.location.origin}/`,
          navigateToLoginRequestUrl: false,
        },
        cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
      });
      if (typeof instance.initialize === 'function') await instance.initialize();
      await instance.handleRedirectPromise();
      const resp = await instance.loginPopup({ scopes: ['openid', 'profile', 'email'] });
      await abrirSessao({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: resp.idToken }),
      });
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? e.message
          : 'Não foi possível entrar. Tente novamente.',
      );
      setEstado('pronto');
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-brand-50 via-white to-white">
      {/* Painel esquerdo — marca */}
      <div className="hidden md:flex md:w-2/5 lg:w-1/2 bg-gradient-to-br from-brand-700 to-brand-900 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="flex items-center gap-8">
          <Logo
            className="h-40 lg:h-56 w-auto object-contain shrink-0 drop-shadow-lg"
            fallback={<span className="text-7xl font-bold text-white/90">A</span>}
          />
          <div>
            <div className="text-sm uppercase tracking-widest text-white/70 font-semibold">
              Solicitação de investimentos
            </div>
            <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight leading-tight mt-2">
              AACD Investe
            </h1>
            <p className="mt-4 text-white/85 leading-relaxed">
              Um único lugar para propor, aprovar e receber os investimentos das unidades de
              reabilitação, hospital e oficina ortopédica.
            </p>
          </div>
        </div>
        <div className="text-sm text-white/70">
          <div>&copy; {new Date().getFullYear()} Associação de Assistência à Criança Deficiente</div>
        </div>
        {/* Decorativo */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/2 -right-16 w-64 h-64 rounded-full bg-white/5" />
      </div>

      {/* Painel direito */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="md:hidden text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-white border border-surface-border p-2 mb-3">
              <Logo
                className="max-h-full max-w-full object-contain"
                fallback={<span className="text-brand text-xl font-bold">A</span>}
              />
            </div>
            <h1 className="text-xl font-semibold">AACD Investe</h1>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="text-xl font-semibold text-ink mb-1">Entrar</h2>
              <p className="text-sm text-ink-soft mb-6">
                Acesse com sua conta Microsoft da AACD.
              </p>

              {estado === 'checando' ? (
                <div className="flex items-center gap-3 text-ink-soft py-3">
                  <span className="w-5 h-5 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
                  Verificando acesso…
                </div>
              ) : (
                <>
                  <button
                    onClick={entrarComMicrosoft}
                    disabled={estado === 'entrando'}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-surface-border bg-white hover:bg-surface-alt transition font-medium text-ink disabled:opacity-60"
                  >
                    {estado === 'entrando' ? (
                      <>
                        <span className="w-5 h-5 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
                        Entrando…
                      </>
                    ) : (
                      <>
                        <MicrosoftLogo className="w-5 h-5" />
                        Entrar com conta Microsoft
                      </>
                    )}
                  </button>

                  {erro && (
                    <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                      {erro}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-ink-muted mt-6">
            Problemas para acessar? Escreva para{' '}
            <a href="mailto:bi@aacd.org.br" className="text-brand-700 hover:underline">
              bi@aacd.org.br
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
