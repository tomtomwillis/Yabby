# Styling

## Global Variables

Colours and fonts are defined as CSS custom properties in `src/App.css`. Changing them here updates the whole app.

```css
--colour1: #4CAF50;   /* green  */
--colour2: #0000FF;   /* blue   */
--colour3: #FF9F65;   /* orange */
--colour4: #FFFFFF;   /* white  */
--colour5: #333333;   /* dark   */

--font1: 'WorkSans', Arial, sans-serif;
--font2: 'NectoMono', monospace;
```

Reference them in any CSS file like:

```css
color: var(--colour1);
font-family: var(--font1);
```

## Structure

- `src/App.css` - global layout, shared utilities, colour and font variables
- `src/index.css` - root/base reset styles
- Each component has its own `.css` file in the same folder as its `.tsx` file
- Pages have no CSS of their own — they use component styles and `App.css`

## Text Animations

`src/components/basic/TextAnimations.css` provides reusable animation classes:

```html
<h1 class="animated-text float-gentle">Floating Text</h1>
```

Available classes: `float-gentle`, and others defined in that file. Currently used for the header title.

## PWA Theme Colour

The PWA theme colour (browser chrome colour on mobile) is set in `vite.config.ts` inside the PWA manifest configuration, and also in `index.html` via the `<meta name="theme-color">` tag.
