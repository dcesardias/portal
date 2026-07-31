import { cn } from '../lib/utils';

// Editor dos campos OPCIONAIS + valor unitário de um item, usado pelo Gestor
// Focal/admin na fila de aprovação. Identidade (descrição, qtd, catálogo,
// motivo, data prevista, escopo inicial) não é editável aqui.

export type SubtipoObra =
  | 'NOVA_CONSTRUCAO'
  | 'REFORMA_ESTRUTURAL'
  | 'REVITALIZACAO'
  | 'MANUTENCAO_CORRETIVA'
  | 'OUTROS';
export type ManutPreventiva = 'SIM_CALIBRACAO' | 'NAO_COMPLEXA' | 'NAO_SEI';

export type ItemDraft = {
  valorUnitario: number;
  especificacao: string;
  modelosReferencia: string;
  justificativaPeriodo: string;
  publicoAlvo: string;
  volumePessoas: string;
  beneficiosProjeto: string;
  impactoRdc50: string;
  justificativaClinica: string;
  infraAguaEsgoto: boolean;
  infraEletricaRegulada: boolean;
  infraBlindagem: boolean;
  infraClimatizacao: boolean;
  infraGasesMedicinais: boolean;
  infraPlugAndPlay: boolean;
  manutencaoPreventiva: '' | ManutPreventiva;
  manutPeriodMensal: boolean;
  manutPeriodTrimestral: boolean;
  manutPeriodSemestral: boolean;
  manutPeriodAnual: boolean;
  subtipoObra: '' | SubtipoObra;
  subtipoObraOutros: string;
  ieDemolicoes: boolean;
  iePiso: boolean;
  ieForro: boolean;
  ieArCondicionado: boolean;
  ieMarcenaria: boolean;
  ieCaixilhos: boolean;
};

const INFRA: { key: keyof ItemDraft; label: string }[] = [
  { key: 'infraAguaEsgoto', label: 'Ponto de água / esgoto' },
  { key: 'infraEletricaRegulada', label: 'Rede elétrica regulada' },
  { key: 'infraBlindagem', label: 'Blindagem de sala' },
  { key: 'infraClimatizacao', label: 'Climatização dedicada' },
  { key: 'infraGasesMedicinais', label: 'Gases medicinais' },
];
const MANUT: { key: ManutPreventiva; label: string }[] = [
  { key: 'SIM_CALIBRACAO', label: 'Sim, exige calibração/revisão periódica' },
  { key: 'NAO_COMPLEXA', label: 'Não exige manutenção complexa' },
  { key: 'NAO_SEI', label: 'Não sei informar' },
];
const PERIODO: { key: keyof ItemDraft; label: string }[] = [
  { key: 'manutPeriodMensal', label: 'Mensal' },
  { key: 'manutPeriodTrimestral', label: 'Trimestral' },
  { key: 'manutPeriodSemestral', label: 'Semestral' },
  { key: 'manutPeriodAnual', label: 'Anual' },
];
const SUBTIPO: { key: SubtipoObra; label: string }[] = [
  { key: 'NOVA_CONSTRUCAO', label: 'Nova construção' },
  { key: 'REFORMA_ESTRUTURAL', label: 'Reforma estrutural' },
  { key: 'REVITALIZACAO', label: 'Revitalização' },
  { key: 'MANUTENCAO_CORRETIVA', label: 'Manutenção corretiva' },
  { key: 'OUTROS', label: 'Outros' },
];
const ESCOPO: { key: keyof ItemDraft; label: string }[] = [
  { key: 'ieDemolicoes', label: 'Demolições' },
  { key: 'iePiso', label: 'Piso' },
  { key: 'ieForro', label: 'Forro' },
  { key: 'ieArCondicionado', label: 'Ar-condicionado' },
  { key: 'ieMarcenaria', label: 'Marcenaria' },
  { key: 'ieCaixilhos', label: 'Caixilhos' },
];

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
export function grupoExigeManutencao(grupoNome: string | undefined): boolean {
  return !!grupoNome && normalizar(grupoNome).startsWith('equipamento');
}

const btn = (ativo: boolean) =>
  cn(
    'px-3 py-1.5 rounded-lg border text-sm transition text-left',
    ativo
      ? 'bg-brand text-white border-brand'
      : 'bg-white text-ink border-surface-border hover:border-brand',
  );

