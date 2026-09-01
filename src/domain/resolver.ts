import type {
  ApprovalRecord,
  ModDefinition,
  ModId,
  ModProfile,
  PlayerIntent,
  ProfileMod,
  RejectionRecord,
  ResolutionAction,
  ResolutionPlan,
  ResolutionResult,
  ResolvedRule,
  ResolveRequest,
  StagedResolution,
  VerificationIssue,
  VerificationResult,
} from "./types";
import { skyrimModCatalog } from "./skyrimData";

interface RouteDefinition {
  readonly id: ResolutionPlan["route"];
  readonly title: string;
  readonly summary: string;
  readonly enable: readonly ModId[];
  readonly disable: readonly ModId[];
  readonly tradeoffs: readonly string[];
}

interface MutableProfileMod {
  id: ModId;
  version: string;
  enabled: boolean;
  loadOrder: number;
}

const ROUTES: readonly RouteDefinition[] = [
  {
    id: "sunhelm-balanced",
    title: "Balanced survival with SunHelm",
    summary:
      "Keeps Legacy of the Dragonborn and Ordinator, adds a light survival stack, and removes duplicated or expensive systems.",
    enable: ["sunhelm"],
    disable: ["survival-mode", "campfire", "frostfall"],
    tradeoffs: [
      "Uses a streamlined needs model instead of Frostfall's more granular exposure simulation.",
      "Disables the built-in Survival Mode so only one needs system owns hunger and fatigue.",
    ],
  },
  {
    id: "frostfall-classic",
    title: "Classic survival with Campfire and Frostfall",
    summary:
      "Keeps Legacy of the Dragonborn and Ordinator while adding a deeper camping and exposure stack.",
    enable: ["campfire", "frostfall"],
    disable: ["survival-mode", "sunhelm"],
    tradeoffs: [
      "Adds more dependencies and script activity than the SunHelm route.",
      "Provides more granular camping and exposure mechanics.",
      "Disables the built-in Survival Mode so only one exposure system is active.",
    ],
  },
];

export class ResolutionApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolutionApprovalError";
  }
}

export function compareVersions(left: string, right: string): number {
  const leftParts = numericVersionParts(left);
  const rightParts = numericVersionParts(right);
  const width = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < width; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  return 0;
}

/** Produce deterministic, fully verified alternatives. No profile is mutated. */
export function resolveSkyrimProfile(
  request: ResolveRequest,
  catalog: readonly ModDefinition[] = skyrimModCatalog,
): ResolutionResult {
  const plans = ROUTES.map((route) => buildPlan(request, route, catalog));

  return {
    recommendedPlanId: plans[0].id,
    plans,
  };
}

