# Satbayev Syllabus 2.0 — update status

Implemented in the existing Python/SQLite application:

- Personal workspaces with up to 20 independent syllabus tabs.
- Undo/Redo, automatic server saving, named versions and restoration (up to 30 per syllabus).
- Reset content or start a clean template; save a version before either reset.
- Personal editing of metadata, headings, policies, table headers and formatting. Score totals remain calculated.
- Dependent institute/department/programme/course suggestions, course-year and semester filtering, and course metadata autofill when supplied by the catalogue.
- Account-isolated workspace storage, CSRF enforcement and optimistic revision checks.

Existing `documents`, accounts and shared configuration remain in place. A user's existing syllabus is copied into the workspace on first save. Workspaces use an additional SQLite table. Runtime files and credentials must never be committed.

The supplied 2026–2027 6B05208 Seismology curriculum has been incorporated: 81 offerings in each of Kazakh, Russian and English. Semester, credits and contact-hour allocations were cross-checked across all three language tables and visually against Russian pages 5–8. The source file name, SHA-256 and source page numbers are recorded in data/seismology-2026.json. Elective alternatives remain separate; military training has no semester or credit allocation in the source and is excluded from the semester selector. Existing personal data is retained when catalogue records are added.

Before deploying to the existing Render service, verify the current database path and persistent disk, and make a database backup. `SYLLABUS_DB` can specify an absolute persistent path; the default remains `runtime/syllabus.sqlite3`. Preserve the existing database rather than initializing a replacement. The current server start arguments are retained.

From `Satbayev-Syllabus-updated Github/Satbayev-Syllabus final`:

```
py build.py
py tests/server.test.py
py tests/languages-ai.test.py
py tests/workspace.test.py
node --check tests/compiled-app.js
node tests/ui-logic.test.cjs
node tests/export.test.cjs
node tests/workspace.test.cjs
node tests/text-tools.test.cjs
node tests/ux-dom.test.cjs
```

DOM tests require `jsdom`. These tests are not a substitute for visual browser QA. The update has not been deployed or visually verified yet.
