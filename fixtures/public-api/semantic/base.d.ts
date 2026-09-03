export declare class Base {
  protected baseState: string;
  inherited(value: number): number;
}

export interface Contract {
  execute(input: string): boolean;
}
