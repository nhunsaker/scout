// Exercises every drop rule on the first component: a bad key, a string over 256 characters, three unsupported
// value types, and 8 keys past the 32-key limit (after 32 succeed).
export default {
  afterScan(components) {
    const [first] = components;
    if (!first) return;
    first.setMetadata("1bad", "x");
    first.setMetadata("owner", "y".repeat(300));
    first.setMetadata("weird", { nope: true });
    first.setMetadata("count", Number.POSITIVE_INFINITY);
    first.setMetadata("when", new Date("not-a-date"));
    for (let i = 0; i < 40; i++) first.setMetadata(`key${i}`, i);
  },
};
