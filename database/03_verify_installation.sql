-- Script de verificação e diagnóstico
-- Execute este script no SQL Server Management Studio para verificar a instalação

USE PowerBIPortal;
GO

PRINT '========================================';
PRINT 'VERIFICAÇÃO DO SISTEMA DE GRUPOS E TABELAS';
PRINT '========================================';
PRINT '';

-- 1. Verificar se as tabelas existem
PRINT '1. Verificando existência das tabelas...';
IF OBJECT_ID('dbo.TableGroups', 'U') IS NOT NULL
    PRINT '   ✓ Tabela TableGroups existe';
ELSE
    PRINT '   ✗ ERRO: Tabela TableGroups NÃO existe - Execute 01_create_tables.sql';

IF OBJECT_ID('dbo.TableDefinitions', 'U') IS NOT NULL
    PRINT '   ✓ Tabela TableDefinitions existe';
ELSE
    PRINT '   ✗ ERRO: Tabela TableDefinitions NÃO existe - Execute 01_create_tables.sql';

PRINT '';

-- 2. Verificar grupos
PRINT '2. Verificando grupos cadastrados...';
DECLARE @GroupCount INT;
SELECT @GroupCount = COUNT(*) FROM TableGroups WHERE IsActive = 1;
PRINT '   Total de grupos ativos: ' + CAST(@GroupCount AS VARCHAR);

IF @GroupCount > 0
BEGIN
    PRINT '   Grupos encontrados:';
    SELECT '   - ' + Code + ': ' + Name AS Grupo
    FROM TableGroups 
    WHERE IsActive = 1
    ORDER BY Name;
END
ELSE
BEGIN
    PRINT '   ⚠ AVISO: Nenhum grupo encontrado - Execute 02_insert_adp_data.sql';
END

PRINT '';

-- 3. Verificar tabelas
PRINT '3. Verificando tabelas cadastradas...';
DECLARE @TableCount INT;
SELECT @TableCount = COUNT(*) FROM TableDefinitions WHERE IsActive = 1;
PRINT '   Total de tabelas ativas: ' + CAST(@TableCount AS VARCHAR);

IF @TableCount > 0
BEGIN
    PRINT '   Tabelas encontradas:';
    SELECT 
        '   - ' + t.TableName + ' (' + t.DisplayName + ')' + 
        CASE WHEN g.Name IS NOT NULL THEN ' - Grupo: ' + g.Name ELSE ' - Sem grupo' END AS Tabela
    FROM TableDefinitions t
    LEFT JOIN TableGroups g ON t.GroupId = g.Id
    WHERE t.IsActive = 1
    ORDER BY g.Name, t.DisplayName;
END
ELSE
BEGIN
    PRINT '   ⚠ AVISO: Nenhuma tabela encontrada - Execute 02_insert_adp_data.sql';
END

PRINT '';

-- 4. Verificar relacionamento grupo-tabelas
PRINT '4. Verificando relacionamento grupos x tabelas...';
SELECT 
    g.Code AS GrupoCodigo,
    g.Name AS GrupoNome,
    COUNT(t.Id) AS TotalTabelas
FROM TableGroups g
LEFT JOIN TableDefinitions t ON g.Id = t.GroupId AND t.IsActive = 1
WHERE g.IsActive = 1
GROUP BY g.Code, g.Name
ORDER BY g.Name;

PRINT '';

-- 5. Verificar índices
PRINT '5. Verificando índices...';
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableDefinitions_GroupId')
    PRINT '   ✓ Índice IX_TableDefinitions_GroupId existe';
ELSE
    PRINT '   ✗ ERRO: Índice IX_TableDefinitions_GroupId não existe';

IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableDefinitions_TableName')
    PRINT '   ✓ Índice IX_TableDefinitions_TableName existe';
ELSE
    PRINT '   ✗ ERRO: Índice IX_TableDefinitions_TableName não existe';

IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableGroups_Code')
    PRINT '   ✓ Índice IX_TableGroups_Code existe';
ELSE
    PRINT '   ✗ ERRO: Índice IX_TableGroups_Code não existe';

PRINT '';

-- 6. Teste de permissões
PRINT '6. Testando permissões do usuário atual...';
PRINT '   Usuário conectado: ' + SUSER_SNAME();
PRINT '   Database: ' + DB_NAME();

-- Tentar SELECT
BEGIN TRY
    DECLARE @TestCount INT;
    SELECT @TestCount = COUNT(*) FROM TableGroups;
    PRINT '   ✓ Permissão SELECT em TableGroups: OK';
END TRY
BEGIN CATCH
    PRINT '   ✗ ERRO SELECT em TableGroups: ' + ERROR_MESSAGE();
END CATCH

BEGIN TRY
    SELECT @TestCount = COUNT(*) FROM TableDefinitions;
    PRINT '   ✓ Permissão SELECT em TableDefinitions: OK';
END TRY
BEGIN CATCH
    PRINT '   ✗ ERRO SELECT em TableDefinitions: ' + ERROR_MESSAGE();
END CATCH

PRINT '';
PRINT '========================================';
PRINT 'VERIFICAÇÃO CONCLUÍDA';
PRINT '========================================';
PRINT '';
PRINT 'Se houver erros acima, corrija-os antes de usar o sistema.';
PRINT 'Se tudo estiver OK, você pode acessar /excel/admin no navegador.';
