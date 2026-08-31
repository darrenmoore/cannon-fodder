import { Camera } from './render/camera.js';
import { missionResolved, missionStarted, startSession } from './shell/analytics.js';
import { unlockAudio } from './shell/audio.js';
import { Controls } from './ui/controls.js';
import { Game } from './sim/game.js';
import { closeSheet, sheetOpen, showSettings, showSheet } from './ui/sheet.js';
import { Layout } from './ui/layout.js';
import { Hud } from './ui/hud.js';
import { Input } from './shell/input.js';
import { startLoop } from './loop.js';
import { parseMap } from './sim/map.js';
import { fetchLevels, loadDifficulty, saveDifficulty, showMenu } from './ui/menu.js';
import { Renderer } from './render/render.js';
import { showBootHill } from './ui/boothill.js';
import { deploy, loadCampaign, recordMission } from './sim/campaign.js';
import { createWorld, squadCentre } from './sim/world.js';
import { loadSettings, settings, updateSettings } from './ui/settings.js';
import { startMusic, stopMusic } from './shell/music.js';
import { Phase } from './types.js';
import type { DifficultyId } from './sim/difficulty.js';
import type { LevelInfo } from './ui/menu.js';

/**
 * Boot and the outer shell: pick a mission from the menu, play it, come back.
 * The render loop runs continuously; while the menu is up it simply has nothing
 * to draw, which keeps the transition free of teardown.
 *
 * The campaign is loaded once here and threaded down, rather than being reached
 * for from wherever it happens to be needed. One owner, one save; the mission
 * modules stay unable to remember anything on their own, which is what keeps the
 * meta-game auditable.
 */

const LAST_PLAYED_KEY = 'cf.lastPlayed';
const DIFFICULTY_KEY = 'cf.difficulty';
/** Used only before a map is loaded; a real mission uses its own spawn count. */
const DEFAULT_SQUAD = 6;

