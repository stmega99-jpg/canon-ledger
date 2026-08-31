export {};

declare global {
  interface ToolExecuteOptions {
    readonly signal?: AbortSignal;
    readonly requestUserInteraction?: () => Promise<unknown>;
  }

  interface SiteToolDescriptor {
    readonly name: string;
    readonly title?: string;
    readonly description: string;
    readonly inputSchema: Record<string, unknown>;
    readonly annotations?: Record<string, boolean>;
    readonly execute: (
      input: Record<string, unknown>,
      options?: ToolExecuteOptions,
    ) => unknown | Promise<unknown>;
  }

  interface ModelContext {
    registerTool(tool: SiteToolDescriptor): void | Promise<void>;
    getTools?(): unknown | Promise<unknown>;
  }

  interface Document {
    readonly modelContext?: ModelContext;
  }
}
