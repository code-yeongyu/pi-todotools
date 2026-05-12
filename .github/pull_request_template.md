## Summary

<!-- Brief description, 1-3 bullets -->

-

## Verification

- [ ] `npm run check` (typecheck + biome)
- [ ] `npm test` (unit tests)
- [ ] `npm pack --dry-run` (release sanity)
- [ ] `pi -e ./src/index.ts` smoke-tested locally, if behavior changed

## todotools impact

- [ ] Tool schema or prompt guidance changes are documented in README if changed
- [ ] Session state compatibility with existing `todowrite` results remains covered by tests
- [ ] Continuation behavior remains covered by tests if touched
- [ ] CHANGELOG entry added for user-facing changes
