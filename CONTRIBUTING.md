# Contributing

Thanks for improving Zarlflow.

## Development setup

```bash
npm run check
npm run pack:dry
```

## Standards

- Keep Pi host packages in `peerDependencies`, not runtime `dependencies`.
- Treat extension code as security-sensitive: it runs with the user's local process permissions.
- Prefer small, reviewable changes with tests or package validation updates.
- Update `README.md` and `CHANGELOG.md` for user-visible changes.
- Avoid surprising defaults. New automations should be explicit, reversible, and documented.

## Pull request checklist

- [ ] `npm run check` passes.
- [ ] `npm run pack:dry` includes only intended files.
- [ ] Documentation is updated.
- [ ] Security implications are documented where relevant.
