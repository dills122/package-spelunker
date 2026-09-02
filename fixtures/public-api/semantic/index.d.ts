export { renamed as alias } from "./aliases.js";
export { Base, type Contract } from "./base.js";
export * from "./cycle-a.js";
export { Service } from "./service.js";
export * from "./star.js";

/** Returns the supplied value. */
export default function identity<T>(value: T): T;

/** A declaration merged across type and namespace meanings. */
export interface Merged {
  value: string;
}

export declare namespace Merged {
  const kind: "merged";
}

/** Parses text or numbers. @deprecated Use decode instead. */
export declare function parse(value: string): string;
export declare function parse(value: number): number;
