// Self-contained vitest config so the meshy tests never inherit a host repo's
// root vite/vitest config (this package lives inside a larger app repo).
export default {
  test: {
    include: ["test/**/*.test.ts"],
  },
};
