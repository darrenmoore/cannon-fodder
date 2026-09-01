import { CONFIG } from './config.js';
import { Camera } from './render/camera.js';
import { missionResolved, missionStarted, startSession } from './shell/analytics.js';
import { unlockAudio } from './shell/audio.js';
import { ambienceState, startAmbience, stopAmbience, updateAmbience } from './shell/ambience.js';
import { bootBegin, bootEnd, bootFailed, bootStep } from './ui/boot.js';
import { installPixelFace } from './ui/pixelface.js';
import { installClicks } from './ui/clicks.js';
import { showTransmission, teardownComms, transmissionFor } from './ui/comms.js';
import { Controls } from './ui/controls.js';
import { Game } from './sim/game.js';
import { closeSheet, sheetOpen, showSettings, showSheet } from './ui/sheet.js';
import { confirm, confirmOpen } from './ui/confirm.js';
import { fadeIn, fadeOut, setBlackout } from './ui/blackout.js';
import { debug } from './ui/debug.js';
import { Layout } from './ui/layout.js';
import { Hud } from './ui/hud.js';
import { Input } from './shell/input.js';
import { startLoop } from './loop.js';
import { parseMap } from './sim/map.js';
import { fetchLevels, groupByTheatre, loadDifficulty, saveDifficulty } from './ui/menu.js';
import { showFront } from './ui/front.js';
import type { ArenaGame } from './sim/arena-game.js';
import { Renderer } from './render/render.js';
import { showBootHill } from './ui/boothill.js';
import { deploy, loadCampaign, recordMission } from './sim/campaign.js';
import { createWorld, squadCentre } from './sim/world.js';
import { loadSettings, settings, updateSettings } from './ui/settings.js';
import { preloadMusic, startMusic, stopMusic } from './shell/music.js';
import { Phase } from './types.js';
import { DIFFICULTIES, DIFFICULTY_ORDER } from './sim/difficulty.js';
import type { DifficultyId } from './sim/difficulty.js';
import type { GameMap } from './sim/map.js';
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

/** The one reserved arena map. See `docs/arena.md`. */
const ARENA_MAP = 'arena-forest';
const LAST_PLAYED_KEY = 'cf.lastPlayed';
const DIFFICULTY_KEY = 'cf.difficulty';
/** Used only before a map is loaded; a real mission uses its own spawn count. */
const DEFAULT_SQUAD = 6;

