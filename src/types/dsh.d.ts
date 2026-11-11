// src/types/dsh.d.ts
// Type declarations for DSH internal packages (available at runtime)

declare module '@deepseek-ai/cordis' {
  export interface Context {
    require<T>(name: string): T;
    command(name: string, args: string, options?: any): any;
    on(event: string, handler: (...args: any[]) => any): void;
    ui: {
      notify(message: string, level: 'info' | 'error' | 'warn'): void;
    };
    session?: {
      id: string;
      messages: any[];
    };
    llm?: {
      on(event: string, handler: (options: any) => any): void;
    };
    waterfall(event: string, handler: (ctx: any, next: () => any, error: any) => any): void;
  }

  export interface Plugin {
    name: string;
    apply: (ctx: Context, config: any) => void;
  }
}

declare module '@deepseek-ai/dsh-llm' {
  export interface LlmRuntime {
    on(event: string, handler: (options: any) => any): void;
    stream(options: any): AsyncIterable<any>;
  }
}

declare module '@deepseek-ai/dsh-session' {
  export interface Session {
    id: string;
    messages: any[];
  }
}

declare module '@deepseek-ai/dsh-home-paths' {
  export interface SystemInfoProvider {
    getSystemInfo(): Promise<any>;
  }
}