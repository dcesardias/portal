-- ========================================
-- Tabela de jobs de upload do Sistema de Carga
-- Banco: PowerBIPortal
-- Permite acompanhar progresso de uploads em background,
-- mostrar data da ultima carga por tabela e bloquear cargas
-- concorrentes para a mesma tabela.
-- ========================================

USE PowerBIPortal;
GO

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UploadJobs]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[UploadJobs] (
        [JobId]         VARCHAR(64)   NOT NULL PRIMARY KEY,
        [TableName]     VARCHAR(200)  NOT NULL,
        [JobType]       VARCHAR(20)   NOT NULL,            -- 'standard' | 'temp'
        [LoadType]      VARCHAR(20)   NULL,                -- 'completa' | 'incremental'
        [Status]        VARCHAR(20)   NOT NULL,            -- 'queued' | 'running' | 'success' | 'error' | 'cancelled'
        [Stage]         VARCHAR(40)   NULL,
        [Message]       NVARCHAR(500) NULL,
        [Progress]      INT           NOT NULL DEFAULT 0,
        [TotalRows]     INT           NULL,
        [InsertedRows]  INT           NULL,
        [FileName]      NVARCHAR(255) NULL,
        [FileSize]      BIGINT        NULL,
        [UserId]        INT           NULL,
        [UserName]      NVARCHAR(200) NULL,
        [ErrorMessage]  NVARCHAR(MAX) NULL,
        [StartedAt]     DATETIME      NOT NULL DEFAULT GETDATE(),
        [FinishedAt]    DATETIME      NULL,
        [UpdatedAt]     DATETIME      NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Tabela UploadJobs criada';
END
ELSE
BEGIN
    PRINT 'Tabela UploadJobs ja existe';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_UploadJobs_TableName_Status')
BEGIN
    CREATE INDEX IX_UploadJobs_TableName_Status ON [dbo].[UploadJobs]([TableName], [Status]);
    PRINT 'Indice IX_UploadJobs_TableName_Status criado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_UploadJobs_Status_StartedAt')
BEGIN
    CREATE INDEX IX_UploadJobs_Status_StartedAt ON [dbo].[UploadJobs]([Status], [StartedAt] DESC);
    PRINT 'Indice IX_UploadJobs_Status_StartedAt criado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_UploadJobs_TableName_FinishedAt')
BEGIN
    CREATE INDEX IX_UploadJobs_TableName_FinishedAt ON [dbo].[UploadJobs]([TableName], [FinishedAt] DESC) WHERE [Status] = 'success';
    PRINT 'Indice IX_UploadJobs_TableName_FinishedAt criado';
END
GO

PRINT 'Setup UploadJobs concluido';
