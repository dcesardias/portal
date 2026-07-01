-- =============================================================================
-- Migration 04 — Pages.IsHomologation
-- =============================================================================
-- Adiciona a coluna IsHomologation na tabela Pages para suportar a rota
-- /homologa (cards de paineis em homologacao) e a secao dedicada na tela
-- /admin. Idempotente: pode rodar varias vezes sem efeito colateral.
--
-- Como rodar:
--   Abra no SSMS conectado em PowerBIPortal (server55) e execute o script
--   inteiro. Depois reinicie o AppPool do site no IIS para o Node carregar
--   o codigo novo que escreve nesta coluna.
--
-- Reversao (se precisar):
--   ALTER TABLE dbo.Pages DROP CONSTRAINT DF_Pages_IsHomologation;
--   ALTER TABLE dbo.Pages DROP COLUMN IsHomologation;
-- =============================================================================

SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Pages')
      AND name = N'IsHomologation'
)
BEGIN
    PRINT 'Adicionando coluna dbo.Pages.IsHomologation';
    ALTER TABLE dbo.Pages
        ADD IsHomologation BIT NOT NULL
        CONSTRAINT DF_Pages_IsHomologation DEFAULT(0);
END
ELSE
BEGIN
    PRINT 'Coluna dbo.Pages.IsHomologation ja existe — nada a fazer.';
END

-- Verificacao final
SELECT
    c.name      AS ColumnName,
    t.name      AS DataType,
    c.is_nullable AS IsNullable,
    OBJECT_DEFINITION(c.default_object_id) AS DefaultDefinition
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.Pages')
  AND c.name = N'IsHomologation';
