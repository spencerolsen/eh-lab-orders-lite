# LAB-24: Visual theme

- **Status:** In progress
- **Type:** Groundwork
- **Depends on:** LAB-04 (Web foundation: app shell and navigation)
- **Unblocks:** nothing (feature tickets use the theme as soon as it is merged; none of them waits for it)
- **Branch:** `lab-24-visual-theme`

## Description

After this task, the app has a deliberate look: a deep teal menu bar, a lime accent, a warm cream page, and consistent buttons, form fields, tables and status badges. The palette and shapes are inspired by the company this exercise is for, taken from their public website. The app keeps its own name and uses no logo.

It is done now, before the feature pages exist, so that every page built from LAB-06 on inherits the look by using the shared styles. It changes styles only: no behaviour, no API, no data. A short polish pass happens near the end, once the real pages exist.

## Requirements

**Design values** (in `src/web/styles/base.css`, as CSS custom properties on `:root`)
- Colours, named by role and not by hue, so a page never writes a hex value:
  - `--color-brand-strong: #003438` (menu bar, headings)
  - `--color-brand: #004a50` (primary buttons)
  - `--color-accent: #dcff9f` (current section, text on primary buttons, highlights)
  - `--color-surface-tint: #ddf3ee` (table header, row hover, quiet badges)
  - `--color-page: #fffaf2` (page background)
  - `--color-surface: #fffdf9` (cards, tables, dialogs)
  - `--color-text: #451f41` (body text)
  - `--color-text-muted`, `--color-border`, and `--color-danger` with `--color-danger-surface` for errors: chosen in this task to sit well beside the palette.
- Type: a system serif stack for headings (for example `Georgia, 'Iowan Old Style', 'Times New Roman', serif`) and the system sans-serif stack for everything else. No font files and no font downloads: the company's own typefaces are licensed and are not used.
- Spacing steps, two corner sizes (controls and cards) and the pill shape for buttons and badges.
- The existing focus outline stays clearly visible on every colour it can appear on.

**Shared styles** (plain CSS classes, no component library; one small stylesheet per concern under `src/web/styles/` if `base.css` grows past easy reading)
- Menu bar: brand background, the current section shown as a lime pill and still marked with `aria-current="page"`.
- Buttons: primary (brand background, accent text), secondary (outlined), danger; pill shaped; visible hover, focus and disabled states.
- Form fields: label above the field, the field, help text and an error message; an invalid field is marked by more than colour (the message text and `aria-invalid`).
- Tables: tinted header, row separators, row hover, right-aligned numbers.
- Status badges for the four order statuses (`ordered`, `collected`, `completed`, `cancelled`): each has its own tint, and the status word is always shown, so colour is never the only signal.
- Dialog and slide-out panel surfaces (the native `dialog` element), with a backdrop: styles only, ready for LAB-12 and LAB-15.
- The existing `Loading`, `EmptyState`, `ErrorMessage` and fallback screen restyled with the same values.

**Rules**
- Every text and background pair used meets WCAG AA contrast (4.5:1 for body text, 3:1 for large text and for the focus outline against its background). The pairs and their ratios are listed in `docs/architecture.md`.
- Desktop only, as decided: no responsive breakpoints.
- No company logo, no company name in the UI, no copied images or icons.
- No new runtime dependency.

**A style sample page**
- A route `/styles` (linked from nowhere in the menu) that shows every shared style in one place: headings, text, each button in each state, a form with a valid and an invalid field, a table with a few rows, the four badges, and the loading, empty and error components. It is the reference for anyone building a page, and the surface the checks below look at.

## Acceptance criteria

- [ ] No hex colour appears in any file under `src/web/` except where the custom properties are defined.
- [ ] The menu bar, the three placeholder pages, the "Page not found" screen and the footer all use the theme, with no unstyled element.
- [ ] The current section in the menu is a lime pill and has `aria-current="page"`.
- [ ] `/styles` shows every shared style listed above, and is not linked from the menu.
- [ ] Each of the four status badges shows its status word and has a tint distinct from the other three.
- [ ] An invalid form field on `/styles` shows its error text and has `aria-invalid="true"`.
- [ ] Every element on `/styles` can be reached with the keyboard and shows a visible focus outline.
- [ ] `docs/architecture.md` lists each text and background pair in use with its contrast ratio, and every ratio meets the rule above.
- [ ] No font file is added to the repository and the built page requests no font from another site.
- [ ] No logo, company name or copied image appears anywhere in the repository.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test` pass; the existing component tests still pass without loosening any assertion.
- [ ] This task's manual checks are added to `docs/acceptance-checklist.md` under Checkpoint 1.

## Tests

- **Component:** `status badge shows the status word for each of the four statuses`; `the styles page renders every shared style without throwing`. Existing tests for the menu bar, error boundary and error message keep passing unchanged.
- Colours and layout are checked by eye on `/styles` and by the contrast table, not by automated tests. Visual regression testing is out of scope.

## Docs to update

- `AGENTS.md`: a short "Styling a page" section: use the custom properties and shared classes, never a hex value; where `/styles` is; desktop only.
- `docs/architecture.md`: the theme (roles and values), the contrast table, and where the styles live.
- `docs/acceptance-checklist.md`: the visual checks, under Checkpoint 1.
- `docs/plan/README.md`: this task's row in the table and its place in the dependency diagram.
- The process log entry is written outside the repository.

## Out of scope

- The company's logo, name and licensed typefaces: deliberately not used.
- Mobile and narrow-screen layouts: not planned (desktop only).
- Dark mode: future version.
- Icons and illustrations: future version.
- A final polish pass with real content: done near the end, after LAB-20.
- Styling of pages that do not exist yet: each feature ticket applies the shared styles to its own page.

## Notes from the build

- **Status badge and LAB-11.** The shared list of order statuses does not exist yet. `StatusBadge` (`src/web/components/StatusBadge.tsx`) takes the status as a plain string, shows the word and adds the class `badge-<status>`. LAB-11 creates the list in `src/shared/` and connects the badge to it (types its prop with the shared status type).
- **Colours chosen here:** muted text `#6b5a68` (a greyed plum, from the body text's hue), border `#e3d9cc` (a darker cream), danger `#a3221b` on `#fdeceb`.
- **Focus outline:** teal (`--color-brand`) on light backgrounds and lime in the menu bar. The old orange outline is 2.62:1 on the teal menu bar, below 3:1, and adds a hue outside the palette.
- **Badge tints come from the palette** (surface-tint, accent, brand, danger-surface), so no new colour was added; `cancelled` also has a border.
- **Field outlines use the muted text colour**, so a field's edge is 6.29:1 against its surface; `--color-border` stays light for separators.
- **Every `<button>` is primary by default**, with `button-secondary` and `button-danger` modifiers: the existing buttons (Try again, Reload the page, an empty state's action) needed no change.
- **The fallback screen** is a card on the page; `ErrorBoundary`'s markup gained one wrapper `div`, and its test is unchanged.
- **Extra helpers** for the page builders: `page-header`, `form`, `form-actions`, `card`, `stack`, `muted`, `button` (a link that looks like a button), `numeric` in a table.
- **The `/styles` page opens a sample dialog and panel** with `showModal()`, so their surfaces can be seen; a test checks it renders every section, and a second test checks it is not in the menu.

## What to be able to explain

1. Why are colours named by role (`--color-brand`) and not by hue (`--teal`)? What does that make easy to change?
2. Why system fonts and not the company's own typefaces?
3. Why is the status word always shown on a badge, when the colour already tells you the status?
4. What is the `/styles` page for, and who is it for?
5. Why was this done before the feature pages and not at the end?
