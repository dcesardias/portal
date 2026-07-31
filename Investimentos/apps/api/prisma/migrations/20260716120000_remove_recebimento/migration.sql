BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [investimentos].[Recebimento] DROP CONSTRAINT [Recebimento_solicitacaoItemId_fkey];

-- DropForeignKey
ALTER TABLE [investimentos].[Recebimento] DROP CONSTRAINT [Recebimento_usuarioId_fkey];

-- DropTable
DROP TABLE [investimentos].[Recebimento];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
