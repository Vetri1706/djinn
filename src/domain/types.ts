export type ModId = string;

export type ModKind =
  | "game"
  | "framework"
  | "content"
  | "gameplay"
  | "visual"
  | "patch";

export type PerformanceTier = "light" | "moderate" | "heavy";

export interface DependencyRule {
  readonly modId: ModId;
  readonly minimumVersion?: string;
  readonly ruleId: string;
  readonly reason: string;
}

export interface IncompatibilityRule {
  readonly modId: ModId;
  readonly ruleId: string;
  readonly reason: string;
  /** If present, the pair is valid only while this patch is enabled. */
  readonly resolvedByPatchId?: ModId;
}

export interface LoadAfterRule {
  readonly modId: ModId;
  readonly ruleId: string;
  readonly reason: string;
}

export interface ModDefinition {
  readonly id: ModId;
  readonly name: string;
  readonly version: string;
  readonly kind: ModKind;
  readonly description: string;
  readonly experienceTags: readonly string[];
  readonly performanceTier: PerformanceTier;
  readonly dependencies: readonly DependencyRule[];
  readonly incompatibilities: readonly IncompatibilityRule[];
  readonly loadAfter: readonly LoadAfterRule[];
  /** A patch must load after both members of the pair it reconciles. */
  readonly patches?: readonly [ModId, ModId];
}

export interface ProfileMod {
  readonly id: ModId;
  readonly version: string;
  readonly enabled: boolean;
  readonly loadOrder: number;
}

export interface ModProfile {
  readonly game: "skyrim-se";
  readonly revision: number;
  readonly mods: readonly ProfileMod[];
}

export interface PlayerIntent {
  readonly desiredExperienceTags: readonly string[];
  readonly avoidTags: readonly string[];
  readonly mustKeepModIds: readonly ModId[];
  readonly performancePreference: "light" | "balanced" | "unrestricted";
}

export interface ResolveRequest {
  readonly profile: ModProfile;
  readonly intent: PlayerIntent;
}

export type VerificationIssueKind =
  | "unknown-mod"
  | "missing-dependency"
  | "dependency-version"
  | "incompatibility"
  | "missing-patch"
  | "load-order"
  | "must-keep"
  | "avoided-tag"
  | "orphan-patch";

export interface VerificationIssue {
  readonly kind: VerificationIssueKind;
  readonly severity: "error" | "warning";
  readonly modIds: readonly ModId[];
  readonly ruleId?: string;
  readonly message: string;
}

export interface VerificationResult {
  readonly valid: boolean;
  readonly issues: readonly VerificationIssue[];
}

export type ResolutionAction =
  | {
      readonly kind: "install";
      readonly modId: ModId;
      readonly toVersion: string;
      readonly reason: string;
    }
  | {
      readonly kind: "update";
      readonly modId: ModId;
      readonly fromVersion: string;
      readonly toVersion: string;
      readonly reason: string;
    }
  | {
      readonly kind: "enable" | "disable";
      readonly modId: ModId;
      readonly reason: string;
    }
  | {
      readonly kind: "reorder";
      readonly modId: ModId;
      readonly fromLoadOrder: number;
      readonly toLoadOrder: number;
      readonly reason: string;
    };

export interface ResolvedRule {
  readonly ruleId: string;
  readonly modIds: readonly ModId[];
  readonly resolution: string;
}

export interface ResolutionPlan {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly route: "sunhelm-balanced" | "frostfall-classic";
  readonly baseRevision: number;
  readonly keeps: readonly ModId[];
  readonly requiredPatchIds: readonly ModId[];
  readonly actions: readonly ResolutionAction[];
  readonly resolvedRules: readonly ResolvedRule[];
  readonly tradeoffs: readonly string[];
  readonly proposedProfile: ModProfile;
  readonly verification: VerificationResult;
  readonly requiresHumanApproval: true;
}

export interface ResolutionResult {
  readonly recommendedPlanId: string;
  readonly plans: readonly ResolutionPlan[];
}

export type StagedResolution =
  | {
      readonly id: string;
      readonly state: "pending";
      readonly plan: ResolutionPlan;
    }
  | {
      readonly id: string;
      readonly state: "approved";
      readonly plan: ResolutionPlan;
      readonly approvedBy: string;
      readonly approvedAt: string;
    }
  | {
      readonly id: string;
      readonly state: "rejected";
      readonly plan: ResolutionPlan;
      readonly rejectedBy: string;
      readonly rejectedAt: string;
      readonly reason: string;
    };

export interface ApprovalRecord {
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export interface RejectionRecord {
  readonly rejectedBy: string;
  readonly rejectedAt: string;
  readonly reason: string;
}
