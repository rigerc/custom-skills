# Ink hooks reference

Contents: [useInput](#useinput) · [usePaste](#usepaste) · [useApp](#useapp) · [useStdin](#usestdin) · [useStdout / useStderr](#usestdout--usestderr) · [useWindowSize](#usewindowsize) · [useBoxMetrics](#useboxmetrics) · [useFocus](#usefocus) · [useFocusManager](#usefocusmanager) · [useCursor](#usecursor) · [useAnimation](#useanimation) · [useIsScreenReaderEnabled](#useisscreenreaderenabled)

Some hooks are newer than others; verify the installed Ink version (see SKILL.md "Version check first").

## useInput

```ts
useInput((input: string, key: Key) => void, options?: {isActive?: boolean})
```

Called per character typed. A multi-character paste arrives as one call with the whole string as `input` (unless `usePaste` is active; then paste goes to `usePaste` instead).

`key` booleans (all default false): `leftArrow`, `rightArrow`, `upArrow`, `downArrow`, `return`, `escape`, `ctrl`, `shift`, `tab`, `backspace`, `delete`, `pageUp`, `pageDown`, `home`, `end`, `meta`.

Only with the kitty keyboard protocol enabled: `super`, `hyper`, `capsLock`, `numLock`, and `eventType` (`'press' | 'repeat' | 'release'`; `undefined` without the protocol). With the protocol, non-printable keys produce empty `input`, and `Ctrl+C` gives `input === 'c'` with `key.ctrl === true`.

`isActive` (default true): disable a handler when another component should own input.

```tsx
useInput((input, key) => {
	if (key.ctrl && input === 'c') exit();
	if (key.upArrow) setIndex(i => Math.max(0, i - 1));
	if (key.downArrow) setIndex(i => Math.min(items.length - 1, i + 1));
	if (key.return) submit(items[index]);
}, {isActive: mode === 'browse'});
```

Requires raw-mode capable stdin; throws otherwise. Guard with `useStdin().isRawModeSupported`.

## usePaste

```ts
usePaste((text: string) => void, options?: {isActive?: boolean})
```

Enables bracketed paste mode while mounted. Delivers the complete pasted string verbatim (newlines and escapes included). Pasted content is not forwarded to `useInput` handlers while it is active; both hooks can coexist in a component.

## useApp

```ts
const {exit, waitUntilRenderFlush, suspendTerminal} = useApp();
```

- `exit(errorOrResult?)`: unmount the app. `exit()` resolves `waitUntilExit()` with `undefined`; `exit(error)` rejects with an `Error`; `exit(value)` resolves with `value`.
- `waitUntilRenderFlush()`: promise that settles after pending output is written to stdout. Await it before running code that depends on the frame being visible.
- `suspendTerminal(callback?)`: hands the terminal to a child process (`$EDITOR`, `less`, `fzf`), then restores Ink's terminal state and repaints. While suspended Ink stops writing and reading and restores raw mode off, cursor visible, bracketed paste off, alt screen exited, kitty protocol off.

```tsx
await suspendTerminal(async () => { await runEditor(); });   // callback form

const s = await suspendTerminal();                           // manual form
try { await runEditor(); } finally { await s.resume(); }

await using s2 = await suspendTerminal();                    // disposable form
await runEditor();
```

Suspending while already suspended throws. Only works in interactive TTY mode (in non-interactive output the callback runs without terminal handoff).

## useStdin

```ts
const {stdin, isRawModeSupported, setRawMode} = useStdin();
```

`stdin` is the stream passed to `render` (default `process.stdin`). `setRawMode(bool)` throws unless `isRawModeSupported`. Use this instead of `process.stdin.setRawMode` so Ink can handle Ctrl+C.

```tsx
return isRawModeSupported ? <Interactive /> : <StaticFallback />;
```

## useStdout / useStderr

```ts
const {stdout, write} = useStdout();
const {stderr, write} = useStderr();
```

`write(data: string)`: writes above Ink's live output without corrupting it. Like `<Static>` but string-only.

## useWindowSize

```ts
const {columns, rows} = useWindowSize();
```

Re-renders on terminal resize. Note: shrinking the terminal can briefly leave ghost lines (terminal-emulator reflow behavior). Fallback for older versions: read `useStdout().stdout.columns/rows` and subscribe to `stdout.on('resize', ...)`.

## useBoxMetrics

```ts
const ref = useRef<DOMElement>(null);
const {width, height, left, top, clientWidth, clientHeight, hasMeasured} = useBoxMetrics(ref);
```

Attach `ref` to a `<Box>`. Updates when layout changes. All zeros until the first layout pass or if the ref is detached; check `hasMeasured`. `left`/`top` are layout coordinates relative to the parent and don't include ancestors' `contentOffsetX/Y`. `clientWidth/Height` exclude borders but **not padding**.

## useFocus

```ts
const {isFocused, focus} = useFocus({autoFocus?: boolean, isActive?: boolean, id?: string});
```

Makes the component focusable via Tab (next) / Shift+Tab (previous), in registration order.
- `autoFocus`: take focus if nothing is focused (default false).
- `isActive`: temporarily disable while keeping position in the order (default true).
- `id`: unique id for programmatic focus (`useFocusManager().focus(id)`).

```tsx
const Field = ({label}) => {
	const {isFocused} = useFocus();
	return <Text color={isFocused ? 'cyan' : undefined}>{isFocused ? '❯' : ' '} {label}</Text>;
};
```

Pair with `useInput(handler, {isActive: isFocused})` so only the focused field handles keys.

## useFocusManager

```ts
const {enableFocus, disableFocus, focusNext, focusPrevious, focus, activeId} = useFocusManager();
```

Focus management is enabled by default. `disableFocus()` blurs the active component. `focus(id)` jumps to a component with that `id` (no-op if unknown). `activeId` is the focused id or `undefined`.

## useCursor

```ts
const {setCursorPosition} = useCursor();
setCursorPosition({x, y});      // 0-based column, row from top of Ink output
setCursorPosition(undefined);   // hide cursor
```

Positions the real terminal cursor after each render; needed for IME composition. Use `string-width` to compute `x` for wide characters.

## useAnimation

```ts
const {frame, time, delta, reset} = useAnimation({interval?: number, isActive?: boolean});
```

All animations share one internal timer, so many animated components cost one render cycle. `interval` default 100 ms. `frame`: integer tick counter (spinner frames). `time`: ms since start/reset (sine waves). `delta`: ms since previous rendered tick (physics). `isActive: false` stops it; turning it back on resets values to 0. `reset()` restarts from now.

```tsx
const Spinner = () => {
	const {frame} = useAnimation({interval: 80});
	const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
	return <Text color="cyan">{frames[frame % frames.length]}</Text>;
};
```

## useIsScreenReaderEnabled

Returns boolean. Branch to render descriptive plain text instead of decorative glyphs.
