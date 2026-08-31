import { Camera } from './camera.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { startLoop } from './loop.js';
import { parseMap } from './map.js';
import { fetchLevels, loadDifficulty, saveDifficulty, showMenu } from './menu.js';
import { Renderer } from './render.js';
import { createWorld, squadCentre } from './world.js';
import type { DifficultyId } from './difficulty.js';
import type { LevelInfo } from './menu.js';

/**
 * Boot and the outer shell: pick a mission from the menu, play it, come back.
 * The render loop runs continuously; while the menu is up it simply has nothing
 * to draw, which keeps the transition free of teardown.
 */

const LAST_PLAYED_KEY = 'cf.lastPlayed';
const DIFFICULTY_KEY = 'cf.difficulty';

async function boot(): Promise<void> {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const camera = new Camera();
  const renderer = new Renderer(ctx);
  const input = new Input(canvas);
  const hud = new Hud();

  // Canvas is sized in device pixels but laid out in CSS pixels, so the game
  // stays sharp on a high-DPI display without changing any world coordinates.
  const resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.imageSmoothingEnabled = false;
    camera.resize(canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  const levels = await fetchLevels();
  if (levels.length === 0) throw new Error('no missions found in data/');

  let game: Game | null = null;

  // The loop runs for the life of the page; `game` is null while the menu is up.
  let lastDraw = performance.now();
  startLoop(
    (dt) => {
      if (!game) return;
      game.step(dt);
      hud.update(game.world);
    },
    (alpha) => {
      const now = performance.now();
      const frameDt = Math.min(0.1, (now - lastDraw) / 1000);
      lastDraw = now;
      if (game) renderer.draw(game.world, camera, alpha, frameDt);
    },
  );

  /**
   * Runs one mission. Resolves with what the player asked for next: back to the
   * list, or straight on to the following mission.
   */
  const play = async (info: LevelInfo, difficulty: DifficultyId): Promise<'menu' | 'next'> => {
    const res = await fetch(`/api/maps/${info.id}`);
    if (!res.ok) throw new Error(`could not load "${info.id}": ${res.status}`);
    const map = parseMap(await res.text(), info.id);

    // The renderer bakes terrain and scenery per map, which needs a world to
    // read building placements from -- so build a throwaway one first.
    renderer.prepare(map, createWorld(map, difficulty));

    game = new Game(map, camera, renderer, input, difficulty);
    // The end-of-mission panel drives the shell rather than the other way
    // round, so "next mission" is one click from where you finished.
    const index = levels.findIndex((l) => l.id === info.id);
    hud.hasNext = index >= 0 && index < levels.length - 1;
    hud.onNext = (): void => { if (game) game.nextRequested = true; };
    hud.onRetry = (): void => { game?.restart(); hud.hideOverlay(); };
    hud.onMissions = (): void => { if (game) game.exitRequested = true; };
    // Debug handle: lets the console (and the headless driver) inspect and poke
    // live game state without threading test hooks through the modules.
    (window as unknown as { game: Game | null }).game = game;
    const centre = squadCentre(game.world);
    if (centre) camera.centreOn(centre, map);

    hud.showBriefing(game.world);
    window.setTimeout(() => {
      if (game && game.world.phase === 0) hud.hideOverlay();
    }, 2200);

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
      const chosen = await showMenu(levels, last, difficulty, (d) => {
        difficulty = d;
        saveDifficulty(DIFFICULTY_KEY, d);
      });
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
