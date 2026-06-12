/* Rôle DAF = combinaison Administrateur + Caissier.
   Le dépliage (DAF -> ADMINISTRATEUR + CAISSIER) est géré côté applicatif
   dans AuthorizationService (ROLE_EXPANSION) : DAF n'a donc pas besoin de
   permissions propres dans sec_role_permission.
   1) Étend la contrainte CHECK sur sec_role.code pour autoriser le code DAF.
   2) Insère le rôle s'il n'existe pas (idempotent). */

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_sec_role_code' AND parent_object_id = OBJECT_ID(N'dbo.sec_role')
)
BEGIN
    ALTER TABLE dbo.sec_role DROP CONSTRAINT CK_sec_role_code;
END

ALTER TABLE dbo.sec_role ADD CONSTRAINT CK_sec_role_code
    CHECK (code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'VALIDATEUR', N'DEMANDEUR',
                    N'CAISSIER', N'GESTIONNAIRE_PORTEFEUILLE', N'DAF'));

IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'DAF')
BEGIN
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'DAF', N'Directeur Administratif et Financier',
            N'Rôle combiné : cumule les droits d''Administrateur et de Caissier', 1);
END
