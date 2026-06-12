/* Jetons de notification push (Expo). Idempotent. */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'sec_push_token')
BEGIN
    CREATE TABLE dbo.sec_push_token (
        id          BIGINT IDENTITY(1,1) NOT NULL,
        user_id     BIGINT NOT NULL,
        token       NVARCHAR(255) NOT NULL,
        platform    NVARCHAR(20) NULL,
        created_at  DATETIME2(3) NOT NULL CONSTRAINT DF_sec_push_token_created DEFAULT SYSUTCDATETIME(),
        updated_at  DATETIME2(3) NULL,
        CONSTRAINT PK_sec_push_token PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_sec_push_token_token UNIQUE (token)
    );
END