export function verifyModProfile(
  profile: ModProfile,
  intent?: PlayerIntent,
  catalog: readonly ModDefinition[] = skyrimModCatalog,
): VerificationResult {
  const definitions = definitionMap(catalog);
  const enabled = new Map(
    profile.mods.filter((mod) => mod.enabled).map((mod) => [mod.id, mod]),
  );
  const issues: VerificationIssue[] = [];

  for (const mod of enabled.values()) {
    const definition = definitions.get(mod.id);
    if (!definition) {
      issues.push({
        kind: "unknown-mod",
        severity: "error",
        modIds: [mod.id],
        message: `Enabled mod ${mod.id} is not present in the curated catalog.`,
      });
      continue;
    }

    for (const dependency of definition.dependencies) {
      const installedDependency = enabled.get(dependency.modId);
      if (!installedDependency) {
        issues.push({
          kind: "missing-dependency",
          severity: "error",
          modIds: [mod.id, dependency.modId],
          ruleId: dependency.ruleId,
          message: `${definition.name} requires ${nameOf(dependency.modId, definitions)}.`,
        });
        continue;
      }

      if (
        dependency.minimumVersion &&
        compareVersions(installedDependency.version, dependency.minimumVersion) < 0
      ) {
        issues.push({
          kind: "dependency-version",
          severity: "error",
          modIds: [mod.id, dependency.modId],
          ruleId: dependency.ruleId,
          message: `${definition.name} requires ${nameOf(
            dependency.modId,
            definitions,
          )} ${dependency.minimumVersion} or newer.`,
        });
      }
    }

    for (const incompatibility of definition.incompatibilities) {
      if (!enabled.has(incompatibility.modId)) continue;

      const patchEnabled = incompatibility.resolvedByPatchId
        ? enabled.has(incompatibility.resolvedByPatchId)
        : false;
      if (patchEnabled) continue;

      issues.push({
        kind: incompatibility.resolvedByPatchId
          ? "missing-patch"
          : "incompatibility",
        severity: "error",
        modIds: [mod.id, incompatibility.modId],
        ruleId: incompatibility.ruleId,
        message: incompatibility.resolvedByPatchId
          ? `${definition.name} and ${nameOf(
              incompatibility.modId,
              definitions,
            )} require ${nameOf(incompatibility.resolvedByPatchId, definitions)}.`
          : incompatibility.reason,
      });
    }

    if (definition.patches) {
      const missingTargets = definition.patches.filter((id) => !enabled.has(id));
      if (missingTargets.length > 0) {
        issues.push({
          kind: "orphan-patch",
          severity: "warning",
          modIds: [definition.id, ...missingTargets],
          message: `${definition.name} is enabled without all of the mods it patches.`,
        });
      }
    }
  }

  issues.push(...verifyLoadOrder(profile, definitions));

  if (intent) {
    for (const mustKeepId of intent.mustKeepModIds) {
      if (!enabled.has(mustKeepId)) {
        issues.push({
          kind: "must-keep",
          severity: "error",
          modIds: [mustKeepId],
          message: `${nameOf(mustKeepId, definitions)} is a must-keep mod but is not enabled.`,
        });
      }
    }

    for (const mod of enabled.values()) {
      const definition = definitions.get(mod.id);
      const avoidedTags = definition?.experienceTags.filter((tag) =>
        intent.avoidTags.includes(tag),
      );
      if (avoidedTags && avoidedTags.length > 0) {
        issues.push({
          kind: "avoided-tag",
          severity: "error",
          modIds: [mod.id],
          message: `${definition?.name ?? mod.id} carries avoided tag${
            avoidedTags.length === 1 ? "" : "s"
          }: ${avoidedTags.join(", ")}.`,
        });
      }
    }
  }

  const deduplicatedIssues = deduplicateIssues(issues);
  return {
    valid: !deduplicatedIssues.some((issue) => issue.severity === "error"),
    issues: deduplicatedIssues,
  };
}

/** Stage a valid plan for review without changing the active profile. */
export function stageResolutionPlan(plan: ResolutionPlan): StagedResolution {
  if (!plan.verification.valid) {
    throw new ResolutionApprovalError(
      `Plan ${plan.id} cannot be staged because verification failed.`,
    );
  }

  return {
    id: `${plan.id}@revision-${plan.baseRevision}`,
    state: "pending",
    plan,
  };
}

export function approveStagedResolution(
  staged: StagedResolution,
  approval: ApprovalRecord,
): StagedResolution {
  if (staged.state !== "pending") {
    throw new ResolutionApprovalError(
      `Only a pending resolution can be approved; ${staged.id} is ${staged.state}.`,
    );
  }
  if (!approval.approvedBy.trim() || !approval.approvedAt.trim()) {
    throw new ResolutionApprovalError(
      "Approval requires an approver and an explicit timestamp.",
    );
  }

  return {
    ...staged,
    state: "approved",
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
  };
}

export function rejectStagedResolution(
  staged: StagedResolution,
  rejection: RejectionRecord,
): StagedResolution {
  if (staged.state !== "pending") {
    throw new ResolutionApprovalError(
      `Only a pending resolution can be rejected; ${staged.id} is ${staged.state}.`,
    );
  }
  if (
    !rejection.rejectedBy.trim() ||
    !rejection.rejectedAt.trim() ||
    !rejection.reason.trim()
  ) {
    throw new ResolutionApprovalError(
      "Rejection requires a reviewer, timestamp, and reason.",
    );
  }

  return {
    ...staged,
    state: "rejected",
    rejectedBy: rejection.rejectedBy,
    rejectedAt: rejection.rejectedAt,
    reason: rejection.reason,
  };
}

