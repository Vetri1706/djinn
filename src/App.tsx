import { useMemo, useState } from 'react'
import {
  applyApprovedPlan,
  approveStagedResolution,
  resolveSkyrimProfile,
  stageResolutionPlan,
  verifyModProfile,
} from './domain/resolver'
import {
  skyrimDemoIntent,
  skyrimDemoProfile,
  skyrimModCatalog,
} from './domain/skyrimData'
import type {
  ModId,
  ModProfile,
  ResolutionAction,
  ResolutionPlan,
  ResolutionResult,
  StagedResolution,
  VerificationIssue,
} from './domain/types'
import { useDjinnWebMcp } from './webmcp/useDjinnWebMcp'

interface ActivityEntry {
  id: number
  source: 'agent' | 'player' | 'system'
  text: string
}

const catalogById = new Map(skyrimModCatalog.map((mod) => [mod.id, mod]))
const defaultGoal =
  'Make this profile survival-focused. Keep Legacy of the Dragonborn and Ordinator. Avoid heavy graphics mods.'

function modName(modId: ModId): string {
  return catalogById.get(modId)?.name ?? modId
}

function cloneProfile(profile: ModProfile): ModProfile {
  return { ...profile, mods: profile.mods.map((mod) => ({ ...mod })) }
}

function compactPlan(plan: ResolutionPlan) {
  return {
    id: plan.id,
    route: plan.route,
    title: plan.title,
    summary: plan.summary,
    actions: plan.actions.map((action) => ({
      kind: action.kind,
      mod: modName(action.modId),
      reason: action.reason,
    })),
    required_patches: plan.requiredPatchIds.map(modName),
    tradeoffs: plan.tradeoffs,
    verification: plan.verification,
    requires_human_approval: true,
  }
}

function actionLabel(action: ResolutionAction): string {
  switch (action.kind) {
    case 'install':
      return 'Add'
    case 'update':
      return 'Update'
    case 'enable':
      return 'Enable'
    case 'disable':
      return 'Disable'
    case 'reorder':
      return 'Reorder'
  }
}

function issueTone(issue: VerificationIssue): 'danger' | 'warning' {
  return issue.severity === 'error' ? 'danger' : 'warning'
}

