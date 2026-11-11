// src/types/sql.d.ts
// Type declarations for sql.js

declare module 'sql.js' {
  export interface SqlValue {
    isNull(): boolean;
    get(): string | number | Uint8Array | null;
    toString(): string;
  }

  export interface Statement {
    bind(params: (string | number | null | Uint8Array)[]): void;
    run(params?: (string | number | null | Uint8Array)[]): void;
    step(): boolean;
    get(): (string | number | null)[];
    getAsObject(): Record<string, any>;
    getColumnNames(): string[];
    free(): void;
  }

  export interface Database {
    exec(sql: string): any[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
    run(sql: string, params?: (string | number | null | Uint8Array)[]): void;
  }

  export interface Config {
    locateFile?: (file: string) => string;
  }

  export function initSqlJs(config?: Config): Promise<{
    Database: new (data?: Uint8Array) => Database;
  }>;

  export default initSqlJs;
}