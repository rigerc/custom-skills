# Ink components reference

Contents: [Text](#text) · [Box](#box) · [Newline](#newline) · [Spacer](#spacer) · [Static](#static) · [Transform](#transform) · [Accessibility props](#accessibility-props)

## Text

Displays and styles text. Children: strings and nested `<Text>` only (no `<Box>`).

| Prop | Type / values | Default |
|---|---|---|
| `color` | any chalk color: name, `#hex`, `rgb(r, g, b)` | none |
| `backgroundColor` | same as `color` | none |
| `dimColor` | boolean | false |
| `bold`, `italic`, `underline`, `strikethrough`, `inverse` | boolean | false |
| `wrap` | `wrap` \| `hard` \| `truncate` (= `truncate-end`) \| `truncate-start` \| `truncate-middle` \| `truncate-end` | `wrap` |

`wrap` behavior inside `<Box width={7}>` with "Hello World": `wrap` → `Hello⏎World`; `hard` → `Hello W⏎orld`; `truncate-end` → `Hello…`; `truncate-middle` → `He…ld`; `truncate-start` → `…World`.

Nested styling:

```tsx
<Text>
	Status: <Text color="green" bold>OK</Text> <Text dimColor>(3 checks)</Text>
</Text>
```

## Box

Flexbox container, the layout primitive. Think `<div style="display:flex">`. Default `flexDirection` is `row`.

### Dimensions
- `width`, `height`: number (cells) or percentage string (`"50%"`, relative to parent).
- `minWidth`, `maxWidth`: **number only** (percent unsupported, see react/yoga#872).
- `minHeight`, `maxHeight`: number or percentage string.
- `aspectRatio`: number (width/height). Combine with at least one of `width`, `height`, `minHeight`, `maxHeight`.

### Padding / margin
`padding`, `paddingX`, `paddingY`, `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight`, and the same set for `margin*`. All numbers, default 0.

### Gap
`gap`, `columnGap`, `rowGap` (numbers, default 0). `gap` is shorthand for both.

### Flex
- `flexDirection`: `row` | `row-reverse` | `column` | `column-reverse`
- `flexGrow` (default 0), `flexShrink` (default 1), `flexBasis` (number or `"50%"`)
- `flexWrap`: `nowrap` | `wrap` | `wrap-reverse`
- `alignItems`: `flex-start` | `center` | `flex-end` | `stretch` | `baseline`
- `alignSelf`: `auto` | `flex-start` | `center` | `flex-end` | `stretch` | `baseline`
- `alignContent`: `flex-start` (Ink default, unlike CSS's `stretch`) | `flex-end` | `center` | `stretch` | `space-between` | `space-around` | `space-evenly`. Only matters when `flexWrap` creates multiple lines.
- `justifyContent`: `flex-start` | `center` | `flex-end` | `space-between` | `space-around` | `space-evenly`

### Position
- `position`: `relative` (default) | `absolute` | `static` (offsets ignored)
- `top`, `right`, `bottom`, `left`: number or percentage string

### Visibility / overflow
- `display`: `flex` (default) | `none` (hides the element)
- `overflow`, `overflowX`, `overflowY`: `visible` (default) | `hidden`
- `contentOffsetX`, `contentOffsetY`: shift children left/up by N cells (integers; fractional values are truncated). Combine with `overflow="hidden"` to build scroll views (see `patterns.md`).

### Borders
- `borderStyle`: `single` | `double` | `round` | `bold` | `singleDouble` | `doubleSingle` | `classic`, or a custom object `{topLeft, top, topRight, left, bottomLeft, bottom, bottomRight, right}`. Undefined means no border.
- `borderColor` (shorthand), or per side: `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor`
- `borderDimColor` (shorthand), or per side: `borderTopDimColor`, ...
- `borderBackgroundColor` (shorthand), or per side: `borderTopBackgroundColor`, ... (fall back to `borderBackgroundColor`)
- `borderTop`, `borderRight`, `borderBottom`, `borderLeft`: boolean, default true. Hide individual sides, e.g. a bottom-only rule: `<Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} />`.

Borders consume 1 cell per side, so a boxed `height={3}` has 1 row of content.

### Background
`backgroundColor`: fills the whole box area (including padding and border interior), inherited by child `<Text>` unless they set their own.

### Common layout idioms

```tsx
// Label + flexible value
<Box><Text>Label:</Text><Box flexGrow={1} marginLeft={1}><Text>value</Text></Box></Box>

// Left / right aligned row
<Box><Text>Left</Text><Spacer /><Text>Right</Text></Box>

// Two equal columns
<Box><Box width="50%"><Text>A</Text></Box><Box width="50%"><Text>B</Text></Box></Box>

// Header / body / footer filling the terminal
<Box flexDirection="column" height={rows}>
	<Box><Text bold>Header</Text></Box>
	<Box flexGrow={1} flexDirection="column">{body}</Box>
	<Box><Text dimColor>q to quit</Text></Box>
</Box>

// Overlay (absolute)
<Box position="absolute" top={1} right={2}><Text>badge</Text></Box>
```

## Newline

`<Newline count={1} />`: inserts `\n`. **Only valid inside `<Text>`.**

## Spacer

`<Spacer />`: flexible space that expands along the parent's main axis (pushes siblings apart). In a `column` container, the container needs a definite height for the spacer to have an effect.

## Static

Renders items permanently *above* the live output; ideal for completed tasks, logs, and test results where item count is unbounded.

Props:
- `items`: array of anything.
- `children(item, index)`: render function. **The root element needs a `key`.**
- `style`: Box props applied to the container (`style={{padding: 1}}`).

Rules: only *new* items (appended to the array) are rendered; changes to previously rendered items never re-render. Place it above the dynamic part of the tree.

```tsx
<>
	<Static items={done}>
		{task => <Box key={task.id}><Text color="green">✔ {task.title}</Text></Box>}
	</Static>
	<Text dimColor>Running: {running}</Text>
</>
```

## Transform

`<Transform transform={(line, index) => string}>` post-processes the rendered string of its children (use for gradients, links, effects, hanging indents).

- Children should be `<Text>` elements.
- Must **not change dimensions** or layout breaks.
- `line` contains ANSI codes if children have styling props; use `strip-ansi`/`slice-ansi` for trimming or slicing.
- Called per output line with a zero-based `index`:

```tsx
const HangingIndent = ({indent = 4, children}) => (
	<Transform transform={(line, i) => (i === 0 ? line : ' '.repeat(indent) + line)}>
		{children}
	</Transform>
);
```

## Accessibility props

Available on `<Box>` and `<Text>`; active when screen reader mode is on (`render(..., {isScreenReaderEnabled: true})` or `INK_SCREEN_READER=true`).

- `aria-label`: string read instead of the visible content.
- `aria-hidden`: boolean, hide from screen readers.
- `aria-role`: `button` `checkbox` `combobox` `list` `listbox` `listitem` `menu` `menuitem` `option` `progressbar` `radio` `radiogroup` `tab` `tablist` `table` `textbox` `timer` `toolbar`
- `aria-state`: `{busy, checked, disabled, expanded, multiline, multiselectable, readonly, required, selected}` (booleans)

Example: `<Box aria-role="checkbox" aria-state={{checked: true}}><Text>Accept</Text></Box>` reads as `(checked) checkbox: Accept`. For custom components, use `useIsScreenReaderEnabled()` to render more descriptive plain-text output.
