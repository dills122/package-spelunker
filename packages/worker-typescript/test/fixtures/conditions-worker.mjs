process.stdout.write(
  JSON.stringify({
    ok: true,
    value: {
      target: "index.d.ts",
      compilerVersion: "6.0.3",
      tsconfigPath: null,
      moduleResolution: "nodenext",
      lookupKind: "import",
      conditions: ["arbitrary"],
      snapshotId: "sha256:fixture",
      trace: [],
      usage: { resolverTraceSteps: 0 },
    },
  }),
);
