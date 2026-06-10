/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    // Os imports TypeScript com "nodenext" usam extensão .js; Jest precisa de
    // resolver para .ts. Este mapeamento faz exactamente isso.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
};
