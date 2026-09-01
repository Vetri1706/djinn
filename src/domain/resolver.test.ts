import { describe, expect, it } from "vitest";
import {
  applyApprovedPlan,
  approveStagedResolution,
  enabledModIds,
  rejectStagedResolution,
  resolveSkyrimProfile,
  stageResolutionPlan,
  verifyModProfile,
} from "./resolver";
import {
  skyrimDemoIntent,
  skyrimDemoProfile,
  skyrimModCatalog,
} from "./skyrimData";

function demoResolution() {
  return resolveSkyrimProfile({
    profile: skyrimDemoProfile,
    intent: skyrimDemoIntent,
  });
}

describe("Skyrim compatibility resolver", () => {
  it("builds a valid light-survival recommendation without mutating the input", () => {
    const originalProfile = structuredClone(skyrimDemoProfile);
    const result = demoResolution();
    const plan = result.plans.find((candidate) => candidate.id === result.recommendedPlanId);

    expect(plan).toBeDefined();
    expect(plan?.route).toBe("sunhelm-balanced");
    expect(plan?.verification).toEqual({ valid: true, issues: [] });
    expect(skyrimDemoProfile).toEqual(originalProfile);

    const enabled = enabledModIds(plan!.proposedProfile);
    expect(enabled).toContain("legacy-of-the-dragonborn");
    expect(enabled).toContain("ordinator");
    expect(enabled).toContain("apocalypse");
    expect(enabled).toContain("sunhelm");
    expect(enabled).not.toContain("adamant");
    expect(enabled).not.toContain("survival-mode");
    expect(enabled).not.toContain("skyrim-202x");
  });

  it("adds every required compatibility patch and records its evidence rule", () => {
    const plan = demoResolution().plans[0];

    expect(plan.requiredPatchIds).toEqual([
      "lotd-open-cities-patch",
      "ordinator-apocalypse-patch",
    ]);
    expect(
      plan.actions.some(
        (action) =>
          action.kind === "install" &&
          action.modId === "ordinator-apocalypse-patch",
      ),
    ).toBe(true);
    expect(
      plan.resolvedRules.some(
        (rule) =>
          rule.ruleId === "compat-ordinator-apocalypse" &&
          rule.modIds.includes("ordinator-apocalypse-patch"),
      ),
    ).toBe(true);
    expect(
      plan.resolvedRules.some(
        (rule) => rule.ruleId === "compat-lotd-open-cities",
      ),
    ).toBe(true);
  });

  it("updates an outdated dependency and disables the conflicting perk overhaul", () => {
    const plan = demoResolution().plans[0];

    expect(plan.actions).toContainEqual(
      expect.objectContaining({
        kind: "update",
        modId: "skse64",
        fromVersion: "2.2.3",
        toVersion: "2.2.6",
      }),
    );
    expect(plan.actions).toContainEqual(
      expect.objectContaining({ kind: "disable", modId: "adamant" }),
    );
    expect(plan.actions).toContainEqual(
      expect.objectContaining({ kind: "disable", modId: "skyrim-202x" }),
    );
  });

  it("offers a separate valid Campfire and Frostfall plan", () => {
    const result = demoResolution();
    const plan = result.plans.find(
      (candidate) => candidate.route === "frostfall-classic",
    );

    expect(result.plans).toHaveLength(2);
    expect(plan?.verification.valid).toBe(true);
    const enabled = enabledModIds(plan!.proposedProfile);
    expect(enabled).toContain("campfire");
    expect(enabled).toContain("frostfall");
    expect(enabled).toContain("papyrusutil");
    expect(enabled).not.toContain("sunhelm");
    expect(enabled).not.toContain("survival-mode");
  });

  it("places dependencies before dependants and patches after both targets", () => {
    for (const plan of demoResolution().plans) {
      const order = enabledModIds(plan.proposedProfile);
      const before = (left: string, right: string) =>
        order.indexOf(left) < order.indexOf(right);

      expect(before("skse64", "skyui")).toBe(true);
      expect(before("ordinator", "ordinator-apocalypse-patch")).toBe(true);
      expect(before("apocalypse", "ordinator-apocalypse-patch")).toBe(true);
      expect(before("legacy-of-the-dragonborn", "lotd-open-cities-patch")).toBe(
        true,
      );
      expect(before("open-cities", "lotd-open-cities-patch")).toBe(true);
    }

    const frostfallPlan = demoResolution().plans.find(
      (plan) => plan.route === "frostfall-classic",
    )!;
    const frostfallOrder = enabledModIds(frostfallPlan.proposedProfile);
    expect(frostfallOrder.indexOf("campfire")).toBeLessThan(
      frostfallOrder.indexOf("frostfall"),
    );
  });

  it("will not apply a plan until a human explicitly approves it", () => {
    const staged = stageResolutionPlan(demoResolution().plans[0]);

    expect(staged.state).toBe("pending");
    expect(() => applyApprovedPlan(skyrimDemoProfile, staged)).toThrow(
      "must be approved",
    );

    const rejected = rejectStagedResolution(staged, {
      rejectedBy: "player",
      rejectedAt: "2026-09-02T01:00:00+05:30",
      reason: "Prefer the deeper survival option.",
    });
    expect(() => applyApprovedPlan(skyrimDemoProfile, rejected)).toThrow(
      "must be approved",
    );
  });

  it("applies an approved plan as a new, verified profile revision", () => {
    const staged = stageResolutionPlan(demoResolution().plans[0]);
    const approved = approveStagedResolution(staged, {
      approvedBy: "player",
      approvedAt: "2026-09-02T01:05:00+05:30",
    });
    const applied = applyApprovedPlan(skyrimDemoProfile, approved);

    expect(applied.revision).toBe(skyrimDemoProfile.revision + 1);
    expect(verifyModProfile(applied, skyrimDemoIntent).valid).toBe(true);
    expect(enabledModIds(applied)).toContain("sunhelm");
  });

  it("rejects an approved plan if the active profile changed after preview", () => {
    const staged = stageResolutionPlan(demoResolution().plans[0]);
    const approved = approveStagedResolution(staged, {
      approvedBy: "player",
      approvedAt: "2026-09-02T01:05:00+05:30",
    });
    const newerProfile = { ...skyrimDemoProfile, revision: 8 };

    expect(() => applyApprovedPlan(newerProfile, approved)).toThrow("is stale");
  });

  it("keeps conflicting must-keeps visible and refuses to stage an invalid plan", () => {
    const result = resolveSkyrimProfile({
      profile: skyrimDemoProfile,
      intent: {
        ...skyrimDemoIntent,
        mustKeepModIds: [
          ...skyrimDemoIntent.mustKeepModIds,
          "adamant",
        ],
      },
    });
    const plan = result.plans[0];

    expect(plan.verification.valid).toBe(false);
    expect(plan.verification.issues).toContainEqual(
      expect.objectContaining({
        kind: "incompatibility",
        ruleId: "conflict-perk-overhauls",
      }),
    );
    expect(() => stageResolutionPlan(plan)).toThrow("verification failed");
  });

  it("reports why the initial profile is unsafe before proposing changes", () => {
    const verification = verifyModProfile(
      skyrimDemoProfile,
      skyrimDemoIntent,
      skyrimModCatalog,
    );

    expect(verification.valid).toBe(false);
    expect(verification.issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-patch",
        ruleId: "compat-ordinator-apocalypse",
      }),
    );
    expect(verification.issues).toContainEqual(
      expect.objectContaining({
        kind: "avoided-tag",
        modIds: ["skyrim-202x"],
      }),
    );
  });
});
