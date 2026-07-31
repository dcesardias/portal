BEGIN TRY

BEGIN TRAN;

-- AlterTable: status da verba pública (admin, só quando tipoVerba = VP)
ALTER TABLE [investimentos].[Solicitacao] ADD [statusVerbaPublica] VARCHAR(20) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
