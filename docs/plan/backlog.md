# Backlog: improvements not taken

Optional review findings and ideas that were deliberately not applied, kept as an honest list of what would be done next.

| Item | Where it came from | Why it was not done |
|---|---|---|
| Node-level 400 and 431 responses: a request the HTTP layer cannot parse (headers over 16 KB, a body shorter than its `content-length`) is answered before the app sees it, outside the standard error shape and with no request id. | LAB-03 review | Documented instead of handled (`docs/api.md`, errors): the app's own clients never send such requests. |
| No automated test checks that the `pnpm dev` script's steps run in order and that the Vite proxy reaches the API. | LAB-04 review | Covered by the manual checklist (`docs/acceptance-checklist.md`, Checkpoint 1) and, from LAB-21, by the browser tests, which run against the real dev setup. |
| An already-applied migration file that is edited later is ignored without a warning. | LAB-02 review | The rule not to edit applied migrations is documented in `AGENTS.md`; storing and comparing a checksum of each applied file would be the fix. |
| Browser tests do not run in the automated checks on pull requests. | Deliberate (LAB-05, LAB-21) | They are the slowest and most fragile layer, so they run locally with `pnpm test:e2e` (from LAB-21). |
