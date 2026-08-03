# Fork notes - for a possible upstream PR

Fork of `kunchenguid/lavish-axi`. Branch `fix/styling-validity-audit`.
See `ISSUES.md` for the two gaps and where they sit in the codebase.

## What is actually fixed

**Nothing observable yet.** One commit adds a tested detection core. It is not wired into the audit
pipeline, so running this fork behaves identically to upstream. Do not open a PR describing this as a
working fix.

| Commit    | What it adds                        | Wired in |
| --------- | ----------------------------------- | -------- |
| `1b86e40` | `ISSUES.md` - the two gaps, located | n/a      |
| `93b32d1` | `src/style-validity.js` + 9 tests   | **No**   |

## The commit that matters

`93b32d1 feat(audit): detect declarations dropped by unresolved custom properties`

**The defect it targets.** A `var(--x)` naming an undefined custom property makes the whole
declaration invalid at computed-value time, so the browser drops it. The element keeps its classes,
its geometry is untouched and its text stays readable. The existing geometry-based audit therefore
stays silent - correctly, by its own contract - while the entire visual design is gone.

Real instance: a page authored against DaisyUI v5 property names while loading `daisyui@4.12.14`,
which defines `--bc` and contains zero occurrences of `--color-base-content`. Card tints, coloured
card edges, calendar shading and a table-header contrast fix all silently did nothing. It was
reviewed by a human and called easy to read.

**Design decisions worth defending in review:**

- **Pure core, DOM wrapper at the bottom.** Testable with no browser. The 9 tests run in ~50ms.
- **A reference with a fallback is not reported.** `var(--x, red)` still renders.
- **A runtime resolver rescues properties set outside any stylesheet**, so script-set and inline
  properties are not false positives.
- **A cross-origin stylesheet makes the page unverifiable, and it reports nothing.** Its definitions
  cannot be read, so flagging references it may well define would be confident noise.
- **Reported as its own non-geometric class,** not folded into "severe layout failure". The existing
  audit's restraint is why its warnings are worth reading; diluting that signal would cost more than
  this rule adds.

**Regression evidence.** 4 of the 9 tests fail when the detection is neutralised. Verified by
breaking it and re-running, not by assumption.

## Before any upstream PR

1. Wire `collectStyleValidityFindings` into the in-page audit in `src/artifact-sdk.js`, next to the
   geometry probes.
2. Add an `unresolved-custom-property` entry to `RULE_DESCRIPTIONS` in `src/layout-warnings.js`
   (around line 85-99). The fingerprint, status and serialization machinery needs no change.
3. Add a browser fixture under `test/fixtures/layout-audit/` reproducing the v4/v5 mismatch, and
   assert the audit reports it. Until that exists, the end-to-end path is unproven.
4. Issue 2 (pinned design versions are advisory only) is untouched.
5. Rebase onto upstream. This fork was taken at 0.1.45.

## Local install

This machine runs the fork instead of the published package. Both node installs point at it:

- nvm: `~/.nvm/versions/node/v24.16.0/bin/lavish-axi` -> `dist/cli.mjs` here, via `npm link`.
- nodenv: `~/.nodenv/versions/24.16.0/lib/node_modules/lavish-axi` -> this directory, via a symlink,
  because `npm link` did not take there. The nodenv shim is what a login shell resolves first, so
  this one is the one that actually matters.

**This means `dist/` is live.** Source edits do not take effect until `npm run build`.

**Use pnpm, not npm.** The repo migrated to pnpm and gitignores `package-lock.json`. Running
`npm install` creates one and makes `test/release-ci-exclusions.test.js` fail with 2 errors that look
like real defects and are not.

To revert to the published package: `npm i -g lavish-axi` for each install.

## Suite status

691 pass, 2 fail, both caused by the npm lockfile above and both passing once it is deleted. One
browser test times out without `LAVISH_AXI_BROWSER_E2E=1` and a real browser, which is expected.
`npm run check` has not been run end to end.
