# Ink render API reference

Contents: [render](#rendertree-options) · [Instance](#instance-returned-by-render) · [renderToString](#rendertostringtree-options) · [measureElement](#measureelementref) · [Environment behavior](#environment-behavior)

## render(tree, options?)

Mounts a React tree and renders it to the terminal. Returns an [Instance](#instance-returned-by-render).

| Option | Type | Default | Notes |
|---|---|---|---|
| `stdout` | Writable | `process.stdout` | Where to render |
| `stdin` | Readable | `process.stdin` | Where to read input |
| `stderr` | Writable | `process.stderr` | Error stream |
| `exitOnCtrlC` | boolean | `true` | In raw mode Ctrl+C isn't a signal; Ink listens for it. If false, handle it yourself. |
| `patchConsole` | boolean | `true` | Intercepts `console.*`, clears the UI, prints the message, re-renders the UI. Restored before React cleanup on unmount. |
| `onRender` | `({renderTime}) => void` | none | Runs after each committed frame (does not wait for stream flush; use `waitUntilRenderFlush()` for that). |
| `isScreenReaderEnabled` | boolean | `INK_SCREEN_READER === 'true'` | Screen-reader-friendly output |
| `debug` | boolean | `false` | Each update is written as separate output instead of replacing the previous frame (useful for inspecting frames). |
| `maxFps` | number | `30` | Cap on render frequency; lower for CPU-heavy, frequently updating UIs. |
| `incrementalRendering` | boolean | `false` | Only update changed lines; reduces flicker. Falls back to whole-line updates for unsupported terminal controls. |
| `concurrent` | boolean | `false` | React Concurrent Rendering: working Suspense for data fetching, `useTransition`, `useDeferredValue`. Changes render timing; tests may need `act()`. |
| `interactive` | boolean | `true` unless CI or `!stdout.isTTY` | Override auto-detection. Non-interactive mode skips erase/cursor sequences, resize handling, synchronized output, and kitty detection, and writes only the final non-static frame at unmount. |
| `alternateScreen` | boolean | `false` | Use the alternate screen buffer (like vim/htop/less); original screen restored on exit. No scrollback while active. Teardown output is intentionally discarded. Interactive mode only. |
| `kittyKeyboard` | `{mode?, flags?}` | undefined | See below. |

For `concurrent`, `interactive`, and `alternateScreen`: reusing the same stdout across multiple `render()` calls without unmounting first is unsupported. Call `unmount()` (or `cleanup()`) before changing them or creating a fresh instance.

### kittyKeyboard

```ts
render(<App />, {kittyKeyboard: {mode: 'auto'}});
render(<App />, {kittyKeyboard: {mode: 'enabled', flags: ['disambiguateEscapeCodes', 'reportEventTypes']}});
```

- `mode`: `'auto'` (default; query terminal with `CSI ? u`, enable if it answers within 200 ms) | `'enabled'` (force; stdin and stdout must be TTYs) | `'disabled'`.
- `flags` (default `['disambiguateEscapeCodes']`): `disambiguateEscapeCodes`, `reportEventTypes`, `reportAlternateKeys` (accepted but alternates not exposed), `reportAllKeysAsEscapeCodes`, `reportAssociatedText` (auto-enables `reportAllKeysAsEscapeCodes`).
- Unlocks `key.super`, `key.hyper`, `key.capsLock`, `key.numLock`, `key.eventType`, and distinguishes `Ctrl+I` vs `Tab`, `Shift+Enter` vs `Enter`, `Esc` vs `Ctrl+[`. F-keys, media keys, and modifier-only keys are not individually exposed on `key`. Enable `reportAssociatedText` to get composed/shifted text in `input`.

## Instance (returned by render)

```ts
const {rerender, unmount, waitUntilExit, waitUntilRenderFlush, cleanup, clear} = render(<App />);
```

- `rerender(tree)`: update props of the root node or replace it.
- `unmount()`: unmount the app.
- `waitUntilExit()`: promise settling when the app unmounts. Resolves with the value from `exit(value)`, rejects with the error from `exit(error)`. After a manual `unmount()` it settles once unmount-related writes finish.
- `waitUntilRenderFlush()`: settles once pending frames are flushed to stdout.
- `cleanup()`: unmount **and** delete the internal Ink instance bound to that stdout (tears down terminal state like the alt screen). Mostly for tests or advanced reuse of the same stream.
- `clear()`: clear the output.

Typical CLI entry:

```tsx
const app = render(<App />);
try {
	const result = await app.waitUntilExit();   // value passed to exit(value)
	process.exitCode = 0;
} catch (err) {                                  // exit(new Error(...))
	console.error(err);
	process.exitCode = 1;
}
```

Run code after output is visible:

```tsx
rerender(<App step="ready" />);
await waitUntilRenderFlush();
runNextCommand();
```

## renderToString(tree, options?)

Synchronously renders a React element to a string. No stdout writes, no terminal listeners, no persistent app.

Options: `columns` (default 80), the virtual terminal width controlling wrapping.

```tsx
import {renderToString, Box, Text} from 'ink';
const out = renderToString(<Box padding={1}><Text color="green">Hello</Text></Box>, {columns: 40});
```

Notes:
- Terminal hooks (`useInput`, `useStdin`, `useStdout`, `useStderr`, `useWindowSize`, `useApp`, `useFocus`, `useFocusManager`) return no-op defaults and don't throw.
- `useEffect` callbacks run, but resulting state updates don't affect the returned string (it reflects the initial render). `useLayoutEffect` updates **do** appear.
- `<Static>` output is prepended to the dynamic output.
- A component that throws propagates the error to the caller after cleanup.

Good for docs generation, snapshot tests, writing output to files, and non-interactive "print once" modes.

## measureElement(ref)

Returns `{x, y, width, height, clientWidth, clientHeight}` for a `<Box>` captured via `ref`.

- `x`/`y` are positions in the live layout region (layout-tree coordinates, not terminal viewport coordinates) and ignore ancestors' `contentOffsetX/Y`.
- `clientWidth/Height` exclude borders but not padding. For scrollable views, measure the content wrapper separately and clamp with `content.height - viewport.clientHeight`; put padding on the content wrapper, not the viewport.
- Returns zeros if called during render. Call from `useEffect`/`useLayoutEffect`, input handlers, or timers, and add dependencies so it re-measures when content changes.

```tsx
const ref = useRef();
useEffect(() => {
	const {width, height} = measureElement(ref.current);
}, [items]);
return <Box ref={ref}>...</Box>;
```

## Environment behavior

- **CI** (detected via `CI` env / `is-in-ci`): only the last frame is rendered on exit; resize events ignored. Opt out with `CI=false node cli.js`.
- **Non-TTY stdout** (piped/redirected): non-interactive, final frame only.
- **React DevTools:** install optional `react-devtools-core`, run with `DEV=true`, start `npx react-devtools`. Quit the CLI with Ctrl+C afterwards.
- **Screen readers:** `INK_SCREEN_READER=true` or `isScreenReaderEnabled` option.
