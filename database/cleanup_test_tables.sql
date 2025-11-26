-- Script para limpar tabelas de teste criadas durante desenvolvimento
-- Execute no banco PowerBIPortal para remover definições
-- Execute no banco Fonte para remover as tabelas físicas

-- 1. PowerBIPortal: Desativar tabelas de teste
USE PowerBIPortal;
GO

-- Listar tabelas de teste
SELECT Id, TableName, DisplayName, GroupId, IsActive 
FROM TableDefinitions 
WHERE TableName LIKE 'TESTE%'
ORDER BY CreatedAt DESC;

-- Desativar (soft delete) tabelas de teste
-- Descomente a linha abaixo se quiser executar:
-- UPDATE TableDefinitions SET IsActive = 0 WHERE TableName LIKE 'TESTE%';

-- OU deletar permanentemente (use com cuidado!):
-- DELETE FROM TableDefinitions WHERE TableName LIKE 'TESTE%';

GO

-- 2. Fonte: Dropar tabelas de teste
USE Fonte;
GO

-- Listar tabelas de teste
SELECT name, create_date 
FROM sys.tables 
WHERE name LIKE 'TESTE%'
ORDER BY create_date DESC;

-- Dropar tabelas de teste
-- Descomente as linhas abaixo conforme necessário:
-- DROP TABLE IF EXISTS [dbo].[TESTE_MAT];
-- DROP TABLE IF EXISTS [dbo].[TESTE_MATRICULA];

GO