/**
 * Apply is intentionally the only state-transition function. It rejects
 * pending/rejected plans and stale base revisions, so preview and staging can
 * never silently commit changes.
 */
export function applyApprovedPlan(
  currentProfile: ModProfile,
  staged: StagedResolution,
): ModProfile {
  if (staged.state !== "approved") {
    throw new ResolutionApprovalError(
      `Resolution ${staged.id} must be approved before it can be applied.`,
    );
  }
  if (currentProfile.revision !== staged.plan.baseRevision) {
    throw new ResolutionApprovalError(
      `Resolution ${staged.id} is stale: expected profile revision ${staged.plan.baseRevision}, received ${currentProfile.revision}.`,
    );
  }
  if (currentProfile.game !== staged.plan.proposedProfile.game) {
    throw new ResolutionApprovalError("A plan cannot be applied to a different game.");
  }
  if (!staged.plan.verification.valid) {
    throw new ResolutionApprovalError("An invalid plan cannot be applied.");
  }

  return {
    ...staged.plan.proposedProfile,
    revision: currentProfile.revision + 1,
    mods: staged.plan.proposedProfile.mods.map((mod) => ({ ...mod })),
  };
}

function buildPlan(
  request: ResolveRequest,
  route: RouteDefinition,
  catalog: readonly ModDefinition[],
): ResolutionPlan {
  const definitions = definitionMap(catalog);
  const desired = new Map<ModId, MutableProfileMod>(
    request.profile.mods.map((mod) => [mod.id, { ...mod }]),
  );
  const mustKeep = new Set(request.intent.mustKeepModIds);
  const routeMods = new Set(route.enable);
  const enableReasons = new Map<ModId, string>();
  const disableReasons = new Map<ModId, string>();
  const updateReasons = new Map<ModId, string>();
  const resolvedRules: ResolvedRule[] = [];
  const requiredPatchIds = new Set<ModId>();

  for (const modId of request.intent.mustKeepModIds) {
    enableMod(
      modId,
      `Must keep: ${nameOf(modId, definitions)}.`,
      desired,
      definitions,
      enableReasons,
    );
  }

  for (const modId of route.enable) {
    enableMod(
      modId,
      `${route.title} selects ${nameOf(modId, definitions)}.`,
      desired,
      definitions,
      enableReasons,
    );
  }
  resolvedRules.push({
    ruleId: `intent-route-${route.id}`,
    modIds: route.enable,
    resolution: `Selected ${route.title} to satisfy the survival intent.`,
  });

  for (const modId of route.disable) {
    disableMod(
      modId,
      `${route.title} does not use ${nameOf(modId, definitions)}.`,
      desired,
      mustKeep,
      disableReasons,
    );
  }

  for (const mod of desired.values()) {
    if (!mod.enabled || mustKeep.has(mod.id)) continue;
    const definition = definitions.get(mod.id);
    const avoided = definition?.experienceTags.filter((tag) =>
      request.intent.avoidTags.includes(tag),
    );
    if (!avoided || avoided.length === 0) continue;

    disableMod(
      mod.id,
      `Avoids requested tag${avoided.length === 1 ? "" : "s"}: ${avoided.join(
        ", ",
      )}.`,
      desired,
      mustKeep,
      disableReasons,
    );
    resolvedRules.push({
      ruleId: `intent-avoid-${avoided.sort().join("-")}`,
      modIds: [mod.id],
      resolution: `Disabled ${definition?.name ?? mod.id}.`,
    });
  }

  // First settle direct conflicts. Patchable pairs get their declared patch;
  // hard conflicts preserve must-keeps and the selected route.
  for (const definition of catalog) {
    if (!desired.get(definition.id)?.enabled) continue;
    for (const conflict of definition.incompatibilities) {
      if (!desired.get(conflict.modId)?.enabled) continue;

      if (conflict.resolvedByPatchId) {
        enableMod(
          conflict.resolvedByPatchId,
          conflict.reason,
          desired,
          definitions,
          enableReasons,
        );
        requiredPatchIds.add(conflict.resolvedByPatchId);
        resolvedRules.push({
          ruleId: conflict.ruleId,
          modIds: [definition.id, conflict.modId, conflict.resolvedByPatchId],
          resolution: `Installed ${nameOf(
            conflict.resolvedByPatchId,
            definitions,
          )} and kept both mods.`,
        });
        continue;
      }

      const loser = conflictLoser(
        definition.id,
        conflict.modId,
        mustKeep,
        routeMods,
      );
      if (!loser) continue;
      disableMod(
        loser,
        conflict.reason,
        desired,
        mustKeep,
        disableReasons,
      );
      resolvedRules.push({
        ruleId: conflict.ruleId,
        modIds: [definition.id, conflict.modId],
        resolution: `Disabled ${nameOf(loser, definitions)}; ${conflict.reason}`,
      });
    }
  }

  // Close the dependency graph. Newly added dependencies are visited on later
  // passes, which keeps the implementation deterministic without recursion.
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of [...desired.values()]) {
      if (!mod.enabled) continue;
      const definition = definitions.get(mod.id);
      if (!definition) continue;

      for (const dependency of definition.dependencies) {
        const existing = desired.get(dependency.modId);
        if (!existing?.enabled) {
          enableMod(
            dependency.modId,
            dependency.reason,
            desired,
            definitions,
            enableReasons,
          );
          resolvedRules.push({
            ruleId: dependency.ruleId,
            modIds: [mod.id, dependency.modId],
            resolution: `Enabled required dependency ${nameOf(
              dependency.modId,
              definitions,
            )}.`,
          });
          changed = true;
        }

        const enabledDependency = desired.get(dependency.modId);
        if (
          enabledDependency &&
          dependency.minimumVersion &&
          compareVersions(enabledDependency.version, dependency.minimumVersion) < 0
        ) {
          const catalogVersion = definitions.get(dependency.modId)?.version;
          const replacementVersion =
            catalogVersion &&
            compareVersions(catalogVersion, dependency.minimumVersion) >= 0
              ? catalogVersion
              : dependency.minimumVersion;
          enabledDependency.version = replacementVersion;
          updateReasons.set(dependency.modId, dependency.reason);
          resolvedRules.push({
            ruleId: dependency.ruleId,
            modIds: [mod.id, dependency.modId],
            resolution: `Updated ${nameOf(
              dependency.modId,
              definitions,
            )} to ${replacementVersion}.`,
          });
          changed = true;
        }
      }
    }
  }

  const orderedIds = deterministicLoadOrder(desired, definitions);
  const enabledSet = new Set(orderedIds);
  const disabledIds = [...desired.values()]
    .filter((mod) => !enabledSet.has(mod.id))
    .sort((left, right) => left.loadOrder - right.loadOrder || left.id.localeCompare(right.id))
    .map((mod) => mod.id);
  const finalOrder = [...orderedIds, ...disabledIds];

  finalOrder.forEach((modId, index) => {
    const mod = desired.get(modId);
    if (mod) mod.loadOrder = index;
  });

  const proposedProfile: ModProfile = {
    game: request.profile.game,
    revision: request.profile.revision,
    mods: finalOrder.map((modId) => ({ ...desired.get(modId)! })),
  };
  const verification = verifyModProfile(proposedProfile, request.intent, catalog);
  const actions = buildActions(
    request.profile,
    proposedProfile,
    enableReasons,
    disableReasons,
    updateReasons,
  );

  return {
    id: `${route.id}-r${request.profile.revision}`,
    title: route.title,
    summary: route.summary,
    route: route.id,
    baseRevision: request.profile.revision,
    keeps: [...request.intent.mustKeepModIds],
    requiredPatchIds: [...requiredPatchIds].sort(),
    actions,
    resolvedRules: deduplicateResolvedRules(resolvedRules),
    tradeoffs: route.tradeoffs,
    proposedProfile,
    verification,
    requiresHumanApproval: true,
  };
}

