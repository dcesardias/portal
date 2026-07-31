BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [investimentos].[User] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [login] VARCHAR(64) NOT NULL,
    [nome] NVARCHAR(255) NOT NULL,
    [email] VARCHAR(255) NOT NULL,
    [senhaHash] NVARCHAR(512) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT [User_ativo_df] DEFAULT 1,
    [mustChangePwd] BIT NOT NULL CONSTRAINT [User_mustChangePwd_df] DEFAULT 0,
    [dtCriacao] DATETIME2 NOT NULL CONSTRAINT [User_dtCriacao_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_login_key] UNIQUE NONCLUSTERED ([login]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [investimentos].[RefreshToken] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [tokenHash] CHAR(64) NOT NULL,
    [familyId] UNIQUEIDENTIFIER NOT NULL,
    [parentId] UNIQUEIDENTIFIER,
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [replacedById] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RefreshToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RefreshToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RefreshToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [investimentos].[Perfil] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [nome] VARCHAR(60) NOT NULL,
    [descricao] NVARCHAR(255),
    CONSTRAINT [Perfil_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Perfil_nome_key] UNIQUE NONCLUSTERED ([nome])
);

-- CreateTable
CREATE TABLE [investimentos].[Permissao] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [chave] VARCHAR(80) NOT NULL,
    CONSTRAINT [Permissao_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Permissao_chave_key] UNIQUE NONCLUSTERED ([chave])
);

