// Split out of the original single-file engine (see legacy/index.html).
// Origin: INTERACTIVE TUTORIAL

import * as lucide from '../lib/icons.js';
import { S } from './state.js';
import { isElementVisible, rectOverlapArea } from '../lib/util.js';
import { setBaseMap } from './baseMaps.js';
import { applyBorderDetail } from './borderDetail.js';
import { CARD_BASE_CLASS, DRAWER_BUTTON_LABELS, TOUR_BASE_ORDER, TUTORIAL_STEPS, TUTORIAL_TARGETS } from './constants.js';
import { setDrawMode } from './drawTools.js';
import { downloadAlightMotionXML } from './exporters/alightMotion.js';
import { getLastDrawnPolygon, toggleAutoSeaCut } from './merge.js';
import { runGeorefDetection } from './seaDetect.js';
import { startSplitMode } from './split.js';
import { populateStyleDrawer } from './styleInspector.js';
import { bakePolygonsIntoMap } from './tileBake.js';
import { closeDrawers, showToast } from './uiHelpers.js';

export function tutorialIsOpen() {
  const el = document.getElementById('tutorial-overlay');
  return el && !el.classList.contains('hidden');
}

export function openDrawerOnly(id) {
  closeDrawers();
  if (!id) return;
  const d = document.getElementById(id);
  if (d) d.classList.add('open');
}

export function isDesktopUI() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

// ---- Interactive targets: which real GUI element each step spotlights ----
// Each entry lists selector fallbacks (first visible one wins), so the
// same step works on desktop (drawer open) and mobile (nav button).

export function tourCycleBaseMap() {
  S.tourBaseCycle = (S.tourBaseCycle + 1) % TOUR_BASE_ORDER.length;
  setBaseMap(TOUR_BASE_ORDER[S.tourBaseCycle]);
}

export function tourDemoRoughen() {
  if (!S.activeSelectedLayer) S.activeSelectedLayer = getLastDrawnPolygon();
  if (!S.activeSelectedLayer) {
    showToast('Draw, load or split a shape first — then I can roughen its border');
    return;
  }
  populateStyleDrawer(S.activeSelectedLayer);
  applyBorderDetail();
}

export const TUTORIAL_CTAS = [{
  label: '▶️ Start the tour',
  fn: () => tutorialNext()
}, {
  label: '🎨 Cycle base maps',
  fn: () => tourCycleBaseMap()
}, {
  label: '✏️ Try drawing a polygon',
  fn: () => {
    minimizeTutorial();
    setDrawMode('Polygon');
  }
}, null, {
  label: '✂️ Start split mode',
  fn: () => {
    minimizeTutorial();
    startSplitMode();
  }
}, {
  label: '🚀 Toggle Auto-Cut Sea',
  fn: () => toggleAutoSeaCut()
}, {
  label: '🔎 Focus the search box',
  fn: () => {
    const el = document.getElementById('country-search');
    if (el) el.focus();
  }
}, {
  label: '🌊 Roughen the selected shape',
  fn: () => tourDemoRoughen()
}, {
  label: '🧱 Bake shapes into the map',
  fn: () => bakePolygonsIntoMap()
}, null, {
  label: '🔍 Run auto-detection',
  fn: () => runGeorefDetection()
}, {
  label: '🎬 Export Alight Motion XML',
  fn: () => downloadAlightMotionXML()
}];

export function tutorialCTA() {
  const c = TUTORIAL_CTAS[S.tutorialIndex];
  if (c && typeof c.fn === 'function') c.fn();
}

export function findVisibleTarget(selectors) {
  for (let i = 0; i < selectors.length; i++) {
    let els;
    try {
      els = document.querySelectorAll(selectors[i]);
    } catch (e) {
      continue;
    }
    for (let j = 0; j < els.length; j++) {
      const el = els[j];
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 3 || r.height < 3) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null) continue;
      // Must be on screen — off-screen (closed) drawers are skipped
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      return el;
    }
  }
  return null;
}

export function clearTourHighlight() {
  const spot = document.getElementById('tour-spot');
  const call = document.getElementById('tour-call');
  if (spot) spot.classList.add('hidden');
  if (call) call.classList.add('hidden');
}

