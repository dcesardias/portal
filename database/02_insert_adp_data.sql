-- ========================================
-- Script para inserir dados iniciais do grupo ADP
-- Banco: PowerBIPortal
-- Data: 2025-11-25
-- ========================================

USE PowerBIPortal;
GO

-- Inserir grupo ADP
DECLARE @ADPGroupId INT;

IF NOT EXISTS (SELECT 1 FROM [dbo].[TableGroups] WHERE [Code] = 'ADP')
BEGIN
    INSERT INTO [dbo].[TableGroups] ([Code], [Name], [Description], [Icon])
    VALUES ('ADP', 'ADP', 'Tabelas do sistema ADP', '📊');
    
    SET @ADPGroupId = SCOPE_IDENTITY();
    PRINT 'Grupo ADP inserido com ID: ' + CAST(@ADPGroupId AS VARCHAR);
END
ELSE
BEGIN
    SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';
    PRINT 'Grupo ADP já existe com ID: ' + CAST(@ADPGroupId AS VARCHAR);
END
GO

-- Inserir tabelas do grupo ADP
DECLARE @ADPGroupId INT;
SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';

-- AFASTAMENTO
IF NOT EXISTS (SELECT 1 FROM [dbo].[TableDefinitions] WHERE [TableName] = 'AFASTAMENTO')
BEGIN
    INSERT INTO [dbo].[TableDefinitions] 
        ([TableName], [DisplayName], [Description], [Icon], [GroupId])
    VALUES 
        ('AFASTAMENTO', 'Afastamentos', 'Dados de afastamentos de funcionários', '🏥', @ADPGroupId);
    PRINT 'Tabela AFASTAMENTO cadastrada';
END
ELSE
BEGIN
    UPDATE [dbo].[TableDefinitions]
    SET [GroupId] = @ADPGroupId,
        [DisplayName] = 'Afastamentos',
        [Description] = 'Dados de afastamentos de funcionários',
        [Icon] = '🏥'
    WHERE [TableName] = 'AFASTAMENTO';
    PRINT 'Tabela AFASTAMENTO atualizada';
END
GO

-- FERIAS
DECLARE @ADPGroupId INT;
SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TableDefinitions] WHERE [TableName] = 'FERIAS')
BEGIN
    INSERT INTO [dbo].[TableDefinitions] 
        ([TableName], [DisplayName], [Description], [Icon], [GroupId])
    VALUES 
        ('FERIAS', 'Férias', 'Registros de férias', '🏖️', @ADPGroupId);
    PRINT 'Tabela FERIAS cadastrada';
END
ELSE
BEGIN
    UPDATE [dbo].[TableDefinitions]
    SET [GroupId] = @ADPGroupId,
        [DisplayName] = 'Férias',
        [Description] = 'Registros de férias',
        [Icon] = '🏖️'
    WHERE [TableName] = 'FERIAS';
    PRINT 'Tabela FERIAS atualizada';
END
GO

-- MATRICULA
DECLARE @ADPGroupId INT;
SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TableDefinitions] WHERE [TableName] = 'MATRICULA')
BEGIN
    INSERT INTO [dbo].[TableDefinitions] 
        ([TableName], [DisplayName], [Description], [Icon], [GroupId])
    VALUES 
        ('MATRICULA', 'Matrículas', 'Dados de matrículas de funcionários', '👤', @ADPGroupId);
    PRINT 'Tabela MATRICULA cadastrada';
END
ELSE
BEGIN
    UPDATE [dbo].[TableDefinitions]
    SET [GroupId] = @ADPGroupId,
        [DisplayName] = 'Matrículas',
        [Description] = 'Dados de matrículas de funcionários',
        [Icon] = '👤'
    WHERE [TableName] = 'MATRICULA';
    PRINT 'Tabela MATRICULA atualizada';
END
GO

-- MOVIMENTO_PESSOAL
DECLARE @ADPGroupId INT;
SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TableDefinitions] WHERE [TableName] = 'MOVIMENTO_PESSOAL')
BEGIN
    INSERT INTO [dbo].[TableDefinitions] 
        ([TableName], [DisplayName], [Description], [Icon], [GroupId])
    VALUES 
        ('MOVIMENTO_PESSOAL', 'Movimento Pessoal', 'Movimentações de pessoal', '📋', @ADPGroupId);
    PRINT 'Tabela MOVIMENTO_PESSOAL cadastrada';
