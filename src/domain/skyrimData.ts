import type {
  ModDefinition,
  ModProfile,
  PlayerIntent,
} from "./types";

/**
 * A deliberately small, versioned demo fixture. It is not a live Nexus Mods
 * index; every decision made by the resolver is traceable to a rule below.
 */
export const skyrimModCatalog: readonly ModDefinition[] = [
  {
    id: "skyrim-se",
    name: "Skyrim Special Edition",
    version: "1.6.1170",
    kind: "game",
    description: "The base game runtime.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "skse64",
    name: "Skyrim Script Extender",
    version: "2.2.6",
    kind: "framework",
    description: "Script runtime used by the demo's advanced mods.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skyrim-se",
        ruleId: "dep-skse-game",
        reason: "SKSE runs against the game runtime.",
      },
    ],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "address-library",
    name: "Address Library for SKSE Plugins",
    version: "11.0.0",
    kind: "framework",
    description: "Shared address database for SKSE plugins.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skse64",
        minimumVersion: "2.2.6",
        ruleId: "dep-address-skse",
        reason: "The address library is consumed through SKSE.",
      },
    ],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "skyui",
    name: "SkyUI",
    version: "5.2.0",
    kind: "framework",
    description: "Configuration UI used by survival systems.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skse64",
        minimumVersion: "2.2.6",
        ruleId: "dep-skyui-skse",
        reason: "SkyUI's scripts require SKSE.",
      },
    ],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "ussep",
    name: "Unofficial Skyrim Special Edition Patch",
    version: "4.3.3",
    kind: "patch",
    description: "General base-game corrections in the curated fixture.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skyrim-se",
        ruleId: "dep-ussep-game",
        reason: "USSEP patches the base game.",
      },
    ],
    incompatibilities: [],
    loadAfter: [
      {
        modId: "skyrim-se",
        ruleId: "order-ussep-game",
        reason: "The patch must load after the base game.",
      },
    ],
  },
  {
    id: "legacy-of-the-dragonborn",
    name: "Legacy of the Dragonborn",
    version: "6.0.0",
    kind: "content",
    description: "Museum and collection-focused quest content.",
    experienceTags: ["collecting", "quests"],
    performanceTier: "moderate",
    dependencies: [
      {
        modId: "skse64",
        minimumVersion: "2.2.6",
        ruleId: "dep-lotd-skse",
        reason: "The curated Legacy fixture uses SKSE scripts.",
      },
      {
        modId: "skyui",
        minimumVersion: "5.2.0",
        ruleId: "dep-lotd-skyui",
        reason: "The curated Legacy fixture uses SkyUI menus.",
      },
    ],
    incompatibilities: [
      {
        modId: "open-cities",
        ruleId: "compat-lotd-open-cities",
        reason: "Both alter shared city museum transition records.",
        resolvedByPatchId: "lotd-open-cities-patch",
      },
    ],
    loadAfter: [
      {
        modId: "ussep",
        ruleId: "order-lotd-ussep",
        reason: "Legacy should win its intended records after USSEP.",
      },
    ],
  },
  {
    id: "ordinator",
    name: "Ordinator - Perks of Skyrim",
    version: "9.31.0",
    kind: "gameplay",
    description: "A broad perk-tree overhaul.",
    experienceTags: ["build-crafting", "gameplay"],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skyrim-se",
        ruleId: "dep-ordinator-game",
        reason: "Ordinator edits base-game perk records.",
      },
    ],
    incompatibilities: [
      {
        modId: "adamant",
        ruleId: "conflict-perk-overhauls",
        reason: "Two complete perk overhauls cannot govern the same trees.",
      },
      {
        modId: "apocalypse",
        ruleId: "compat-ordinator-apocalypse",
        reason: "Apocalypse's added spells need Ordinator-aware perk hooks.",
        resolvedByPatchId: "ordinator-apocalypse-patch",
      },
    ],
    loadAfter: [
      {
        modId: "ussep",
        ruleId: "order-ordinator-ussep",
        reason: "Ordinator's intentional perk edits load after base fixes.",
      },
    ],
  },
  {
    id: "apocalypse",
    name: "Apocalypse - Magic of Skyrim",
    version: "9.45.0",
    kind: "gameplay",
    description: "A spell package retained from the active demo profile.",
    experienceTags: ["magic", "gameplay"],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skyrim-se",
        ruleId: "dep-apocalypse-game",
        reason: "Apocalypse adds spells to the base game.",
      },
    ],
    incompatibilities: [],
    loadAfter: [
      {
        modId: "ussep",
        ruleId: "order-apocalypse-ussep",
        reason: "Apocalypse's intentional spell edits load after base fixes.",
      },
    ],
  },
  {
    id: "ordinator-apocalypse-patch",
    name: "Ordinator / Apocalypse Compatibility Patch",
    version: "1.0.0",
    kind: "patch",
    description: "Connects Apocalypse spells to Ordinator's altered perk trees.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [
      {
        modId: "ordinator",
        minimumVersion: "9.31.0",
        ruleId: "dep-ordinator-apocalypse-patch-ordinator",
        reason: "The patch edits Ordinator perk records.",
      },
      {
        modId: "apocalypse",
        minimumVersion: "9.45.0",
        ruleId: "dep-ordinator-apocalypse-patch-apocalypse",
        reason: "The patch connects Apocalypse spells to those perks.",
      },
    ],
    incompatibilities: [],
    loadAfter: [
      {
        modId: "ordinator",
        ruleId: "order-ordinator-apocalypse-patch-ordinator",
        reason: "The patch must win after Ordinator.",
      },
      {
        modId: "apocalypse",
        ruleId: "order-ordinator-apocalypse-patch-apocalypse",
        reason: "The patch must win after Apocalypse.",
      },
    ],
    patches: ["ordinator", "apocalypse"],
  },
  {
    id: "adamant",
    name: "Adamant - A Perk Overhaul",
    version: "6.0.0",
    kind: "gameplay",
    description: "An alternative complete perk overhaul.",
    experienceTags: ["gameplay"],
    performanceTier: "light",
    dependencies: [],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "survival-mode",
    name: "Survival Mode",
    version: "1.0.0",
    kind: "gameplay",
    description: "The fixture's built-in survival ruleset.",
    experienceTags: ["survival"],
    performanceTier: "light",
    dependencies: [],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "sunhelm",
    name: "SunHelm Survival and Needs",
    version: "3.1.4",
    kind: "gameplay",
    description: "A streamlined needs and survival route.",
    experienceTags: ["survival", "needs"],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skse64",
        minimumVersion: "2.2.6",
        ruleId: "dep-sunhelm-skse",
        reason: "SunHelm's scripts use SKSE.",
      },
      {
        modId: "address-library",
        minimumVersion: "11.0.0",
        ruleId: "dep-sunhelm-address-library",
        reason: "SunHelm uses the shared address database.",
      },
      {
        modId: "skyui",
        minimumVersion: "5.2.0",
        ruleId: "dep-sunhelm-skyui",
        reason: "SunHelm exposes configuration through SkyUI.",
      },
    ],
    incompatibilities: [
      {
        modId: "survival-mode",
        ruleId: "conflict-two-survival-systems",
        reason: "Both systems govern hunger, fatigue, and exposure.",
      },
      {
        modId: "frostfall",
        ruleId: "conflict-sunhelm-frostfall",
        reason: "The two routes duplicate exposure mechanics.",
      },
    ],
    loadAfter: [
      {
        modId: "skyui",
        ruleId: "order-sunhelm-skyui",
        reason: "SunHelm registers its menu after SkyUI.",
      },
    ],
  },
  {
    id: "campfire",
    name: "Campfire",
    version: "1.12.1",
    kind: "gameplay",
    description: "Camping framework for the classic survival route.",
    experienceTags: ["survival", "camping"],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skse64",
        minimumVersion: "2.2.6",
        ruleId: "dep-campfire-skse",
        reason: "The demo's Campfire route uses SKSE.",
      },
    ],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "papyrusutil",
    name: "PapyrusUtil SE",
    version: "4.5.0",
    kind: "framework",
    description: "Script utility dependency for Frostfall.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [
      {
        modId: "skse64",
        minimumVersion: "2.2.6",
        ruleId: "dep-papyrusutil-skse",
        reason: "PapyrusUtil extends the SKSE script runtime.",
      },
    ],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "frostfall",
    name: "Frostfall",
    version: "3.4.1",
    kind: "gameplay",
    description: "A more granular exposure-focused survival route.",
    experienceTags: ["survival", "exposure"],
    performanceTier: "moderate",
    dependencies: [
      {
        modId: "campfire",
        minimumVersion: "1.12.1",
        ruleId: "dep-frostfall-campfire",
        reason: "Frostfall uses Campfire's camping framework.",
      },
      {
        modId: "papyrusutil",
        minimumVersion: "4.5.0",
        ruleId: "dep-frostfall-papyrusutil",
        reason: "Frostfall stores state through PapyrusUtil.",
      },
      {
        modId: "skyui",
        minimumVersion: "5.2.0",
        ruleId: "dep-frostfall-skyui",
        reason: "Frostfall exposes configuration through SkyUI.",
      },
    ],
    incompatibilities: [
      {
        modId: "survival-mode",
        ruleId: "conflict-frostfall-survival-mode",
        reason: "Both systems govern exposure and fatigue.",
      },
    ],
    loadAfter: [
      {
        modId: "campfire",
        ruleId: "order-frostfall-campfire",
        reason: "Frostfall extends Campfire and must load later.",
      },
      {
        modId: "skyui",
        ruleId: "order-frostfall-skyui",
        reason: "Frostfall registers its menu after SkyUI.",
      },
    ],
  },
  {
    id: "open-cities",
    name: "Open Cities Skyrim",
    version: "3.1.0",
    kind: "content",
    description: "Moves major cities into the exterior worldspace.",
    experienceTags: ["immersion"],
    performanceTier: "moderate",
    dependencies: [],
    incompatibilities: [],
    loadAfter: [],
  },
  {
    id: "lotd-open-cities-patch",
    name: "Legacy / Open Cities Compatibility Patch",
    version: "1.0.0",
    kind: "patch",
    description: "Reconciles shared city and museum transition records.",
    experienceTags: [],
    performanceTier: "light",
    dependencies: [
      {
        modId: "legacy-of-the-dragonborn",
        minimumVersion: "6.0.0",
        ruleId: "dep-lotd-open-cities-patch-lotd",
        reason: "The patch edits Legacy records.",
      },
      {
        modId: "open-cities",
        minimumVersion: "3.1.0",
        ruleId: "dep-lotd-open-cities-patch-open-cities",
        reason: "The patch edits Open Cities records.",
      },
    ],
    incompatibilities: [],
    loadAfter: [
      {
        modId: "legacy-of-the-dragonborn",
        ruleId: "order-lotd-open-cities-patch-lotd",
        reason: "The compatibility patch must win after Legacy.",
      },
      {
        modId: "open-cities",
        ruleId: "order-lotd-open-cities-patch-open-cities",
        reason: "The compatibility patch must win after Open Cities.",
      },
    ],
    patches: ["legacy-of-the-dragonborn", "open-cities"],
  },
  {
    id: "skyrim-202x",
    name: "Skyrim 202X Texture Pack",
    version: "10.0.0",
    kind: "visual",
    description: "A high-resolution visual package in the demo profile.",
    experienceTags: ["heavy-graphics", "visual-overhaul"],
    performanceTier: "heavy",
    dependencies: [],
    incompatibilities: [],
    loadAfter: [],
  },
];

