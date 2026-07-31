/**
 * Tests unitaires (Jest + ts-jest).
 *
 * Périmètre : la logique métier PURE, sans base ni serveur — typiquement les
 * règles d'autorisation et les garde-fous anti-escalade, qu'on veut voir casser
 * un test le jour où quelqu'un les modifie par inadvertance.
 *
 * Lancement : npm test  (ou npm run test:cov pour la couverture)
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  // Miroir des "paths" du tsconfig : sans ça, les imports @modules/… ne résolvent pas.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  /**
   * Chaque worker Jest recompile TypeScript de son côté : au-delà de 2, ils se
   * disputent le CPU et la suite passe de ~12 s à plus de 2 minutes, avec un
   * avertissement « worker failed to exit gracefully » qui n'est qu'un symptôme
   * de cette contention (aucune fuite réelle — vérifié via --detectOpenHandles).
   */
  maxWorkers: 2,
};
