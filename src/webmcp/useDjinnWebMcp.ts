import { useEffect, useRef, useState } from 'react'
import type { WebMcpToolDescriptor } from './types'

export type WebMcpRegistrationStatus =
  | 'registering'
  | 'ready'
  | 'unsupported'
  | 'blocked'

export interface DjinnToolHandlers {
  getCurrentProfile: () => unknown
  inspectMod: (modId: string) => unknown
  getDependencyGraph: () => unknown
  listConflicts: () => unknown
  findRequiredPatches: () => unknown
  previewResolutionPlan: (route?: string) => unknown
  compareResolutionOptions: () => unknown
  applyApprovedPlan: (planId: string) => unknown
  verifyProfile: () => unknown
  onToolCall: (toolName: string) => void
}

const EMPTY_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

function stringArgument(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function serializableError(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'The tool could not complete the request.',
  }
}

export function useDjinnWebMcp(
  handlers: DjinnToolHandlers,
): WebMcpRegistrationStatus {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [status, setStatus] = useState<WebMcpRegistrationStatus>('registering')

  useEffect(() => {
    const modelContext = document.modelContext
    if (!window.isSecureContext || typeof modelContext?.registerTool !== 'function') {
      setStatus('unsupported')
      return
    }

    const registration = new AbortController()
    const readOnly = { readOnlyHint: true, untrustedContentHint: false }
    const write = { readOnlyHint: false, untrustedContentHint: false }

    const invoke = async (
      toolName: string,
      signal: AbortSignal | undefined,
      action: () => unknown,
    ): Promise<unknown> => {
      if (signal?.aborted) throw signal.reason
      handlersRef.current.onToolCall(toolName)
      try {
        return await action()
      } catch (error) {
        return serializableError(error)
      }
    }

    const tools: WebMcpToolDescriptor[] = [
      {
        name: 'get_current_mod_profile',
        title: 'Get current mod profile',
        description: 'Returns the live Skyrim profile, revision, enabled mods, and player constraints without changing state.',
        inputSchema: EMPTY_INPUT_SCHEMA,
        annotations: readOnly,
        execute: async (_input, context) =>
          invoke('get_current_mod_profile', context?.signal, () => handlersRef.current.getCurrentProfile()),
      },
      {
        name: 'inspect_mod',
        title: 'Inspect a mod',
        description: 'Returns one curated mod definition with dependencies, incompatibilities, patches, performance tier, and live profile status.',
        inputSchema: {
          type: 'object',
          properties: {
            mod_id: { type: 'string', description: 'Stable mod identifier from the current profile or dependency graph.' },
          },
          required: ['mod_id'],
          additionalProperties: false,
        },
        annotations: readOnly,
        execute: async (input, context) =>
          invoke('inspect_mod', context?.signal, () => {
            const modId = stringArgument(input, 'mod_id')
            return modId
              ? handlersRef.current.inspectMod(modId)
              : { ok: false, error: 'mod_id is required.' }
          }),
      },
      {
        name: 'get_dependency_graph',
        title: 'Get dependency graph',
        description: 'Returns semantic dependency and load-after edges for the live Skyrim profile and relevant candidate mods.',
        inputSchema: EMPTY_INPUT_SCHEMA,
        annotations: readOnly,
        execute: async (_input, context) =>
          invoke('get_dependency_graph', context?.signal, () => handlersRef.current.getDependencyGraph()),
      },
      {
        name: 'list_conflicts',
        title: 'List profile conflicts',
        description: 'Deterministically verifies the current profile and returns missing dependencies, incompatibilities, patch gaps, load-order errors, and violated player constraints.',
        inputSchema: EMPTY_INPUT_SCHEMA,
        annotations: readOnly,
        execute: async (_input, context) =>
          invoke('list_conflicts', context?.signal, () => handlersRef.current.listConflicts()),
      },
      {
        name: 'find_required_patches',
        title: 'Find required patches',
        description: 'Returns compatibility patches required by valid resolution plans for the current profile and player constraints.',
        inputSchema: EMPTY_INPUT_SCHEMA,
        annotations: readOnly,
        execute: async (_input, context) =>
          invoke('find_required_patches', context?.signal, () => handlersRef.current.findRequiredPatches()),
      },
      {
        name: 'preview_resolution_plan',
        title: 'Preview a resolution plan',
        description: 'Builds and visibly stages a deterministic resolution plan for human review. It never changes the active profile or approves the plan.',
        inputSchema: {
          type: 'object',
          properties: {
            route: {
              type: 'string',
              enum: ['sunhelm-balanced', 'frostfall-classic'],
              description: 'Optional survival route. Omit to use the recommended route.',
            },
          },
          additionalProperties: false,
        },
        annotations: write,
        execute: async (input, context) =>
          invoke('preview_resolution_plan', context?.signal, () =>
            handlersRef.current.previewResolutionPlan(stringArgument(input, 'route')),
          ),
      },
      {
        name: 'compare_resolution_options',
        title: 'Compare resolution options',
        description: 'Returns the valid resolution routes, exact actions, trade-offs, required patches, and verification outcome without changing the active profile.',
        inputSchema: EMPTY_INPUT_SCHEMA,
        annotations: readOnly,
        execute: async (_input, context) =>
          invoke('compare_resolution_options', context?.signal, () => handlersRef.current.compareResolutionOptions()),
      },
      {
        name: 'apply_approved_plan',
        title: 'Apply an approved plan',
        description: 'Applies a plan only after the player approved that exact staged plan in the visible page. Rejects pending, rejected, mismatched, or stale plans.',
        inputSchema: {
          type: 'object',
          properties: {
            plan_id: { type: 'string', description: 'Exact identifier of the visibly staged and human-approved plan.' },
          },
          required: ['plan_id'],
          additionalProperties: false,
        },
        annotations: write,
        execute: async (input, context) =>
          invoke('apply_approved_plan', context?.signal, () => {
            const planId = stringArgument(input, 'plan_id')
            return planId
              ? handlersRef.current.applyApprovedPlan(planId)
              : { ok: false, error: 'plan_id is required.' }
          }),
      },
      {
        name: 'verify_mod_profile',
        title: 'Verify mod profile',
        description: 'Runs deterministic consistency checks against the live profile and reports whether every dependency, incompatibility, patch, load order, must-keep, and performance constraint passes.',
        inputSchema: EMPTY_INPUT_SCHEMA,
        annotations: readOnly,
        execute: async (_input, context) =>
          invoke('verify_mod_profile', context?.signal, () => handlersRef.current.verifyProfile()),
      },
    ]

    void Promise.all(
      tools.map((tool) => modelContext.registerTool(tool, { signal: registration.signal })),
    )
      .then(() => {
        if (!registration.signal.aborted) setStatus('ready')
      })
      .catch(() => {
        if (!registration.signal.aborted) setStatus('blocked')
      })

    return () => registration.abort()
  }, [])

  return status
}
