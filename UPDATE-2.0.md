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

The owner selected the free Render demo without guaranteed data retention and confirmed no existing Render data needed migration. The original local database remains untouched. `SYLLABUS_DB` can specify a persistent path; the default remains `runtime/syllabus.sqlite3`. Back up runtime data before future updates.

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

DOM tests require `jsdom`. The 2.0 update was deployed to the existing Render service on 2026-11-13; HTTP availability and deployed source were verified, and the editor was visually reviewed locally. Live authenticated saving was not verified because browser access stopped.

The language selector now changes only the interface (Kazakh, Russian, English), with a browser-local preference. It does not translate syllabus text, change document language, add Undo entries or save new document versions. Regression tests compare complete document/workspace state and preview content across all three choices.