function enableMod(
  modId: ModId,
  reason: string,
  desired: Map<ModId, MutableProfileMod>,
  definitions: Map<ModId, ModDefinition>,
  reasons: Map<ModId, string>,
): void {
  const existing = desired.get(modId);
  if (existing) {
    if (!existing.enabled) reasons.set(modId, reason);
    existing.enabled = true;
    return;
  }

  const definition = definitions.get(modId);
  desired.set(modId, {
    id: modId,
    version: definition?.version ?? "0.0.0",
    enabled: true,
    loadOrder: Number.MAX_SAFE_INTEGER,
  });
  reasons.set(modId, reason);
}

function disableMod(
  modId: ModId,
  reason: string,
  desired: Map<ModId, MutableProfileMod>,
  mustKeep: Set<ModId>,
  reasons: Map<ModId, string>,
): void {
  if (mustKeep.has(modId)) return;
  const existing = desired.get(modId);
  if (!existing?.enabled) return;
  existing.enabled = false;
  reasons.set(modId, reason);
}

function conflictLoser(
  left: ModId,
  right: ModId,
  mustKeep: Set<ModId>,
  routeMods: Set<ModId>,
): ModId | undefined {
  const leftProtected = mustKeep.has(left) || routeMods.has(left);
  const rightProtected = mustKeep.has(right) || routeMods.has(right);
  if (leftProtected && rightProtected) return undefined;
  if (leftProtected) return right;
  if (rightProtected) return left;
  return [left, right].sort().at(-1);
}

