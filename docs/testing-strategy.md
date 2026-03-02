# Testing and coverage strategy

- Current enforced minimum coverage for integration tests is **50%** (lines/branches/functions/statements).
- We will increase the threshold by **+5% each sprint** until reaching 80%, then review critical-path gaps.
- CI blocks merges when lint, typecheck, integration tests, or e2e tests fail.
