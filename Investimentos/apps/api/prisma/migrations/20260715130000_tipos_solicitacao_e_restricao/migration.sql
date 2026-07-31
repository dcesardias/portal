BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [investimentos].[ItemCatalogo] ADD [legadoId] INT,
[tipo] VARCHAR(20) NOT NULL CONSTRAINT [ItemCatalogo_tipo_df] DEFAULT 'ITEM',
[tipoVerba] VARCHAR(30);

-- AlterTable
ALTER TABLE [investimentos].[SolicitacaoItem] ADD [tipo] VARCHAR(20) NOT NULL CONSTRAINT [SolicitacaoItem_tipo_df] DEFAULT 'ITEM';

-- CreateTable
CREATE TABLE [investimentos].[RestricaoSolicitante] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [centroCustoCodigo] VARCHAR(20),
    [contaContabil] VARCHAR(60),
    [criadoEm] DATETIME2 NOT NULL CONSTRAINT [RestricaoSolicitante_criadoEm_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RestricaoSolicitante_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RestricaoSolicitante_userId_idx] ON [investimentos].[RestricaoSolicitante]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemCatalogo_tipo_idx] ON [investimentos].[ItemCatalogo]([tipo]);

-- AddForeignKey
ALTER TABLE [investimentos].[RestricaoSolicitante] ADD CONSTRAINT [RestricaoSolicitante_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [investimentos].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

