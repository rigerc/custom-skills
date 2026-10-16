---
name: ink
description: Build, debug, and test terminal UIs and interactive CLIs with Ink (vadimdemedes/ink), "React for CLIs". Use this skill whenever the user mentions Ink, `ink` imports (`import {render, Box, Text} from 'ink'`), create-ink-app, ink-testing-library, or ink-* packages (ink-text-input, ink-spinner, ink-select-input), or wants to build a CLI/TUI/terminal dashboard/interactive prompt/spinner/progress UI/full-screen terminal app using React components, hooks, or Flexbox layout in the terminal, even if they never say "Ink" explicitly. Also use it for fixing Ink problems such as flickering output, app exiting immediately, useInput raw-mode errors, console.log mixing with the UI, text wrapping or layout issues, or testing Ink components.
---

# Ink: React for command-line apps

Ink is a React renderer that targets the terminal. Components render to a Yoga (Flexbox) layout, and Ink diffs and redraws the output as state changes. If you know React, you know Ink: hooks, context, Suspense, refs, and keys all work. Only Ink's own components, hooks, and `render` options need documenting, and they are covered here and in `references/`.

## Mental model (get these right and most bugs disappear)

1. **Every `<Box>` is `display: flex`**, and the default `flexDirection` is `row` (same as `<div style="display:flex">`). To stack things vertically, set `flexDirection="column"`.
2. **All text must be inside `<Text>`.** Bare strings inside `<Box>` throw. `<Text>` may contain only strings and other `<Text>` (plus `<Newline>`), never `<Box>`.
3. **Sizes are character cells.** `width={20}` is 20 columns, `height={3}` is 3 rows. Percentages work for `width`/`height`/`minHeight`/`maxHeight`; `minWidth`/`maxWidth` accept numbers only.
4. **The process lives only while the event loop has work.** A tree with no timers, pending promises, or `useInput` renders once and exits. Exit deliberately with `useApp().exit()`, `instance.unmount()`, or Ctrl+C (on by default).
5. **Ink owns stdout while it is running.** Don't `process.stdout.write` or rely on raw `console.log` for UI output; use `<Static>`, `useStdout().write`, or let Ink's console patching handle logs (see Gotchas).

## Version check first

The upstream README documents the *upcoming* release, and the npm release can lag it. Before using newer APIs, check what's installed (`npm ls ink react`, or read `node_modules/ink/package.json`).

- Newer APIs that may be absent in older versions: `useAnimation`, `usePaste`, `useBoxMetrics`, `useWindowSize`, `useCursor`, `renderToString`, `useApp().suspendTerminal`, `waitUntilRenderFlush`, and render options `alternateScreen`, `interactive`, `kittyKeyboard`, `concurrent`, `incrementalRendering`, plus Box props `contentOffsetX/Y`, `aspectRatio`, `alignContent`, `position`, and `backgroundColor`.
- Ink releases are **ESM-only** and pin a React range and Node floor. As of Oct 2026 the npm release is Ink 8.x, which needs React >= 19.3, `@types/react` >= 19.3 (TS), and Node >= 22; it works with `ink-testing-library` 4.x. Older Ink majors need older React/Node, so check `peerDependencies`/`engines` before scaffolding or upgrading. Use `"type": "module"`, and write relative imports with extensions when compiling TypeScript with NodeNext resolution.
- If a documented API is missing, fall back to the older equivalent (`measureElement` for `useBoxMetrics`, `useStdout().stdout.columns` plus a `resize` listener for `useWindowSize`, a `setInterval` for `useAnimation`) rather than guessing.

## Getting started

Fastest path:

```bash
npx create-ink-app my-cli                # JavaScript
npx create-ink-app --typescript my-cli   # TypeScript
```

Manual TypeScript setup:

```bash
npm install ink react
npm install -D typescript @types/react tsx
```

`package.json` needs `"type": "module"`; `tsconfig.json` needs `"jsx": "react-jsx"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`. Run during development with `npx tsx src/cli.tsx`. For plain JS without a build step you need Babel with `@babel/preset-react` (or a loader such as `import-jsx` / esbuild-kit), because Ink code is JSX.

Minimal app:

```tsx
import React, {useState, useEffect} from 'react';
import {render, Box, Text, useApp, useInput} from 'ink';

const App = () => {
	const {exit} = useApp();
	const [count, setCount] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => setCount(c => c + 1), 100); // functional update
		return () => clearInterval(timer);                            // always clean up
	}, []);

	useInput((input, key) => {
		if (input === 'q' || key.escape) exit();
	});

	return (
		<Box borderStyle="round" paddingX={1} flexDirection="column">
			<Text color="green">{count} ticks</Text>
			<Text dimColor>press q to quit</Text>
		</Box>
	);
};

render(<App />);
```

## Which tool for which job

| Need | Use |
|---|---|
| Layout, spacing, borders, backgrounds | `<Box>` (see `references/components.md`) |
| Colors, bold, wrapping, truncation | `<Text>` props: `color`, `backgroundColor`, `bold`, `dimColor`, `wrap="truncate-end"`... |
| Push content to the edges | `<Spacer>` |
| Log of finished items above a live area | `<Static items={...}>` |
| Post-process rendered text (gradients, links) | `<Transform>` |
| Keyboard input | `useInput` (keys), `usePaste` (pasted text) |
| Tab-order focus between widgets | `useFocus` / `useFocusManager` |
| Quit, hand terminal to `$EDITOR`/`less` | `useApp()` → `exit`, `suspendTerminal` |
| Terminal size / responsive layout | `useWindowSize` |
| Spinners, progress, timed effects | `useAnimation` (one shared timer) |
| Measure a box (e.g. scrolling) | `useBoxMetrics(ref)` / `measureElement(ref)` |
| Write text outside the React tree safely | `useStdout().write`, `useStderr().write` |
| IME / cursor placement | `useCursor` |
| Accessibility | `useIsScreenReaderEnabled`, `aria-*` props |
| Unit tests | `ink-testing-library` (`lastFrame()`), or `renderToString` |

