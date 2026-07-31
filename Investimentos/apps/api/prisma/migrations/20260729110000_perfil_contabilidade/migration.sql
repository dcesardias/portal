BEGIN TRY

BEGIN TRAN;

-- Seed: perfil CONTABILIDADE (idempotente)
IF NOT EXISTS (SELECT 1 FROM [investimentos].[Perfil] WHERE [nome] = 'CONTABILIDADE')
BEGIN
    INSERT INTO [investimentos].[Perfil] ([id], [nome], [descricao])
    VALUES (
        NEWID(),
        'CONTABILIDADE',
        N'Vincula os itens do catálogo ao material do Tasy e à conta contábil (não edita preços).'
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
