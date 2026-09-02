import { Base, type Contract } from "./base.js";

/** Service documentation. */
export declare class Service<T extends string = string> extends Base implements Contract {
  private secret: boolean;
  protected state: number;
  readonly name: T;
  optional?: number;
  constructor(name: T);
  static create<U extends string>(name: U): Service<U>;
  execute(input: string): boolean;
  method(value: string): string;
  method(value: number): number;
}
