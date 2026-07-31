BEGIN TRY

BEGIN TRAN;

-- AlterTable: vínculo do item à conta contábil (view dbo.VW_CONTA_CONTABIL_PESSOAL)
ALTER TABLE [investimentos].[ItemCatalogo] ADD
[cdContaContabil] VARCHAR(20) NULL,
[dsContaContabil] NVARCHAR(255) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
