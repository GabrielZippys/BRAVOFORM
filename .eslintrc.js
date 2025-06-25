// .eslintrc.js
module.exports = {
  extends: ['next', 'next/core-web-vitals'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn', // Muda de "error" para "warn"
    'no-unused-vars': 'warn', // Para JavaScript normal
  },
};
