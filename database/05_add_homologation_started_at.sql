-- =============================================================================
-- Migration 05 — Pages.HomologationStartedAt
-- =============================================================================
-- Adiciona a coluna HomologationStartedAt (DATE) na tabela Pages. Usada pela
-- rota /homologa para exibir nos cards "Em homologacao ha X dias/semanas".
-- O admin preenche manualmente no modal de edicao da pagina (campo aparece
-- ligado ao checkbox "Painel em Homologacao").
--
-- Idempotente: pode rodar varias vezes sem efeito colateral.
--
-- Como rodar:
--   Abra no SSMS conectado em PowerBIPortal (server55) e execute o script
--   inteiro. Depois reinicie o AppPool do site no IIS para o Node carregar
--   o codigo novo que escreve nesta coluna.
--
-- Reversao:
--   ALTER TABLE dbo.Pages DROP COLUMN HomologationStartedAt;
-- =============================================================================

SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Pages')
      AND name = N'HomologationStartedAt'
)
BEGIN
    PRINT 'Adicionando coluna dbo.Pages.HomologationStartedAt';
    ALTER TABLE dbo.Pages
        ADD HomologationStartedAt DATE NULL;
END
ELSE
BEGIN
    PRINT 'Coluna dbo.Pages.HomologationStartedAt ja existe — nada a fazer.';
END

-- Verificacao final
SELECT
    c.name        AS ColumnName,
    t.name        AS DataType,
    c.is_nullable AS IsNullable
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.Pages')
  AND c.name = N'HomologationStartedAt';