-- CreateTable
CREATE TABLE [investimentos].[UserPerfil] (
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [perfilId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [UserPerfil_pkey] PRIMARY KEY CLUSTERED ([userId],[perfilId])
);

-- CreateTable
CREATE TABLE [investimentos].[PerfilPermissao] (
    [perfilId] UNIQUEIDENTIFIER NOT NULL,
    [permissaoId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PerfilPermissao_pkey] PRIMARY KEY CLUSTERED ([perfilId],[permissaoId])
);

-- CreateTable
CREATE TABLE [investimentos].[Estabelecimento] (
    [id] INT NOT NULL,
    [nome] NVARCHAR(120) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT [Estabelecimento_ativo_df] DEFAULT 1,
    CONSTRAINT [Estabelecimento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[UnidadeNegocio] (
    [id] INT NOT NULL,
    [nome] NVARCHAR(120) NOT NULL,
    [estabelecimentoId] INT NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT [UnidadeNegocio_ativo_df] DEFAULT 1,
    CONSTRAINT [UnidadeNegocio_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[CentroCusto] (
    [codigo] VARCHAR(20) NOT NULL,
    [descricao] NVARCHAR(255) NOT NULL,
    [unidadeId] INT NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT [CentroCusto_ativo_df] DEFAULT 1,
    CONSTRAINT [CentroCusto_pkey] PRIMARY KEY CLUSTERED ([codigo])
);

-- CreateTable
CREATE TABLE [investimentos].[GrupoInvestimento] (
    [id] INT NOT NULL,
    [nome] NVARCHAR(120) NOT NULL,
    [categoria] VARCHAR(20) NOT NULL,
    [contaContabil] VARCHAR(60),
    [ativo] BIT NOT NULL CONSTRAINT [GrupoInvestimento_ativo_df] DEFAULT 1,
    CONSTRAINT [GrupoInvestimento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[ItemCatalogo] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nome] NVARCHAR(255) NOT NULL,
    [grupoId] INT NOT NULL,
    [agrupamento] NVARCHAR(120),
    [classificacao] NVARCHAR(120),
    [especificacao] NVARCHAR(500),
    [valorReferencia] DECIMAL(14,2),
    [ativo] BIT NOT NULL CONSTRAINT [ItemCatalogo_ativo_df] DEFAULT 1,
    [idRenem] VARCHAR(40),
    [dsRenem] NVARCHAR(255),
    CONSTRAINT [ItemCatalogo_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[Motivo] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nome] NVARCHAR(120) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT [Motivo_ativo_df] DEFAULT 1,
    CONSTRAINT [Motivo_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[Fluxo] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [nome] NVARCHAR(120) NOT NULL,
    [descricao] NVARCHAR(500),
    [ativo] BIT NOT NULL CONSTRAINT [Fluxo_ativo_df] DEFAULT 1,
    CONSTRAINT [Fluxo_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Fluxo_nome_key] UNIQUE NONCLUSTERED ([nome])
);

-- CreateTable
CREATE TABLE [investimentos].[EtapaFluxo] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [fluxoId] UNIQUEIDENTIFIER NOT NULL,
    [ordem] INT NOT NULL,
    [nome] NVARCHAR(120) NOT NULL,
    [fonteAprovador] VARCHAR(20) NOT NULL,
    [perfilAlvo] VARCHAR(60),
    [usuarioAlvoId] UNIQUEIDENTIFIER,
    [obrigatoria] BIT NOT NULL CONSTRAINT [EtapaFluxo_obrigatoria_df] DEFAULT 1,
    [permiteRevisao] BIT NOT NULL CONSTRAINT [EtapaFluxo_permiteRevisao_df] DEFAULT 1,
    [aprovacaoParalela] BIT NOT NULL CONSTRAINT [EtapaFluxo_aprovacaoParalela_df] DEFAULT 0,
    CONSTRAINT [EtapaFluxo_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EtapaFluxo_fluxoId_ordem_key] UNIQUE NONCLUSTERED ([fluxoId],[ordem])
);

-- CreateTable
CREATE TABLE [investimentos].[RegraFluxo] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [prioridade] INT NOT NULL,
    [estabelecimentoId] INT,
    [grupoId] INT,
    [tipoVerba] VARCHAR(4),
    [vlMin] DECIMAL(14,2),
    [vlMax] DECIMAL(14,2),
    [fluxoId] UNIQUEIDENTIFIER NOT NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [RegraFluxo_isDefault_df] DEFAULT 0,
    CONSTRAINT [RegraFluxo_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[RegraAlcada] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [estabelecimentoId] INT NOT NULL,
    [grupoId] INT NOT NULL,
    [nivel] VARCHAR(20) NOT NULL,
    [usuarioLogin] VARCHAR(64) NOT NULL,
    CONSTRAINT [RegraAlcada_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RegraAlcada_estabelecimentoId_grupoId_nivel_usuarioLogin_key] UNIQUE NONCLUSTERED ([estabelecimentoId],[grupoId],[nivel],[usuarioLogin])
);

-- CreateTable
CREATE TABLE [investimentos].[Solicitacao] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [numero] INT NOT NULL IDENTITY(1,1),
    [solicitanteId] UNIQUEIDENTIFIER NOT NULL,
    [estabelecimentoId] INT NOT NULL,
    [unidadeNegocioId] INT NOT NULL,
    [centroCustoCodigo] VARCHAR(20) NOT NULL,
    [dtSolicitacao] DATETIME2 NOT NULL CONSTRAINT [Solicitacao_dtSolicitacao_df] DEFAULT CURRENT_TIMESTAMP,
    [dtRecurso] DATETIME2,
    [tipoVerba] VARCHAR(4),
    [projeto] NVARCHAR(255),
    [status] VARCHAR(30) NOT NULL,
    [fluxoId] UNIQUEIDENTIFIER,
    [etapaAtualOrdem] INT,
    CONSTRAINT [Solicitacao_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Solicitacao_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [investimentos].[SolicitacaoItem] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [solicitacaoId] UNIQUEIDENTIFIER NOT NULL,
    [grupoId] INT NOT NULL,
    [itemCatalogoId] INT,
    [descricao] NVARCHAR(500) NOT NULL,
    [especificacao] NVARCHAR(2000),
    [motivoId] INT NOT NULL,
    [justificativa] NVARCHAR(2000) NOT NULL,
    [quantidade] INT NOT NULL,
    [valorUnitario] DECIMAL(14,2) NOT NULL,
    [valorTotal] DECIMAL(14,2) NOT NULL,
    [ieDemolicoes] BIT NOT NULL CONSTRAINT [SolicitacaoItem_ieDemolicoes_df] DEFAULT 0,
    [iePiso] BIT NOT NULL CONSTRAINT [SolicitacaoItem_iePiso_df] DEFAULT 0,
    [ieForro] BIT NOT NULL CONSTRAINT [SolicitacaoItem_ieForro_df] DEFAULT 0,
    [ieArCondicionado] BIT NOT NULL CONSTRAINT [SolicitacaoItem_ieArCondicionado_df] DEFAULT 0,
    [ieMarcenaria] BIT NOT NULL CONSTRAINT [SolicitacaoItem_ieMarcenaria_df] DEFAULT 0,
    [ieCaixilhos] BIT NOT NULL CONSTRAINT [SolicitacaoItem_ieCaixilhos_df] DEFAULT 0,
    CONSTRAINT [SolicitacaoItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[Aprovacao] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [solicitacaoId] UNIQUEIDENTIFIER NOT NULL,
    [etapaId] UNIQUEIDENTIFIER NOT NULL,
    [aprovadorId] UNIQUEIDENTIFIER NOT NULL,
    [decisao] VARCHAR(20) NOT NULL,
    [justificativa] NVARCHAR(2000),
    [data] DATETIME2 NOT NULL CONSTRAINT [Aprovacao_data_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Aprovacao_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[Recebimento] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [solicitacaoItemId] UNIQUEIDENTIFIER,
    [usuarioId] UNIQUEIDENTIFIER NOT NULL,
    [dtReceb] DATETIME2 NOT NULL CONSTRAINT [Recebimento_dtReceb_df] DEFAULT CURRENT_TIMESTAMP,
    [quantidade] INT NOT NULL,
    [valor] DECIMAL(14,2) NOT NULL,
    [nrNota] VARCHAR(100),
    [cnpjFornecedor] VARCHAR(14),
    [justificativa] NVARCHAR(2000),
    [previsto] BIT NOT NULL CONSTRAINT [Recebimento_previsto_df] DEFAULT 1,
    [grupoSnapshotId] INT,
    [descricaoSnapshot] NVARCHAR(500),
    [centroCustoSnapshot] VARCHAR(20),
    CONSTRAINT [Recebimento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [investimentos].[EventoAuditoria] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [entidade] VARCHAR(60) NOT NULL,
    [entidadeId] VARCHAR(60) NOT NULL,
    [usuarioId] UNIQUEIDENTIFIER,
    [acao] VARCHAR(40) NOT NULL,
    [dadosJson] NVARCHAR(max),
    [data] DATETIME2 NOT NULL CONSTRAINT [EventoAuditoria_data_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EventoAuditoria_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshToken_userId_familyId_idx] ON [investimentos].[RefreshToken]([userId], [familyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RegraFluxo_prioridade_idx] ON [investimentos].[RegraFluxo]([prioridade]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Solicitacao_solicitanteId_idx] ON [investimentos].[Solicitacao]([solicitanteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Solicitacao_status_idx] ON [investimentos].[Solicitacao]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aprovacao_solicitacaoId_idx] ON [investimentos].[Aprovacao]([solicitacaoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EventoAuditoria_entidade_entidadeId_idx] ON [investimentos].[EventoAuditoria]([entidade], [entidadeId]);

-- AddForeignKey
ALTER TABLE [investimentos].[RefreshToken] ADD CONSTRAINT [RefreshToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [investimentos].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[UserPerfil] ADD CONSTRAINT [UserPerfil_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [investimentos].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[UserPerfil] ADD CONSTRAINT [UserPerfil_perfilId_fkey] FOREIGN KEY ([perfilId]) REFERENCES [investimentos].[Perfil]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[PerfilPermissao] ADD CONSTRAINT [PerfilPermissao_perfilId_fkey] FOREIGN KEY ([perfilId]) REFERENCES [investimentos].[Perfil]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[PerfilPermissao] ADD CONSTRAINT [PerfilPermissao_permissaoId_fkey] FOREIGN KEY ([permissaoId]) REFERENCES [investimentos].[Permissao]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[UnidadeNegocio] ADD CONSTRAINT [UnidadeNegocio_estabelecimentoId_fkey] FOREIGN KEY ([estabelecimentoId]) REFERENCES [investimentos].[Estabelecimento]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[CentroCusto] ADD CONSTRAINT [CentroCusto_unidadeId_fkey] FOREIGN KEY ([unidadeId]) REFERENCES [investimentos].[UnidadeNegocio]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[ItemCatalogo] ADD CONSTRAINT [ItemCatalogo_grupoId_fkey] FOREIGN KEY ([grupoId]) REFERENCES [investimentos].[GrupoInvestimento]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[EtapaFluxo] ADD CONSTRAINT [EtapaFluxo_fluxoId_fkey] FOREIGN KEY ([fluxoId]) REFERENCES [investimentos].[Fluxo]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[RegraFluxo] ADD CONSTRAINT [RegraFluxo_fluxoId_fkey] FOREIGN KEY ([fluxoId]) REFERENCES [investimentos].[Fluxo]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[RegraFluxo] ADD CONSTRAINT [RegraFluxo_estabelecimentoId_fkey] FOREIGN KEY ([estabelecimentoId]) REFERENCES [investimentos].[Estabelecimento]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[RegraFluxo] ADD CONSTRAINT [RegraFluxo_grupoId_fkey] FOREIGN KEY ([grupoId]) REFERENCES [investimentos].[GrupoInvestimento]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[RegraAlcada] ADD CONSTRAINT [RegraAlcada_estabelecimentoId_fkey] FOREIGN KEY ([estabelecimentoId]) REFERENCES [investimentos].[Estabelecimento]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[RegraAlcada] ADD CONSTRAINT [RegraAlcada_grupoId_fkey] FOREIGN KEY ([grupoId]) REFERENCES [investimentos].[GrupoInvestimento]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[Solicitacao] ADD CONSTRAINT [Solicitacao_solicitanteId_fkey] FOREIGN KEY ([solicitanteId]) REFERENCES [investimentos].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[Solicitacao] ADD CONSTRAINT [Solicitacao_estabelecimentoId_fkey] FOREIGN KEY ([estabelecimentoId]) REFERENCES [investimentos].[Estabelecimento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Solicitacao] ADD CONSTRAINT [Solicitacao_unidadeNegocioId_fkey] FOREIGN KEY ([unidadeNegocioId]) REFERENCES [investimentos].[UnidadeNegocio]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Solicitacao] ADD CONSTRAINT [Solicitacao_centroCustoCodigo_fkey] FOREIGN KEY ([centroCustoCodigo]) REFERENCES [investimentos].[CentroCusto]([codigo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Solicitacao] ADD CONSTRAINT [Solicitacao_fluxoId_fkey] FOREIGN KEY ([fluxoId]) REFERENCES [investimentos].[Fluxo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[SolicitacaoItem] ADD CONSTRAINT [SolicitacaoItem_solicitacaoId_fkey] FOREIGN KEY ([solicitacaoId]) REFERENCES [investimentos].[Solicitacao]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [investimentos].[SolicitacaoItem] ADD CONSTRAINT [SolicitacaoItem_grupoId_fkey] FOREIGN KEY ([grupoId]) REFERENCES [investimentos].[GrupoInvestimento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[SolicitacaoItem] ADD CONSTRAINT [SolicitacaoItem_itemCatalogoId_fkey] FOREIGN KEY ([itemCatalogoId]) REFERENCES [investimentos].[ItemCatalogo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[SolicitacaoItem] ADD CONSTRAINT [SolicitacaoItem_motivoId_fkey] FOREIGN KEY ([motivoId]) REFERENCES [investimentos].[Motivo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Aprovacao] ADD CONSTRAINT [Aprovacao_solicitacaoId_fkey] FOREIGN KEY ([solicitacaoId]) REFERENCES [investimentos].[Solicitacao]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Aprovacao] ADD CONSTRAINT [Aprovacao_etapaId_fkey] FOREIGN KEY ([etapaId]) REFERENCES [investimentos].[EtapaFluxo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Aprovacao] ADD CONSTRAINT [Aprovacao_aprovadorId_fkey] FOREIGN KEY ([aprovadorId]) REFERENCES [investimentos].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Recebimento] ADD CONSTRAINT [Recebimento_solicitacaoItemId_fkey] FOREIGN KEY ([solicitacaoItemId]) REFERENCES [investimentos].[SolicitacaoItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [investimentos].[Recebimento] ADD CONSTRAINT [Recebimento_usuarioId_fkey] FOREIGN KEY ([usuarioId]) REFERENCES [investimentos].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
