# Plan: Add syntax highlighting (JSON input, Java output) to both pages

## Goal

Give both the JSON input pane (POJO page) and the Java output panes (POJO + Controller pages) proper syntax highlighting. The input pane becomes a real editor; the output panes become read-only highlighted views.

## Context

- Current state:
  - `pojo-converter.ts` — `<textarea>` for JSON input (plain), `<pre>` for Java output (plain).
  - `controller-generator.ts` — `<pre>` for Java output (plain).
  - No highlighting library installed.
  - Bootstrap 5.3.3 already loaded.
- Constraints:
  - Angular 22, strict TS, `@angular/forms` FormsModule already in use.
  - Output must keep working with the existing `[(ngModel)]`-style signals (we'll keep the signals, just change the UI widget).
  - Keep the existing dark `bg-dark text-light` aesthetic.

## Approach

Use **CodeMirror 6** (`@codemirror/view` + `@codemirror/state` + `@codemirror/lang/java` + `@codemirror/lang-json` + `@lezer/highlight` + `@codemirror/theme` or built-in `oneDark`).

- **Input (JSON)**: replace `<textarea>` with a `CodeMirror` editor bound to the existing `jsonInput` signal via `updateListener`.
- **Output (Java)**: replace `<pre>` with a read-only `CodeMirror` editor (or a static `EditorView` that re-renders on `generatedCode()` change).

Why CodeMirror 6 over Prism/Highlight.js:
- Real editor (cursor, selection, multi-line) for the input — a big UX upgrade over a textarea.
- Read-only mode for output is just a config flag.
- First-class Java + JSON language packs.
- `oneDark` theme matches the existing dark aesthetic.

## Tasks

### Task 1 — Install dependencies
```
npm install @codemirror/state @codemirror/view @codemirror/lang-java @codemirror/lang-json @lezer/highlight
```
Commit: `chore: add CodeMirror 6 deps for syntax highlighting`

### Task 2 — Create `CodeMirrorEditor` component
File: `src/app/components/code-editor/code-editor.ts`

- Signals: `code: signal<string>`, `language: signal<'java' | 'json'>`, `readOnly: signal<boolean>`.
- On first change detection: create `EditorView` with:
  - `EditorState` seeded from `code()`.
  - Extensions: `java()` or `json()` based on `language()`, `oneDark`, `EditorView.lineWrapping`, `EditorView.editable.of(!readOnly())`.
- On `code()` change: update state with `EditorState.replace` (avoid full re-creation).
- On `updateListener`: push editor content back to the `code` signal (only when not readOnly).
- On `language()` change: swap language extension.
- Expose `destroy()` to tear down the view on `OnDestroy`.
- Template: `<div #host class="code-editor-host"></div>` — CodeMirror mounts into this div.

### Task 3 — Wire into `pojo-converter`
- Replace `<textarea>` with `<app-code-editor [code]="jsonInput" (codeChange)="jsonInput.set($event)" language="json" [readOnly]="false" />`.
- Replace `<pre>` with `<app-code-editor [code]="generatedCode()" language="java" [readOnly]="true" />`.
- Keep the `copyCode()` behavior (it reads from `generatedCode()`, no change).

### Task 4 — Wire into `controller-generator`
- Replace `<pre>` with `<app-code-editor [code]="generatedCode()" language="java" [readOnly]="true" />`.

### Task 5 — Styling
- Add a `.code-editor-host` class in `styles.css` (or component styles) to size the editor to the card body (100% width, min-height ~400px, scroll).
- Ensure the dark theme matches Bootstrap's `bg-dark`.

### Task 6 — Tests
- Add `code-editor.spec.ts`:
  - Renders the initial code.
  - Emits `codeChange` when the user types (simulate via `dispatch`).
  - Switches language (java ↔ json) without losing content.
  - Read-only mode prevents edits.
- Re-run full `npm test` (existing 24 tests must still pass).

### Task 7 — Browser E2E
- Open `http://localhost:4200/` → paste JSON → verify JSON keys are highlighted (e.g., `"id"` in one color, `1` in another).
- Generate → verify Java annotations (`@RestController`, `@Data`) are highlighted in a different color from plain text.
- Open `/#/controller` → add endpoint → Generate → verify Java highlighting.
- Verify Copy button still copies the raw text.

## Risks / mitigations

- **CodeMirror in Angular strict mode**: `EditorState` is immutable; use `updateListener` + `state.replace` rather than direct mutation. Mitigated by the standard CodeMirror 6 + Angular pattern.
- **Language swap**: `EditorState.of` doesn't exist — we recreate the `EditorState` with the new language extension and apply via `view.setState(...)`. CodeMirror 6 supports this cleanly.
- **Bundle size**: CodeMirror 6 is modular; we only pull in `state`, `view`, `lang/java`, `lang/json`, `lezer/highlight`. Expected ~30–50 KB gzipped total. Acceptable.
- **Theme**: `oneDark` is included in `@codemirror/view` (or `@codemirror/theme`). If not, add `@codemirror/theme`.

## Open questions

- Should the JSON input pane be **read-only** or **editable**? (I'll assume editable — it's an input.)
- Should the output panes be **read-only**? (Yes — they're generated code.)
- Any specific color scheme preference? (I'll use `oneDark` to match the existing dark aesthetic.)

## Out of scope

- Line numbers toggle.
- Search/replace.
- Multiple languages in one editor.
- Mobile-specific layout tweaks.
