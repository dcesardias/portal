BEGIN TRY

BEGIN TRAN;

-- AlterTable: anotações por papel (planilha "Formulários 2")
ALTER TABLE [investimentos].[Solicitacao] ADD
[obsGF] NVARCHAR(2000),
[obsGPE] NVARCHAR(2000),
[validacao] NVARCHAR(500);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