function deterministicLoadOrder(
  desired: Map<ModId, MutableProfileMod>,
  definitions: Map<ModId, ModDefinition>,
): ModId[] {
  const enabledIds = [...desired.values()]
    .filter((mod) => mod.enabled)
    .sort((left, right) => left.loadOrder - right.loadOrder || left.id.localeCompare(right.id))
    .map((mod) => mod.id);
  const originalRank = new Map(enabledIds.map((id, index) => [id, index]));
  const outgoing = new Map(enabledIds.map((id) => [id, new Set<ModId>()]));
  const indegree = new Map(enabledIds.map((id) => [id, 0]));
  const enabledSet = new Set(enabledIds);

  const addEdge = (before: ModId, after: ModId): void => {
    if (!enabledSet.has(before) || !enabledSet.has(after) || before === after) return;
    const targets = outgoing.get(before)!;
    if (targets.has(after)) return;
    targets.add(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  };

  for (const id of enabledIds) {
    const definition = definitions.get(id);
    if (!definition) continue;
    for (const dependency of definition.dependencies) {
      addEdge(dependency.modId, id);
    }
    for (const rule of definition.loadAfter) {
      addEdge(rule.modId, id);
    }
    for (const target of definition.patches ?? []) {
      addEdge(target, id);
    }
  }

  const rank = (id: ModId): number => originalRank.get(id) ?? Number.MAX_SAFE_INTEGER;
  const ready = enabledIds
    .filter((id) => indegree.get(id) === 0)
    .sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
  const result: ModId[] = [];

  while (ready.length > 0) {
    const current = ready.shift()!;
    result.push(current);
    for (const target of [...(outgoing.get(current) ?? [])].sort()) {
      const nextDegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) {
        ready.push(target);
        ready.sort(
          (left, right) => rank(left) - rank(right) || left.localeCompare(right),
        );
      }
    }
  }

  // A cycle remains visible to verification; this fallback only keeps preview
  // output stable and never claims that the resulting profile is valid.
  if (result.length !== enabledIds.length) {
    for (const id of enabledIds) {
      if (!result.includes(id)) result.push(id);
    }
  }

  return result;
}

