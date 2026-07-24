/** @type {import("jest").Config} */
module.exports = {
  rootDir: "..",
  testEnvironment: "node",
  watchman: false,
  testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
          target: "es2023",
        },
        module: {
          type: "commonjs",
        },
      },
    ],
  },
  testTimeout: 10000,
};
