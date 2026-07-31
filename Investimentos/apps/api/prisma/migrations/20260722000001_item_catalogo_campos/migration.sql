BEGIN TRY

BEGIN TRAN;

-- AlterTable: campos novos do Cadastro de Item (planilha "Formulários 2")
ALTER TABLE [investimentos].[ItemCatalogo] ADD
[valorMin] DECIMAL(14,2),
[valorMax] DECIMAL(14,2),
[movimentoContabil] VARCHAR(20),
[dolarizadoRenem] BIT NOT NULL CONSTRAINT [ItemCatalogo_dolarizadoRenem_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
