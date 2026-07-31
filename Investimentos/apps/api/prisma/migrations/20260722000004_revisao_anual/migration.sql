BEGIN TRY

BEGIN TRAN;

-- AlterTable: campo "Revisão Anual" (anotações livres do GPE/admin)
ALTER TABLE [investimentos].[Solicitacao] ADD
[revisaoAnual] NVARCHAR(2000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
