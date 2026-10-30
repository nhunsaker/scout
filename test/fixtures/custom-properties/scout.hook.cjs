// CommonJS hook: same `afterScan` shape, exported Node's CJS way.
module.exports = {
  afterScan(components) {
    for (const component of components) component.setMetadata("owner", "cjs-owner");
  },
};
