module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  moduleNameMapper: {
    '^@system\.(.*)$': '<rootDir>/tests/mocks/system/$1.js'
  },
  collectCoverageFrom: ['entry/src/main/js/MainAbility/common/**/*.js'],
  clearMocks: true
};
