-- =====================================================================
-- Tabelas mestras: dbo.OCR_FORNECEDORES e dbo.OCR_CATEGORIAS  (banco Fonte)
--
-- Permitem marcar flags de classificacao (ex.: "Despesa de TI") por
-- fornecedor ou categoria normalizada. A flag vale para QUALQUER fatura
-- (passada ou futura) que tenha aquele fornecedor/categoria, via JOIN
-- por OCR_FATURA_ITAU_ITENS.fornecedor_id / .categoria_id.
--
-- A coluna fornecedor_id / categoria_id e adicionada em
-- OCR_FATURA_ITAU_ITENS pelo portal no boot (server.js -> ensureItensFkColumns).
--
-- Idempotente.
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[OCR_FORNECEDORES]') AND type = N'U'
)
BEGIN
    CREATE TABLE dbo.OCR_FORNECEDORES (
        Id                   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        nome                 NVARCHAR(200) NOT NULL,
        despesa_ti           BIT           NOT NULL CONSTRAINT DF_OCR_FORNECEDORES_TI DEFAULT(0),
        observacao           NVARCHAR(500) NULL,
        first_seen_fatura_id INT           NULL,
        created_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_FORNECEDORES_created DEFAULT(SYSDATETIME()),
        updated_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_FORNECEDORES_updated DEFAULT(SYSDATETIME()),
        CONSTRAINT UQ_OCR_FORNECEDORES_nome UNIQUE (nome)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[OCR_CATEGORIAS]') AND type = N'U'
)
BEGIN
    CREATE TABLE dbo.OCR_CATEGORIAS (
        Id                   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        nome                 NVARCHAR(100) NOT NULL,
        despesa_ti           BIT           NOT NULL CONSTRAINT DF_OCR_CATEGORIAS_TI DEFAULT(0),
        observacao           NVARCHAR(500) NULL,
        first_seen_fatura_id INT           NULL,
        created_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_CATEGORIAS_created DEFAULT(SYSDATETIME()),
        updated_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_CATEGORIAS_updated DEFAULT(SYSDATETIME()),
        CONSTRAINT UQ_OCR_CATEGORIAS_nome UNIQUE (nome)
    );
END
GO

-- Adiciona FK columns em OCR_FATURA_ITAU_ITENS (idempotente)
IF COL_LENGTH('dbo.OCR_FATURA_ITAU_ITENS', 'fornecedor_id') IS NULL
    ALTER TABLE dbo.OCR_FATURA_ITAU_ITENS ADD fornecedor_id INT NULL;
GO
IF COL_LENGTH('dbo.OCR_FATURA_ITAU_ITENS', 'categoria_id') IS NULL
    ALTER TABLE dbo.OCR_FATURA_ITAU_ITENS ADD categoria_id INT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_OCR_FATURA_ITAU_ITENS_Fornecedor'
)
    ALTER TABLE dbo.OCR_FATURA_ITAU_ITENS
    ADD CONSTRAINT FK_OCR_FATURA_ITAU_ITENS_Fornecedor
        FOREIGN KEY (fornecedor_id) REFERENCES dbo.OCR_FORNECEDORES(Id);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_OCR_FATURA_ITAU_ITENS_Categoria'
)
    ALTER TABLE dbo.OCR_FATURA_ITAU_ITENS
    ADD CONSTRAINT FK_OCR_FATURA_ITAU_ITENS_Categoria
        FOREIGN KEY (categoria_id) REFERENCES dbo.OCR_CATEGORIAS(Id);
GO
