/**
 * Exercises the "Code owners" override path: reads the built-in attribution
 * from `component.codeOwners`, and overrides it only for the checkout
 * component, to prove a hook's explicit setMetadata wins.
 *
 * @type {import("@scoutui/cli").ScoutHook}
 */
export default {
  afterScan(components) {
    for (const component of components) {
      if (component.filePath === "src/checkout/Cart.tsx") {
        component.setMetadata("Code owners", "@example/checkout-overridden");
      }
      // An unrelated key: proves it doesn't erase "Code owners" on every
      // other component.
      component.setMetadata("seenByHook", true);
    }
  },
};
