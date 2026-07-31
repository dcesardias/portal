BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [investimentos].[SolicitacaoItem] ADD
[justificativaPeriodo] NVARCHAR(500),
[publicoAlvo] NVARCHAR(2000),
[volumePessoas] NVARCHAR(2000),
[subtipoObra] VARCHAR(40),
[subtipoObraOutros] NVARCHAR(255),
[escopoInicial] NVARCHAR(2000),
[beneficiosProjeto] NVARCHAR(2000),
[impactoRdc50] NVARCHAR(500),
[justificativaClinica] NVARCHAR(2000),
[infraAguaEsgoto] BIT NOT NULL CONSTRAINT [SolicitacaoItem_infraAguaEsgoto_df] DEFAULT 0,
[infraEletricaRegulada] BIT NOT NULL CONSTRAINT [SolicitacaoItem_infraEletricaRegulada_df] DEFAULT 0,
[infraBlindagem] BIT NOT NULL CONSTRAINT [SolicitacaoItem_infraBlindagem_df] DEFAULT 0,
[infraClimatizacao] BIT NOT NULL CONSTRAINT [SolicitacaoItem_infraClimatizacao_df] DEFAULT 0,
[infraGasesMedicinais] BIT NOT NULL CONSTRAINT [SolicitacaoItem_infraGasesMedicinais_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
