import { renderEmbroideryPreviewSvg, type PreviewStitchTuple } from '../preview';

export interface SquareArchiveCardOptions {
  badgeLeft: string;
  badgeRight: string;
  statusText: string;
  statusClass: 'gallery-star' | 'gallery-play-chip' | 'gallery-lock-chip';
  title: string;
  scoreLabel: string;
  stitches: ReadonlyArray<PreviewStitchTuple> | undefined;
  themeId: number;
  completed?: boolean;
  current?: boolean;
  locked?: boolean;
  lockOverlayText?: string;
  paletteDots?: string[];
  footerRightText: string;
  footerRightClass: 'square-card-specials' | 'square-card-sub' | 'gallery-play-chip';
  footerLeftSub?: string;
  dataset?: Record<string, string>;
  onClick: (btn: HTMLButtonElement) => void;
}

/**
 * Single DRY factory for Pearl Loom's 1-column square embroidery cards across
 * Level Select, Daily Library, Random Archive, and Custom Collection.
 */
export function createSquareArchiveCard(opts: SquareArchiveCardOptions): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `square-level-card${opts.completed ? ' is-completed' : ''}${opts.current ? ' is-current' : ''}${opts.locked ? ' is-locked' : ''}`;
  if (opts.dataset) {
    for (const [k, v] of Object.entries(opts.dataset)) {
      btn.dataset[k] = v;
    }
  }
  if (typeof opts.locked === 'boolean') {
    btn.setAttribute('aria-disabled', opts.locked ? 'true' : 'false');
  }

  // Top header row
  const head = document.createElement('div');
  head.className = 'square-card-head';

  const badges = document.createElement('span');
  badges.className = 'gallery-lvl-badges';

  const numEl = document.createElement('span');
  numEl.className = 'gallery-lvl-num';
  numEl.textContent = opts.badgeLeft;

  const gridEl = document.createElement('span');
  gridEl.className = 'gallery-lvl-grid';
  gridEl.textContent = opts.badgeRight;

  badges.append(numEl, gridEl);

  const statusEl = document.createElement('span');
  statusEl.className = opts.statusClass;
  statusEl.textContent = opts.statusText;
  head.append(badges, statusEl);

  // Center Retina SVG embroidery preview
  const previewWrap = document.createElement('div');
  previewWrap.className = 'square-card-preview';
  previewWrap.innerHTML = renderEmbroideryPreviewSvg(opts.stitches, opts.themeId, {
    locked: Boolean(opts.locked),
    size: 196,
  });
  if (opts.locked && opts.lockOverlayText) {
    const lockTag = document.createElement('span');
    lockTag.className = 'square-lock-overlay';
    lockTag.textContent = opts.lockOverlayText;
    previewWrap.append(lockTag);
  }

  // Bottom metadata row
  const foot = document.createElement('div');
  foot.className = 'square-card-foot';

  const titleRow = document.createElement('div');
  titleRow.className = 'square-card-title-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'square-card-name';
  nameEl.textContent = opts.title;

  const scoreTag = document.createElement('span');
  scoreTag.className = 'square-card-score';
  scoreTag.textContent = opts.scoreLabel;

  titleRow.append(nameEl, scoreTag);

  const metaRow = document.createElement('div');
  metaRow.className = 'square-card-meta-row';

  if (opts.paletteDots && opts.paletteDots.length > 0) {
    const dots = document.createElement('div');
    dots.className = 'square-card-dots';
    for (const hex of opts.paletteDots) {
      const d = document.createElement('span');
      d.className = 'gallery-dot';
      d.style.backgroundColor = hex;
      dots.append(d);
    }
    metaRow.append(dots);
  } else {
    const subLeft = document.createElement('span');
    subLeft.className = 'square-card-sub';
    subLeft.textContent = opts.footerLeftSub ?? '';
    metaRow.append(subLeft);
  }

  const rightMeta = document.createElement('span');
  rightMeta.className = opts.footerRightClass;
  rightMeta.textContent = opts.footerRightText;
  metaRow.append(rightMeta);

  foot.append(titleRow, metaRow);
  btn.append(head, previewWrap, foot);
  btn.addEventListener('click', () => opts.onClick(btn));
  return btn;
}

/** Single DRY factory for empty archive cards across Daily, Random, and Custom sheets. */
export function createEmptyArchiveCard(icon: string, heading: string, copy: string): HTMLDivElement {
  const empty = document.createElement('div');
  empty.className = 'empty-archive-card';

  const iconEl = document.createElement('span');
  iconEl.className = 'empty-archive-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;

  const titleEl = document.createElement('strong');
  titleEl.textContent = heading;

  const pEl = document.createElement('p');
  pEl.textContent = copy;

  empty.append(iconEl, titleEl, pEl);
  return empty;
}
