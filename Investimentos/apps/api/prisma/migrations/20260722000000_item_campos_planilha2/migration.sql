BEGIN TRY

BEGIN TRAN;

-- AlterTable: novos campos (planilha "Formulários 2")
ALTER TABLE [investimentos].[SolicitacaoItem] ADD
[modelosReferencia] NVARCHAR(2000),
[infraPlugAndPlay] BIT NOT NULL CONSTRAINT [SolicitacaoItem_infraPlugAndPlay_df] DEFAULT 0,
[manutencaoPreventiva] VARCHAR(30),
[manutPeriodMensal] BIT NOT NULL CONSTRAINT [SolicitacaoItem_manutPeriodMensal_df] DEFAULT 0,
[manutPeriodTrimestral] BIT NOT NULL CONSTRAINT [SolicitacaoItem_manutPeriodTrimestral_df] DEFAULT 0,
[manutPeriodSemestral] BIT NOT NULL CONSTRAINT [SolicitacaoItem_manutPeriodSemestral_df] DEFAULT 0,
[manutPeriodAnual] BIT NOT NULL CONSTRAINT [SolicitacaoItem_manutPeriodAnual_df] DEFAULT 0;

-- AlterColumn: "Descrição e Especificação" passa a ser texto longo (500 -> 2000)
ALTER TABLE [investimentos].[SolicitacaoItem] ALTER COLUMN [descricao] NVARCHAR(2000) NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
