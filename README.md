# DirDelta Desktop

A bidirectional folder comparison app built with Electron and TypeScript. The interface is in English, and all operations run locally.

## Getting started

```sh
npm install
npm start
```

Requires Node.js and a desktop environment supported by Electron.

## Usage

1. Select the left and right folders.
2. Optionally enable **Verify with SHA-256**.
3. Click **Compare**.
4. Use the arrow next to an item to copy it to the other folder. A folder arrow copies its scanned descendants as well. **Copy missing** buttons transfer only items present on the source side and missing on the destination side.

The list shows only missing, different, or type-conflicting items. Parent folders present on both sides are omitted even when their contents differ; differences appear with their full relative paths. Folders present on only one side and file/folder type conflicts remain visible. Identical files and files with matching sizes in quick mode are hidden at every level. Folders with no visible differences are also hidden. Search matches the full relative paths of differences. There is no identical/unverified counter; the total item count covers the entire scan.

**Hide hidden folders and files** hides dot-prefixed files (such as `.env`), folders (such as `.git`), and their contents from the list and search results. It is off by default and does not require rescanning. It does not change counters, scanning, or what gets copied, and it does not use the Windows hidden attribute.

Folders whose entire contents are missing on the other side start collapsed; click a row to expand it. A folder copy arrow transfers all its scanned contents. Bulk copying includes missing items from the entire comparison. Clicking a file name reveals it in the system file manager.

- **Quick mode:** Shows path, type, and file-size differences. Files with matching sizes are not listed, but their contents are not assumed to be identical. Size differences remain visible without separate parent folder rows.
- **SHA-256:** Reads the contents of every file present on both sides and compares their hashes. Copied content is also verified before being placed at the destination. Large files can take longer.
- Hidden files and empty folders are included in scanning. Symbolic links and special files are not copied; their reasons appear under **Excluded items**. Read errors are listed separately with the side, path, cause, and suggested action. **Results may be incomplete** is shown only for read errors. A read error during SHA-256 calculation stops the comparison.
- File/folder type conflicts are not resolved automatically. Identical or nested root folders are rejected.
- Overwriting existing files requires confirmation in a native dialog. The app does not delete files or synchronize automatically.
- Files are written to temporary files in the destination folder and placed at their final paths when complete. Individual file replacement is atomic; an entire batch is not a single transaction. Completed copies remain after errors or cancellation. The view is rescanned after copying.
- Copying preserves file contents, standard permission bits, and file timestamps. ACLs, extended attributes, and folder timestamps are not preserved.
- Results reflect the scan time. Avoid modifying source or destination folders in other applications during an operation. Compare again after external changes.

## Development

```sh
npm run typecheck
npm test
npm run test:ui
```

File-system access runs in the main process through a narrow IPC interface. The renderer runs without Node.js access, with sandboxing and context isolation enabled. `src/engine.ts` preserves the existing engine API through re-exports. `dirdelta_bash_script/` contains the original command-line tool.

### Source responsibilities

- `src/main.ts`: Electron startup, window creation, and dependency wiring.
- `src/desktop/ipc.ts`: IPC input and sender validation, followed by delegation to session commands.
- `src/application/`: Comparison rules, dependency contracts, and a per-window operation session, independent of Electron and the file system.
- `src/filesystem/`: Scanning, file-read errors, safe path resolution, SHA-256, and atomic file copying.
- `src/types.ts`: Shared read-only results and the desktop API contract.
- `src/renderer.ts`: User actions, screen state, and API calls.
- `src/presentation/view.ts`: DOM rendering for result rows, counters, and warnings.
- `src/tree.ts`: Folder grouping, search, visibility filtering, and bulk selection using the platform path separator.

The application layer does not import infrastructure. `main.ts` injects concrete file-system operations into the session. The session prevents concurrent commands, including folder selection, owns cancellation, and is disposed when its window closes. Copying invalidates the comparison whether it succeeds, fails, or is declined at confirmation; the UI rescans afterward.

Browser code uses namespaces because the sandboxed renderer has no CommonJS loader. Scripts load in this order in `index.html`: `tree`, `presentation/view`, `renderer`. No additional package or build tool is required. UI dates use `en-US`; search and sorting use the English locale. File names and paths retain their original text.

`npm test` covers file-system integrations, pure tree behavior, and session concurrency/cancellation. `npm run test:ui` exercises the main user flows through a real Electron window, preload, and IPC; it requires a desktop session. The original Bash tool is independent; check its syntax with `bash -n dirdelta_bash_script/dirdelta`.
