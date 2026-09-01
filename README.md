# Djinn

**Tell the mod manager the experience you want; Djinn resolves the technical mod graph without sacrificing the mods you care about.**

Djinn is a WebMCP-native compatibility and conflict resolver for modded PC games. The hackathon demo focuses on one deliberately constrained Skyrim Special Edition profile:

> Make this profile survival-focused. Keep Legacy of the Dragonborn and Ordinator. Avoid heavy graphics mods.

The page owns the live profile, curated compatibility data, staged plan, approval state, and verifier. A browser agent reads and acts on that shared state through semantic WebMCP tools. Deterministic TypeScript code—not an LLM—handles dependencies, incompatible mods, patch requirements, version checks, and load order.

## What is working now

- A curated Skyrim profile with seven independently traceable violations.
- Two deterministic, valid resolution routes: a lean SunHelm setup and a deeper Campfire/Frostfall setup.
- Must-keep protection for Legacy of the Dragonborn and Ordinator.
- Automatic dependency closure, version alignment, compatibility patches, conflict removal, performance-constraint enforcement, and topological load ordering.
- A visible stage → human approval → apply lifecycle.
- Stale-plan and unauthorized-apply rejection.
- Nine live WebMCP tools registered with `document.modelContext.registerTool()`.
- Browser-tested shared state updates and final verification.

This is an honest demo scope: the catalog and profile are curated fixtures, and applying a plan changes the in-memory demo profile. It does **not** write to Vortex, Mod Organizer 2, Nexus Mods, or a player's filesystem. The natural-language goal is interpreted by the external browser agent; Djinn currently does not embed its own LLM.

## WebMCP tools

| Tool | Purpose |
| --- | --- |
| `get_current_mod_profile` | Read the active profile and player constraints. |
| `inspect_mod` | Inspect dependencies, conflicts, tags, and profile state. |
| `get_dependency_graph` | Read semantic dependency and incompatibility edges. |
| `list_conflicts` | Run the deterministic verifier against the current profile. |
| `find_required_patches` | Find patches required by every valid plan. |
| `preview_resolution_plan` | Visibly stage a plan without approving or applying it. |
| `compare_resolution_options` | Compare exact actions and trade-offs for valid routes. |
| `apply_approved_plan` | Apply only the exact plan already approved in the page. |
| `verify_mod_profile` | Verify the live post-change profile. |

The write tool intentionally refuses pending, rejected, mismatched, stale, or invalid plans. WebMCP annotations are hints only; authorization is enforced again inside the deterministic state transition.

## Run locally

Requirements: Node.js 20.19+ or Node.js 22.12+.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173/`.

For WebMCP testing, use ChatGPT's in-app browser or a compatible Chrome build with `chrome://flags/#enable-webmcp-testing` enabled. The UI remains usable when WebMCP is unavailable.

## Verify

```bash
npm test
npm run build
```

The domain suite covers dependency closure, alternative routes, must-keep preservation, patch installation, load ordering, approval enforcement, stale-plan rejection, and final validity.

## Architecture

```text
Browser agent
    ⇅ semantic WebMCP tools
Live React review surface
    ⇅ staged plan + explicit approval
Deterministic TypeScript resolver
    ⇅
Curated mod catalog + current profile
```

The split is intentional:

- The agent handles intent, comparison, and trade-offs.
- The resolver handles technical validity.
- The player owns the final decision.

## Demo journey

1. Ask the agent to inspect the current profile and list conflicts.
2. Ask it to compare valid survival-focused options.
3. Have it call `preview_resolution_plan` for the recommended route.
4. Review the exact adds, disables, update, load-order corrections, and trade-off in the page.
5. Click **Approve this plan**.
6. Ask the agent to call `apply_approved_plan` with the staged plan ID.
7. Call `verify_mod_profile`: revision 8 returns `valid: true` with zero issues.

## License

MIT. Skyrim and all referenced mod names belong to their respective owners. They are used here only as labels in a non-commercial compatibility demonstration; no third-party mod files or assets are included.
