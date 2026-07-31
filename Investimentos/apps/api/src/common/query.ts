/**
 * Helpers para filtros de multisseleção vindos da query string. Aceitam tanto
 * repetição (`?g=1&g=2`) quanto CSV (`?g=1,2`). Retornam [] quando vazio.
 */
function toArr(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function csvStrs(v: string | string[] | undefined): string[] {
  return [...new Set(toArr(v))];
}

export function csvNums(v: string | string[] | undefined): number[] {
  return [...new Set(toArr(v).map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)))];
}
