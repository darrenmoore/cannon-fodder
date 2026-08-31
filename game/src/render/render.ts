import { CONFIG } from '../config.js';
import { bigTextSprite } from './bigfont.js';
import { grenadeArc } from '../sim/combat.js';
import { lerp } from '../loop.js';
import { tileAt } from '../sim/map.js';
import { buildAtlas, facingIndex, SOLDIER_ANCHOR, WALK_FRAMES } from './sprites/index.js';
import { bakeCanopy } from './canopy.js';
import { paintGround } from './ground.js';
import { textSprite } from './pixelfont.js';
import { threshAt } from './palette.js';
import { analyseTerrain } from './terrain.js';
import { TILES, Tile } from '../sim/tiles.js';
import { EnemyKind, Faction, Phase } from '../types.js';
import { rankTier } from '../sim/campaign.js';
import { squadCentre } from '../sim/world.js';
import type { Aim } from '../shell/aim.js';
import type { Camera } from './camera.js';
import type { GameMap } from '../sim/map.js';
import type { Atlas, Foliage, Sprite } from './sprites/index.js';
import type { TerrainInfo } from './terrain.js';
import type { Actor, Building, Enemy, Hostage, Vec2 } from '../types.js';
import type { World } from '../sim/world.js';

/**
 * Edge-arrow colours, per enemy kind.
 *
 * The same three the sprites use, because the type is the whole point of the
 * arrow: a rifleman off the top of the screen is a nuisance and a sniper off
 * the top of the screen is the thing about to kill someone.
 */
const ENEMY_INK: Record<EnemyKind, string> = {
  [EnemyKind.Rifle]: '#ff6a48',
  [EnemyKind.Sniper]: '#b8bcc4',
  [EnemyKind.Bazooka]: '#d46ad4',
  [EnemyKind.Officer]: '#ffd24a',
};

/**
 * Drawing, in one place.
 *
 * The static ground is painted once into an offscreen canvas the size of the
 * whole map and blitted by visible rect, so terrain costs one drawImage a frame
 * however detailed it is. Scenery and actors are merged into a single list and
 * sorted by their feet, which is what lets a soldier disappear behind a tree.
 * Blood and corpses are stamped into a second full-map canvas and never
 * simulated again.
 *
 * Foliage is the exception to the static ground: canopies are drawn per frame
 * with a wind offset, so the treeline breathes.
 */

interface SceneryItem {
  sprite: Sprite;
  /** Top-left draw position in world pixels. */
  x: number;
  y: number;
  /** Sort key: where the object touches the ground. */
  sortY: number;
  /** Foliage sways; its own phase keeps the forest from moving in lockstep. */
  foliage?: Foliage;
  phase?: number;
  /**
   * A building's *id*, not the building.
   *
   * The scenery list is baked once per map, from a world that is thrown away
   * immediately afterwards -- so an object reference here pointed at a building
   * nobody was playing with. It was always intact and always stage zero, which
   * is why a levelled hut never turned into a ruin, damage stages never showed,
   * and no building ever drew a damage bar. Resolved against the live world
   * every frame instead, which also survives a restart building a new world.
   */
  buildingId?: number;
}

interface DrawItem {
  sortY: number;
  scenery?: SceneryItem;
  /** The live building a scenery item stands for, resolved this frame. */
  building?: Building;
  actor?: Actor;
  hostage?: Hostage;
}

/** Scrambles a tile coordinate pair, so sprite variants do not visibly band. */
const tileHash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Shadow ink per theme.
 *
 * A shadow is the ground it falls on with the light taken away, not a dark
 * shape laid over it — so each of these is the bottom entry of that theme's own
 * ground ramp. Near-black instead reads as a hole cut in the map, and on snow
 * it reads as a stain.
 */
/** Where a figure's shadow falls, in world pixels. The sun is up and behind. */
const FIGURE_SHADOW = { x: 2, y: 3 };

/** How deep a figure stands in each liquid, and what the surface looks like. */
type WadeKind = 'none' | 'water' | 'mud' | 'deep';
const WADE: Record<'water' | 'mud' | 'deep', { visible: number; line: string; foam: string }> = {
  // Sprite is 15px tall; 7 leaves head and shoulders, 10 leaves him waist-deep.
  water: { visible: 7, line: '#2f6d92', foam: '#9fd8ef' },
  mud: { visible: 10, line: '#6b5c30', foam: '#a89355' },
  // Swimming: six pixels, so head and shoulders with his chin at the surface.
  // Five read as a man who had already drowned. Deliberately the same three
  // lines as wading rather than a new arrangement -- the depth and the darker
  // water are the difference, and a man this low being slow and unable to
  // shoot should be legible from the silhouette without a second idiom.
  deep: { visible: 6, line: '#173a55', foam: '#7fc4e0' },
};

/** Fraction of a death spent buckling before the body is on the ground. */
const DEATH_BUCKLE = 0.4;

/** How long the roof of a collapsing building stays visible, and how far it goes. */
const ROOF_LIFT_TIME = 0.45;
const ROOF_LIFT_PX = 9;

const SHADOW_INK: Record<string, string> = {
  jungle: '#2b3a0f',
  desert: '#5e5322',
  arctic: '#6e929c',
};

