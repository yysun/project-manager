# Persist Dashboard Panel State E2E Specification

## Scenario 1 - Collapse Filters independently

Given packaged Project Manager Studio loads with Summary and Filters expanded

When the user collapses Filters

Then the complete task-filter row is hidden, Summary remains expanded, the Filters control remains
visible and keyboard operable, its `aria-expanded` value is false, its `aria-controls` value names
the hidden filter region, that referenced element exists, and no filter descendant appears in the
tab order or accessibility tree

When the user expands Filters at desktop, 800px intermediate, and phone widths

Then the Filters disclosure label sits directly above the Search box, its top edge aligns with the
Priority label's top edge, Search and Priority remain on the same control line beneath those labels,
and later controls may wrap without leaving an orphaned Filters label

## Scenario 2 - Restore both panel choices after reload

Given the user collapses Summary while leaving Filters expanded

When the user reloads Studio in the same browser origin

Then Summary restores collapsed and Filters restores expanded

Given the user then expands Summary and collapses Filters

When the user reloads Studio again

Then Summary restores expanded and Filters restores collapsed, proving the two preferences persist
independently

## Scenario 3 - Fall back safely from invalid stored payloads

Given the preference helper receives malformed JSON

When it reads the stored panel state

Then both panels fall back to expanded without throwing

Given the preference helper instead receives only one boolean field, a non-boolean field, a throwing
`window.localStorage` property getter, or throwing `getItem` and `setItem` operations

When it reads or writes the panel state

Then reads return both panels expanded and writes fail safely without throwing. This scenario is
executed by the focused Node regression tests because injecting invalid storage into the packaged
page would require a test-only production path.

## Scenario 4 - Preserve filters, views, and responsive layout

Given Filters is expanded at desktop and phone widths in both Kanban and Timeline

When the user searches, selects priority and owner filters, enables blocked-only, collapses and
re-expands Filters, switches projects while Filters is expanded and while it is collapsed, switches
views, reloads while non-default filters remain selected, and separately uses Clear filters

Then active filters keep affecting tasks while the row is collapsed, all controls retain their
existing behavior when reopened, switching projects keeps its existing filter-reset behavior without
changing either panel preference, filter values are defaults after reload because they were never
stored, Clear filters still resets them, the responsive toolbar layout keeps Filters aligned with
Priority and directly above Search at intermediate and phone widths, and the browser console reports
no errors

## Execution Evidence — 2026-08-11

- Packaged Studio ran against the two-project Alpha/Beta fixture at 1440×900, 800×900, and 390×844.
- At every width the Filters and Priority label tops matched exactly (`191=191`, `340.5=340.5`, and
  `326.6953125=326.6953125`). Search sat directly beneath Filters and beside the Priority select;
  later phone controls wrapped without displacing that pair.
- Collapsed Filters kept the disclosure visible and operable with a 17px toolbar height, set
  `aria-expanded=false`, retained `aria-controls=task-filters`, applied native `hidden` to that
  region, and removed Search and the Task filters group from the visible accessibility snapshot.
- Reload restored Summary expanded / Filters collapsed, then Summary collapsed / Filters expanded,
  proving independent persistence in both directions.
- Filtering Alpha by `Beta` produced zero cards before and after Filters collapsed. Switching to Beta
  while collapsed preserved the panel state, restored one matching card through the existing project
  reset, and reopened with an empty Search value.
- Clear filters restored the card, Priority filtering affected both Kanban and Timeline, and reload
  reset non-persisted filter values to their defaults. Browser console warnings/errors: none.
- Focused preference tests passed 4/4 for both restored combinations, missing/malformed/partial and
  non-boolean payloads, a throwing storage getter, throwing storage operations, and complete writes.