async function boot(): Promise<void> {
  bootBegin();

  // Before anything reads a preference. Nothing branches on whether settings
  // were ever saved, only on their values, so this is safe to do first.
  loadSettings();
  bootStep('boot');

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

  /*
   * The chrome's typeface, before anything measures itself against it.
   *
   * It is built from the same glyph table the canvas plots (`src/glyphs.ts`)
   * and installed as a data-URI `@font-face`, so the sidebar and the
   * battlefield are set in one face rather than in whatever monospace the
   * player's machine happens to supply -- which is 004 H3, and the reason two
   * critics independently picked the UI text as the thing that could not have
   * come from a 1993 machine.
   *
   * Failure is not fatal and not worth a branch: the stylesheet lists the old
   * monospace stack behind it, so a browser that refuses the font falls back to
   * exactly what it used before.
   */
  installPixelFace();
  // One delegated listener, so a control written tomorrow is audible too.
  installClicks();

/*
   * The menu track starts buffering here, in parallel with the atlas bake and
   * the mission fetch, so the loading bar's time is also the download's time.
   * The await sits just before the boot screen comes down: the owner's ask was
   * that when loading finishes, the music plays -- so "loaded" includes it.
   */
  const musicReady = preloadMusic();

  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const camera = new Camera();
  // Building the renderer bakes the atlas -- every sprite in the game, plotted
  // pixel by pixel -- which is the longest step in the boot and the one the
  // player would otherwise spend watching nothing.
  const renderer = new Renderer(ctx);
  bootStep('sprites');
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
    // One step either side of the layout's own answer -- the same three stops
    // the settings sheet offers, so the keys cannot reach a zoom the UI
    // cannot name.
    const bias = Math.max(-1, Math.min(1, settings().zoomBias + delta));
    if (bias === settings().zoomBias) return;
    updateSettings({ zoomBias: bias });
    layout.apply();
  };

  const levels = await fetchLevels();
  bootStep('missions');
  await musicReady;
  if (levels.length === 0) throw new Error('no missions found in data/');

  /**
   * The campaign proper: the missions that form a sequence.
   *
   * The test range is listed in the menu of a dev build but is not part of the
   * run, so "next mission" from the last real mission must not walk into it and
   * the last real mission must still be the last. Everything about *ordering* --
   * what follows what, what has a next -- reads this; only the menu reads
   * `levels`.
   */
  const campaignLevels = levels.filter((l) => !l.dev);

  // Dev only, and absent rather than hidden in a real build: `__DEV__` is a
  // literal `false` there, so esbuild drops this call, the module and the whole
  // panel from the bundle.
  if (__DEV__) {
    const { mountDebugPanel } = await import('./ui/debug.js');
    mountDebugPanel(() => game?.world ?? null);
  }

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
  /** Non-null only while the arena is up full-size. Mutually exclusive with `game`. */
  let arena: ArenaGame | null = null;

  /*
   * The attract world: the same arena, running behind the front end.
   *
   * 101 asked for it in one line -- "when they click on level select, the
   * background still keeps animating, cpu vs cpu" -- and the shape that matters
   * is that **it is owned here rather than by the front screen**. The front end
   * is shown, hidden and shown again: from boot, from the end of a mission,
   * from Boot Hill, from backing out of the level select. A battle owned by
   * that screen would restart on every one of those, which is precisely the
   * thing the brief asked not to happen. Owned here, the battle is simply
   * always there and the front end is something that appears over it.
   *
   * The world therefore outlives a mission. What does *not* is the renderer's
   * per-map bake -- terrain, scenery, the decal canvas, the fog mask are fields
   * on the one `Renderer`, so a mission and the backdrop cannot both be
   * prepared. Coming back to the front end re-prepares it against the world
   * that has been sitting there all along.
   */
  let backdrop: ArenaGame | null = null;
  let backdropMap: GameMap | null = null;
  let backdropOn = false;
  /** Drops the mission's own listeners when it ends. */
  let pauseTeardown: (() => void) | null = null;

  // The loop runs for the life of the page; `game` is null while the menu is up.
  let lastDraw = performance.now();
  startLoop(
    (dt) => {
      if (arena) {
        arena.step(dt);
        if (settings().arenaShowScore) hud.showArena(arena.readout(), settings().arenaLockCamera);
        return;
      }
      /*
       * The attract world steps only while it is the thing on screen, and only
       * while somebody is looking at the page.
       *
       * `loop.ts` already clamps the delta so a backgrounded tab cannot
       * stampede the simulation, but not stampeding is not the same as not
       * running: a front screen left open in another tab would otherwise spend
       * an afternoon fighting a battle nobody can see.
       */
      if (backdropOn && backdrop && !document.hidden) backdrop.step(dt);
      controls.update(game?.world ?? null, camera.isManual);
      // A sheet is a modal: the world behind it holds still rather than being
      // fought blind through a panel. The briefing is the same promise made at
      // the other end of a mission -- it is a title card, not a head start for
      // the garrison, so nothing moves until the player has put it away.
      if (!game || sheetOpen() || confirmOpen() || hud.briefingUp) return;
      // Dev only, and the second and last line the debug switches cost anyone:
      // the world holds while the draw carries on, so a capture harness can
      // advance it by an exact number of steps and photograph the result.
      //
      // The gate is around the *step* alone and not around the frame. The HUD
      // is what raises the end-of-mission panel, so freezing it too made the
      // one moment worth photographing -- winning -- the one moment that could
      // not be photographed.
      if (!(__DEV__ && debug.paused)) game.step(dt);
      hud.update(game.world);
    },
    (alpha) => {
      const now = performance.now();
      const frameDt = Math.min(0.1, (now - lastDraw) / 1000);
      lastDraw = now;
      if (arena) {
        // No `aim` argument, so no reticle and no crosshair are drawn over a
        // battle nobody is aiming at. The parameter is optional precisely so
        // this can be said by leaving it out.
        renderer.draw(arena.world, camera, alpha, frameDt);
        updateAmbience(camera, renderer.windTime, frameDt, true);
      } else if (backdropOn && backdrop) {
        // Drawn even when the tab is hidden is pointless, but drawn while a
        // modal is up is not: the front end's own dialogs sit over it and the
        // battle carrying on behind them is the entire point.
        renderer.draw(backdrop.world, camera, alpha, frameDt);
      } else if (game) {
        renderer.draw(game.world, camera, alpha, frameDt, input.aim);
        // The bed rides the draw, not the step: it needs the camera as drawn
        // and the renderer's wind clock, and it should keep breathing while
        // the debug pause holds the world still for a photograph.
        /*
         * The bed sounds through the briefing now, on the owner's ask: you
         * are looking at a jungle and it should sound like one before you are
         * standing in it. `hud.briefingUp` used to gate it off with the
         * sheets, which lumped "the player is reading a card about this place"
         * in with "the player has stepped out of the game".
         *
         * The sheets still silence it -- a paused world that goes on chirping
         * is a world that has not really paused -- and so does a resolved
         * mission, where the bed would play under the end banner.
         */
        updateAmbience(camera, renderer.windTime, frameDt,
          !sheetOpen() && game.world.phase === Phase.Playing);
      }
    },
  );

  /**
   * Is a battle behind the menu worth running on this device at all?
   *
   * Not on a phone. `wide` is a desktop or a large tablet in landscape; the
   * other two layouts are small screens whose front end is already a tight fit,
   * and a forty-man simulation drawn behind it buys them nothing. The brief
   * asked for this on a desktop front end. A still frame would do as well on a
   * phone, and is a separate decision if anybody wants it.
   */
  const backdropWanted = (): boolean => layout.state.mode === 'wide';

  /**
   * Brings the attract world up behind the front end.
   *
   * Built once and then only re-prepared. `input.mode = 'sealed'` is the whole
   * of the promise this screen makes: not one gesture reaches the simulation
   * *or the camera*, because every one of them belongs to the menu drawn on
   * top. `spectator` would be wrong here -- it keeps the camera for the viewer,
   * and the front end's buttons and the battlefield's edge-scroll would be
   * fighting over the same pointer, which edge-scroll wins by being invisible.
   */
  const startBackdrop = async (): Promise<void> => {
    // Folded away entirely by esbuild in a production build, which takes the
    // dynamic import below -- and so the whole arena -- with it. Dev-only means
    // absent, not merely unreachable; the same rule the debug panel follows.
    if (!__DEV__) return;
    if (!backdropWanted()) return;
    try {
      if (!backdrop) {
        const { ArenaGame } = await import('./sim/arena-game.js');
        const res = await fetch(`/api/maps/${ARENA_MAP}`);
        if (!res.ok) return;
        backdropMap = parseMap(await res.text(), ARENA_MAP);
        /*
         * Prepared *before* the game is built, and this order is not
         * cosmetic: `prepare` is what creates the decal canvas, and every
         * constructor here clears the decals as its first act. At boot
         * nothing has been prepared yet, so building the arena first throws
         * on an undefined context -- silently, into the catch below, leaving
         * a front screen with no battle behind it and no clue why. `play`
         * has always done it in this order for the same reason.
         */
        renderer.prepare(backdropMap, createWorld(backdropMap, 'veteran'));
        backdrop = new ArenaGame(backdropMap, camera, input, () => renderer.clearDecals(), true);
      }
      // Every time, not just the first: a mission in between will have baked
      // its own terrain over the top of this one.
      renderer.prepare(backdropMap!, backdrop.world);
    } catch (err) {
      /*
       * A backdrop is decoration. If it cannot be had -- the map missing, the
       * import failing -- the front end is still a working front end, and
       * failing loudly here would take the whole game down for a picture.
       *
       * It says so in a dev build, though. The first version swallowed this
       * without a word and the symptom was a front screen that looked
       * completely normal, which is the worst way to hide a broken feature.
       */
      if (__DEV__) console.warn('attract world did not start:', err);
      return;
    }
    // Dev handle, the same audience as `window.game`: the attract world is the
    // one thing on screen that no click can reach, so a driver has to be able
    // to ask it questions directly.
    if (__DEV__) (window as unknown as { __bd: ArenaGame | null }).__bd = backdrop;
    input.mode = 'sealed';
    document.body.dataset.mode = 'backdrop';
    layout.apply();
    backdropOn = true;
  };

  /** Puts it away again, keeping the world for next time. */
  const stopBackdrop = (): void => {
    if (!backdropOn) return;
    backdropOn = false;
    input.mode = 'play';
    delete document.body.dataset.mode;
    layout.apply();
  };

  /**
   * Runs one mission. Resolves with what the player asked for next: back to the
   * list, or straight on to the following mission.
   */
  const play = async (
    info: LevelInfo, difficulty: DifficultyId,
  ): Promise<'menu' | 'next' | { replay: DifficultyId }> => {
    /** Set when the player picks a *different* difficulty from the end panel. */
    let replayAt: DifficultyId | null = null;
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
    const roster = (): ReturnType<typeof deploy> => deploy(campaign, map.squadSize);

    game = new Game(map, camera, renderer, input, difficulty, roster);
    // The bed knows the terrain from here; it starts sounding on the first
    // drawn frame after the briefing comes down.
    startAmbience(map);
    missionStarted(info.id, difficulty);
    // The end-of-mission panel drives the shell rather than the other way
    // round, so "next mission" is one click from where you finished.
    const index = campaignLevels.findIndex((l) => l.id === info.id);
    hud.hasNext = index >= 0 && index < campaignLevels.length - 1;
    /*
     * The briefing's heading. Numbered within its theatre, not across the
     * campaign, for the same reason the level select is (front.ts): a desert
     * list running 05, 07, 14 reads as a list with holes in it. Neither number
     * is on `world.map`, so it is handed over here (201-qa 005).
     */
    {
      const group = groupByTheatre(campaignLevels).find(
        (g) => g.levels.some((l) => l.id === info.id),
      );
      hud.missionNumber = group ? group.levels.findIndex((l) => l.id === info.id) + 1 : 0;
      hud.theatreName = group?.theatre.name ?? '';
    }
    hud.onNext = (): void => { if (game) game.nextRequested = true; };
    hud.onRetry = (): void => {
      if (!game) return;
      /*
       * Replay asks *at what difficulty*, the way the level select does --
       * one button per rung, the one just played wearing the primary plate
       * and named in the body, so nobody finishes a campaign never knowing
       * the rungs existed (200-qa 026). The same rung restarts in place; a
       * different one relaunches through the mission loop, because
       * difficulty is fixed at Game construction and everything derived
       * from it has to be rebuilt.
       */
      void confirm({
        title: 'Play it again — on what setting?',
        body: `You just played ${map.name} on ${DIFFICULTIES[difficulty].name}.`,
        buttons: DIFFICULTY_ORDER.map((id) => ({
          label: DIFFICULTIES[id].name.toUpperCase(),
          value: id as string,
          variant: (id === difficulty ? 'primary' : 'normal') as 'primary' | 'normal',
        })),
        dismiss: 'back',
      }).then((v) => {
        if (v === 'back' || !game) return;
        if (v !== difficulty) {
          replayAt = v as DifficultyId;
          return;
        }
        game.restart();
        hud.hideOverlay();
        /*
         * Straight back into it, out of the black.
         *
         * A retry is a mission opening in every way that matters -- and it was
         * not treated as one: the panel was hidden, the world rebuilt, and
         * *nothing put the screen back*, so the blackout stayed at full from
         * the end-of-mission fade and the player was left looking at a black
         * rectangle with a live mission running under it. It never recovered.
         *
         * It does not get the briefing, though, which the first fix gave it.
         * You have just read that briefing and just failed the mission it
         * describes; a card between you and trying again is a card in the
         * way. So: the fade, and none of the ceremony.
         */
        void fadeIn(CONFIG.banner.fade);
      });
    };
    hud.onMissions = (): void => { if (game) game.exitRequested = true; };

    /*
     * The sidebar tools. Two of the three are destructive, and both ask first
     * through the one confirmation component -- the questions are worded as
     * what will be lost, because "are you sure" without the cost is a ritual
     * rather than a question. Settings asks nothing; it costs nothing.
     */
    hud.onExit = (): void => {
      void confirm({
        title: 'Leave the mission?',
        body: 'The squad walks away. Progress on this attempt is lost.',
        buttons: [
          { label: 'LEAVE', value: 'leave', variant: 'primary' },
          { label: 'STAY', value: 'stay' },
        ],
        dismiss: 'stay',
      }).then((v) => { if (v === 'leave' && game) game.exitRequested = true; });
    };
    /*
     * A restart is an opening -- the same rule openMission's own comment
     * fought for. The first wiring here called game.restart() and carried on,
     * which swapped the world under the player mid-frame; the owner's words
     * were that he expected the screen to fade to black and show the mission
     * screen again, which is precisely what "goes through openMission" means.
     */
    const restartMission = async (): Promise<void> => {
      await fadeOut(CONFIG.banner.fade);
      game?.restart();
      hud.hideOverlay();
      closeSheet();
      openMission();
    };
    hud.onRestart = (): void => {
      void confirm({
        title: 'Restart the mission?',
        body: 'Back to the drop, everyone on their feet. This attempt is lost.',
        buttons: [
          { label: 'RESTART', value: 'restart', variant: 'primary' },
          { label: 'CANCEL', value: 'cancel' },
        ],
        dismiss: 'cancel',
      }).then((v) => { if (v === 'restart') void restartMission(); });
    };
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
      if (!game || sheetOpen() || confirmOpen()) return;
      /*
       * Nothing to pause, so nothing to offer.
       *
       * The sheet exists to stop the world while the player is not looking at
       * it. On the briefing and on the end-of-mission panel the world is
       * already stopped -- the step loop returns before `game.step` for the
       * briefing, and a resolved phase steps nothing -- so a pause here buys
       * the player nothing and costs them the card they were reading. The
       * result panel is neither a sheet nor a confirm (it is `#overlay` with
       * `.interactive`), so the two guards above do not see it and a
       * tab-away used to stack Paused straight over a win.
       *
       * It sits in `openPause` rather than in the visibilitychange handler
       * because the sidebar's PAUSE button reaches the same place, and it
       * had the same hole (201-qa 009).
       */
      if (hud.briefingUp || game.world.phase !== Phase.Playing) return;
      // Boot Hill is not here any more: a link to the graves is a strange thing
      // to offer somebody who paused mid-firefight, and the brief asked for it
      // out. Its door moves to the front end, which is 101's -- until that
      // lands it is reachable from the mission list only.
      // Three verbs, one of them primary: resume large and centred, restart
      // and settings small below it. The mission-list row is gone -- leaving
      // is the sidebar door's job, behind its own confirmation (200-qa 024).
      showSheet('Paused', map.name, [
        { label: 'Resume', tone: 'good', key: 'Enter', primary: true, onPick: () => {} },
        { label: 'Restart', tone: 'warn', key: 'R', onPick: () => { void restartMission(); } },
        { label: 'Settings', onPick: () => showSettings(() => layout.apply()) },
      ], true);   // and the controls, from the same list the briefing uses
    };
    input.onPause = openPause;
    hud.onPause = openPause;

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
    // Same audience: the ambience targets are unhearable headlessly, so the
    // driver asserts on the numbers instead.
    (window as unknown as { ambience: typeof ambienceState }).ambience = ambienceState;
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
    /*
     * Every mission opens on black and fades in, whichever way you arrived.
     *
     * Coming from the mission before, the screen is already out -- the results
     * panel was drawn on it -- so this is simply not turning it back on yet,
     * and the briefing lands on the same black the panel did. Coming from the
     * list it is turned out here, so the two routes look the same rather than
     * one of them cutting straight to a live map.
     */
    /**
     * Opening a mission: black, briefing, and up out of the black when it goes.
     *
     * A function rather than three statements because **a retry is an opening
     * too**, and it was not treated as one: `onRetry` rebuilt the world and hid
     * the panel, and nothing anywhere put the screen back. The blackout was
     * still at full from the end-of-mission fade, so retrying a mission left
     * the player looking at a black rectangle with a live game running
     * underneath it -- reproduced, and it never recovered.
     *
     * Everything that starts a mission goes through here now, so a fourth route
     * cannot forget the same step.
     */
    const openMission = (): void => {
      setBlackout(1);
      hud.showBriefing(game!.world);
      window.addEventListener('pointerdown', dismissBriefing, true);
      window.addEventListener('keydown', dismissBriefing, true);
    };

    const dismissBriefing = (e: Event): void => {
      if (!game || game.world.phase !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      hud.hideOverlay();
      // ...and the mission comes up out of the black. The order matters: the
      // briefing is gone first, so what fades in is the map and not the card.
      void fadeIn(CONFIG.banner.fade);
      /*
       * Nothing is swallowed here, and that is the fix rather than an omission.
       *
       * `stopPropagation` above runs in the *capture* phase on `window`, so the
       * dismissing press never reaches the canvas and never becomes an order --
       * there is nothing left for a swallow to eat. Arming one anyway left it
       * sitting there to eat the player's next real order, which is exactly
       * what it did: click one closed the briefing, **click two did nothing**,
       * click three worked. Reproduced on Chicken Run, and absent when the
       * briefing was dismissed with a key.
       *
       * The keyboard half of this was found and fixed in 004 and guarded with
       * `if (e.type === 'pointerdown')` -- a test of the event's type, when the
       * question is whether the game ever saw it. It never does.
       */
      teardownBriefing();
      /*
       * The wire opens once the card is gone, not before: the briefing owns
       * the screen while it is up, and a strip sliding in underneath it would
       * be two things talking at once (201-qa 007).
       */
      const wire = transmissionFor(map);
      if (wire) showTransmission(wire.speaker, wire.text, wire.opts);
    };
    const teardownBriefing = (): void => {
      window.removeEventListener('pointerdown', dismissBriefing, true);
      window.removeEventListener('keydown', dismissBriefing, true);
    };

    openMission();

    try {
      localStorage.setItem(LAST_PLAYED_KEY, info.id);
    } catch {
      // Private browsing: remembering the last mission is not worth failing over.
    }

    return new Promise<'menu' | 'next' | { replay: DifficultyId }>((resolve) => {
      const check = (): void => {
        const done = game?.exitRequested ? 'menu'
          : game?.nextRequested ? 'next'
            : replayAt ? { replay: replayAt } : null;
        if (done) {
          game = null;
          (window as unknown as { game: Game | null }).game = null;
          stopAmbience();
          hud.hideOverlay();
          closeSheet();
          teardownBriefing();
          teardownComms();
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

  /**
   * The CPU-vs-CPU arena: a world with nobody playing it.
   *
   * A sibling of `play`, and much shorter, because almost everything `play`
   * does is about a *player* -- the briefing, the pause sheet, the results, the
   * campaign write, the wake lock. None of that has any meaning here.
   *
   * The promise this screen makes is that you cannot touch it, and it is made
   * in one line: `input.mode = 'spectator'`. That drops orders, grenades and
   * the aim at source (see `shell/input.ts`), and the two things it does *not*
   * drop are the reason it is not `sealed` -- the camera is yours, because
   * looking around is the whole activity. `sealed` is what the intro backdrop
   * will use.
   */
  const playArena = async (): Promise<void> => {
    /*
     * Imported here rather than at the top, so that a production build does not
     * carry it.
     *
     * `__DEV__` folds to a literal `false`, which lets esbuild drop this whole
     * branch -- and with it `arena-game.ts`, `arena.ts` and everything they
     * pull in. The same trick the debug panel uses, for the same reason: dev
     * only should mean *absent*, not merely unreachable. When the arena becomes
     * the intro backdrop it stops being dev-only and this goes back to being an
     * ordinary import.
     */
    if (!__DEV__) return;
    const { ArenaGame } = await import('./sim/arena-game.js');
    stopMusic();
    const res = await fetch(`/api/maps/${ARENA_MAP}`);
    if (!res.ok) throw new Error(`could not load the arena: ${res.status}`);
    const map = parseMap(await res.text(), ARENA_MAP);

    renderer.prepare(map, createWorld(map, 'veteran'));
    input.mode = 'spectator';
    /*
     * One attribute, and the stylesheet takes away everything that describes a
     * game being played: the squad sidebar, the action bar, and the crosshair
     * cursor. The re-layout is not optional -- the sidebar is a flex column
     * next to the canvas, so removing it changes how much room the canvas has,
     * and the backing store is sized by `Layout` rather than by CSS. Without
     * this the battle is drawn into a strip the width of the old viewport with
     * black beside it, which is exactly what the first capture showed.
     */
    document.body.dataset.mode = 'spectator';
    layout.apply();

    arena = new ArenaGame(map, camera, input, () => renderer.clearDecals());
    startAmbience(map);
    (window as unknown as { arena: ArenaGame | null }).arena = arena;

    /**
     * The two ways of watching, on two keys.
     *
     * `C` locks the camera to the middle of the map instead of letting it chase
     * the fighting; `H` takes the readout away and leaves nothing but the
     * battlefield. Both are saved, because they are a *taste in how to watch* --
     * somebody who wants the battle framed like a painting wants that every
     * time -- and because the intro backdrop will want both switched on
     * permanently, which is then a stored preference rather than a second code
     * path.
     *
     * Keys rather than a settings panel: the arena has no pause sheet to hang
     * one on, and a screen whose whole content is a picture should not grow
     * chrome to describe the picture. The bar says which keys, until it is the
     * thing being turned off.
     */
    const paintReadout = (): void => {
      if (!arena) return;
      if (settings().arenaShowScore) hud.showArena(arena.readout(), settings().arenaLockCamera);
      else hud.hideArena();
    };
    const onArenaKey = (e: KeyboardEvent): void => {
      if (e.key === 'c' || e.key === 'C') {
        updateSettings({ arenaLockCamera: !settings().arenaLockCamera });
        // Hand the camera back, or `lookAt`'s manual hold survives the unlock
        // and the view sits in the middle refusing to follow anything.
        if (!settings().arenaLockCamera) camera.release();
        paintReadout();
      } else if (e.key === 'h' || e.key === 'H') {
        updateSettings({ arenaShowScore: !settings().arenaShowScore });
        paintReadout();
      }
    };
    window.addEventListener('keydown', onArenaKey);
    paintReadout();

    const leave = (): void => { if (arena) arena.exitRequested = true; };
    input.onPause = leave;

    setBlackout(1);
    void fadeIn(CONFIG.banner.fade);

    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (arena?.exitRequested) {
          arena = null;
          (window as unknown as { arena: ArenaGame | null }).arena = null;
          input.mode = 'play';
          delete document.body.dataset.mode;
          // ...and the sidebar comes back, so the canvas has to be re-sized
          // around it again.
          layout.apply();
          input.onPause = null;
          window.removeEventListener('keydown', onArenaKey);
          stopAmbience();
          hud.hideArena();
          resolve();
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
    let info: LevelInfo | null = queued;
    queued = null;

    if (!info) {
      /*
       * `#arena`: the full-size arena, for working on it.
       *
       * A developer's door, not a player's -- the BATTLE button that used to be
       * on the front screen is gone, because the arena's home is now *behind*
       * that screen and a front page offering to go and look at its own
       * wallpaper is a front page explaining itself. Checked before the front
       * is drawn, and the fragment is cleared on the way out or the next reload
       * walks straight back in.
       */
      if (__DEV__ && window.location.hash === '#arena') {
        history.replaceState(null, '', window.location.pathname);
        stopBackdrop();
        await playArena();
        continue;
      }

      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST_PLAYED_KEY);
      } catch {
        last = null;
      }
      // The front lowers the blackout itself once it is up to receive the eye;
      // dropping it here opened a beat of naked stage before the screen faded
      // in. Music starts under the black, which is fine -- it is music.
      startMusic();
      // Before the front is drawn, so it comes up over a battle already in
      // progress rather than fading in and then having one appear behind it.
      await startBackdrop();
      // The menu is up and painted, which is the first moment there is anything
      // behind the loading screen worth revealing. Ending it here rather than
      // when boot() returns means it never lifts onto an empty page.
      bootStep('ready');
      void bootEnd();
      const chosen = await showFront(levels, last, difficulty, (d) => {
        difficulty = d;
        saveDifficulty(DIFFICULTY_KEY, d);
      }, campaign, visitBootHill);
      // The front end is going away and a mission is about to take the
      // renderer's per-map bake.
      stopBackdrop();
      difficulty = chosen.difficulty;
      info = levels.find((l) => l.id === chosen.id) ?? null;
      if (!info) continue;
    }

    const outcome = await play(info, difficulty);
    if (typeof outcome === 'object') {
      // The end panel's "replay at another difficulty": same mission, new
      // rung, straight back in through the front door of the loop.
      difficulty = outcome.replay;
      saveDifficulty(DIFFICULTY_KEY, difficulty);
      queued = info;
      continue;
    }
    if (outcome === 'next') {
      const at = campaignLevels.findIndex((l) => l.id === info.id);
      queued = at >= 0 ? campaignLevels[at + 1] ?? null : null;
    }
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  // Say so on the screen the player is already looking at. Without this a
  // thrown error leaves the loading screen up forever, which reads as a slow
  // connection and gets blamed on their line rather than on us.
  bootFailed(err);
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



