-- =====================================================================
-- Tabela: dbo.OCR_FATURA_ITAU  (banco Fonte)
--
-- Cabecalho da fatura (cartao de credito empresarial Itau, NF, boleto):
-- identificacao, datas, partes, totais, resumo, limites, encargos
-- cobrados, encargos do proximo periodo e totalizadores.
--
-- Lancamentos (compras, saques, pagamentos, encargos individuais) ficam
-- na tabela filha dbo.OCR_FATURA_ITAU_ITENS.
--
-- "uploaded_by" referencia logicamente PowerBIPortal.dbo.Users.Id (nao
-- ha FK fisica entre bancos diferentes).
--
-- Idempotente: o portal tambem aplica ALTER TABLE ADD para colunas
-- novas no boot via ensureOcrFaturaItauTable() em server.js.
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[OCR_FATURA_ITAU]') AND type = N'U'
)
BEGIN
    CREATE TABLE dbo.OCR_FATURA_ITAU (
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        -- Identificacao
        tipo_documento           NVARCHAR(60)   NULL,
        numero_fatura            NVARCHAR(100)  NULL,
        numero_conta             NVARCHAR(40)   NULL,
        empresa                  NVARCHAR(300)  NULL,
        linha_digitavel          NVARCHAR(80)   NULL,
        nosso_numero             NVARCHAR(40)   NULL,
        agencia_beneficiario     NVARCHAR(40)   NULL,
        carteira                 NVARCHAR(20)   NULL,

        -- Datas
        data_emissao             DATE           NULL,
        data_postagem            DATE           NULL,
        data_vencimento          DATE           NULL,
        data_proximo_fechamento  DATE           NULL,

        -- Partes
        fornecedor_nome          NVARCHAR(300)  NULL,  -- emissor (banco em fatura de cartao)
        fornecedor_cnpj          NVARCHAR(20)   NULL,
        pagador_nome             NVARCHAR(300)  NULL,
        pagador_cnpj             NVARCHAR(20)   NULL,
        pagador_endereco         NVARCHAR(500)  NULL,

        -- Totais
        moeda                    NVARCHAR(5)    NULL,
        valor_total              DECIMAL(18,2)  NULL,
        descricao                NVARCHAR(MAX)  NULL,

        -- Resumo da fatura
        total_fatura_anterior    DECIMAL(18,2)  NULL,
        pagamentos_efetuados     DECIMAL(18,2)  NULL,
        saldo_atraso             DECIMAL(18,2)  NULL,
        lancamentos_atuais       DECIMAL(18,2)  NULL,

        -- Limites
        limite_total_credito     DECIMAL(18,2)  NULL,
        limite_disponivel        DECIMAL(18,2)  NULL,
        limite_total_utilizado   DECIMAL(18,2)  NULL,

        -- Encargos cobrados nesta fatura
        juros_atraso_percent           DECIMAL(9,4)   NULL,
        juros_atraso_valor             DECIMAL(18,2)  NULL,
        juros_mora_percent_mensal      DECIMAL(9,4)   NULL,
        juros_mora_valor               DECIMAL(18,2)  NULL,
        multa_atraso_percent           DECIMAL(9,4)   NULL,
        multa_atraso_valor             DECIMAL(18,2)  NULL,
        iof_financiamento_descricao    NVARCHAR(200)  NULL,
        iof_financiamento_valor        DECIMAL(18,2)  NULL,

        -- Encargos do proximo periodo
        juros_max_proximo_mensal_percent  DECIMAL(9,4) NULL,
        juros_max_proximo_anual_percent   DECIMAL(9,4) NULL,
        juros_pgto_contas_mensal_percent  DECIMAL(9,4) NULL,

        -- Totalizadores
        total_pagamentos                       DECIMAL(18,2) NULL,
        total_lancamentos_atuais               DECIMAL(18,2) NULL,
        total_transacoes_internacionais_brl    DECIMAL(18,2) NULL,
        repasse_iof_brl                        DECIMAL(18,2) NULL,
        total_lancamentos_internacionais_brl   DECIMAL(18,2) NULL,

        -- Auditoria
        pdf_filename             NVARCHAR(300)  NULL,
        pdf_size_bytes           INT            NULL,
        model_used               NVARCHAR(60)   NULL,
        raw_response             NVARCHAR(MAX)  NULL,  -- JSON bruto da IA
        uploaded_by              INT            NULL,  -- ref. logica PowerBIPortal.dbo.Users.Id
        uploaded_at              DATETIME2      NOT NULL CONSTRAINT DF_OCR_FATURA_ITAU_uploaded_at DEFAULT (SYSDATETIME())
    );

    CREATE INDEX IX_OCR_FATURA_ITAU_uploaded_at ON dbo.OCR_FATURA_ITAU(uploaded_at DESC);
    CREATE INDEX IX_OCR_FATURA_ITAU_uploaded_by ON dbo.OCR_FATURA_ITAU(uploaded_by);
END
GO
