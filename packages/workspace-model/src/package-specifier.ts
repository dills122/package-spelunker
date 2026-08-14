export interface PackageSpecifier {
  readonly requested: string;
  readonly packageName: string;
  readonly packageSubpath?: string;
}

export interface InvalidPackageSpecifierFailure {
  readonly code: "invalid_request";
  readonly message: "Package specifier must be a bare or scoped package name with an optional safe subpath.";
}

export type PackageSpecifierResult =
  | { readonly ok: true; readonly value: PackageSpecifier }
  | { readonly ok: false; readonly failure: InvalidPackageSpecifierFailure };

const safeComponent = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/** Validates a package name/subpath before any component is mapped into a filesystem path. */
export function parsePackageSpecifier(value: string): PackageSpecifierResult {
  if (
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > 512 ||
    value.includes("%") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes(":")
  ) {
    return invalidPackageSpecifier();
  }

  const segments = value.split("/");
  const packageSegmentCount = value.startsWith("@") ? 2 : 1;
  if (segments.length < packageSegmentCount) return invalidPackageSpecifier();

  const packageSegments = segments.slice(0, packageSegmentCount);
  const subpathSegments = segments.slice(packageSegmentCount);
  if (
    packageSegments.some((segment) => !safeComponent.test(segment.replace(/^@/, ""))) ||
    subpathSegments.some((segment) => !safeComponent.test(segment))
  ) {
    return invalidPackageSpecifier();
  }

  const packageName = packageSegments.join("/");
  return {
    ok: true,
    value: Object.freeze({
      requested: value,
      packageName,
      ...(subpathSegments.length === 0 ? {} : { packageSubpath: subpathSegments.join("/") }),
    }),
  };
}

function invalidPackageSpecifier(): Extract<PackageSpecifierResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "invalid_request",
      message:
        "Package specifier must be a bare or scoped package name with an optional safe subpath.",
    },
  };
}