export function positionTourElements() {
  if (!tutorialIsOpen()) return;
  const spot = document.getElementById('tour-spot');
  const call = document.getElementById('tour-call');
  const t = TUTORIAL_TARGETS[S.tutorialIndex];
  const host = t ? findVisibleTarget(t.targets) : null;
  if (!host) {
    spot.classList.add('hidden');
    call.classList.add('hidden');
    return;
  }
  const r = host.getBoundingClientRect();
  const pad = 6;
  spot.classList.remove('hidden');
  spot.style.top = `${r.top - pad}px`;
  spot.style.left = `${r.left - pad}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;
  document.getElementById('tour-call-text').textContent = t.label || 'here';
  call.classList.remove('hidden');
  const inner = document.getElementById('tour-call-inner');
  requestAnimationFrame(() => {
    const w = inner.offsetWidth;
    let cx = r.left + r.width / 2 - w / 2;
    cx = Math.max(8, Math.min(cx, window.innerWidth - w - 8));
    const cy = r.top < 64 ? r.bottom + 12 : r.top - 36;
    call.style.left = `${cx}px`;
    call.style.top = `${cy}px`;
  });
}

// Every rect the card must avoid, with weights (higher = worse to cover)
export function tourExclusionRects() {
  const excl = [];
  const t = TUTORIAL_TARGETS[S.tutorialIndex];
  const host = t ? findVisibleTarget(t.targets) : null;
  if (host) excl.push({
    r: host.getBoundingClientRect(),
    pad: 16,
    weight: 5
  });
  document.querySelectorAll('.sheet-drawer.open').forEach(d => {
    excl.push({
      r: d.getBoundingClientRect(),
      pad: 10,
      weight: 3
    });
  });
  const header = document.getElementById('app-header');
  if (isElementVisible(header)) excl.push({
    r: header.getBoundingClientRect(),
    pad: 6,
    weight: 1
  });
  const nav = document.getElementById('mobile-nav');
  if (isElementVisible(nav)) excl.push({
    r: nav.getBoundingClientRect(),
    pad: 6,
    weight: 1
  });
  const rail = document.getElementById('desktop-rail');
  if (isElementVisible(rail)) excl.push({
    r: rail.getBoundingClientRect(),
    pad: 6,
    weight: 1
  });
  return excl;
}

// Candidate card anchors, in order of preference

// Candidate card anchors, in order of preference
export function tourPlacementCandidates(cw, ch, vw, vh) {
  const rail = document.getElementById('desktop-rail');
  const railVisible = isElementVisible(rail);
  const minLeft = railVisible ? rail.getBoundingClientRect().right + 18 : 14;
  const nav = document.getElementById('mobile-nav');
  const navTop = isElementVisible(nav) ? nav.getBoundingClientRect().top : vh;
  const header = document.getElementById('app-header');
  const headerBottom = isElementVisible(header) ? header.getBoundingClientRect().bottom + 12 : 60;
  const drawerEl = document.querySelector('.sheet-drawer.open');
  const dr = drawerEl ? drawerEl.getBoundingClientRect() : null;
  const centerX = Math.max(minLeft, (vw - cw) / 2);
  const centerY = Math.max(headerBottom, (vh - ch) / 2);
  const cands = [];

  // 1) Beside a right-side panel (desktop drawer)
  if (dr && dr.width <= vw * 0.55 && dr.right > vw - 6) {
    cands.push({
      x: Math.max(minLeft, dr.left - cw - 26),
      y: centerY
    });
  }
  // 2) Above a bottom sheet (mobile drawer)
  if (dr && dr.width > vw * 0.55 && dr.bottom > vh - 6) {
    cands.push({
      x: centerX,
      y: Math.max(headerBottom, dr.top - ch - 22)
    });
  }

  // 3) Centered
  cands.push({
    x: centerX,
    y: centerY
  });

  // 4) Opposite side of the spotlighted target
  const t = TUTORIAL_TARGETS[S.tutorialIndex];
  const host = t ? findVisibleTarget(t.targets) : null;
  if (host) {
    const r = host.getBoundingClientRect();
    const targetOnRight = r.left + r.width / 2 > vw / 2;
    cands.push({
      x: targetOnRight ? minLeft : Math.max(minLeft, vw - cw - 16),
      y: Math.max(headerBottom, Math.min(r.top - 8, navTop - ch - 14))
    });
    cands.push({
      x: Math.max(minLeft, r.left + r.width / 2 - cw / 2),
      y: Math.min(r.bottom + 18, Math.max(headerBottom, navTop - ch - 14))
    });
    cands.push({
      x: Math.max(minLeft, r.left + r.width / 2 - cw / 2),
      y: Math.max(headerBottom, r.top - ch - 28)
    });
  }

  // 5) Top / bottom centre fallbacks
  cands.push({
    x: centerX,
    y: Math.max(headerBottom, navTop - ch - 18)
  });
  cands.push({
    x: centerX,
    y: headerBottom
  });
  return cands;
}

// Pick the candidate with the least overlap and glide the card there

// Pick the candidate with the least overlap and glide the card there
export function placeTutorialCard() {
  if (!tutorialIsOpen()) return;
  const pos = document.getElementById('tutorial-pos');
  const card = document.getElementById('tutorial-card');
  pos.className = 'w-full h-full relative';
  card.style.position = 'absolute';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cw = card.offsetWidth || 512;
  const ch = card.offsetHeight || 460;
  const rail = document.getElementById('desktop-rail');
  const railVisible = isElementVisible(rail);
  const minLeft = railVisible ? rail.getBoundingClientRect().right + 18 : 14;
  const navVisible = isElementVisible(document.getElementById('mobile-nav'));
  const minTop = 10;
  const excl = tourExclusionRects();
  const cands = tourPlacementCandidates(cw, ch, vw, vh);
  let best = null;
  cands.forEach(c => {
    const x = Math.min(Math.max(c.x, minLeft), Math.max(minLeft, vw - cw - 14));
    const yTop = Math.max(c.y, minTop);
    const yMax = navVisible ? vh - ch - 14 : vh - ch - 14;
    const y = Math.min(Math.max(yTop, minTop), Math.max(minTop, yMax));
    const box = {
      left: x,
      top: y,
      right: x + cw,
      bottom: y + ch
    };
    let score = 0;
    excl.forEach(e => {
      const rr = {
        left: e.r.left - e.pad,
        top: e.r.top - e.pad,
        right: e.r.right + e.pad,
        bottom: e.r.bottom + e.pad
      };
      score += rectOverlapArea(box, rr) * e.weight;
    });
    // Prefer staying near the vertical middle when overlaps tie
    score += Math.abs(y + ch / 2 - vh / 2) * 2.5;
    if (!best || score < best.score) best = {
      x,
      y,
      score
    };
  });
  if (best) {
    card.style.left = `${Math.round(best.x)}px`;
    card.style.top = `${Math.round(best.y)}px`;
  }
}

export function layoutTourOverlay() {
  placeTutorialCard();
  positionTourElements();
}

export function minimizeTutorial() {
  document.getElementById('tutorial-overlay').classList.add('hidden');
  clearTourHighlight();
  const cur = TUTORIAL_STEPS[S.tutorialIndex];
  document.getElementById('tutorial-pill-text').textContent = `${S.tutorialIndex + 1}/${TUTORIAL_STEPS.length} · ${cur.title}`;
  const pill = document.getElementById('tutorial-pill');
  pill.classList.remove('hidden');
  pill.classList.add('flex');
  lucide.createIcons();
}

export function expandTutorial() {
  const pill = document.getElementById('tutorial-pill');
  pill.classList.add('hidden');
  pill.classList.remove('flex');
  document.getElementById('tutorial-overlay').classList.remove('hidden');
  renderTutorialStep();
}

export function startTutorial() {
  S.tutorialIndex = 0;
  S.tourBaseCycle = 0;
  const pill = document.getElementById('tutorial-pill');
  pill.classList.add('hidden');
  pill.classList.remove('flex');
  clearTourHighlight();
  document.getElementById('tutorial-overlay').classList.remove('hidden');
  renderTutorialStep();
  lucide.createIcons();
}

export function renderTutorialStep() {
  const s = TUTORIAL_STEPS[S.tutorialIndex];
  const last = S.tutorialIndex === TUTORIAL_STEPS.length - 1;
  const desktop = isDesktopUI();
  // Only desktop shows the drawer live (its right panel and the card can
  // share the screen). On mobile the card would cover the bottom sheet.
  const canPeekDrawer = !!s.drawer && desktop;
  document.getElementById('tutorial-title').textContent = s.title;
  document.getElementById('tutorial-subtitle').textContent = s.subtitle;
  document.getElementById('tutorial-counter').textContent = `${S.tutorialIndex + 1} / ${TUTORIAL_STEPS.length}`;

  // Mobile: tell the user which button opens this panel instead
  const hint = !desktop && s.drawer ? `<div class="flex items-start gap-2 p-2.5 bg-emerald-950/40 border border-emerald-700/50 rounded-xl text-[11px] text-emerald-200">
             <span class="text-sm leading-none">👆</span>
             <span>Find the <b>${DRAWER_BUTTON_LABELS[s.drawer] || 'menu'}</b> button in the bar at the bottom of the screen to follow along.</span>
           </div>` : '';
  document.getElementById('tutorial-body').innerHTML = s.body + hint;
  const iconEl = document.getElementById('tutorial-icon');
  if (iconEl) iconEl.setAttribute('data-lucide', s.icon);
  const prevBtn = document.getElementById('tutorial-prev');
  prevBtn.disabled = S.tutorialIndex === 0;
  prevBtn.classList.toggle('opacity-40', S.tutorialIndex === 0);
  document.getElementById('tutorial-next').textContent = last ? 'Finish' : 'Next';
  const dots = document.getElementById('tutorial-dots');
  dots.innerHTML = TUTORIAL_STEPS.map((_, i) => `<button onclick="tutorialGo(${i})" title="Step ${i + 1}" class="w-1.5 h-1.5 rounded-full transition ${i === S.tutorialIndex ? 'bg-emerald-400 w-4' : 'bg-slate-600 hover:bg-slate-500'}"></button>`).join('');

  // ---- Action button for this step ----
  const cta = TUTORIAL_CTAS[S.tutorialIndex];
  const ctaWrap = document.getElementById('tutorial-cta-wrap');
  if (cta) {
    document.getElementById('tutorial-cta').textContent = cta.label;
    ctaWrap.classList.remove('hidden');
  } else {
    ctaWrap.classList.add('hidden');
  }
  document.getElementById('tutorial-card').className = `${CARD_BASE_CLASS} max-h-[88vh]`;
  openDrawerOnly(canPeekDrawer ? s.drawer : null);
  lucide.createIcons();

  // ---- Slide the card clear of the target/drawer, then keep it locked ----
  layoutTourOverlay();
  setTimeout(layoutTourOverlay, 80);
  setTimeout(() => {
    layoutTourOverlay();
    const t = TUTORIAL_TARGETS[S.tutorialIndex];
    const host = t ? findVisibleTarget(t.targets) : null;
    if (host && host.closest('.sheet-drawer')) {
      try {
        host.scrollIntoView({
          block: 'center',
          behavior: 'smooth'
        });
      } catch (e) {}
      setTimeout(layoutTourOverlay, 420);
    }
  }, 380);
  // Re-check after drawer/sheet animations settle
  setTimeout(layoutTourOverlay, 700);
}

export function tutorialGo(i) {
  S.tutorialIndex = Math.min(Math.max(i, 0), TUTORIAL_STEPS.length - 1);
  renderTutorialStep();
}

export function tutorialNext() {
  if (S.tutorialIndex >= TUTORIAL_STEPS.length - 1) {
    endTutorial(true);
    return;
  }
  S.tutorialIndex++;
  renderTutorialStep();
}

export function tutorialPrev() {
  if (S.tutorialIndex > 0) {
    S.tutorialIndex--;
    renderTutorialStep();
  }
}

export function endTutorial(markSeen) {
  const overlay = document.getElementById('tutorial-overlay');
  overlay.classList.add('hidden');
  clearTourHighlight();
  const pill = document.getElementById('tutorial-pill');
  pill.classList.add('hidden');
  pill.classList.remove('flex');
  openDrawerOnly(null);
  if (markSeen) {
    try {
      localStorage.setItem('gjs_tutorial_seen', '1');
    } catch (e) {}
    showToast('Guide closed — reopen anytime with the “?” button');
  }
}

export function locateUser() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported.");
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    S.map.setView([pos.coords.latitude, pos.coords.longitude], 12);
    showToast("Centered on GPS");
  }, () => showToast("Could not retrieve GPS location"));
}
