import CPRActor from "./actor/cpr-actor.js";

/**
 * Extend the base ActiveEffect class to implement system-specific logic.
 * @extends {ActiveEffect}
 */
export default class CPRActiveEffect extends ActiveEffect {
  /**
   * We extend the constructor to initialize CPR data structures used for tracking the CPRActiveEffect
   * With V10, Foundry moved all system data points into {obj}.system, so we will follow suit with
   * active effects
   *
   * @constructor
   * @param {*} object - the Foundry object data for an Active Effect
   * @param {*} options - The Foundry options for an Active Effect
   */
  constructor(object = {}, options = {}) {
    super(object, options);
    if (!this.system) {
      this.system = {
        isSuppressed: false,
      };
    }
  }

  /**
   * Convenience getter for retrieving how an effect is "used", this is actually stored
   * on the item providing the effect.
   *
   * XXX: LOGGER calls do not work in this getter. I don't know why; use console.
   */
  get usage() {
    const item = this.parent;
    if (!item) return null;
    return item.system.usage;
  }

  /**
   * set the key category for a mod
   *
   * @param {Number} num - the index of the mod in the changes array
   * @param {String} category - the key category value to set
   */
  async setModKeyCategory(num, category) {
    await this.setFlag(game.system.id, `changes.cats.${num}`, category);
  }

  /**
   * Determine whether this ActiveEffect is suppressed by core state (e.g., expired
   * status) or CPR item rules (e.g., unequipped, uninstalled, or unrezzed parent).
   *
   * @override
   * @returns {boolean}
   */
  get isSuppressed() {
    if (super.isSuppressed) return true;
    if (this.disabled) return false;
    const doc = this.parent;
    if (!doc || doc instanceof CPRActor) return false; // we never suppress actor effects
    return Boolean(doc.areEffectsSuppressed?.());
  }

  /**
   * Keep `system.isSuppressed` aligned with `this.isSuppressed` after DataModel
   * initialization so sheets and legacy callers can inspect either property.
   *
   * @override
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.determineSuppression();
  }

  /**
   * Check if this effect change should apply during the current phase.
   * Suppressed effects are skipped before delegating to core phase checks.
   *
   * @override
   * @param {ActiveEffectChangeData} change - the change being considered
   * @param {object} [options] - phase and replacementData options from Foundry
   * @returns {boolean}
   */
  shouldApplyChange(change, options) {
    if (this.isSuppressed) return false;
    return super.shouldApplyChange(change, options);
  }

  /**
   * Compute and mirror suppression onto `this.system.isSuppressed` (if extensible).
   *
   * @returns {boolean} whether this ActiveEffect is currently suppressed
   */
  determineSuppression() {
    const suppressed = this.isSuppressed;
    if (this.system && Object.isExtensible(this.system)) {
      this.system.isSuppressed = suppressed;
    }
    return suppressed;
  }
}
