/** Architecture rules (dependency-cruiser). */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "client-not-to-server",
      comment: "Browser code must never import server modules (server configuration and secrets stay on the server).",
      severity: "error",
      from: { path: ["^src/client/", "^src/instrumentation-client\\.ts$"] },
      to: { path: "^src/server/" },
    },
    {
      name: "server-not-to-app",
      comment: "Server modules are framework-independent; the app layer depends on them, not the other way round.",
      severity: "error",
      from: { path: "^src/server/" },
      to: { path: "^src/app/" },
    },
    {
      name: "no-tests-from-src",
      severity: "error",
      from: { path: "^(src|scripts)/" },
      to: { path: "^tests/" },
    },
    {
      name: "not-to-dev-dep",
      comment: "Production code must not depend on development-only packages.",
      severity: "error",
      from: { path: "^src/", pathNot: "\\.test\\.tsx?$" },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