Full prop and option lists: `references/components.md`, `references/hooks.md`, `references/render-api.md`. Worked recipes (select menu, text input, task list, scroll view, full-screen layout, subprocess handoff, routing, testing): `references/patterns.md`. Read the relevant reference before writing non-trivial code; don't rely on memory for option names.

## Gotchas that cause real bugs

- **App exits immediately.** Nothing keeps the event loop alive. Add a timer/promise, a `useInput` handler, or `await waitUntilExit()` on a flow that is actually pending.
- **`useInput` throws about raw mode** when stdin isn't a TTY (piped input, CI). Guard with `const {isRawModeSupported} = useStdin()` and pass `{isActive: isRawModeSupported}` or render a non-interactive fallback. Use Ink's `setRawMode` from `useStdin`, never `process.stdin.setRawMode`, so Ctrl+C handling keeps working. If you set `exitOnCtrlC: false`, you must handle Ctrl+C yourself (`key.ctrl && input === 'c'`).
- **Several `useInput` hooks fire at once.** Every active handler sees every keypress. Gate inactive ones with `{isActive: false}` and keep one "owner" per screen or focus target.
- **Flicker or duplicated frames.** Ink redraws the whole live area on each update, and output taller than the terminal is especially prone to this. Move finished lines into `<Static>`, constrain height with `useWindowSize`, lower `maxFps`, or try `incrementalRendering: true`. Don't update state every few milliseconds when every 80-100ms looks the same.
- **`<Static>` only appends.** It renders items it hasn't seen and ignores later edits to earlier ones. Every item's root element needs a stable `key`. Put it before the dynamic part of the tree.
- **`console.log` interleaving.** `patchConsole` (default `true`) reroutes `console.*` above the UI. That's fine for debug logs but not for structured output. For deliberate output use `<Static>` or `useStdout().write`, and for stdout-as-data CLIs (piping JSON) render the UI to stderr or skip Ink when `!process.stdout.isTTY`.
- **Wrapping needs a width.** Text wraps to its container's width. Use `wrap="truncate-end"` for single-line rows and give `<Box>` explicit `width` when you need predictable columns. Wide characters (CJK, emoji) occupy 2 cells, so use `string-width` for manual math.
- **`measureElement`/`useBoxMetrics` read 0 during the first render.** Layout isn't computed yet. Read them in effects/handlers, or check `hasMeasured`.
- **`<Transform>` must not change dimensions**, and its input contains ANSI escapes when children are styled. Use ANSI-aware helpers (`strip-ansi`, `slice-ansi`) for string surgery.
- **Keys:** wrap lists in `key`-ed elements, as in React. `useFocus` order is registration order and `Tab`/`Shift+Tab` are consumed by Ink's focus manager.
- **Non-interactive environments.** In CI or when stdout isn't a TTY, Ink only writes the final frame on unmount and skips cursor/erase sequences. Set `CI=false` or `render(..., {interactive: true})` only if you know the target supports it.
- **Colors.** Color strings go through chalk: named colors, hex (`#ff8800`), `rgb(...)`. Respect `NO_COLOR`/`FORCE_COLOR` conventions rather than hard-coding assumptions about terminal capability.

## Working approach

1. Decide the UI shape first: one-shot output, live-updating status, prompt/wizard, or full-screen app. This determines whether you need `<Static>`, `alternateScreen`, focus management, or none of them.
2. Keep state in React (`useState`/`useReducer`), side effects in `useEffect` with cleanup, and long-running work in async functions that update state. Treat the component tree as a pure view of that state.
3. Prefer composition: small components (`<Spinner>`, `<StatusRow>`, `<KeyHint>`) over one giant tree. Reach for community packages (below) before hand-rolling inputs and selects.
4. Always provide a clean exit path (`q`/Esc/Ctrl+C) and make sure effects clean up timers and subprocesses so the process can terminate.
5. Test with `ink-testing-library`; assert on `lastFrame()` and drive input via `stdin.write`. See `references/patterns.md`.

## Community packages (install separately)

`ink-text-input`, `ink-select-input`, `ink-multi-select`, `ink-confirm-input`, `ink-spinner`, `ink-link`, `ink-gradient`, `ink-big-text`, `ink-table`, `ink-progress-bar`, `ink-task-list`, `ink-divider`, `ink-titled-box`, `ink-form`, `ink-stepper`, `ink-tab`, `ink-markdown`, `ink-syntax-highlight`, `ink-chart`, `ink-scroll-view`, `ink-scroll-list`, `ink-virtual-list`, `ink-picture`, `ink-spawn`. Confirm a package supports your installed Ink/React versions before adopting it, because some older ones lag behind major releases. When in doubt, write a ~30-line component yourself.

Project scaffolding: `create-ink-app`. Docs/site: https://term.ink. Source: https://github.com/vadimdemedes/ink. Debugging with React DevTools: `npm i -D react-devtools-core`, run the app with `DEV=true`, and start `npx react-devtools`.