export const skyrimDemoProfile: ModProfile = {
  game: "skyrim-se",
  revision: 7,
  mods: [
    { id: "skyrim-se", version: "1.6.1170", enabled: true, loadOrder: 0 },
    { id: "skse64", version: "2.2.3", enabled: true, loadOrder: 1 },
    { id: "address-library", version: "11.0.0", enabled: true, loadOrder: 2 },
    { id: "skyui", version: "5.2.0", enabled: true, loadOrder: 3 },
    { id: "ussep", version: "4.3.3", enabled: true, loadOrder: 4 },
    {
      id: "legacy-of-the-dragonborn",
      version: "6.0.0",
      enabled: true,
      loadOrder: 5,
    },
    { id: "open-cities", version: "3.1.0", enabled: true, loadOrder: 6 },
    { id: "apocalypse", version: "9.45.0", enabled: true, loadOrder: 7 },
    { id: "ordinator", version: "9.31.0", enabled: true, loadOrder: 8 },
    { id: "adamant", version: "6.0.0", enabled: true, loadOrder: 9 },
    { id: "survival-mode", version: "1.0.0", enabled: true, loadOrder: 10 },
    { id: "skyrim-202x", version: "10.0.0", enabled: true, loadOrder: 11 },
  ],
};

export const skyrimDemoIntent: PlayerIntent = {
  desiredExperienceTags: ["survival"],
  avoidTags: ["heavy-graphics"],
  mustKeepModIds: ["legacy-of-the-dragonborn", "ordinator"],
  performancePreference: "balanced",
};
