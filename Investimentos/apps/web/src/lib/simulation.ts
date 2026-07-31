// Estado de "simular usuário" (admin visualizando o sistema como outro usuário,
// só-leitura). Vive no localStorage porque o api.ts precisa lê-lo fora do React
// (no request interceptor do axios) para anexar o header X-Simulate-User.
const KEY = 'simulate_user_id';

export function getSimulateUserId(): string | null {
  return localStorage.getItem(KEY);
}

export function setSimulateUserId(id: string | null): void {
  if (id) {
    localStorage.setItem(KEY, id);
  } else {
    localStorage.removeItem(KEY);
  }
}
