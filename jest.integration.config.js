module.exports = {
  verbose: true,
  moduleFileExtensions: ["ts", "tsx", "js"],
  transform: {
    ".(ts|tsx)": "ts-jest",
  },
  collectCoverage: true,
  coverageReporters: ["lcovonly", "text-summary"],
  testEnvironment: "<rootDir>/testEnvironment.js",
  clearMocks: true,
  collectCoverageFrom: ["src/**/*.ts"],
  testRegex: [String.raw`(snapshot_tests[\/]).*(\.spec\.ts)$`],
};
