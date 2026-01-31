-- ========================================
-- Script para criar estrutura de cadastro de grupos e tabelas
-- Banco: PowerBIPortal
-- Data: 2025-11-25
-- ========================================

USE PowerBIPortal;
GO

-- Tabela de Grupos de Tabelas
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TableGroups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TableGroups] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [Code] VARCHAR(50) NOT NULL UNIQUE,
        [Name] NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [Icon] NVARCHAR(50) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE()
    );
    
    PRINT 'Tabela TableGroups criada com sucesso';
END
ELSE
BEGIN
    PRINT 'Tabela TableGroups já existe';
END
GO

-- Tabela de Definições de Tabelas
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TableDefinitions]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TableDefinitions] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [TableName] VARCHAR(100) NOT NULL UNIQUE,
        [DisplayName] NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [Icon] NVARCHAR(50) NULL,
        [GroupId] INT NULL,
        [ModelFileName] NVARCHAR(255) NULL, -- Nome do arquivo modelo Excel
        [ModelFilePath] NVARCHAR(500) NULL, -- Caminho do arquivo modelo
        [ColumnDefinitions] NVARCHAR(MAX) NULL, -- JSON com definição das colunas
        [AllowFullLoad] BIT NOT NULL DEFAULT 1, -- Permitir Carga Completa
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_TableDefinitions_TableGroups FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[TableGroups]([Id]) ON DELETE SET NULL
    );
    
    PRINT 'Tabela TableDefinitions criada com sucesso';
END
ELSE
BEGIN
    PRINT 'Tabela TableDefinitions já existe';
END
GO

-- Criar índices para melhorar performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableDefinitions_GroupId')
BEGIN
    CREATE INDEX IX_TableDefinitions_GroupId ON [dbo].[TableDefinitions]([GroupId]);
    PRINT 'Índice IX_TableDefinitions_GroupId criado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableDefinitions_TableName')
BEGIN
    CREATE INDEX IX_TableDefinitions_TableName ON [dbo].[TableDefinitions]([TableName]);
    PRINT 'Índice IX_TableDefinitions_TableName criado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableGroups_Code')
BEGIN
    CREATE INDEX IX_TableGroups_Code ON [dbo].[TableGroups]([Code]);
    PRINT 'Índice IX_TableGroups_Code criado';
END
GO

PRINT 'Estrutura de tabelas criada com sucesso!';