const seededRnd = (seed: number): (() => number) => {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

export class Renderer {
  private readonly atlas: Atlas = buildAtlas();
  private terrain!: HTMLCanvasElement;
  /** Derived per-tile shape data, shared by the bake and the scenery pass. */
  private info!: TerrainInfo;
  /**
   * The treeline, baked as one mass and drawn over the actors. Trees are solid,
   * so nobody can stand inside one; what the overdraw buys is the overhang onto
   * a soldier at the hem, which is what the reference shows.
   */
  private canopy: HTMLCanvasElement | null = null;
  /** The building set this mission's theme uses. */
  private huts: Sprite[] = [];
  /** This mission's map, for the few draws that need to read a tile. */
  private map!: GameMap;
  /** Solid-black copies of sprites, for drop shadows. Built on first use. */
  private readonly silhouettes = new Map<Sprite, Sprite>();
  private decals!: HTMLCanvasElement;
  private decalCtx!: CanvasRenderingContext2D;
  private scenery: SceneryItem[] = [];
  /** Water tile coordinates, for the animated shimmer pass. */
  private waterTiles: Array<[number, number]> = [];
  private drawList: DrawItem[] = [];
  /** This frame's buildings by id, so scenery can find the one it draws. */
  private liveBuildings = new Map<number, Building>();
  /** One pixel per tile; scaled up with smoothing on for soft-edged fog. */
  private fogMask!: HTMLCanvasElement;
  private fogCtx!: CanvasRenderingContext2D;
  private time = 0;
  /** Seconds since the mission was won, or -1 when nobody is celebrating. */
  private cheerTime = -1;
  /** Which survivor does the jumping; picked once per celebration. */
  private jumperId = -1;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  /** Rebuilds the baked layers. Called once per map, not per restart. */
  prepare(map: GameMap, world: World): void {
    this.terrain = document.createElement('canvas');
    this.terrain.width = map.pixelWidth;
    this.terrain.height = map.pixelHeight;
    const g = this.terrain.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    this.map = map;
    this.info = analyseTerrain(map);
    this.waterTiles = paintGround(g, map, this.info).waterTiles;

    // The canopy's shadow goes down before anything stands on the ground, so
    // scenery and building shadows land on top of it rather than under it.
    const baked = bakeCanopy(map, this.info);
    if (baked.shadow) g.drawImage(baked.shadow, 0, 0);
    this.canopy = baked.layer;

    this.scenery = this.collectScenery(map, world, g);

    this.decals = document.createElement('canvas');
    this.decals.width = map.pixelWidth;
    this.decals.height = map.pixelHeight;
    this.decalCtx = this.decals.getContext('2d')!;
    this.decalCtx.imageSmoothingEnabled = false;

    // The fog mask is one pixel per tile. Blitting it up to world scale with
    // smoothing on turns hard tile edges into a soft falloff for free.
    this.fogMask = document.createElement('canvas');
    this.fogMask.width = map.width;
    this.fogMask.height = map.height;
    this.fogCtx = this.fogMask.getContext('2d')!;
  }

  clearDecals(): void {
    this.decalCtx.clearRect(0, 0, this.decals.width, this.decals.height);
  }

  /** Places scenery sprites and stamps their ground shadows into the terrain. */
  private collectScenery(map: GameMap, world: World, ground: CanvasRenderingContext2D): SceneryItem[] {
    const items: SceneryItem[] = [];
    const t = map.tile;
    const tufts = this.atlas.grassTufts[map.theme] ?? this.atlas.grassTufts.jungle;

    /**
     * A hard-edged elliptical shadow, dithered rather than blended.
     *
     * `ellipse` plus `globalAlpha` gives an anti-aliased, semi-transparent
     * smudge, which is the most anachronistic thing that can appear in a frame
     * imitating an Amiga: the hardware had neither alpha blending nor
     * anti-aliasing, and the eye reads a soft gradient as "modern" instantly.
     *
     * Scanning it out row by row keeps every edge on the pixel grid. The
     * coverage is a checker rather than a fill, so it darkens the ground it
     * falls on instead of replacing it — a solid ellipse of near-black under a
     * building looks like a hole cut in the map, especially on snow.
     */
    const shade = SHADOW_INK[map.theme] ?? SHADOW_INK.jungle;
    const shadow = (cx: number, cy: number, rx: number, ry: number): void => {
      ground.fillStyle = shade;
      for (let y = Math.round(cy - ry); y <= cy + ry; y++) {
        const k = (y - cy) / ry;
        const half = Math.sqrt(Math.max(0, 1 - k * k)) * rx;
        for (let x = Math.round(cx - half); x <= cx + half; x++) {
          // Coverage falls off from the centre and is resolved against the same
          // jittered threshold the ground uses, so the shadow fades out the way
          // everything else on the map does. Stacking two modulo patterns
          // instead produced visible stripes under every building.
          const inset = 1 - Math.hypot((x - cx) / rx, k);
          if (threshAt(x, y) > inset * 1.15) continue;
          ground.fillRect(x, y, 1, 1);
        }
      }
    };

    const claimed = new Set<string>();
    for (const b of world.buildings) for (const [bx, by] of b.tiles) claimed.add(`${bx},${by}`);

    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = tileAt(map, tx, ty);
        const cx = tx * t + t / 2;
        const bottom = (ty + 1) * t;
        const rnd = seededRnd(tx * 131 + ty * 977);

        if (tile === Tile.Tree) {
          // Nothing: the treeline is one baked mass, not a sprite per tile.
          continue;
        } else if (tile === Tile.TallGrass) {
          // Also part of the baked mass: one sprite per tile put a readable
          // repeating glyph on a 16px lattice across whole missions.
          continue;
        } else if (tile === Tile.Rock) {
          // Also part of the baked mass: one boulder per tile laid an outcrop
          // out as a grid, and a grid of boulders reads as masonry.
          continue;
        } else if (tile === Tile.Tent) {
          const sprite = this.atlas.tent;
          // A 2x2 tent block places one sprite from its top-left tile.
          if (tileAt(map, tx - 1, ty) === Tile.Tent || tileAt(map, tx, ty - 1) === Tile.Tent) continue;
          shadow(cx + t / 2 + 2, bottom + t - 5, 12, 4);
          items.push({
            sprite,
            x: cx + t / 2 - sprite.width / 2,
            y: bottom + t - sprite.height + 2,
            sortY: bottom + t - 6,
          });
        } else if (!claimed.has(`${tx},${ty}`) && !TILES[tile].solid && tile === Tile.Grass && rnd() < 0.09) {
          // Sparse ground detail so open fields are not flat colour.
          const sprite = tufts[tileHash(tx, ty) % tufts.length];
          items.push({
            sprite,
            x: cx - sprite.width / 2 + Math.round(rnd() * 6 - 3),
            y: bottom - sprite.height - Math.round(rnd() * 6),
            sortY: bottom - 8,
            phase: (tx * 2.1 + ty * 1.1) % (Math.PI * 2),
          });
        }
      }
    }

    // Buildings are placed from the world so they can swap to a ruin sprite.
    // Which building a mission puts up is a matter of where it is fought.
    const huts = map.theme === 'arctic' ? this.atlas.cabin : this.atlas.hut;
    this.huts = huts;
    for (const b of world.buildings) {
      const sprite = this.buildingSet(b.kind, huts)[0];
      const blockCx = (b.x0 + b.w / 2) * t;
      const blockBottom = (b.y0 + b.h) * t;
      // Offset well clear of the sprite's own footprint, or the building
      // simply covers its own shadow and reads as pasted onto the map.
      shadow(blockCx + b.w * 3, blockBottom - 1, b.w * 7.5, b.h * 3.5);
      items.push({
        sprite,
        x: blockCx - sprite.width / 2,
        y: blockBottom - sprite.height + 3,
        sortY: blockBottom - 5,
        buildingId: b.id,
      });
    }

    return items;
  }

  /** Burns any queued blood, corpses and scorch marks into the decal layer. */
  private flushDecals(world: World): void {
    if (world.fx.pendingDecals.length === 0) return;
    const g = this.decalCtx;

    for (const d of world.fx.pendingDecals) {
      const rnd = seededRnd(d.seed);
      if (d.kind === 'blood') {
        g.globalAlpha = 0.85;
        for (let i = 0; i < 10; i++) {
          const a = rnd() * Math.PI * 2;
          const r = rnd() * 7;
          g.fillStyle = rnd() < 0.4 ? '#6d1109' : '#96190f';
          const size = 1 + ((rnd() * 2) | 0);
          g.fillRect(Math.round(d.pos.x + Math.cos(a) * r), Math.round(d.pos.y + Math.sin(a) * r), size, size);
        }
      } else if (d.kind === 'corpse') {
        g.globalAlpha = 1;
        const sprite = d.who === 'enemy' ? this.atlas.corpseEnemy
          : d.who === 'hostage' ? this.atlas.corpseHostage
            : this.atlas.corpsePlayer;
        g.drawImage(sprite, Math.round(d.pos.x - sprite.width / 2), Math.round(d.pos.y - sprite.height + 4));
      } else {
        g.globalAlpha = 0.6;
        for (let i = 0; i < 26; i++) {
          const a = rnd() * Math.PI * 2;
          const r = rnd() * 16;
          g.fillStyle = rnd() < 0.5 ? '#241a10' : '#3a2c1c';
          g.fillRect(Math.round(d.pos.x + Math.cos(a) * r), Math.round(d.pos.y + Math.sin(a) * r), 2, 2);
        }
      }
    }
    g.globalAlpha = 1;
    world.fx.pendingDecals.length = 0;
  }

  /**
   * Wind offset for a piece of foliage, in whole world pixels. A slow gust
   * travels across the map so the whole treeline does not move as one.
   */
  private windOffset(x: number, y: number, phase: number): number {
    const w = CONFIG.wind;
    const gust = Math.sin((x + y) * w.gustScale + this.time * w.gustSpeed);
    const sway = Math.sin(this.time * w.speed + phase);
    return Math.round(sway * w.amplitude * (0.65 + gust * 0.35));
  }

  draw(world: World, camera: Camera, alpha: number, dtSinceLastFrame: number, aim?: Aim): void {
    this.time += dtSinceLastFrame;
    this.flushDecals(world);

    // Won, and still on the field: the survivors turn out of the screen and
    // celebrate until the results arrive. Negative means nobody is cheering.
    this.cheerTime = world.phase === Phase.Won ? world.phaseTime : -1;
    if (this.cheerTime >= 0 && this.jumperId < 0) {
      // The longest-serving survivor does the jumping -- lowest id, which is
      // the man at the top of the roster.
      const living = world.soldiers.filter((s) => s.alive);
      this.jumperId = living.length ? Math.min(...living.map((s) => s.id)) : -1;
    } else if (this.cheerTime < 0) {
      this.jumperId = -1;
    }

    const ctx = this.ctx;
    const zoom = camera.zoom;
    const ox = camera.offsetX;
    const oy = camera.offsetY;

    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1207';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(zoom, 0, 0, zoom, -ox * zoom, -oy * zoom);

    const viewL = ox;
    const viewT = oy;
    const viewR = ox + camera.viewW;
    const viewB = oy + camera.viewH;

    // 1. Ground and 2. decals: one blit each, clipped to the visible rect.
    const sx = Math.max(0, Math.floor(viewL));
    const sy = Math.max(0, Math.floor(viewT));
    const sw = Math.min(this.terrain.width - sx, Math.ceil(viewR - sx) + 1);
    const sh = Math.min(this.terrain.height - sy, Math.ceil(viewB - sy) + 1);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(this.terrain, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.drawImage(this.decals, sx, sy, sw, sh, sx, sy, sw, sh);
    }

    this.drawWaterShimmer(world, viewL, viewT, viewR, viewB);
    this.drawExtractionZones(world);
    this.drawOrderMarker(world);

    // 3. Scenery and actors, sorted by ground contact so depth reads correctly.
    this.drawList.length = 0;
    this.liveBuildings.clear();
    for (const b of world.buildings) this.liveBuildings.set(b.id, b);
    for (const item of this.scenery) {
      if (item.x > viewR + 8 || item.x + item.sprite.width < viewL - 8) continue;
      if (item.y > viewB + 8 || item.y + item.sprite.height < viewT - 20) continue;
      const live = this.liveBuildings.get(item.buildingId ?? -1);
      /*
       * Rubble is ground, and ground is walked *on*.
       *
       * A levelled building kept the standing building's place in the depth
       * sort, because it is the same scenery entry with a different sprite --
       * so a soldier crossing a demolished hut was drawn behind it, which is
       * correct for a wall and nonsense for a heap of it. Sorting it to the top
       * of the map rather than to its own footprint puts every actor in front
       * of it and nothing behind it, which is what flat means here.
       */
      const flat = live !== undefined && !live.standing;
      this.drawList.push({
        sortY: flat ? -Infinity : item.sortY,
        scenery: item,
        building: live,
      });
    }
    for (const a of world.actors) {
      // The dead are drawn too, but only while they are still falling.
      if (!a.alive && !(a.deathTime >= 0 && a.deathTime < CONFIG.fx.deathTime)) continue;
      const x = lerp(a.prev.x, a.pos.x, alpha);
      const y = lerp(a.prev.y, a.pos.y, alpha);
      if (x < viewL - 20 || x > viewR + 20 || y < viewT - 24 || y > viewB + 24) continue;
      // Your own men are always drawn; theirs only where you have eyes.
      if (a.faction === Faction.Enemy && !world.fog.isVisible(x, y)) continue;
      this.drawList.push({ sortY: y, actor: a });
    }
    for (const h of world.hostages) {
      if (!h.alive || h.delivered) continue;
      if (!world.fog.isVisible(h.pos.x, h.pos.y)) continue;
      this.drawList.push({ sortY: h.pos.y, hostage: h });
    }
    this.drawList.sort((p, q) => p.sortY - q.sortY);

    for (const item of this.drawList) {
      if (item.scenery) this.drawScenery(item.scenery, item.building);
      else if (item.actor) this.drawActor(item.actor, alpha);
      else if (item.hostage) this.drawHostage(item.hostage, alpha);
    }

    // 4. The treeline, over the actors: a soldier at the hem stands under the
    // overhang rather than in front of it.
    if (this.canopy && sw > 0 && sh > 0) {
      ctx.drawImage(this.canopy, sx, sy, sw, sh, sx, sy, sw, sh);
    }

    // 5. Everything that belongs on top of the world.
    this.drawCrates(world);
    this.drawSupplies(world);
    this.drawMines(world);
    this.drawTargetMarkers(world, alpha);
    this.drawBullets(world);
    this.drawGrenades(world, alpha);
    this.drawParticles(world);
    this.drawMuzzleFlashes(world);

    // 6. Fog, so it covers the world but leaves tracers coming out of it.
    this.drawFog(world, sx, sy, sw, sh);

    // 7. Pickup labels over the fog: a message to the player, not part of the
    // battlefield, so nothing is allowed to dim it.
    this.drawPopups(world);

    // 8. The aim, and what is off the edge of it. Both are drawn over the fog
    // and sized in CSS pixels rather than world pixels, because they are a
    // message to the player rather than a thing standing on the ground -- a
    // reticle that halved in size when the player zoomed out would be useless
    // at exactly the moment it is needed most.
    if (aim) this.drawAim(world, aim, zoom);
    this.drawOffscreen(world, camera, zoom, viewL, viewT, viewR, viewB);

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 9. The end of the phase, over everything, in screen space.
    this.drawPhaseBanner(world);
  }

  /*
   * The fade out used to be step 10 here, a black `fillRect` over the canvas.
   *
   * It has moved to `ui/blackout.ts`, and had to. The sidebar is DOM, outside
   * the canvas, so the battlefield went dark and six names and a grenade count
   * stayed lit beside it -- which reads as a rendering fault rather than as an
   * ending. Nothing painted in here can cover the chrome. The timing is
   * unchanged and still comes from `CONFIG.banner`; only the surface moved.
   */

  /**
   * PHASE COMPLETE, flying up and settling.
   *
   * Over the battlefield, not over a panel. That is the whole shape of the
   * moment in `docs/original-images/elements/phase-complete.jpg`: the grass is
   * still there behind the lettering, the men are still standing on it, and for
   * a second and a half the game is finished but not yet a menu. A DOM card on
   * the frame the mission resolves skips all of that.
   *
   * Driven entirely from `phase` and `phaseTime`, so there is no banner state
   * to keep in sync with anything -- a restart resets the world and the banner
   * resets with it, for free.
   *
   * Sized in *screen* pixels rather than world pixels, and at an integer scale.
   * A banner that shrank when the player zoomed out would be reading the wrong
   * units, and a fractional scale on a hand-plotted serif turns its 2px stems
   * into a grey smear.
   */
  private drawPhaseBanner(world: World): void {
    if (world.phase === Phase.Playing) return;
    const lines = world.phase === Phase.Won ? ['PHASE', 'COMPLETE'] : ['MISSION', 'FAILED'];

    const ctx = this.ctx;
    const { width, height } = ctx.canvas;
    const sprites = lines.map((line) => bigTextSprite(line));
    const widest = Math.max(...sprites.map((s) => s.width));
    const scale = Math.max(1, Math.floor((width * CONFIG.banner.fill) / widest));

    const lineGap = 2 * scale;
    const totalH = sprites.reduce((h, s) => h + s.height * scale, 0) + lineGap * (sprites.length - 1);

    // Eased out, so it arrives fast and stops rather than drifting in. It
    // starts wholly below the frame: the rise is what makes it an event.
    const t = Math.min(1, world.phaseTime / CONFIG.banner.rise);
    const eased = 1 - (1 - t) ** 3;
    const restY = Math.round((height - totalH) / 2);
    const y0 = Math.round(restY + (height - restY) * (1 - eased));

    let y = y0;
    for (const sprite of sprites) {
      const w = sprite.width * scale;
      const h = sprite.height * scale;
      ctx.drawImage(sprite, Math.round((width - w) / 2), y, w, h);
      y += h + lineGap;
    }
  }

  /**
   * The grenade reticle and the fire cone.
   *
   * The original expressed both as modifier keys and drew neither, which works
   * when you have three mouse buttons and can see the cursor. Everything here
   * exists because a thumb has neither: where it will land, who is throwing it,
   * how far the blast reaches, and whether that blast has one of your own men
   * inside it.
   */
  private drawAim(world: World, aim: Aim, zoom: number): void {
    if (aim.mode === 'idle') return;
    const ctx = this.ctx;
    /** One CSS pixel, in world units. Keeps the chrome a constant real size. */
    const px = 1 / zoom;

    if (aim.mode === 'fire') {
      // A crosshair, and nothing else.
      //
      // There used to be a translucent cone thrown from the squad toward the
      // cursor -- a torch beam, added when the touch controls needed to make
      // manual fire visible. It is soft-edged alpha in a frame that has neither,
      // and no gun in this game emits light down its line of fire. What the
      // player actually needs to know is where the rounds are going, which the
      // crosshair says on its own.
      if (!squadCentre(world)) return;
      this.crosshair(aim.point, 7 * px, px, '#ffe9a0');
      return;
    }

    if (!aim.placed) return;
    const hot = aim.friendly || aim.blocked;
    const ink = hot ? '#ff6a48' : aim.clamped ? '#d8a13c' : '#c8e070';

    // The blast, to scale. Dithered rather than filled: an alpha disc is the
    // one thing in this renderer that would read as belonging to another game.
    this.ring(aim.point, CONFIG.grenade.blastRadius, px, ink, hot);

    if (aim.thrower) {
      // The arc, from the man who will actually throw -- who is also ringed, so
      // "whoever is nearest" stops being invisible logic.
      this.throwArc(aim.thrower.pos, aim.point, px, ink);
      ctx.strokeStyle = ink;
      ctx.lineWidth = px;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(aim.thrower.pos.x, aim.thrower.pos.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.crosshair(aim.point, 9 * px, px, ink);
  }

  /** A dotted parabola along the throw, sampled from the flight the sim uses. */
  private throwArc(from: Vec2, to: Vec2, px: number, ink: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.7;
    const steps = 14;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t - grenadeArc(t);
      const s = Math.max(1, Math.round(1.5 * px));
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A ring of hard dots. `urgent` doubles the density, which is what makes a
   * blast that would catch your own squad read as a warning rather than as a
   * slightly different colour -- and colour alone is not something to hang a
   * squad on.
   */
  private ring(at: Vec2, radius: number, px: number, ink: string, urgent: boolean): void {
    const ctx = this.ctx;
    const step = urgent ? 0.12 : 0.24;
    const size = Math.max(1, Math.round(px));
    ctx.fillStyle = ink;
    ctx.globalAlpha = urgent ? 0.95 : 0.7;
    for (let a = 0; a < Math.PI * 2; a += step) {
      ctx.fillRect(
        Math.round(at.x + Math.cos(a) * radius),
        Math.round(at.y + Math.sin(a) * radius),
        size, size,
      );
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A circle made of pixels, never of an arc.
   *
   * `ctx.arc` produces an anti-aliased curve, which is the one thing this
   * renderer cannot contain: every edge elsewhere is hard, so a soft one reads
   * instantly as belonging to a different game. Dots are stepped by arc length
   * rather than by angle, so spacing stays constant as the radius grows, and
   * each is nudged a pixel by a hash of its own angle so the front is ragged
   * instead of drawn with a compass.
   */
  private shockRing(at: Vec2, radius: number, ink: string): void {
    if (radius < 1) return;
    const ctx = this.ctx;
    ctx.fillStyle = ink;
    // Wider means thinner: a shock front spreads its debris, it does not
    // manufacture more of it.
    const step = Math.max(0.1, 2.6 / radius);
    let i = 0;
    for (let a = 0; a < Math.PI * 2; a += step, i++) {
      // Deterministic scatter: the same dot stays put between frames.
      const h = Math.sin(i * 12.9898) * 43758.5453;
      const jitter = ((h - Math.floor(h)) * 3 - 1) | 0;
      const r = radius + jitter;
      ctx.fillRect(Math.round(at.x + Math.cos(a) * r), Math.round(at.y + Math.sin(a) * r), 1, 1);
    }
  }

  private crosshair(at: Vec2, arm: number, px: number, ink: string): void {
    const ctx = this.ctx;
    const w = Math.max(1, px);
    const gap = arm * 0.4;
    ctx.fillStyle = ink;
    ctx.fillRect(Math.round(at.x - arm), Math.round(at.y), Math.round(arm - gap), w);
    ctx.fillRect(Math.round(at.x + gap), Math.round(at.y), Math.round(arm - gap), w);
    ctx.fillRect(Math.round(at.x), Math.round(at.y - arm), w, Math.round(arm - gap));
    ctx.fillRect(Math.round(at.x), Math.round(at.y + gap), w, Math.round(arm - gap));
  }

  /**
   * Arrows at the edge for threats and objectives that are off-screen.
   *
   * Not a nicety. A phone in landscape shows about 195 world pixels of height
   * and a sniper's range is 190, so a sniper can engage from just outside the
   * frame -- something that effectively cannot happen on a desktop. Without
   * these the small-screen build is not merely different, it is unfair.
   */
  private drawOffscreen(
    world: World, camera: Camera, zoom: number,
    viewL: number, viewT: number, viewR: number, viewB: number,
  ): void {
    const ctx = this.ctx;
    const px = 1 / zoom;
    /** Inset from the true edge, so an arrow is not half off the screen. */
    const pad = 14 * px;
    const l = viewL + pad;
    const t = viewT + pad;
    const r = viewR - pad;
    const b = viewB - pad;
    const cx = (viewL + viewR) / 2;
    const cy = (viewT + viewB) / 2;

    const mark = (at: Vec2, ink: string, alpha: number): void => {
      // Clamp the target to the edge box, and point the arrow along the line
      // from the middle of the view -- which is where the squad is.
      const x = Math.max(l, Math.min(r, at.x));
      const y = Math.max(t, Math.min(b, at.y));
      const a = Math.atan2(at.y - cy, at.x - cx);
      const size = 7 * px;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
      ctx.lineTo(x + Math.cos(a + 2.5) * size, y + Math.sin(a + 2.5) * size);
      ctx.lineTo(x + Math.cos(a - 2.5) * size, y + Math.sin(a - 2.5) * size);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const outside = (p: Vec2): boolean => p.x < l || p.x > r || p.y < t || p.y > b;

    // Threats: only the ones that can actually see a soldier, and only where
    // the fog would have let you see them anyway. An arrow for an enemy you
    // have no business knowing about would be a cheat, not an accommodation.
    for (const e of world.enemies) {
      if (!e.alive || !outside(e.pos)) continue;
      if (!world.fog.isVisible(e.pos.x, e.pos.y)) continue;
      const d = Math.hypot(e.pos.x - cx, e.pos.y - cy);
      if (d > e.stats.fireRange * 1.35) continue;
      mark(e.pos, ENEMY_INK[e.kind] ?? '#ff6a48', Math.max(0.35, 1 - d / 400));
    }

    // Objectives: the reason a 220-tile map is navigable at phone zoom at all.
    for (const z of world.extraction) if (outside(z)) mark(z, '#8fd44a', 0.75);
    for (const h of world.hostages) {
      if (h.alive && !h.delivered && outside(h.pos)) mark(h.pos, '#8fb0d4', 0.75);
    }
    void camera;
  }

  /** Which baked set a building draws from. Huts follow the mission's theme. */
  private buildingSet(kind: Building['kind'], huts: Sprite[]): Sprite[] {
    // A bunker has no damage stages, so its one sprite answers for all four --
    // including the wreck slot, which it can never reach.
    return kind === 'factory' ? this.atlas.factory
      : kind === 'outpost' ? this.atlas.outpost
        : kind === 'bunker' ? this.bunkerSet
          : huts;
  }

  /** One sprite in all four slots -- a bunker has no damage stages. */
  private readonly bunkerSet: Sprite[] = [this.atlas.bunker, this.atlas.bunker, this.atlas.bunker, this.atlas.bunker];

  private drawScenery(item: SceneryItem, live?: Building): void {
    const ctx = this.ctx;

    // A levelled building swaps to its ruin, which is why buildings are drawn
    // from live state rather than baked into the terrain like everything else.
    if (live) {
      const b = live;
      const set = this.buildingSet(b.kind, this.huts);
      // Wrecked is stage 3; a standing building shows how close it is to it.
      const sprite = set[b.standing ? Math.min(2, b.damageStage) : 3];
      ctx.drawImage(sprite, Math.round(item.x), Math.round(item.y));

      // The roof coming off.
      //
      // The ash-grey ruin was always drawn the instant a building fell, and it
      // read as a recolour rather than as a collapse -- the eye is caught by
      // movement, and there was none. So for the first moment of a ruin's life
      // the intact building is drawn over it, lifting and fading: the roof
      // leaves, and what is underneath is plainly wreckage. No new state, since
      // `ruinAge` is already counted for the smoke.
      if (!b.standing && b.ruinAge < ROOF_LIFT_TIME) {
        const t = b.ruinAge / ROOF_LIFT_TIME;
        // Fast off the mark and slowing, the way a thrown thing leaves.
        const rise = Math.round((1 - (1 - t) * (1 - t)) * ROOF_LIFT_PX);
        ctx.globalAlpha = 1 - t * t;
        ctx.drawImage(set[0], Math.round(item.x), Math.round(item.y) - rise);
        ctx.globalAlpha = 1;
      }
      if (b.standing && b.flash > 0) {
        ctx.globalAlpha = b.flash * 0.5;
        ctx.fillStyle = '#fff6d0';
        ctx.fillRect(Math.round(item.x), Math.round(item.y), sprite.width, sprite.height);
        ctx.globalAlpha = 1;
      }
      // Damage bar, once it has taken a real hit. The sprite carries most of
       // the message; this just gives you the exact number.
      //
      // A building nothing can level still draws one, permanently full. That is
      // the point: an empty space where a bar should be reads as "you have not
      // hit it", and a full bar that never moves reads as "you have, and it did
      // not matter" -- which is the true statement.
      if (b.standing && (b.hp < b.maxHp || b.indestructible)) {
        const w = b.w * 16 - 4;
        const x = Math.round(b.x0 * 16 + 2);
        const y = Math.round(item.y - 4);
        ctx.fillStyle = '#20140c';
        ctx.fillRect(x, y, w, 2);
        ctx.fillStyle = '#d8a13c';
        ctx.fillRect(x, y, Math.max(1, Math.round((w * b.hp) / b.maxHp)), 2);
      }
      return;
    }

    if (item.foliage) {
      // Trunk static, canopy swaying: the tree bends rather than slides.
      ctx.drawImage(item.sprite, Math.round(item.x), Math.round(item.y));
      const sway = this.windOffset(item.x, item.y, item.phase ?? 0);
      ctx.drawImage(
        item.foliage.canopy,
        Math.round(item.x + sway),
        Math.round(item.y + item.foliage.canopyOffsetY),
      );
      return;
    }

    // Grass and tufts sway as a whole; they are short enough to get away with it.
    const sway = item.phase === undefined ? 0 : this.windOffset(item.x, item.y, item.phase);
    ctx.drawImage(item.sprite, Math.round(item.x + sway), Math.round(item.y));
  }

  /**
   * Paints the fog. The mask is rebuilt at tile resolution each frame -- 5k
   * pixels on a big map, which is nothing -- then blitted up to world scale
   * with smoothing on, which turns the tile grid into a soft falloff.
   *
   * Unexplored ground is near-black; ground the squad has seen but is not
   * watching stays dim, so you keep the map you have scouted.
   */
  private drawFog(world: World, sx: number, sy: number, sw: number, sh: number): void {
    const fog = world.fog;
    if (!fog.enabled || sw <= 0 || sh <= 0) return;

    const map = world.map;
    const g = this.fogCtx;
    const img = g.createImageData(map.width, map.height);
    const data = img.data;
    const unexplored = Math.round(CONFIG.fog.unexplored * 255);
    const remembered = Math.round(CONFIG.fog.remembered * 255);

    for (let i = 0; i < fog.visible.length; i++) {
      const o = i * 4;
      data[o] = 6;
      data[o + 1] = 8;
      data[o + 2] = 5;
      data[o + 3] = fog.visible[i] ? 0 : fog.explored[i] ? remembered : unexplored;
    }
    g.putImageData(img, 0, 0);

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this.fogMask,
      sx / map.tile, sy / map.tile, sw / map.tile, sh / map.tile,
      sx, sy, sw, sh,
    );
    ctx.imageSmoothingEnabled = false;
  }

  private drawWaterShimmer(world: World, l: number, t: number, r: number, b: number): void {
    const ctx = this.ctx;
    const size = world.map.tile;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#b9e4f5';
    for (const [tx, ty] of this.waterTiles) {
      const x = tx * size;
      const y = ty * size;
      if (x > r || x + size < l || y > b || y + size < t) continue;
      const phase = (tx * 0.7 + ty * 1.3) % (Math.PI * 2);
      const wob = Math.sin(this.time * 1.6 + phase);
      if (wob > 0.2) ctx.fillRect(x + 3 + ((wob * 3) | 0), y + 4, 4, 1);
      if (wob < -0.3) ctx.fillRect(x + 8 - ((wob * 3) | 0), y + 11, 3, 1);
    }
    ctx.globalAlpha = 1;
  }

  private spritesFor(a: Actor): Sprite[][] {
    const set = a.faction === Faction.Player ? this.atlas.player
      : (a as Enemy).kind === EnemyKind.Sniper ? this.atlas.sniper
        : (a as Enemy).kind === EnemyKind.Bazooka ? this.atlas.bazooka
          : (a as Enemy).kind === EnemyKind.Officer ? this.atlas.officer
            : (a as Enemy).traits?.camo ? this.atlas.camo
              : this.atlas.enemy;
    // Which of the baked men this one is. Keyed to the actor's id, so he keeps
    // the same kit for as long as he is alive and gets it back on a restart.
    return set[a.id % set.length];
  }

  private drawActor(a: Actor, alpha: number): void {
    const x = lerp(a.prev.x, a.pos.x, alpha);
    const y = lerp(a.prev.y, a.pos.y, alpha);
    const celebrating = this.cheerTime >= 0 && a.alive && a.faction === Faction.Player;
    const moving = Math.hypot(a.vel.x, a.vel.y) > 4;
    // Cheering runs the walk cycle on the clock rather than on distance, which
    // is what turns a man standing still into a man moving his arms about.
    const frame = celebrating ? Math.floor(this.cheerTime * 9) % WALK_FRAMES
      : moving ? Math.floor(a.walkPhase / 3.2) % WALK_FRAMES : 0;
    const sprite = this.spritesFor(a)[facingIndex(a.angle)][frame];

    if (!a.alive) { this.drawCollapse(a, sprite, x, y); return; }
    if (a.wounded) { this.drawWounded(a, x, y); return; }
    this.drawFigure(sprite, x, y - (celebrating ? this.hopHeight(a) : 0), this.wadeAt(a));
    this.rankPips(a, x, y);
  }

  /**
   * Rank, over the head of the man who earned it.
   *
   * The chevrons used to sit on every name plate in the sidebar, identical for
   * everyone, which made them decoration. Here they are information you can act
   * on: mid-firefight you can see which of the six has survived nine missions
   * and is worth not spending, and when he dies you watch the marks go with
   * him. A Private gets none -- otherwise it is decoration again.
   *
   * Never drawn on a corpse. A dead man's rank belongs on Boot Hill.
   */
  private rankPips(a: Actor, x: number, y: number): void {
    if (a.faction !== Faction.Player) return;
    const tier = rankTier((a as { rank?: number }).rank ?? 0);
    if (tier < 1) return;

    const ctx = this.ctx;
    // Three is as much as reads at this size; beyond that it is a smear.
    const marks = Math.min(3, tier);
    const top = Math.round(y - SOLDIER_ANCHOR.y) - 5;
    const left = Math.round(x) - (marks * 4 - 1) / 2;

    // Actual chevrons, plotted pixel by pixel: a 3x2 V, the smallest shape that
    // still reads as rank rather than as a dash. A dark seat under each keeps
    // them legible over pale sand and snow as well as jungle.
    ctx.fillStyle = '#14140e';
    ctx.fillRect(left - 1, top - 1, marks * 4, 3);
    ctx.fillStyle = tier >= 5 ? '#f0d878' : '#c9d4b8';
    for (let i = 0; i < marks; i++) {
      const cx = left + i * 4;
      ctx.fillRect(cx, top, 1, 1);
      ctx.fillRect(cx + 1, top + 1, 1, 1);
      ctx.fillRect(cx + 2, top, 1, 1);
    }
  }

  /**
   * A man going down, in two frames.
   *
   * The first attempt scaled the standing sprite toward its own feet, and it
   * read as being crushed rather than as falling -- a vertical squash is what
   * happens to a figure under a weight, not one that has been shot. Pixel art
   * has no in-between here: the sprite cannot be rotated without resampling
   * thirteen pixels into mush, and it cannot be squashed without looking
   * flattened. So the death is drawn the way the original does it, as a cut:
   * he buckles where he stood, then he is a body on the ground.
   *
   * The second frame is the very sprite the decal layer is about to stamp, at
   * the very position it will stamp it, so the handover is invisible.
   */
  private drawCollapse(a: Actor, sprite: Sprite, x: number, y: number): void {
    const ctx = this.ctx;
    const p = Math.max(0, Math.min(1, a.deathTime / CONFIG.fx.deathTime));

    if (p < DEATH_BUCKLE) {
      // Hit: he drops at the knees, still on his feet, for a beat.
      const sag = p < DEATH_BUCKLE / 2 ? 1 : 2;
      const drawX = Math.round(x - SOLDIER_ANCHOR.x);
      const drawY = Math.round(y - SOLDIER_ANCHOR.y) + sag;
      ctx.drawImage(this.silhouette(sprite), drawX + FIGURE_SHADOW.x, drawY + FIGURE_SHADOW.y);
      ctx.drawImage(sprite, drawX, drawY);
      return;
    }

    // Down. Identical to the decal that replaces it a moment later.
    const body = a.faction === Faction.Enemy ? this.atlas.corpseEnemy : this.atlas.corpsePlayer;
    ctx.drawImage(body, Math.round(x - body.width / 2), Math.round(y - body.height + 4));
  }

  /**
   * How far off the ground a celebrating man is.
   *
   * Everybody bobs an inch, out of step with each other so it reads as six men
   * rather than as one animation played six times -- and one of them, the man
   * who has been alive longest, jumps properly. The original picks somebody to
   * leap about while the rest wave, and it is the single detail that makes the
   * moment look like relief instead of a pose.
   */
  private hopHeight(a: Actor): number {
    const t = this.cheerTime;
    if (a.id === this.jumperId) {
      // A real jump, and a pause on the ground between them.
      const cycle = (t * 1.7) % 1;
      return cycle > 0.55 ? 0 : Math.round(Math.sin((cycle / 0.55) * Math.PI) * 6);
    }
    return Math.sin(t * 7 + a.id * 1.3) > 0.4 ? 1 : 0;
  }

  /**
   * A man down but not dead.
   *
   * The hard part is not drawing him, it is telling him apart from a corpse --
   * and there are corpses everywhere by the time this matters. So he is the
   * same body sprite and the difference is that he *moves*: a one-pixel shift
   * on a slow, per-man cycle. Nothing else on a battlefield full of bodies
   * twitches, and the eye finds movement before it finds anything else.
   *
   * A marker floating over him would have been easier and would have been a
   * label on the world rather than a thing in it.
   */
  private drawWounded(a: Actor, x: number, y: number): void {
    const body = this.atlas.corpseEnemy;
    // Keyed on his id so two men lying together are not in step.
    const twitch = Math.sin(this.time * 3.1 + a.id * 1.7) > 0.72 ? 1 : 0;
    this.ctx.drawImage(
      body,
      Math.round(x - body.width / 2) + twitch,
      Math.round(y - body.height + 4),
    );
  }

  /** Which liquid, if any, this actor is standing in. */
  private wadeAt(a: Actor): WadeKind {
    if (!a.wading) return 'none';
    if (a.swimming) return 'deep';
    return tileAt(this.map, Math.floor(a.pos.x / this.map.tile), Math.floor(a.pos.y / this.map.tile)) === Tile.Quicksand
      ? 'mud'
      : 'water';
  }

  private drawHostage(h: Hostage, alpha: number): void {
    const x = lerp(h.prev.x, h.pos.x, alpha);
    const y = lerp(h.prev.y, h.pos.y, alpha);
    const moving = Math.hypot(h.vel.x, h.vel.y) > 4;
    const frame = moving ? Math.floor(h.walkPhase / 3.2) % WALK_FRAMES : 0;
    this.drawFigure(this.atlas.hostage[h.id % this.atlas.hostage.length][facingIndex(h.angle)][frame], x, y, 'none');

    // A marker over anyone still waiting to be freed.
    if (!h.freed) {
      const ctx = this.ctx;
      const bob = Math.sin(this.time * 3) * 1.5;
      ctx.fillStyle = '#f2e9a0';
      ctx.fillRect(Math.round(x), Math.round(y - 19 + bob), 1, 4);
      ctx.fillRect(Math.round(x), Math.round(y - 14 + bob), 1, 1);
    }
  }

  /**
   * A man, and how much of him is above the surface.
   *
   * Deep water used to be a translucent blue bar painted across his legs, which
   * read as a fence he was standing behind. The original sinks him instead: you
   * see head and shoulders and a wake, and the reason wading is dangerous --
   * that he is slow and cannot shoot -- is legible from the picture alone. Mud
   * takes him to the waist, in its own colour, because a brown hazard drawn in
   * water blue is just a bug with a good excuse.
   *
   * Drawn by clipping the sprite rather than covering it, so there is no alpha
   * anywhere and the waterline stays a hard pixel edge.
   */
  private drawFigure(sprite: Sprite, x: number, y: number, wade: WadeKind): void {
    const ctx = this.ctx;
    const drawY = Math.round(y - SOLDIER_ANCHOR.y);
    const drawX = Math.round(x - SOLDIER_ANCHOR.x);

    if (wade === 'none') {
      // The shadow is the figure itself, drawn solid black and offset — the way
      // the original does it, and the reason its men sit on the ground rather
      // than hovering over it. A translucent ellipse under the feet is both an
      // effect the hardware could not produce and much too timid: at this size a
      // soldier's shadow is nearly as big as the soldier.
      ctx.drawImage(
        this.silhouette(sprite),
        drawX + FIGURE_SHADOW.x,
        drawY + FIGURE_SHADOW.y,
      );
      ctx.drawImage(sprite, drawX, drawY);
      return;
    }

    // No shadow in the water: it would be cast on a surface he is under.
    const { visible, line, foam } = WADE[wade];
    ctx.drawImage(sprite, 0, 0, sprite.width, visible, drawX, drawY, sprite.width, visible);

    // The surface closing around him, and the wake it makes.
    ctx.fillStyle = line;
    ctx.fillRect(drawX, drawY + visible, sprite.width, 1);
    ctx.fillStyle = foam;
    ctx.fillRect(drawX + 1, drawY + visible - 1, sprite.width - 2, 1);
    const swell = Math.round(Math.sin(this.time * 4 + x * 0.3));
    ctx.fillRect(drawX + 3 + swell, drawY + visible + 1, sprite.width - 6, 1);
  }

  /**
   * Floating pickup labels: badge, then text, rising and fading.
   *
   * The rise eases out and the fade is held off until the last third, so the
   * label is at full strength for long enough to read and then gets out of the
   * way. Positions are snapped to whole world pixels -- at 3x zoom a half-pixel
   * offset is what turns a 3px letter into mush.
   */
  private drawPopups(world: World): void {
    const ctx = this.ctx;
    for (const p of world.fx.popups) {
      const t = 1 - p.life / p.maxLife;
      const rise = CONFIG.fx.popupRise * (1 - (1 - t) * (1 - t));
      const icon = p.icon ? this.atlas.icons[p.icon] : null;
      const label = textSprite(p.text, p.color);
      const w = label.width + (icon ? icon.width + 1 : 0);
      const x = Math.round(p.pos.x - w / 2);
      const y = Math.round(p.pos.y - rise);

      // A pop on arrival, then steady, then out.
      ctx.globalAlpha = t < 0.08 ? t / 0.08 : t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
      if (icon) {
        ctx.drawImage(icon, x, y - Math.round((icon.height - label.height) / 2));
        ctx.drawImage(label, x + icon.width + 1, y);
      } else {
        ctx.drawImage(label, x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * A solid black copy of a sprite, cached. Cheaper than it looks: there are a
   * few hundred unit sprites in the atlas and each is thirteen pixels wide.
   */
  private silhouette(sprite: Sprite): Sprite {
    let found = this.silhouettes.get(sprite);
    if (found) return found;
    found = document.createElement('canvas');
    found.width = sprite.width;
    found.height = sprite.height;
    const g = found.getContext('2d')!;
    g.drawImage(sprite, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000000';
    g.fillRect(0, 0, found.width, found.height);
    // Solid, and deliberately not dithered.
    //
    // Dithering it seemed like the right call -- it keeps the shadow from
    // doubling the figure's visual mass -- but a checkered copy of a sprite that
    // already has thin legs and thinner arms produces a ragged fringe of dark
    // spikes all round the lower body, and six of those in a clearing look like
    // spiders. A shadow has to be one clean shape or it stops reading as one.
    this.silhouettes.set(sprite, found);
    return found;
  }

  /**
   * Supply boxes, for a `collect` mission.
   *
   * Drawn with a hard rectangular shadow and no alpha, unlike `drawCrates`
   * above -- the soft ellipse there predates the visual laws and is on the
   * standing list of breaches, and copying it to make a new object match would
   * be spreading the bug rather than matching a style.
   */
  private drawSupplies(world: World): void {
    const ctx = this.ctx;
    const sprite = this.atlas.supply;
    for (const box of world.supplies) {
      if (!box.alive || box.collected) continue;
      const x = Math.round(box.pos.x - sprite.width / 2);
      const y = Math.round(box.pos.y - sprite.height + 3);
      ctx.fillStyle = '#1b2a12';
      ctx.fillRect(x + 1, Math.round(box.pos.y) + 1, sprite.width - 2, 2);
      ctx.drawImage(sprite, x, y);
    }
  }

  private drawCrates(world: World): void {
    const ctx = this.ctx;
    for (const c of world.crates) {
      if (!c.alive) continue;
      const sprite = c.barrel ? this.atlas.barrel : this.atlas.crate;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#0d1a08';
      ctx.beginPath();
      ctx.ellipse(c.pos.x, c.pos.y + 3, 5.5, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(sprite, Math.round(c.pos.x - sprite.width / 2), Math.round(c.pos.y - sprite.height + 3));
      if (!c.barrel) {
        // A soft pulse so crates are findable in dense jungle.
        ctx.globalAlpha = 0.25 + Math.sin(this.time * 3) * 0.15;
        ctx.fillStyle = '#ffe27a';
        ctx.fillRect(Math.round(c.pos.x - 2), Math.round(c.pos.y - sprite.height + 1), 4, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * Mines, drawn from the start of the mission.
   *
   * They used to be invisible until stepped on, which made a minefield play
   * exactly like open ground until somebody died in it -- no decision, no
   * skill, just an ambush you could not have seen. Visible, the same map
   * becomes a question about where the lane is.
   */
  private drawMines(world: World): void {
    const ctx = this.ctx;
    for (const m of world.mines) {
      if (!m.alive) continue;
      const sprite = this.atlas.mine;
      ctx.drawImage(sprite, Math.round(m.pos.x - sprite.width / 2), Math.round(m.pos.y - sprite.height + 2));
      if (m.fuse < 0) continue;

      /*
       * The fuse, drawn as a shock front rather than a circle.
       *
       * This was `ctx.arc` with a fading alpha: a geometrically perfect,
       * anti-aliased, semi-transparent hoop expanding out of a mine, in a game
       * whose every other pixel is placed on a whole coordinate. It was the
       * single most out-of-period thing on the screen, and it appeared at the
       * exact moment the player was looking hardest.
       *
       * Now it is discrete pixels flung outward on the circle, jittered so the
       * front is ragged, thinning as it widens the way debris does; and the
       * blink is a hard on/off rather than a sine fade, because a CRT-era
       * warning either lit or it did not.
       */
      const burn = 1 - m.fuse / CONFIG.mine.fuse;
      const lit = Math.floor(this.time * 18) % 2 === 0;
      this.shockRing(m.pos, CONFIG.mine.blastRadius * burn, lit ? '#ffb03a' : '#c8352a');

      // The trigger itself, lighting up under the man standing on it.
      ctx.fillStyle = lit ? '#ffd08a' : '#ff5a3c';
      ctx.fillRect(Math.round(m.pos.x) - 1, Math.round(m.pos.y) - 4, 2, 1);
    }
  }

  private drawExtractionZones(world: World): void {
    if (world.extraction.length === 0) return;
    const ctx = this.ctx;
    /*
     * The zone, as marks on the ground rather than as a stroked circle.
     *
     * It was `ctx.arc` with a hairline stroke and a pulsing `globalAlpha` --
     * three prohibitions in four lines, and the reason it was on
     * `/pixel-check`'s worklist. It is also the thing a `hold` mission asks you
     * to stand in for forty-five seconds, so it is looked at longer than almost
     * anything else in the game.
     *
     * Kept as a circle, because the original's own aim marker is one. What
     * changes is that every pixel is placed: a dashed ring of whole pixels,
     * marching slowly round, with four corner ticks that say which ground is
     * meant rather than merely enclosing it. The pulse is a *tone* change
     * between two solid colours instead of an alpha ramp -- the same bargain
     * the dither makes everywhere else.
     */
    const lit = Math.sin(this.time * 2.4) > 0;
    for (const z of world.extraction) {
      // The drawn ring is the real one: a zone on a tent counts from the tent's
      // edge, so a circle at the bare radius would picture a rule the game is
      // not playing by.
      const r = z.pad + CONFIG.extraction.radius;
      const cx = Math.round(z.x);
      const cy = Math.round(z.y);

      // Dashes, marching. `step` keeps the dash length even at any radius.
      const step = 2.2 / r;
      const drift = this.time * 0.6;
      let i = 0;
      for (let a = 0; a < Math.PI * 2; a += step, i++) {
        // Three on, two off, moving round the ring about a fifth of a turn a
        // second -- slow enough to read as a marker rather than as a warning.
        if ((i + Math.floor(drift * 8)) % 5 >= 3) continue;
        ctx.fillStyle = lit ? '#8fe0ff' : '#4c8ba8';
        ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
      }

      // Four ticks pointing in, on the axes: they turn a ring into a target.
      ctx.fillStyle = lit ? '#bff0ff' : '#5fa3c0';
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
        for (let k = 0; k < 4; k++) {
          ctx.fillRect(cx + dx * (r - k) - (dy ? 0 : 0), cy + dy * (r - k), 1, 1);
        }
      }
    }
  }

  /** Brackets around the enemy or building the squad has been ordered onto. */
  private drawTargetMarkers(world: World, alpha: number): void {
    const ctx = this.ctx;
    const brackets = (x: number, y: number, r: number, color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.moveTo(x + sx * r, y + sy * r - sy * 3);
        ctx.lineTo(x + sx * r, y + sy * r);
        ctx.lineTo(x + sx * r - sx * 3, y + sy * r);
      }
      ctx.stroke();
    };

    const t = world.squadTarget;
    if (t?.alive) {
      brackets(
        lerp(t.prev.x, t.pos.x, alpha),
        lerp(t.prev.y, t.pos.y, alpha) - 6,
        8 + Math.sin(this.time * 7) * 0.8,
        '#ff5a3c',
      );
    }
    const b = world.targetBuilding;
    if (b?.standing) brackets(b.centre.x, b.centre.y, b.w * 8 + 3, '#ff8b3c');
  }

  private drawBullets(world: World): void {
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    for (const b of world.bullets) {
      if (b.blast > 0) {
        // Rockets get a smoke trail so you can see one coming and scatter.
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#8d8478';
        ctx.fillRect(Math.round(b.pos.x - b.vel.x * 0.03), Math.round(b.pos.y - b.vel.y * 0.03), 2, 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffd36a';
        ctx.fillRect(Math.round(b.pos.x - 1), Math.round(b.pos.y - 1), 3, 3);
        continue;
      }
      const tx = b.pos.x - b.vel.x * 0.012;
      const ty = b.pos.y - b.vel.y * 0.012;
      ctx.strokeStyle = b.faction === Faction.Player ? '#fff3b0' : '#ffb27a';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.pos.x, b.pos.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(Math.round(b.pos.x), Math.round(b.pos.y), 1, 1);
    }
  }

  private drawGrenades(world: World, alpha: number): void {
    const ctx = this.ctx;
    for (const g of world.grenades) {
      const x = lerp(g.prev.x, g.pos.x, alpha);
      const y = lerp(g.prev.y, g.pos.y, alpha);
      const h = grenadeArc(g.t);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#0d1a08';
      ctx.beginPath();
      ctx.ellipse(x, y, 2.5, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3f4a35';
      ctx.fillRect(Math.round(x - 1), Math.round(y - h - 2), 3, 3);
      ctx.fillStyle = '#c9d4b8';
      ctx.fillRect(Math.round(x), Math.round(y - h - 3), 1, 1);
    }
  }

  private drawParticles(world: World): void {
    const ctx = this.ctx;
    for (const p of world.fx.particles) {
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife + 0.25);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.pos.x), Math.round(p.pos.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawMuzzleFlashes(world: World): void {
    const ctx = this.ctx;
    const sprite = this.atlas.muzzle;
    for (const f of world.fx.flashes) {
      ctx.drawImage(sprite, Math.round(f.pos.x - 3), Math.round(f.pos.y - 3));
    }
  }

  /** Expanding ring where the last order was given. */
  private drawOrderMarker(world: World): void {
    if (!world.orderGoal || world.orderMarker <= 0) return;
    const ctx = this.ctx;
    const t = 1 - world.orderMarker / 0.6;
    ctx.strokeStyle = world.squadTarget || world.targetBuilding ? '#ff5a3c' : '#d8f0b0';
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(world.orderGoal.x, world.orderGoal.y, 3 + t * 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
