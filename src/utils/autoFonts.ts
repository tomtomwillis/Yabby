// Auto-discovers font files dropped into src/assets/fonts/ that aren't already
// hand-declared in App.css, and registers @font-face rules for them so they
// show up in DesignTool without any code changes.

// Files already given a curated font-family name in App.css — skip these so we
// don't register a second, filename-based family for the same font.
const MANUALLY_WIRED = new Set([
  'ARIAL.TTF',
  'Avara-BoldItalic.otf',
  'CommitMono-400-Regular.otf',
  'CommitMono-700-Regular.otf',
  'DTNouveau-Regular.otf',
  'LibreBaskerville-VariableFont_wght.ttf',
  'WorkSans-Regular.otf',
]);

const FORMATS: Record<string, string> = {
  ttf: 'truetype',
  otf: 'opentype',
  woff: 'woff',
  woff2: 'woff2',
};

const fontUrls = import.meta.glob('../assets/fonts/*.{ttf,otf,woff,woff2,TTF,OTF,WOFF,WOFF2}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function humanize(stem: string): string {
  return stem
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(' ')
    .map(w => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export const AUTO_FONTS: { label: string; value: string }[] = [];

const faceRules: string[] = [];

for (const path of Object.keys(fontUrls).sort()) {
  const filename = path.split('/').pop()!;
  if (MANUALLY_WIRED.has(filename)) continue;

  const dot = filename.lastIndexOf('.');
  const stem = filename.slice(0, dot);
  const ext = filename.slice(dot + 1).toLowerCase();
  const format = FORMATS[ext];
  if (!format) continue;

  faceRules.push(
    `@font-face { font-family: '${stem}'; src: url('${fontUrls[path]}') format('${format}'); font-display: swap; }`
  );
  AUTO_FONTS.push({ label: humanize(stem), value: stem });
}

if (faceRules.length > 0) {
  const style = document.createElement('style');
  style.setAttribute('data-auto-fonts', '');
  style.textContent = faceRules.join('\n');
  document.head.appendChild(style);
}
