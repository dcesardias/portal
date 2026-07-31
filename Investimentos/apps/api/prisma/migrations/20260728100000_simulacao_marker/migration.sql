BEGIN TRY

BEGIN TRAN;

-- AlterTable: marcador de auditoria "criado em modo simulação" (id do admin real; NULL = normal)
ALTER TABLE [investimentos].[Solicitacao] ADD [simuladoPorId] UNIQUEIDENTIFIER NULL;

ALTER TABLE [investimentos].[Aprovacao] ADD [simuladoPorId] UNIQUEIDENTIFIER NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
