BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [investimentos].[ItemCatalogo] ALTER COLUMN [nome] NVARCHAR(500) NOT NULL;
ALTER TABLE [investimentos].[ItemCatalogo] ALTER COLUMN [especificacao] NVARCHAR(max) NULL;
ALTER TABLE [investimentos].[ItemCatalogo] ADD [definicao] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
