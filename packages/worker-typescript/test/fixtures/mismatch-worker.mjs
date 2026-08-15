process.stdout.write(
  JSON.stringify({
    ok: true,
    value: {
      target: "index.d.ts",
      compilerVersion: "6.0.3",
      tsconfigPath: null,
      moduleResolution: "nodenext",
      lookupKind: "import",
      conditions: ["default", "import", "node", "types"],
      snapshotId: "sha256:different",
      trace: [],
      usage: { resolverTraceSteps: 0 },
    },
  }),
);
