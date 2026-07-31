BEGIN TRY

BEGIN TRAN;

-- AlterTable: prorrogação de item para o ano seguinte
ALTER TABLE [investimentos].[SolicitacaoItem] ADD
[prorrogadoParaAno] INT,
[origemItemId] UNIQUEIDENTIFIER;

ALTER TABLE [investimentos].[Solicitacao] ADD
[origemProrrogacaoId] UNIQUEIDENTIFIER;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
