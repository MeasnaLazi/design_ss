# Reference gallery

Anchor images for the review step of the `strip-design` skill
(§ Reading a render). Rendered panels are compared against these before
iterating — this is what replaces "design to pass the rules" with "design to
look like the best work in the category".

## How to populate

Drop PNG/JPG screenshots of **App Store / Play Store strips you admire** into
category folders:

```
composer/references/
  lifestyle-journal/     ← Bio's category — fill this first
  productivity/
  health-fitness/
  finance/
  ...
```

Good sources: screenshots of store product pages (for private, local
reference use), your own past designs, or design-gallery exports. Aim for
5–10 per category you actually design in. Full strips (all panels in one
image) are more useful than single panels — they show rhythm and continuity.

Name files descriptively: `<app>-<what-makes-it-good>.png`
(e.g. `dayone-serif-hierarchy-cropped-hero.png`).

## Notes

- This folder ships empty except for this README; references are personal
  working material and are **gitignored** by default — check `.gitignore`
  before committing anything you don't own.
- The agent falls back to its internal knowledge of strong store pages when
  a category folder is empty, but concrete local references work much better.