export default function App() {
  const [profile, setProfile] = useState<ModProfile>(() => cloneProfile(skyrimDemoProfile))
  const [resolution, setResolution] = useState<ResolutionResult | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [staged, setStaged] = useState<StagedResolution | null>(null)
  const [appliedPlanId, setAppliedPlanId] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([
    { id: 1, source: 'system', text: 'Skyrim SE profile 07 loaded from the live page.' },
  ])

  const verification = useMemo(
    () => verifyModProfile(profile, skyrimDemoIntent),
    [profile],
  )
  const selectedPlan =
    resolution?.plans.find((plan) => plan.id === selectedPlanId) ?? null
  const enabledMods = profile.mods
    .filter((mod) => mod.enabled)
    .sort((left, right) => left.loadOrder - right.loadOrder)

  const addActivity = (source: ActivityEntry['source'], text: string) => {
    setActivity((entries) => [
      ...entries.slice(-6),
      { id: Date.now() + Math.random(), source, text },
    ])
  }

  const buildResolution = (): ResolutionResult =>
    resolveSkyrimProfile({ profile, intent: skyrimDemoIntent })

  const previewPlan = (route?: string) => {
    const nextResolution = buildResolution()
    const plan =
      nextResolution.plans.find((candidate) => candidate.route === route) ??
      nextResolution.plans.find(
        (candidate) => candidate.id === nextResolution.recommendedPlanId,
      ) ??
      nextResolution.plans[0]

    setResolution(nextResolution)
    setSelectedPlanId(plan.id)
    setStaged(stageResolutionPlan(plan))
    setAppliedPlanId(null)
    addActivity('agent', `${plan.title} staged for player review.`)
    return { ok: true, staged: compactPlan(plan) }
  }

  const choosePlan = (plan: ResolutionPlan) => {
    setSelectedPlanId(plan.id)
    setStaged(stageResolutionPlan(plan))
    setAppliedPlanId(null)
    addActivity('player', `${plan.title} selected for review.`)
  }

  const approvePlan = () => {
    if (!staged || staged.state !== 'pending') return
    const approved = approveStagedResolution(staged, {
      approvedBy: 'Player',
      approvedAt: new Date().toISOString(),
    })
    setStaged(approved)
    addActivity('player', `${staged.plan.title} approved. No changes applied yet.`)
  }

  const commitApprovedPlan = (planId: string) => {
    if (!staged || staged.plan.id !== planId) {
      return { ok: false, error: 'That plan is not the plan currently staged in the page.' }
    }
    if (staged.state !== 'approved') {
      return { ok: false, error: 'The player has not approved this staged plan in the page.' }
    }

    const nextProfile = applyApprovedPlan(profile, staged)
    const finalVerification = verifyModProfile(nextProfile, skyrimDemoIntent)
    setProfile(nextProfile)
    setAppliedPlanId(planId)
    addActivity('agent', `Approved plan applied to profile revision ${nextProfile.revision}.`)
    return {
      ok: true,
      profile_revision: nextProfile.revision,
      verification: finalVerification,
    }
  }

  const resetDemo = () => {
    setProfile(cloneProfile(skyrimDemoProfile))
    setResolution(null)
    setSelectedPlanId(null)
    setStaged(null)
    setAppliedPlanId(null)
    setActivity([
      { id: Date.now(), source: 'system', text: 'Demo profile reset to revision 07.' },
    ])
  }

  const webMcpStatus = useDjinnWebMcp({
    getCurrentProfile: () => ({
      ok: true,
      game: 'Skyrim Special Edition',
      revision: profile.revision,
      enabled_mods: enabledMods.map((mod) => ({
        id: mod.id,
        name: modName(mod.id),
        version: mod.version,
        load_order: mod.loadOrder,
      })),
      player_intent: {
        desired_experience: skyrimDemoIntent.desiredExperienceTags,
        must_keep: skyrimDemoIntent.mustKeepModIds.map(modName),
        avoid: skyrimDemoIntent.avoidTags,
        performance: skyrimDemoIntent.performancePreference,
      },
    }),
    inspectMod: (modId) => {
      const definition = catalogById.get(modId)
      if (!definition) return { ok: false, error: `Unknown mod: ${modId}` }
      return {
        ok: true,
        mod: definition,
        profile_state: profile.mods.find((mod) => mod.id === modId) ?? null,
      }
    },
    getDependencyGraph: () => {
      const relevantIds = new Set([
        ...enabledMods.map((mod) => mod.id),
        'sunhelm',
        'campfire',
        'frostfall',
        'papyrusutil',
        'ordinator-apocalypse-patch',
        'lotd-open-cities-patch',
      ])
      const relevantMods = skyrimModCatalog.filter((mod) => relevantIds.has(mod.id))
      return {
        ok: true,
        nodes: relevantMods.map((mod) => ({ id: mod.id, name: mod.name })),
        edges: relevantMods.flatMap((mod) => [
          ...mod.dependencies.map((rule) => ({
            from: mod.id,
            to: rule.modId,
            kind: 'requires',
            rule_id: rule.ruleId,
          })),
          ...mod.incompatibilities
            .filter((rule) => relevantIds.has(rule.modId))
            .map((rule) => ({
              from: mod.id,
              to: rule.modId,
              kind: rule.resolvedByPatchId ? 'requires-patch' : 'incompatible',
              rule_id: rule.ruleId,
            })),
        ]),
      }
    },
    listConflicts: () => ({
      ok: true,
      profile_revision: profile.revision,
      valid: verification.valid,
      conflicts: verification.issues,
    }),
    findRequiredPatches: () => {
      const result = buildResolution()
      const patches = [...new Set(result.plans.flatMap((plan) => plan.requiredPatchIds))]
      return {
        ok: true,
        patches: patches.map((id) => ({ id, name: modName(id) })),
        required_by_every_valid_plan: patches,
      }
    },
    previewResolutionPlan: (route) => previewPlan(route),
    compareResolutionOptions: () => {
      const result = buildResolution()
      return {
        ok: true,
        recommended_plan_id: result.recommendedPlanId,
        options: result.plans.map(compactPlan),
      }
    },
    applyApprovedPlan: (planId) => commitApprovedPlan(planId),
    verifyProfile: () => ({
      ok: true,
      profile_revision: profile.revision,
      ...verification,
    }),
    onToolCall: (toolName) =>
      addActivity('agent', `${toolName.replaceAll('_', ' ')} called through WebMCP.`),
  })

  const webMcpLabel = {
    registering: 'Registering tools',
    ready: '9 WebMCP tools live',
    unsupported: 'UI demo · WebMCP unavailable',
    blocked: 'WebMCP registration blocked',
  }[webMcpStatus]

  const reorderedCount =
    selectedPlan?.actions.filter((action) => action.kind === 'reorder').length ?? 0
  const visibleActions =
    selectedPlan?.actions.filter((action) => action.kind !== 'reorder') ?? []

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-rune" aria-hidden="true"><span>D</span></span>
          <div>
            <strong>DJINN</strong>
            <small>MOD INTELLIGENCE · PLAYER AUTHORITY</small>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="game-pill">SKYRIM SE · PROFILE 07</span>
          <span className={`mcp-pill ${webMcpStatus}`}>
            <i aria-hidden="true" /> {webMcpLabel}
          </span>
        </div>
      </header>

      <main className="workspace-grid">
        <aside className="profile-rail panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ACTIVE PROFILE</span>
              <h2>Relic Hunter</h2>
            </div>
            <span className="revision">R{String(profile.revision).padStart(2, '0')}</span>
          </div>

          <div className="intent-card">
            <span className="eyebrow">PLAYER INTENT</span>
            <p>“{defaultGoal}”</p>
            <div className="constraint-list">
              <span>◆ Survival</span>
              <span>◇ Balanced GPU</span>
              <span>⌁ 2 must-keeps</span>
            </div>
          </div>

          <div className="mod-list-heading">
            <span>LOAD ORDER</span>
            <span>{enabledMods.length} ACTIVE</span>
          </div>
          <div className="mod-list">
            {enabledMods.map((profileMod) => {
              const definition = catalogById.get(profileMod.id)
              const issues = verification.issues.filter((issue) =>
                issue.modIds.includes(profileMod.id),
              )
              const mustKeep = skyrimDemoIntent.mustKeepModIds.includes(profileMod.id)
              const tone = issues.some((issue) => issue.severity === 'error')
                ? 'conflict'
                : mustKeep
                  ? 'protected'
                  : 'clean'
              return (
                <div className={`mod-row ${tone}`} key={profileMod.id}>
                  <span className="load-index">
                    {String(profileMod.loadOrder).padStart(2, '0')}
                  </span>
                  <span className="mod-copy">
                    <strong>{definition?.name ?? profileMod.id}</strong>
                    <small>
                      {definition?.kind ?? 'unknown'} · {profileMod.version}
                    </small>
                  </span>
                  <span className="mod-state" title={mustKeep ? 'Must keep' : issues[0]?.message}>
                    {mustKeep ? '◆' : issues.length ? '!' : '·'}
                  </span>
                </div>
              )
            })}
          </div>
          <button className="quiet-button" onClick={resetDemo} type="button">
            ↺ Reset demo profile
          </button>
        </aside>

        <section className="decision-surface">
          <div className="status-band panel">
            <div>
              <span className="metric danger">{verification.issues.length}</span>
              <span>rules need attention</span>
            </div>
            <div>
              <span className="metric">{resolution?.plans.length ?? '—'}</span>
              <span>valid routes</span>
            </div>
            <div>
              <span className="metric good">2/2</span>
              <span>must-keeps preserved</span>
            </div>
            <div className="deterministic-stamp">
              <i>✓</i>
              <span>TECHNICAL VALIDITY<br /><strong>DETERMINISTIC</strong></span>
            </div>
          </div>

          {!resolution ? (
            <div className="analysis-panel panel">
              <div className="analysis-copy">
                <span className="eyebrow danger-text">PROFILE UNSTABLE</span>
                <h1>Your load order works against the experience you want.</h1>
                <p>
                  Djinn separates your intent from technical validity. The agent can read
                  this profile semantically; the resolver—not the model—proves each plan.
                </p>
                <button className="primary-button" onClick={() => previewPlan()} type="button">
                  <span>Resolve this profile</span>
                  <span aria-hidden="true">→</span>
                </button>
                <small className="safety-note">Preview only · nothing applies without your approval</small>
              </div>

              <ConflictMap applied={false} />

              <div className="conflict-stack">
                {verification.issues.slice(0, 4).map((issue) => (
                  <div className={`conflict-card ${issueTone(issue)}`} key={`${issue.kind}-${issue.modIds.join('-')}`}>
                    <span>{issue.severity === 'error' ? '×' : '!'}</span>
                    <div>
                      <strong>{issue.kind.replaceAll('-', ' ')}</strong>
                      <p>{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="plan-panel panel">
              <div className="plan-header">
                <div>
                  <span className="eyebrow">RESOLUTION OPTIONS</span>
                  <h1>Two stable ways forward.</h1>
                </div>
                <span className="verified-chip">✓ BOTH GRAPH-VERIFIED</span>
              </div>

              <div className="plan-tabs" role="tablist" aria-label="Resolution plans">
                {resolution.plans.map((plan, index) => (
                  <button
                    aria-selected={plan.id === selectedPlanId}
                    className={plan.id === selectedPlanId ? 'active' : ''}
                    key={plan.id}
                    onClick={() => choosePlan(plan)}
                    role="tab"
                    type="button"
                  >
                    <span>PLAN {String.fromCharCode(65 + index)}</span>
                    <strong>{plan.route === 'sunhelm-balanced' ? 'Lean survival' : 'Deep survival'}</strong>
                    {plan.id === resolution.recommendedPlanId && <em>RECOMMENDED</em>}
                  </button>
                ))}
              </div>

              {selectedPlan && (
                <>
                  <div className="plan-summary">
                    <div>
                      <span className="eyebrow">{selectedPlan.route.replaceAll('-', ' ')}</span>
                      <h2>{selectedPlan.title}</h2>
                      <p>{selectedPlan.summary}</p>
                    </div>
                    <div className="plan-score">
                      <strong>0</strong>
                      <span>projected blockers</span>
                    </div>
                  </div>

                  <div className="change-grid">
                    {visibleActions.map((action) => (
                      <div className={`change-row ${action.kind}`} key={`${action.kind}-${action.modId}`}>
                        <span className="action-badge">{actionLabel(action)}</span>
                        <div>
                          <strong>{modName(action.modId)}</strong>
                          <small>{action.reason}</small>
                        </div>
                      </div>
                    ))}
                    {reorderedCount > 0 && (
                      <div className="change-row reorder">
                        <span className="action-badge">Order</span>
                        <div>
                          <strong>{reorderedCount} load-order positions corrected</strong>
                          <small>Topological sort satisfies every dependency and load-after rule.</small>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="tradeoff-row">
                    <span className="eyebrow">TRADE-OFF</span>
                    <p>{selectedPlan.tradeoffs[0]}</p>
                  </div>

                  <div className={`approval-dock ${appliedPlanId ? 'applied' : staged?.state ?? 'pending'}`}>
                    <div>
                      <span className="approval-icon">
                        {appliedPlanId ? '✓' : staged?.state === 'approved' ? '◆' : '◇'}
                      </span>
                      <div>
                        <strong>
                          {appliedPlanId
                            ? 'Profile verified'
                            : staged?.state === 'approved'
                              ? 'Player approval recorded'
                              : 'Human approval required'}
                        </strong>
                        <small>
                          {appliedPlanId
                            ? `Revision ${profile.revision} has no unresolved technical or intent conflicts.`
                            : staged?.state === 'approved'
                              ? 'The agent may now apply this exact plan. Stale or different plans will fail.'
                              : 'Review every add, disable, and reorder before authorizing the write.'}
                        </small>
                      </div>
                    </div>
                    {!appliedPlanId && staged?.state === 'pending' && (
                      <button className="primary-button compact" onClick={approvePlan} type="button">
                        Approve this plan
                      </button>
                    )}
                    {!appliedPlanId && staged?.state === 'approved' && (
                      <button
                        className="primary-button compact"
                        onClick={() => commitApprovedPlan(staged.plan.id)}
                        type="button"
                      >
                        Apply approved plan
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <aside className="agent-rail panel">
          <div className="panel-heading agent-heading">
            <div>
              <span className="eyebrow">AGENT SURFACE</span>
              <h2>Live context</h2>
            </div>
            <span className="pulse-dot" aria-hidden="true" />
          </div>

          <div className="tool-callout">
            <span className="tool-glyph">⌘</span>
            <div>
              <strong>Semantic tools, not clicks</strong>
              <p>The page exposes the profile graph, constraints, plans, approval state, and verifier directly.</p>
            </div>
          </div>

          <div className="activity-log">
            <span className="section-label">RECENT ACTIVITY</span>
            {activity.slice().reverse().map((entry) => (
              <div className={`activity-entry ${entry.source}`} key={entry.id}>
                <span>{entry.source === 'agent' ? 'A' : entry.source === 'player' ? 'P' : '·'}</span>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>

          <div className="tool-index">
            <span className="section-label">EXPOSED CAPABILITIES</span>
            {[
              'get current profile',
              'inspect mod',
              'dependency graph',
              'list conflicts',
              'find patches',
              'preview plan',
              'compare options',
              'apply approved plan',
              'verify profile',
            ].map((tool, index) => (
              <div key={tool}><span>{String(index + 1).padStart(2, '0')}</span>{tool}</div>
            ))}
          </div>

          <div className="trust-boundary">
            <span>VISIBLE TRUST BOUNDARY</span>
            <strong>Agent proposes. Resolver proves. Player commits.</strong>
          </div>
        </aside>
      </main>
    </div>
  )
}

function ConflictMap({ applied }: { applied: boolean }) {
  return (
    <div className={`conflict-map ${applied ? 'resolved' : ''}`} aria-label="Profile conflict graph">
      <svg aria-hidden="true" viewBox="0 0 560 250">
        <path d="M113 52 C205 52 205 105 278 105" />
        <path d="M113 192 C205 192 205 135 278 135" />
        <path className="danger-line" d="M278 105 C355 105 355 48 449 48" />
        <path className="danger-line" d="M278 135 C355 135 355 130 449 130" />
        <path className="warning-line" d="M278 135 C355 135 355 210 449 210" />
      </svg>
      <div className="graph-node must one"><small>MUST KEEP</small><strong>Legacy</strong></div>
      <div className="graph-node must two"><small>MUST KEEP</small><strong>Ordinator</strong></div>
      <div className="graph-core"><span>{applied ? '✓' : '!'}</span><strong>{applied ? 'VALID' : 'CONFLICT'}</strong></div>
      <div className="graph-node danger three"><small>PATCH GAP</small><strong>Open Cities</strong></div>
      <div className="graph-node danger four"><small>PERK COLLISION</small><strong>Adamant</strong></div>
      <div className="graph-node warning five"><small>GPU CONSTRAINT</small><strong>Skyrim 202X</strong></div>
    </div>
  )
}
