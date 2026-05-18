-- =====================================================================
-- Tabela: dbo.OCR_FATURA_ITAU_ITENS  (banco Fonte)
--
-- Lancamentos linha-a-linha de cada fatura: compras nacionais e
-- internacionais, saques, pagamentos, encargos individuais e ajustes.
-- Inclui dados do portador (cartao adicional empresarial), centro de
-- custo, moeda original e taxa de cambio.
--
-- ON DELETE CASCADE: ao remover a fatura mae, os itens vao junto.
--
-- Idempotente: o portal aplica ALTER TABLE ADD pra colunas novas no
-- boot via ensureOcrFaturaItauItensTable() em server.js.
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[OCR_FATURA_ITAU_ITENS]') AND type = N'U'
)
BEGIN
    CREATE TABLE dbo.OCR_FATURA_ITAU_ITENS (
        Id                     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        fatura_id              INT             NOT NULL,
        ordem                  INT             NOT NULL,

        -- Classificacao
        tipo                   NVARCHAR(40)    NULL,  -- compra_nacional | compra_internacional | saque | pagamento | encargo | ajuste | outro
        data                   DATE            NULL,
        estabelecimento        NVARCHAR(300)   NULL,
        cidade                 NVARCHAR(150)   NULL,
        categoria              NVARCHAR(100)   NULL,  -- ex.: "DIVERSOS"
        descricao              NVARCHAR(1000)  NULL,

        -- Portador (cartao empresarial pode ter varios cartoes adicionais)
        portador_nome          NVARCHAR(200)   NULL,
        portador_cartao_final  NVARCHAR(10)    NULL,
        centro_custo           NVARCHAR(50)    NULL,

        -- Moeda original / cambio (para internacionais)
        moeda_original         NVARCHAR(5)     NULL,  -- BRL/USD/EUR/...
        valor_original         DECIMAL(18,4)   NULL,
        taxa_cambio            DECIMAL(18,6)   NULL,

        -- Valor convertido para BRL (negativo para pagamentos/creditos)
        valor_brl              DECIMAL(18,2)   NULL,

        -- Normalizacao via IA (permite agrupar/filtrar entre faturas, pois o
        -- mesmo fornecedor aparece com identificadores diferentes a cada mes).
        fornecedor_normalizado NVARCHAR(200)  NULL,  -- ex.: "Microsoft", "GOL Linhas Aereas", "Zoom"
        categoria_normalizada  NVARCHAR(100)  NULL,  -- ex.: "Software/SaaS", "Viagem - Aereo"
        produto_servico        NVARCHAR(200)  NULL,  -- ex.: "Microsoft 365", "Microsoft Azure"

        -- Compatibilidade legacy (NF tradicional). Em fatura de cartao normalmente nulos.
        quantidade             DECIMAL(18,4)   NULL,
        valor_unitario         DECIMAL(18,4)   NULL,
        valor_total            DECIMAL(18,2)   NULL,

        CONSTRAINT FK_OCR_FATURA_ITAU_ITENS_Fatura FOREIGN KEY (fatura_id)
            REFERENCES dbo.OCR_FATURA_ITAU(Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_OCR_FATURA_ITAU_ITENS_fatura
        ON dbo.OCR_FATURA_ITAU_ITENS(fatura_id, ordem);

    CREATE INDEX IX_OCR_FATURA_ITAU_ITENS_portador
        ON dbo.OCR_FATURA_ITAU_ITENS(portador_nome, portador_cartao_final);

    CREATE INDEX IX_OCR_FATURA_ITAU_ITENS_fornecedor
        ON dbo.OCR_FATURA_ITAU_ITENS(fornecedor_normalizado);

    CREATE INDEX IX_OCR_FATURA_ITAU_ITENS_categoria
        ON dbo.OCR_FATURA_ITAU_ITENS(categoria_normalizada);
END
GO