async function boot(): Promise<void> {
  // Before anything reads a preference. Nothing branches on whether settings
  // were ever saved, only on their values, so this is safe to do first.
  loadSettings();

  // Starts the clock on how long this visit lasts. Registers two listeners and
  // nothing else -- no request is made until the page goes away.
  startSession();

  // Ask for the music here, not when the menu is drawn. Everything below this
  // line -- the layout, the level list, the campaign -- is work the player waits
  // through, and starting the track first means it is already going by the time
  // the front screen appears rather than a beat behind it.
  //
  // Whether it is *allowed* to start is the browser's call, not ours: audible
  // autoplay needs either a prior gesture on the origin or enough of a history
  // with the site. When it is refused, music.ts arms the first gesture instead,
  // and the switch says so rather than looking broken.
  startMusic();

  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const camera = new Camera();
  const renderer = new Renderer(ctx);
  // One owner for every size in the game. The layout measures the viewport,
  // sizes the canvas backing store, picks the zoom and publishes the mode the
  // stylesheet branches on; everything else subscribes rather than measuring.
  const layout = new Layout(canvas, ctx);
  const input = new Input(canvas, layout);
  const hud = new Hud();
  // Every mouse chord the original used, as something you can press. On a
  // desktop it keeps the shortcut printed under each label; on a phone it is
  // the only way any of them can be reached at all.
  const controls = new Controls(input, layout);

  // Audio has to start on a real gesture stack. It used to be unlocked while
  // draining the command queue, which happens inside requestAnimationFrame a
  // frame later -- so iOS refused it every time and the game was silent on
  // every iPhone. This runs synchronously inside the first pointerdown.
  input.onFirstPress(() => unlockAudio());

  /**
   * The mission list's footer, written from the input the player is holding.
   *
   * It used to be a fixed line of markup promising number keys, arrow keys and
   * Enter to a device that has none of them -- instructions that are not merely
   * unhelpful on a phone but actively misleading about what the game can do.
   * It lives here rather than in menu.ts because the layout is what knows, and
   * because the answer has to change when a laptop's owner picks up its
   * touchscreen instead of its trackpad.
   */
  const footer = document.getElementById('menu-foot');
  const writeFooter = (touch: boolean): void => {
    if (!footer) return;
    footer.textContent = touch
      ? 'Tap a mission to begin. Swipe the difficulty bar to change it.'
      : 'Click a mission, or press its number. Left/right arrows change difficulty; '
        + 'Enter resumes the last mission; M toggles the music.';
  };

  // The camera works in device pixels, which is what the layout hands it.
  layout.onChange((state) => {
    camera.zoom = state.deviceZoom;
    camera.resize(canvas.width, canvas.height);
    writeFooter(state.touch);
  });
  layout.apply();
  window.addEventListener('resize', () => layout.apply());
  window.addEventListener('orientationchange', () => layout.apply());
  // Rotating a phone fires `resize` before the new dimensions have settled on
  // some browsers, so the layout is re-derived once more on the far side.
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => layout.apply(), 250);
  });

  // Pinch and wheel do not set the zoom directly: they nudge a stored bias and
  // let the layout re-derive it, so a zoom survives a rotate or a resize
  // instead of being recomputed away.
  input.onZoom = (delta): void => {
    const bias = Math.max(-2, Math.min(2, settings().zoomBias + delta));
    if (bias === settings().zoomBias) return;
    updateSettings({ zoomBias: bias });
    layout.apply();
  };

  const levels = await fetchLevels();
  if (levels.length === 0) throw new Error('no missions found in data/');

  /**
   * A phone screen that goes to sleep mid-firefight, and a mission that keeps
   * running while the player answers the door.
   *
   * `loop.ts` already clamps the delta so a backgrounded tab cannot stampede
   * the simulation, but not stampeding is not the same as not happening: a
   * squad left standing in the open for a phone call comes back dead.
   */
  let wakeLock: { release(): Promise<void> } | null = null;
  const holdScreenAwake = async (): Promise<void> => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request(kind: 'screen'): Promise<{ release(): Promise<void> }> };
      };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      // Unsupported, or refused because the page is not visible. Not fatal.
    }
  };

  const campaign = loadCampaign();
  // Mission ids are what the campaign records; names are what a player recognises.
  const missionNames = new Map(levels.map((l) => [l.id, l.name]));
  const visitBootHill = (): Promise<void> => showBootHill(campaign, missionNames, DEFAULT_SQUAD);

  let game: Game | null = null;
  /** Drops the mission's own listeners when it ends. */
  let pauseTeardown: (() => void) | null = null;

  // The loop runs for the life of the page; `game` is null while the menu is up.
  let lastDraw = performance.now();
  startLoop(
    (dt) => {
      controls.update(game?.world ?? null, camera.isManual);
      // A sheet is a modal: the world behind it holds still rather than being
      // fought blind through a panel.
      if (!game || sheetOpen()) return;
      game.step(dt);
      hud.update(game.world);
    },
    (alpha) => {
      const now = performance.now();
      const frameDt = Math.min(0.1, (now - lastDraw) / 1000);
      lastDraw = now;
      if (game) renderer.draw(game.world, camera, alpha, frameDt, input.aim);
    },
  );

  /**
   * Runs one mission. Resolves with what the player asked for next: back to the
   * list, or straight on to the following mission.
   */
  const play = async (info: LevelInfo, difficulty: DifficultyId): Promise<'menu' | 'next'> => {
    // Front-screen music only. Also covers the mission-to-mission hand-off,
    // which never passes back through the menu.
    stopMusic();

    const res = await fetch(`/api/maps/${info.id}`);
    if (!res.ok) throw new Error(`could not load "${info.id}": ${res.status}`);
    const map = parseMap(await res.text(), info.id);

    // The renderer bakes terrain and scenery per map, which needs a world to
    // read building placements from -- so build a throwaway one first.
    renderer.prepare(map, createWorld(map, difficulty));

    // Asked again on every restart, so a replay fields the roster as it stands
    // rather than the one this mission opened with.
    const roster = (): ReturnType<typeof deploy> => deploy(campaign, map.playerSpawns.length);

    game = new Game(map, camera, renderer, input, difficulty, roster);
    missionStarted(info.id, difficulty);
    // The end-of-mission panel drives the shell rather than the other way
    // round, so "next mission" is one click from where you finished.
    const index = levels.findIndex((l) => l.id === info.id);
    hud.hasNext = index >= 0 && index < levels.length - 1;
    hud.onNext = (): void => { if (game) game.nextRequested = true; };
    hud.onRetry = (): void => { game?.restart(); hud.hideOverlay(); };
    hud.onMissions = (): void => { if (game) game.exitRequested = true; };
    /**
     * Esc and the PAUSE button.
     *
     * Esc used to drop you straight out to the mission list with no
     * confirmation, which is a reasonable thing for a key you meant to press
     * and a terrible one for a button a thumb can brush. It is a sheet now, and
     * the sheet is also where a phone reaches restart and settings -- neither
     * of which had any route at all without a keyboard.
     */
    const openPause = (): void => {
      if (!game || sheetOpen()) return;
      showSheet('Paused', map.name, [
        { label: 'Resume', tone: 'good', key: 'Enter', onPick: () => {} },
        { label: 'Settings', onPick: () => showSettings(() => layout.apply()) },
        { label: 'Boot Hill', hint: `${campaign.fallen.length} buried`, onPick: () => void visitBootHill() },
        { label: 'Restart mission', tone: 'warn', key: 'R', onPick: () => { game?.restart(); hud.hideOverlay(); } },
        { label: 'Mission list', onPick: () => { if (game) game.exitRequested = true; } },
      ]);
    };
    input.onPause = openPause;

    // Losing focus is a pause, not a licence to keep playing without a player.
    const onHide = (): void => { if (document.hidden) openPause(); };
    document.addEventListener('visibilitychange', onHide);
    pauseTeardown = (): void => document.removeEventListener('visibilitychange', onHide);
    void holdScreenAwake();

    // The par the sidebar dangles is the record as it stood *before* this
    // attempt; it is only advanced once the attempt has been committed.
    hud.record = campaign.records[info.id] ?? null;
    hud.aftermath = null;
    hud.buried = campaign.fallen.length;

    // The one place a mission result is ever written. Fires exactly once per
    // resolution, before the HUD notices the phase change and draws the panel.
    game.onResolved = (world): void => {
      hud.aftermath = recordMission(campaign, {
        won: world.phase === Phase.Won,
        missionId: info.id,
        missionName: map.name,
        difficulty,
        time: world.time,
        survived: world.soldiers.filter((s) => s.alive).map((s) => s.name),
        died: world.soldiers.filter((s) => !s.alive).map((s) => s.name),
      });
      hud.record = campaign.records[info.id] ?? null;
      hud.buried = campaign.fallen.length;
      missionResolved(info.id, difficulty, world.phase === Phase.Won);
    };
    // Debug handle: lets the console (and the headless driver) inspect and poke
    // live game state without threading test hooks through the modules.
    (window as unknown as { game: Game | null }).game = game;
    const centre = squadCentre(game.world);
    if (centre) camera.centreOn(centre, map);

    /**
     * The briefing stays up until it is dismissed.
     *
     * It used to vanish on a 2.2 second timer, which is not long enough to read
     * an objective and is exactly long enough to be reading one when it goes.
     * Worse, the mission was already live behind it: a click aimed at the panel
     * landed on the map and marched the squad somewhere before the player had
     * seen the map. So the click that dismisses the briefing is swallowed --
     * the squad gets its first order when the player has actually chosen one.
     */
    hud.showBriefing(game.world);
    const dismissBriefing = (e: Event): void => {
      if (!game || game.world.phase !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      hud.hideOverlay();
      input.swallowNextOrder();
      teardownBriefing();
    };
    const teardownBriefing = (): void => {
      window.removeEventListener('pointerdown', dismissBriefing, true);
      window.removeEventListener('keydown', dismissBriefing, true);
    };
    window.addEventListener('pointerdown', dismissBriefing, true);
    window.addEventListener('keydown', dismissBriefing, true);

    try {
      localStorage.setItem(LAST_PLAYED_KEY, info.id);
    } catch {
      // Private browsing: remembering the last mission is not worth failing over.
    }

    return new Promise<'menu' | 'next'>((resolve) => {
      const check = (): void => {
        const done = game?.exitRequested ? 'menu' : game?.nextRequested ? 'next' : null;
        if (done) {
          game = null;
          (window as unknown as { game: Game | null }).game = null;
          hud.hideOverlay();
          closeSheet();
          teardownBriefing();
          pauseTeardown?.();
          pauseTeardown = null;
          input.onPause = null;
          void wakeLock?.release().catch(() => {});
          wakeLock = null;
          resolve(done);
          return;
        }
        window.requestAnimationFrame(check);
      };
      check();
    });
  };

  // Menu, mission, menu, for as long as the page is open -- except that
  // finishing a mission can hand straight on to the next one without passing
  // back through the list.
  let difficulty = loadDifficulty(DIFFICULTY_KEY);
  let queued: LevelInfo | null = null;
  for (;;) {
    let info = queued;
    queued = null;

    if (!info) {
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST_PLAYED_KEY);
      } catch {
        last = null;
      }
      startMusic();
      const chosen = await showMenu(levels, last, difficulty, (d) => {
        difficulty = d;
        saveDifficulty(DIFFICULTY_KEY, d);
      }, campaign, visitBootHill);
      difficulty = chosen.difficulty;
      info = levels.find((l) => l.id === chosen.id) ?? null;
      if (!info) continue;
    }

    const outcome = await play(info, difficulty);
    if (outcome === 'next') {
      const at = levels.findIndex((l) => l.id === info.id);
      queued = at >= 0 ? levels[at + 1] ?? null : null;
    }
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const sub = document.getElementById('overlay-sub');
  const menu = document.getElementById('menu');
  if (menu) menu.hidden = true;
  if (overlay && title && sub) {
    overlay.hidden = false;
    title.textContent = 'Error';
    sub.textContent = err instanceof Error ? err.message : String(err);
  }
});