export function AprovadorItemEditor({
  tipo,
  grupoNome,
  draft,
  onChange,
  disabled,
}: {
  tipo: string;
  grupoNome?: string;
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  disabled?: boolean;
}) {
  const isItem = tipo === 'ITEM';
  const isObra = tipo === 'OBRA';
  const exigeManut = isItem && grupoExigeManutencao(grupoNome);

  return (
    <div className="mt-2 space-y-3 border-t border-surface-border pt-3">
      <div>
        <label className="label">Valor unitário (R$)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="input"
          value={Number.isFinite(draft.valorUnitario) ? draft.valorUnitario : 0}
          onChange={(e) => onChange({ valorUnitario: Number(e.target.value) })}
          disabled={disabled}
        />
      </div>

      {isItem && (
        <>
          <div>
            <label className="label">Fabricantes</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={draft.especificacao}
              onChange={(e) => onChange({ especificacao: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="label">Modelos de Referência</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={draft.modelosReferencia}
              onChange={(e) => onChange({ modelosReferencia: e.target.value })}
              disabled={disabled}
            />
          </div>
        </>
      )}

      {isObra && (
        <div>
          <label className="label">Tipo de Solicitação</label>
          <div className="flex flex-wrap gap-2">
            {SUBTIPO.map((op) => {
              const checked = draft.subtipoObra === op.key;
              return (
                <button
                  key={op.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ subtipoObra: checked ? '' : op.key })}
                  className={btn(checked)}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
          {draft.subtipoObra === 'OUTROS' && (
            <input
              className="input mt-2"
              value={draft.subtipoObraOutros}
              onChange={(e) => onChange({ subtipoObraOutros: e.target.value })}
              placeholder="Descreva o tipo de solicitação"
              disabled={disabled}
            />
          )}
        </div>
      )}

      {isObra && (
        <div>
          <label className="label">Escopo da obra</label>
          <div className="flex flex-wrap gap-2">
            {ESCOPO.map((es) => {
              const checked = draft[es.key] as boolean;
              return (
                <button
                  key={es.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ [es.key]: !checked } as Partial<ItemDraft>)}
                  className={btn(checked)}
                >
                  {es.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="label">Justificativa para o período escolhido</label>
        <input
          className="input"
          value={draft.justificativaPeriodo}
          onChange={(e) => onChange({ justificativaPeriodo: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div>
        <label className="label">Público-Alvo Principal</label>
        <textarea
          className="input resize-none"
          rows={2}
          value={draft.publicoAlvo}
          onChange={(e) => onChange({ publicoAlvo: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div>
        <label className="label">Volume de Pessoas Impactadas</label>
        <textarea
          className="input resize-none"
          rows={2}
          value={draft.volumePessoas}
          onChange={(e) => onChange({ volumePessoas: e.target.value })}
          disabled={disabled}
        />
      </div>

      {isObra && (
        <>
          <div>
            <label className="label">Principais Benefícios do Projeto</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={draft.beneficiosProjeto}
              onChange={(e) => onChange({ beneficiosProjeto: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="label">A obra impacta o fluxo de RDC 50 (Anvisa)?</label>
            <input
              className="input"
              value={draft.impactoRdc50}
              onChange={(e) => onChange({ impactoRdc50: e.target.value })}
              disabled={disabled}
            />
          </div>
        </>
      )}

      {isItem && (
        <>
          <div>
            <label className="label">
              Justificativa ou Evidência Científica, Normativa e Alinhamento Clínico
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              value={draft.justificativaClinica}
              onChange={(e) => onChange({ justificativaClinica: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="label">Necessita de Infraestrutura Especial?</label>
            <div className="flex flex-wrap gap-2">
              {INFRA.map((inf) => {
                const checked = draft[inf.key] as boolean;
                return (
                  <button
                    key={inf.key}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({ [inf.key]: !checked, infraPlugAndPlay: false } as Partial<ItemDraft>)
                    }
                    className={btn(checked)}
                  >
                    {inf.label}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    infraPlugAndPlay: !draft.infraPlugAndPlay,
                    infraAguaEsgoto: false,
                    infraEletricaRegulada: false,
                    infraBlindagem: false,
                    infraClimatizacao: false,
                    infraGasesMedicinais: false,
                  })
                }
                className={btn(draft.infraPlugAndPlay)}
              >
                Não necessita / plug-and-play
              </button>
            </div>
          </div>
          {exigeManut && (
            <>
              <div>
                <label className="label">Necessidade de Manutenção Preventiva (Se aplicável)</label>
                <div className="flex flex-wrap gap-2">
                  {MANUT.map((op) => {
                    const checked = draft.manutencaoPreventiva === op.key;
                    return (
                      <button
                        key={op.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange({ manutencaoPreventiva: checked ? '' : op.key })}
                        className={btn(checked)}
                      >
                        {op.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Periodicidade da Manutenção (Se aplicável)</label>
                <div className="flex flex-wrap gap-2">
                  {PERIODO.map((p) => {
                    const checked = draft[p.key] as boolean;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange({ [p.key]: !checked } as Partial<ItemDraft>)}
                        className={btn(checked)}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
