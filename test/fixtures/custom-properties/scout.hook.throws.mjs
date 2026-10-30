export default {
  afterScan() {
    throw new Error("boom: cannot compute owners");
  },
};
