module.exports = {
  root: true, // Impede o ESLint de procurar em pastas-pai
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
    tsconfigRootDir: __dirname, // Garante que ele encontre o tsconfig na pasta correta
  },
  ignorePatterns: [
    "/lib/**/*", // Ignora os ficheiros transpilados
    ".eslintrc.js", // Ignora o próprio ficheiro de configuração
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
    "object-curly-spacing": ["error", "always"],
  },
};
