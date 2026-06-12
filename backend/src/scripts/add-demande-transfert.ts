/**
 * Migration ponctuelle : crée la table fin_demande_transfert.
 * Workflow CREE → APPROUVEE/REJETEE → EXECUTEE.
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/add-demande-transfert.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);

  try {
    await ds.query(`
      IF OBJECT_ID(N'dbo.fin_demande_transfert', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.fin_demande_transfert (
          id                       BIGINT IDENTITY(1,1) NOT NULL,
          numero                   NVARCHAR(50) NOT NULL,
          demandeur_id             BIGINT NOT NULL,
          source_type              NVARCHAR(20) NOT NULL,
          source_id                BIGINT NOT NULL,
          destination_type         NVARCHAR(20) NOT NULL,
          destination_id           BIGINT NOT NULL,
          montant                  DECIMAL(19,4) NOT NULL,
          devise_id                BIGINT NOT NULL,
          motif                    NVARCHAR(500) NULL,
          statut                   NVARCHAR(20) NOT NULL CONSTRAINT DF_fin_dt_statut DEFAULT (N'CREE'),
          validateur_id            BIGINT NULL,
          date_validation          DATETIME2(3) NULL,
          commentaire_validation   NVARCHAR(500) NULL,
          executeur_id             BIGINT NULL,
          date_execution           DATETIME2(3) NULL,
          transaction_uuid         UNIQUEIDENTIFIER NULL,
          created_at               DATETIME2(3) NOT NULL CONSTRAINT DF_fin_dt_created DEFAULT SYSUTCDATETIME(),
          created_by_id            BIGINT NULL,
          updated_at               DATETIME2(3) NULL,
          updated_by_id            BIGINT NULL,
          deleted_at               DATETIME2(3) NULL,
          deleted_by_id            BIGINT NULL,
          version                  INT NOT NULL CONSTRAINT DF_fin_dt_version DEFAULT (1),
          CONSTRAINT PK_fin_demande_transfert PRIMARY KEY CLUSTERED (id),
          CONSTRAINT UQ_fin_dt_numero UNIQUE (numero),
          CONSTRAINT CK_fin_dt_source CHECK (source_type IN (N'CAISSE', N'PORTEFEUILLE')),
          CONSTRAINT CK_fin_dt_dest CHECK (destination_type IN (N'CAISSE', N'PORTEFEUILLE')),
          CONSTRAINT CK_fin_dt_statut CHECK (statut IN (N'CREE', N'APPROUVEE', N'REJETEE', N'EXECUTEE', N'ANNULEE'))
        );
        CREATE INDEX IX_fin_dt_demandeur ON dbo.fin_demande_transfert(demandeur_id);
        CREATE INDEX IX_fin_dt_statut ON dbo.fin_demande_transfert(statut);
        PRINT 'Table fin_demande_transfert creee.';
      END
      ELSE
      BEGIN
        PRINT 'Table fin_demande_transfert deja presente.';
      END
    `);
    console.log('OK : migration demande_transfert terminee.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
