# Fork issues - identified 2026-08-03

Fork of `kunchenguid/lavish-axi` v0.1.43 (MIT). These are the gaps found by investigating a real
failure, not a speculative wishlist.

## The failure that prompted this

A status board was authored, served through Lavish, reviewed by a human, and called easy to read. It
was rendering broken. The page loaded `daisyui@4.12.14` while every custom rule in it referenced
DaisyUI v5 custom-property names. Verified: that stylesheet defines `--bc` and contains zero
occurrences of `--color-base-content`. A `var()` naming an undefined custom property makes the whole
declaration invalid at computed-value time, so it is dropped. Card background tints, every coloured
card edge, calendar day shading, column header colours and a table-header contrast fix all silently
did nothing.

**The existing audit was right to stay silent.** Its stated contract is that meaningful content is
inaccessible or unusable. The content was fully readable. Nothing was clipped, overlapped or off
screen. The audit did exactly what it says on the tin.

That is the finding: **Lavish audits layout, never styling validity.** A page whose entire visual
design is dead but whose text is legible passes every check.

## Issue 1 - unresolved CSS custom properties are undetectable

**Severity: this is the one that caused the failure.**

Nothing anywhere in the pipeline notices that a `var(--x)` reference does not resolve. The result is
a whole class of silent visual death: the classes are all present, the DOM is correct, the geometry
is fine, and none of the styling applies.

Cheap to detect in the browser, where it is unambiguous: for elements carrying a declaration that
references a custom property, compare the computed value against the property's resolved value; an
unresolved reference computes to the initial value. Detecting a handful of high-signal properties
(`background-color`, `border-*-color`, `color`) is enough to catch this class.

**Insertion points:**
- Detection: `src/chrome-client.js`, alongside the existing in-iframe geometry probes.
- User-facing copy: `src/layout-warnings.js`, `RULE_DESCRIPTIONS` around line 85-99. Add a rule id
  such as `unresolved-custom-property`.
- The existing fingerprint, status and serialization machinery
  (`layoutWarningFingerprint`, `serializeLayoutWarning`) needs no change; a new rule id flows through
  it unmodified.

**Design caution.** The current audit is deliberately conservative: cosmetic, intentional, transient,
tiny and uncertain observations stay silent, and that restraint is the reason its warnings are worth
reading. An unresolved custom property is not cosmetic and not uncertain, so it fits. But it must be
reported as a distinct, clearly non-geometric class, not folded into "severe layout failure", or it
will dilute the signal that makes the existing warnings trustworthy.

## Issue 2 - the pinned design versions are advisory only

`lavish-axi design` returns an exact CDN snippet with pinned versions (currently Tailwind 4.2.4,
DaisyUI 5.5.19). The help says a playbook MUST be opened before writing HTML. Nothing enforces
either. An author can write a head block from memory, pair a stale major version with current-major
variable names, and Lavish serves it without comment.

That is exactly what happened. The tool knew the right answer and was never asked.

**Proposed fix, low cost and high value:** on open, scan the served HTML for a recognised design
system and compare the version against the pinned one. On a major-version mismatch, emit one line.
Not a warning inbox entry, not a block, just a line at the point where it is still cheap to fix.

**Deliberately not proposed:** injecting or rewriting the design system. Lavish's portability
guarantee is that artifacts render identically opened directly, with no server. Rewriting the head
would break that guarantee, and the guarantee is worth more than the convenience.

**Insertion point:** `src/server.js` or `src/cli.js` at session open, next to the existing
`design-reference.js` data which already holds the pinned versions.

## Not issues

Recorded so they do not get "fixed" later by someone reading only the summary.

- **The audit's silence on this page.** Correct behaviour per its own contract. See above.
- **No injected design system.** Deliberate, documented, and the reason artifacts stay portable.
- **Guidance length.** The guidance was accurate and complete. It was not read.

## Status

Investigated and located. **Nothing implemented.** Both fixes need a browser-verified test that
reproduces the original defect and fails before the change, per the definition of done in the
`lavish-md` spec.
