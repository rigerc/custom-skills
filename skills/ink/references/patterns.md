# Ink patterns and recipes

Contents: [Select menu](#select-menu-no-dependencies) · [Text input](#minimal-text-input) · [Task list with Static](#task-list-static-log--live-status) · [Scroll view](#scroll-view) · [Full-screen layout](#full-screen-app-layout) · [Subprocess / editor handoff](#handing-the-terminal-to-a-subprocess) · [Non-interactive fallback](#non-interactive-fallback) · [Async work and exit codes](#async-work-and-exit-codes) · [Routing](#routing) · [Testing](#testing) · [Performance](#performance-and-flicker-checklist)

These are templates. Adjust to the installed Ink version (see SKILL.md) and the user's TypeScript/JS setup.

## Select menu (no dependencies)

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

type Item<T> = {label: string; value: T};

export function Select<T>({items, onSelect}: {items: Item<T>[]; onSelect: (v: T) => void}) {
	const [index, setIndex] = useState(0);

	useInput((input, key) => {
		if (key.upArrow || input === 'k') setIndex(i => (i - 1 + items.length) % items.length);
		if (key.downArrow || input === 'j') setIndex(i => (i + 1) % items.length);
		if (key.return) onSelect(items[index]!.value);
	});

	return (
		<Box flexDirection="column">
			{items.map((item, i) => (
				<Text key={item.label} color={i === index ? 'cyan' : undefined}>
					{i === index ? '❯ ' : '  '}{item.label}
				</Text>
			))}
		</Box>
	);
}
```

Prefer `ink-select-input` if the user is fine with a dependency.

## Minimal text input

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput, usePaste} from 'ink';

export function TextField({onSubmit, placeholder = ''}: {onSubmit: (v: string) => void; placeholder?: string}) {
	const [value, setValue] = useState('');

	useInput((input, key) => {
		if (key.return) return onSubmit(value);
		if (key.backspace || key.delete) return setValue(v => v.slice(0, -1));
		if (key.ctrl || key.meta || key.escape || key.tab) return;       // ignore shortcuts
		if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
		setValue(v => v + input);
	});

	usePaste(text => setValue(v => v + text.replace(/\r?\n/g, ' ')));    // newer Ink only

	return (
		<Box>
			<Text color="green">› </Text>
			<Text>{value || <Text dimColor>{placeholder}</Text>}</Text>
			<Text inverse> </Text>
		</Box>
	);
}
```

For cursor movement, history, masking, or IME, use `ink-text-input` or add a cursor offset and `useCursor`. Note that on some terminals the Backspace key is reported as `key.delete`, which is why both are handled.

## Task list: Static log + live status

```tsx
import React, {useEffect, useState} from 'react';
import {render, Static, Box, Text, useApp, useAnimation} from 'ink';

type Done = {id: number; title: string; ok: boolean};

const Spinner = () => {
	const {frame} = useAnimation({interval: 80});
	return <Text color="cyan">{'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[frame % 10]}</Text>;
};

const App = ({tasks}: {tasks: {title: string; run: () => Promise<void>}[]}) => {
	const {exit} = useApp();
	const [done, setDone] = useState<Done[]>([]);
	const [current, setCurrent] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			for (const [id, t] of tasks.entries()) {
				if (cancelled) return;
				setCurrent(t.title);
				let ok = true;
				try { await t.run(); } catch { ok = false; }
				setDone(d => [...d, {id, title: t.title, ok}]);
			}
			setCurrent(null);
			exit();
		})();
		return () => { cancelled = true; };
	}, []);

	return (
		<>
			<Static items={done}>
				{d => <Text key={d.id} color={d.ok ? 'green' : 'red'}>{d.ok ? '✔' : '✖'} {d.title}</Text>}
			</Static>
			{current && <Box><Spinner /><Text> {current}</Text></Box>}
		</>
	);
};
```

Why this shape: finished lines go to `<Static>` so they never get redrawn (no flicker, scrollback preserved), while only the live row re-renders. If `useAnimation` isn't available, use a `setInterval` in the `Spinner`.

## Scroll view

Ink has no built-in scrolling; build it from `overflow="hidden"` + `contentOffsetY` (newer versions) and `useBoxMetrics`. Or use `ink-scroll-view`/`ink-virtual-list`.

```tsx
import React, {useRef, useState} from 'react';
import {Box, useInput, useBoxMetrics} from 'ink';

export function ScrollView({height, children}: {height: number; children: React.ReactNode}) {
	const viewportRef = useRef(null);
	const contentRef = useRef(null);
	const {clientHeight} = useBoxMetrics(viewportRef);
	const content = useBoxMetrics(contentRef);
	const [requested, setRequested] = useState(0);

	const max = Math.max(0, content.height - clientHeight);
	const scrollTop = Math.min(requested, max);    // clamp every render (content/terminal can shrink)

	useInput((_, key) => {
		if (key.upArrow) setRequested(Math.max(0, scrollTop - 1));
		if (key.downArrow) setRequested(Math.min(max, scrollTop + 1));
		if (key.pageUp) setRequested(Math.max(0, scrollTop - height));
		if (key.pageDown) setRequested(Math.min(max, scrollTop + height));
	});

	return (
		<Box ref={viewportRef} height={height} overflow="hidden" contentOffsetY={scrollTop} flexDirection="column">
			{/* flexShrink={0} keeps natural height; otherwise Yoga squeezes children and nothing scrolls */}
			<Box ref={contentRef} flexDirection="column" flexShrink={0}>
				{children}
			</Box>
		</Box>
	);
}
```

Rules: put padding on the **content wrapper**, not the viewport (viewport `clientHeight` doesn't subtract padding, so the last row becomes unreachable); keep the `flexShrink={0}` wrapper; clamp on every render. For long lists, render only the visible window of items instead of everything (virtualization).

## Full-screen app layout

```tsx
import React from 'react';
import {render, Box, Text, Spacer, useWindowSize, useApp, useInput} from 'ink';

const App = () => {
	const {columns, rows} = useWindowSize();
	const {exit} = useApp();
	useInput(i => { if (i === 'q') exit(); });

	return (
		<Box flexDirection="column" width={columns} height={rows}>
			<Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} paddingX={1}>
				<Text bold>My App</Text><Spacer />
			</Box>
			<Box flexGrow={1}>
				<Box width="30%" borderStyle="round" flexDirection="column"><Text>Sidebar</Text></Box>
				<Box flexGrow={1} borderStyle="round" flexDirection="column"><Text>Main</Text></Box>
			</Box>
			<Text dimColor>q quit</Text>
		</Box>
	);
};

render(<App />, {alternateScreen: true});
```

Use `alternateScreen: true` for dashboard/TUI style apps so the user's scrollback isn't polluted; skip it for tools whose output should remain in the terminal after exit. Height exactly equal to `rows` can still scroll the terminal by one line in some emulators; use `rows - 1` if you see that.

## Handing the terminal to a subprocess

```tsx
import {spawn} from 'node:child_process';
import {useApp, useInput} from 'ink';

const {suspendTerminal} = useApp();

useInput(async input => {
	if (input === 'e') {
		await suspendTerminal(() => new Promise<void>(resolve => {
			spawn(process.env.EDITOR ?? 'vi', [file], {stdio: 'inherit'}).on('exit', () => resolve());
		}));
	}
});
```

On versions without `suspendTerminal`, unmount the Ink app (`unmount()`), run the child with `stdio: 'inherit'`, then `render()` again.

To *display* a child's output inside the UI instead, spawn with piped stdio, collect lines into state, and render the tail (see `examples/subprocess-output` upstream or `ink-spawn`).

## Non-interactive fallback

CLIs get piped and run in CI. Decide behavior explicitly:

```tsx
import {render, Text, useStdin} from 'ink';

const Prompt = () => {
	const {isRawModeSupported} = useStdin();
	if (!isRawModeSupported) return <Text>Run in an interactive terminal, or pass --yes.</Text>;
	return <InteractivePrompt />;
};
```

Also: when `!process.stdout.isTTY`, either print plain text/JSON without Ink or let Ink's non-interactive mode print the final frame. Never leave `useInput` mounted unguarded in code that may run under CI.

## Async work and exit codes

```tsx
const App = () => {
	const {exit} = useApp();
	useEffect(() => {
		doWork().then(() => exit(), err => exit(err));   // exit(err) rejects waitUntilExit()
	}, []);
	return <Text>Working...</Text>;
};

const app = render(<App />);
await app.waitUntilExit().catch(() => { process.exitCode = 1; });
```

Use `exit(value)` to return a result to the caller of `waitUntilExit()` (e.g. the selected item from a prompt).

## Routing

Use React Router's `MemoryRouter` (see upstream `recipes/routing.md` and `examples/router`):

```tsx
import {MemoryRouter, Routes, Route, useNavigate} from 'react-router';
render(<MemoryRouter><Routes><Route path="/" element={<Home />} /><Route path="/settings" element={<Settings />} /></Routes></MemoryRouter>);
```

For small apps, a `useState<'home' | 'settings'>` screen switch is simpler and has no dependency. Remember that only one screen should have an active `useInput`.

## Testing

### ink-testing-library

```tsx
import React from 'react';
import {render} from 'ink-testing-library';
import {Counter} from './counter.js';

test('renders and reacts to input', async () => {
	const {lastFrame, stdin, frames, unmount} = render(<Counter />);
	expect(lastFrame()).toContain('0');
	stdin.write('\u001B[B');          // down arrow  (\r = enter, \u001B[A = up, \u007F = backspace)
	await new Promise(r => setTimeout(r, 20));   // let React flush
	expect(lastFrame()).toContain('1');
	unmount();
});
```

Tips: assert with `toContain` or regex rather than full-frame equality when color codes are involved (strip with `strip-ansi`); `await` a tick after `stdin.write`; use `frames` to inspect intermediate renders; call `unmount()` to clear timers. Compiling ink-testing-library output with a different Ink copy than your app can break; make sure only one `ink` is installed.

### renderToString (newer Ink)

```tsx
import {renderToString} from 'ink';
expect(renderToString(<Status ok />, {columns: 40})).toMatchSnapshot();
```

Reflects the initial render only, so use it for static layouts, not interactions.

## Performance and flicker checklist

1. Move completed output into `<Static>`.
2. Keep the live region shorter than `rows`.
3. Update state at human-perceptible rates (~80-100 ms for spinners); share timers via `useAnimation`.
4. Lower `maxFps` for chatty updates; consider `incrementalRendering: true`.
5. Memoize expensive children (`React.memo`, `useMemo`) in big trees; avoid re-creating large arrays each tick.
6. Throttle high-volume log/stream updates (batch lines into state every ~50-100 ms instead of per line).
7. Virtualize long lists (only render the visible window).
8. Avoid `console.log` in hot paths while the UI is live.
