-- =====================================================================
-- Tabela: dbo.UserAppPermissions  (banco PowerBIPortal)
--
-- Concede permissoes granulares a usuarios para acessar aplicacoes
-- "satelites" do portal (ex.: /fatura). Quem e IsAdmin=1 acessa tudo
-- sem precisar de entry; usuarios nao-admin precisam ter (UserId, AppKey)
-- registrado aqui para usar a app correspondente.
--
-- Idempotente: o script eh seguro de rodar varias vezes.
-- =====================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[UserAppPermissions]') AND type = N'U'
)
BEGIN
    CREATE TABLE dbo.UserAppPermissions (
        Id        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId    INT          NOT NULL,
        AppKey    NVARCHAR(60) NOT NULL,
        GrantedAt DATETIME2    NOT NULL CONSTRAINT DF_UserAppPermissions_GrantedAt DEFAULT (SYSDATETIME()),
        CONSTRAINT UQ_UserAppPermissions_User_App UNIQUE (UserId, AppKey),
        CONSTRAINT FK_UserAppPermissions_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users(Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_UserAppPermissions_AppKey ON dbo.UserAppPermissions(AppKey);
END
GO
