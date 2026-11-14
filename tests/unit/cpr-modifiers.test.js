import { describe, expect, it } from "vitest";

import CPRMod from "../../src/modules/rolls/cpr-modifiers.js";

describe("CPRMod", () => {
  it("preserves CPR category and situational flags", () => {
    const change = { key: "bonuses.accounting", mode: 2, value: "2" };
    const effect = {
      id: "effect-id",
      name: "Accounting Boost",
      changes: [change],
      flags: {
        "cyberpunk-red-core": {
          changes: {
            cats: { 0: "skill" },
            situational: {
              0: { isSituational: true, onByDefault: true },
            },
          },
        },
      },
    };

    const mod = new CPRMod(effect, change);

    expect(mod.category).toBe("skill");
    expect(mod.isSituational).toBe(true);
    expect(mod.onByDefault).toBe(true);
  });

  it("reads v14 system.changes and string change types", () => {
    const change = {
      key: "bonuses.accounting",
      type: "add",
      phase: "initial",
      value: "2",
    };
    const effect = {
      id: "effect-id",
      name: "Accounting Boost",
      isSuppressed: false,
      disabled: false,
      system: { changes: [change] },
      flags: {
        "cyberpunk-red-core": {
          changes: {
            cats: { 0: "skill" },
            situational: {
              0: { isSituational: true, onByDefault: true },
            },
          },
        },
      },
    };

    const mods = CPRMod.getAllModifiers([effect]);
    expect(mods).toHaveLength(1);
    expect(mods[0].changeMode).toBe("add");
    expect(mods[0].category).toBe("skill");
    expect(mods[0].isSituational).toBe(true);
    expect(mods[0].onByDefault).toBe(true);
  });

  it("skips effects suppressed via v14 isSuppressed getter unless getDisabled is true", () => {
    const change = { key: "bonuses.accounting", type: "add", value: "2" };
    const suppressedEffect = {
      id: "effect-id",
      name: "Suppressed",
      isSuppressed: true,
      disabled: false,
      system: { changes: [change] },
      flags: {},
    };

    expect(CPRMod.getAllModifiers([suppressedEffect])).toHaveLength(0);
    expect(CPRMod.getAllModifiers([suppressedEffect], true)).toHaveLength(1);
  });

  it("treats changes without CPR flags as editable custom modifiers", () => {
    const change = { key: "system.custom.value", mode: 2, value: "1" };
    const effect = {
      id: "effect-id",
      name: "Imported Effect",
      changes: [change],
      flags: {},
    };

    const mod = new CPRMod(effect, change);

    expect(mod.category).toBe("custom");
    expect(mod.isSituational).toBe(false);
    expect(mod.onByDefault).toBe(false);
  });
});
