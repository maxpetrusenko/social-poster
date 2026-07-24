const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);

if (!Number.isInteger(major) || major < 22 || major >= 26) {
  console.error(
    [
      `social-poster requires Node >=22 <26. Current Node: ${process.version}.`,
      "Use the repo .nvmrc before running tests: nvm use 22",
      "Reason: better-sqlite3 native bindings are built for the supported Node ABI; Node 26 fails before Vitest can run database tests.",
    ].join("\n"),
  );
  process.exit(1);
}
