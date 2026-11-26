import { VISUAL_THEMES } from './wasmBridge';

/** Compact embroidery stitch entry: [normX (-1..1), normZ (-1..1), colorIndex (0..5)]. */
export type PreviewStitchTuple = readonly [number, number, number] | readonly [number, number, number, number];

export interface EmbroideryPreviewOptions {
  locked?: boolean;
  size?: number;
}

interface HoopThemeVisual {
  bgFill: string;
  bgInner: string;
  rimOuter: string;
  rimInner: string;
  rimAccent: string;
  gridStroke: string;
  beadStroke: string;
}

const HOOP_THEME_VISUALS: readonly HoopThemeVisual[] = [
  // 0: Jewel Atelier — warm walnut/champagne hoop on sunlit ivory linen
  {
    bgFill: '#efe5d0',
    bgInner: '#f8f2e4',
    rimOuter: '#9b7444',
    rimInner: '#e7c384',
    rimAccent: '#5e4223',
    gridStroke: 'rgba(130, 96, 52, 0.10)',
    beadStroke: 'rgba(42, 28, 14, 0.28)',
  },
  // 1: Cyber Arcade — deep synthwave grid & electric cyan/magenta rim
  {
    bgFill: '#0e1430',
    bgInner: '#171f48',
    rimOuter: '#0aebff',
    rimInner: '#f032c8',
    rimAccent: '#091026',
    gridStroke: 'rgba(10, 235, 255, 0.16)',
    beadStroke: 'rgba(6, 10, 28, 0.45)',
  },
  // 2: Pop Studio — bold comic yellow & crisp black ink rim
  {
    bgFill: '#fff8dc',
    bgInner: '#ffffff',
    rimOuter: '#14161e',
    rimInner: '#ffd60a',
    rimAccent: '#14161e',
    gridStroke: 'rgba(20, 22, 30, 0.08)',
    beadStroke: 'rgba(20, 22, 30, 0.65)',
  },
  // 3: Cathedral Glass — dark lead-came vaulted rose window
  {
    bgFill: '#19142b',
    bgInner: '#281f47',
    rimOuter: '#6e579b',
    rimInner: '#d8b6ff',
    rimAccent: '#120d22',
    gridStroke: 'rgba(216, 182, 255, 0.15)',
    beadStroke: 'rgba(14, 10, 28, 0.55)',
  },
];

let previewUid = 0;

/**
 * Renders a crisp, zero-GPU-cost Retina SVG miniature of a finished pearl embroidery hoop.
 * Matches all 4 Pearl Loom visual themes & color palettes 1-to-1.
 */
export function renderEmbroideryPreviewSvg(
  stitches: readonly PreviewStitchTuple[] | undefined,
  themeIndex: number,
  options: EmbroideryPreviewOptions = {},
): string {
  const tIdx = ((themeIndex % VISUAL_THEMES.length) + VISUAL_THEMES.length) % VISUAL_THEMES.length;
  const theme = VISUAL_THEMES[tIdx];
  const hoop = HOOP_THEME_VISUALS[tIdx];
  const uid = `ep${++previewUid}`;
  const locked = Boolean(options.locked);
  const count = stitches?.length ?? 0;

  // Scale pearl bead radius gracefully from 14-pearl warmups up to 64-pearl 8x8 masterpieces
  let beadR = 6.6;
  if (count > 50) beadR = 4.55;
  else if (count > 36) beadR = 5.15;
  else if (count > 24) beadR = 5.85;

  const defs: string[] = [
    `<radialGradient id="${uid}-bg" cx="44%" cy="38%" r="64%">` +
      `<stop offset="0%" stop-color="${hoop.bgInner}"/>` +
      `<stop offset="100%" stop-color="${hoop.bgFill}"/>` +
    `</radialGradient>`,
  ];

  // Build 1 radial pearl shader gradient per palette color used in this embroidery
  const usedColors = new Set<number>();
  if (stitches) {
    for (const st of stitches) {
      const c = Math.max(0, Math.min(theme.colors.length - 1, Math.round(st[2] ?? 0)));
      usedColors.add(c);
    }
  }
  for (const c of usedColors) {
    const col = theme.colors[c];
    defs.push(
      `<radialGradient id="${uid}-c${c}" cx="34%" cy="30%" r="68%">` +
        `<stop offset="0%" stop-color="${col.hiHex}"/>` +
        `<stop offset="48%" stop-color="${col.hex}"/>` +
        `<stop offset="100%" stop-color="${col.loHex}"/>` +
      `</radialGradient>`,
    );
  }

  // Subtle decorative guide rings inside the embroidery hoop
  const decoGuides =
    `<circle cx="100" cy="100" r="24" fill="none" stroke="${hoop.gridStroke}" stroke-width="1"/>` +
    `<circle cx="100" cy="100" r="48" fill="none" stroke="${hoop.gridStroke}" stroke-width="1"/>` +
    `<circle cx="100" cy="100" r="71" fill="none" stroke="${hoop.gridStroke}" stroke-width="1"/>`;

  // Render every finished pearl bead
  const beads: string[] = [];
  if (stitches && stitches.length > 0) {
    const span = 73; // radius inside inner hoop rim
    for (const st of stitches) {
      const nx = Math.max(-1.02, Math.min(1.02, Number(st[0]) || 0));
      const nz = Math.max(-1.02, Math.min(1.02, Number(st[1]) || 0));
      const c = Math.max(0, Math.min(theme.colors.length - 1, Math.round(st[2] ?? 0)));
      const cx = (100 + nx * span).toFixed(1);
      const cy = (100 + nz * span).toFixed(1);
      const sx = (100 + nx * span - beadR * 0.28).toFixed(1);
      const sy = (100 + nz * span - beadR * 0.30).toFixed(1);
      beads.push(
        `<circle cx="${cx}" cy="${cy}" r="${beadR.toFixed(2)}" fill="url(#${uid}-c${c})" stroke="${hoop.beadStroke}" stroke-width="0.9"/>` +
          `<circle cx="${sx}" cy="${sy}" r="${(beadR * 0.24).toFixed(2)}" fill="rgba(255,255,255,0.68)"/>`,
      );
    }
  }

  // Top brass/theme clasp hardware on the embroidery hoop
  const clasp =
    `<rect x="93" y="4" width="14" height="8" rx="3" fill="${hoop.rimInner}" stroke="${hoop.rimAccent}" stroke-width="1.4"/>` +
    `<circle cx="100" cy="8" r="2.1" fill="${hoop.rimOuter}"/>`;

  const lockedVeil = locked
    ? `<circle cx="100" cy="100" r="84" fill="rgba(14, 18, 30, 0.34)"/>`
    : '';

  return (
    `<svg class="embroidery-preview-svg${locked ? ' is-locked' : ''}" viewBox="0 0 200 200" width="${options.size ?? 160}" height="${options.size ?? 160}" aria-hidden="true">` +
      `<defs>${defs.join('')}</defs>` +
      clasp +
      `<circle cx="100" cy="100" r="90" fill="none" stroke="${hoop.rimOuter}" stroke-width="7.5"/>` +
      `<circle cx="100" cy="100" r="85.5" fill="url(#${uid}-bg)" stroke="${hoop.rimInner}" stroke-width="3.2"/>` +
      decoGuides +
      `<g${locked ? ' opacity="0.62"' : ''}>${beads.join('')}</g>` +
      lockedVeil +
    `</svg>`
  );
}