END
ELSE
BEGIN
    UPDATE [dbo].[TableDefinitions]
    SET [GroupId] = @ADPGroupId,
        [DisplayName] = 'Movimento Pessoal',
        [Description] = 'Movimentações de pessoal',
        [Icon] = '📋'
    WHERE [TableName] = 'MOVIMENTO_PESSOAL';
    PRINT 'Tabela MOVIMENTO_PESSOAL atualizada';
END
GO

-- MOVIMENTO_PESSOAL_CC
DECLARE @ADPGroupId INT;
SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TableDefinitions] WHERE [TableName] = 'MOVIMENTO_PESSOAL_CC')
BEGIN
    INSERT INTO [dbo].[TableDefinitions] 
        ([TableName], [DisplayName], [Description], [Icon], [GroupId])
    VALUES 
        ('MOVIMENTO_PESSOAL_CC', 'Movimento Pessoal CC', 'Movimentações de pessoal - Centro de Custo', '💼', @ADPGroupId);
    PRINT 'Tabela MOVIMENTO_PESSOAL_CC cadastrada';
END
ELSE
BEGIN
    UPDATE [dbo].[TableDefinitions]
    SET [GroupId] = @ADPGroupId,
        [DisplayName] = 'Movimento Pessoal CC',
        [Description] = 'Movimentações de pessoal - Centro de Custo',
        [Icon] = '💼'
    WHERE [TableName] = 'MOVIMENTO_PESSOAL_CC';
    PRINT 'Tabela MOVIMENTO_PESSOAL_CC atualizada';
END
GO

-- ADP_BENEFICIOS
DECLARE @ADPGroupId INT;
SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TableDefinitions] WHERE [TableName] = 'ADP_BENEFICIOS')
BEGIN
    INSERT INTO [dbo].[TableDefinitions] 
        ([TableName], [DisplayName], [Description], [Icon], [GroupId])
    VALUES 
        ('ADP_BENEFICIOS', 'ADP Benefícios', 'Dados de benefícios ADP', '🎁', @ADPGroupId);
    PRINT 'Tabela ADP_BENEFICIOS cadastrada';
END
ELSE
BEGIN
    UPDATE [dbo].[TableDefinitions]
    SET [GroupId] = @ADPGroupId,
        [DisplayName] = 'ADP Benefícios',
        [Description] = 'Dados de benefícios ADP',
        [Icon] = '🎁'
    WHERE [TableName] = 'ADP_BENEFICIOS';
    PRINT 'Tabela ADP_BENEFICIOS atualizada';
END
GO

-- ADP_MOTIVO_RESCISAO
DECLARE @ADPGroupId INT;
SELECT @ADPGroupId = [Id] FROM [dbo].[TableGroups] WHERE [Code] = 'ADP';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TableDefinitions] WHERE [TableName] = 'ADP_MOTIVO_RESCISAO')
BEGIN
    INSERT INTO [dbo].[TableDefinitions] 
        ([TableName], [DisplayName], [Description], [Icon], [GroupId])
    VALUES 
        ('ADP_MOTIVO_RESCISAO', 'ADP Motivo Rescisão', 'Motivos de rescisão ADP', '📄', @ADPGroupId);
    PRINT 'Tabela ADP_MOTIVO_RESCISAO cadastrada';
END
ELSE
BEGIN
    UPDATE [dbo].[TableDefinitions]
    SET [GroupId] = @ADPGroupId,
        [DisplayName] = 'ADP Motivo Rescisão',
        [Description] = 'Motivos de rescisão ADP',
        [Icon] = '📄'
    WHERE [TableName] = 'ADP_MOTIVO_RESCISAO';
    PRINT 'Tabela ADP_MOTIVO_RESCISAO atualizada';
END
GO

-- Verificar dados inseridos
SELECT g.[Code], g.[Name], g.[Description], 
       COUNT(t.[Id]) AS TotalTabelas
FROM [dbo].[TableGroups] g
LEFT JOIN [dbo].[TableDefinitions] t ON g.[Id] = t.[GroupId]
WHERE g.[IsActive] = 1
GROUP BY g.[Code], g.[Name], g.[Description];

PRINT 'Dados do grupo ADP inseridos/atualizados com sucesso!';
