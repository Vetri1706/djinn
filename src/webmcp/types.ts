export interface WebMcpToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

export interface WebMcpToolDescriptor {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: WebMcpToolAnnotations
  execute: (
    input: Record<string, unknown>,
    context?: { signal?: AbortSignal },
  ) => Promise<unknown>
}

export interface ModelContext {
  registerTool: (
    tool: WebMcpToolDescriptor,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ) => Promise<void>
}

declare global {
  interface Document {
    modelContext?: ModelContext
  }
}
