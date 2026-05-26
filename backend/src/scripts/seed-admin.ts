/**
 * Script CLI : creer un utilisateur SUPER_ADMIN initial.
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/seed-admin.ts
 *
 * Variables d'environnement supportees :
 *   ADMIN_MATRICULE (defaut: ADMIN-001)
 *   ADMIN_EMAIL     (defaut: admin@npgandour.com)
 *   ADMIN_NOM       (defaut: Admin)
 *   ADMIN_PRENOM    (defaut: Super)
 *   ADMIN_PASSWORD  (defaut: ChangeMe!2026)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '@modules/security/entities/user.entity';
import { Role } from '@modules/security/entities/role.entity';
import { UserRole } from '@modules/security/entities/user-role.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);

  const matricule = process.env.ADMIN_MATRICULE ?? 'ADMIN-001';
  const email = (process.env.ADMIN_EMAIL ?? 'admin@npgandour.com').toLowerCase();
  const nom = process.env.ADMIN_NOM ?? 'Admin';
  const prenom = process.env.ADMIN_PRENOM ?? 'Super';
  const motDePasseClair = process.env.ADMIN_PASSWORD ?? 'ChangeMe!2026';

  try {
    const userRepo = ds.getRepository(User);
    const roleRepo = ds.getRepository(Role);
    const userRoleRepo = ds.getRepository(UserRole);

    let user = await userRepo.findOne({ where: [{ matricule }, { email }] });
    if (user) {
      console.log(`Utilisateur existant : ${user.matricule} / ${user.email}`);
    } else {
      const hash = await bcrypt.hash(motDePasseClair, 12);
      user = userRepo.create({
        matricule,
        nom,
        prenom,
        email,
        motDePasseHash: hash,
        estActif: true,
      });
      user = await userRepo.save(user);
      console.log(`Utilisateur cree : ${user.matricule} (id=${user.id})`);
    }

    const superAdmin = await roleRepo.findOne({ where: { code: 'SUPER_ADMIN' } });
    if (!superAdmin) {
      console.error('Role SUPER_ADMIN introuvable. Le script DDL a-t-il bien tourne ?');
      process.exit(2);
    }

    const link = await userRoleRepo.findOne({ where: { userId: user.id, roleId: superAdmin.id } });
    if (!link) {
      await userRoleRepo.save(userRoleRepo.create({ userId: user.id, roleId: superAdmin.id }));
      console.log(`Role SUPER_ADMIN attribue a ${user.matricule}`);
    } else {
      console.log(`Role SUPER_ADMIN deja attribue a ${user.matricule}`);
    }

    console.log('\n=========================================');
    console.log('  Compte super-admin pret');
    console.log('=========================================');
    console.log(`  Matricule    : ${matricule}`);
    console.log(`  Email        : ${email}`);
    console.log(`  Mot de passe : ${motDePasseClair}`);
    console.log('=========================================');
    console.log('  Pensez a changer le mot de passe en premiere connexion.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
