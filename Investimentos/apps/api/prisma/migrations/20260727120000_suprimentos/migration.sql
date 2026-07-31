BEGIN TRY

BEGIN TRAN;

-- AlterTable: gestão de valor pelo perfil SUPRIMENTOS (preserva valorUnitario original)
ALTER TABLE [investimentos].[SolicitacaoItem] ADD
[valorSuprimentos] DECIMAL(14,2) NULL,
[suprimentosPorId] UNIQUEIDENTIFIER NULL,
[suprimentosEm] DATETIME2 NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

-- AddForeignKey (fora da transação anterior, padrão gerado pelo Prisma p/ mssql)
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [investimentos].[SolicitacaoItem]
ADD CONSTRAINT [SolicitacaoItem_suprimentosPorId_fkey]
FOREIGN KEY ([suprimentosPorId])
REFERENCES [investimentos].[User]([id])
ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

-- Seed: perfil SUPRIMENTOS (idempotente)
BEGIN TRY

BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM [investimentos].[Perfil] WHERE [nome] = 'SUPRIMENTOS')
BEGIN
    INSERT INTO [investimentos].[Perfil] ([id], [nome], [descricao])
    VALUES (
        NEWID(),
        'SUPRIMENTOS',
        N'Gerencia os preços do catálogo (referência, mínimo e máximo) e ajusta o valor informado pelos solicitantes nas solicitações.'
    );
END;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