function verifyLoadOrder(
  profile: ModProfile,
  definitions: Map<ModId, ModDefinition>,
): VerificationIssue[] {
  const enabled = profile.mods.filter((mod) => mod.enabled);
  const positions = new Map(enabled.map((mod) => [mod.id, mod.loadOrder]));
  const issues: VerificationIssue[] = [];

  for (const mod of enabled) {
    const definition = definitions.get(mod.id);
    if (!definition) continue;
    const rules = [
      ...definition.dependencies.map((dependency) => ({
        modId: dependency.modId,
        ruleId: dependency.ruleId,
        reason: dependency.reason,
      })),
      ...definition.loadAfter,
    ];

    for (const rule of rules) {
      const prerequisitePosition = positions.get(rule.modId);
      const modPosition = positions.get(mod.id);
      if (
        prerequisitePosition === undefined ||
        modPosition === undefined ||
        prerequisitePosition < modPosition
      ) {
        continue;
      }
      issues.push({
        kind: "load-order",
        severity: "error",
        modIds: [rule.modId, mod.id],
        ruleId: rule.ruleId,
        message: `${nameOf(mod.id, definitions)} must load after ${nameOf(
          rule.modId,
          definitions,
        )}.`,
      });
    }
  }

  return issues;
}

function buildActions(
  current: ModProfile,
  proposed: ModProfile,
  enableReasons: Map<ModId, string>,
  disableReasons: Map<ModId, string>,
  updateReasons: Map<ModId, string>,
): ResolutionAction[] {
  const currentById = new Map(current.mods.map((mod) => [mod.id, mod]));
  const actions: ResolutionAction[] = [];

  for (const next of proposed.mods) {
    const previous = currentById.get(next.id);
    if (!previous) {
      actions.push({
        kind: "install",
        modId: next.id,
        toVersion: next.version,
        reason: enableReasons.get(next.id) ?? "Required by the selected plan.",
      });
      continue;
    }

    if (compareVersions(previous.version, next.version) !== 0) {
      actions.push({
        kind: "update",
        modId: next.id,
        fromVersion: previous.version,
        toVersion: next.version,
        reason: updateReasons.get(next.id) ?? "Required version alignment.",
      });
    }
    if (previous.enabled !== next.enabled) {
      actions.push({
        kind: next.enabled ? "enable" : "disable",
        modId: next.id,
        reason: next.enabled
          ? enableReasons.get(next.id) ?? "Required by the selected plan."
          : disableReasons.get(next.id) ?? "Conflicts with the selected plan.",
      });
    }
    if (
      previous.enabled &&
      next.enabled &&
      previous.loadOrder !== next.loadOrder
    ) {
      actions.push({
        kind: "reorder",
        modId: next.id,
        fromLoadOrder: previous.loadOrder,
        toLoadOrder: next.loadOrder,
        reason: "Satisfies dependency and declared load-after rules.",
      });
    }
  }

  const actionOrder: Record<ResolutionAction["kind"], number> = {
    install: 0,
    update: 1,
    enable: 2,
    disable: 3,
    reorder: 4,
  };
  return actions.sort(
    (left, right) =>
      actionOrder[left.kind] - actionOrder[right.kind] ||
      left.modId.localeCompare(right.modId),
  );
}

function definitionMap(
  catalog: readonly ModDefinition[],
): Map<ModId, ModDefinition> {
  return new Map(catalog.map((definition) => [definition.id, definition]));
}

function nameOf(
  modId: ModId,
  definitions: Map<ModId, ModDefinition>,
): string {
  return definitions.get(modId)?.name ?? modId;
}

function numericVersionParts(version: string): number[] {
  const match = version.match(/\d+(?:\.\d+)*/)?.[0];
  return match ? match.split(".").map((part) => Number.parseInt(part, 10)) : [0];
}

function deduplicateIssues(
  issues: readonly VerificationIssue[],
): VerificationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const pair = [...issue.modIds].sort().join("|");
    const key = `${issue.kind}|${issue.ruleId ?? ""}|${pair}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateResolvedRules(
  rules: readonly ResolvedRule[],
): ResolvedRule[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.ruleId}|${[...rule.modIds].sort().join("|")}|${
      rule.resolution
    }`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function enabledModIds(profile: ModProfile): ModId[] {
  return profile.mods
    .filter((mod): mod is ProfileMod => mod.enabled)
    .sort((left, right) => left.loadOrder - right.loadOrder)
    .map((mod) => mod.id);
}
