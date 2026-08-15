process.stdout.write(
  JSON.stringify({
    ok: false,
    failure: {
      code: "resolution_failed",
      message: "TypeScript did not resolve a declaration for the selected package.",
      stack: "/private/workspace/raw-stack",
    },
  }),
);
