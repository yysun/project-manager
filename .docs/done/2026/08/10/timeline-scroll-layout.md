# Timeline Scroll Layout

## Summary

- Long timelines now allocate a readable weekly width and scroll horizontally instead of compressing
  date labels.
- The Task column stays frozen while a separate sticky date header follows the schedule rows and the
  measured application-header height.
- Timeline rows use document vertical scrolling with no height-limited inner box; keyboard focus and
  responsive Task widths remain visible and usable.
- The obsolete folder-native/edit-authority footer was removed from both Studio views, and the
  installable Studio bundle was rebuilt and synchronized globally.

## Verification

- `npm run typecheck` and `npm run build` passed.
- `npm run test:pm` passed 83/83; the focused Timeline model suite passed 4/4.
- Packaged browser E2E passed all five scenarios at 1440×900 and 390×844 with zero label overlaps,
  exact header/track alignment, page-level vertical scrolling, correct sticky offsets, and no
  browser console warnings or errors.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  printed `Skill is valid!`; `git diff --check` passed; repository and global skill trees matched.
- `AR passed: no blocking architecture flaws`, `CR passed: no major findings`, and
  `VR passed: all acceptance criteria complete`.

## Notes

- Timeline zoom controls, virtualization, custom scrollbars, and schedule/schema changes remain out
  of scope.
