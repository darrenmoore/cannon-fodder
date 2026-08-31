import { CONFIG } from './config.js';
import { grenadeArc } from './combat.js';
import { lerp } from './loop.js';
import { tileAt } from './map.js';
import { buildAtlas, facingIndex, SOLDIER_ANCHOR, WALK_FRAMES } from './sprites.js';
import { bakeCanopy } from './canopy.js';
import { paintGround } from './ground.js';
import { textSprite } from './pixelfont.js';
import { threshAt } from './palette.js';
import { analyseTerrain } from './terrain.js';
import { TILES, Tile } from './tiles.js';
import { EnemyKind, Faction } from './types.js';
import type { Camera } from './camera.js';
import type { GameMap } from './map.js';
import type { Atlas, Foliage, Sprite } from './sprites.js';
import type { TerrainInfo } from './terrain.js';
import type { Actor, Building, Enemy, Hostage } from './types.js';
import type { World } from './world.js';

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
  /** Buildings redraw as ruins once levelled, so they are looked up live. */
  building?: Building;
}

interface DrawItem {
  sortY: number;
  scenery?: SceneryItem;
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
  /** Solid-black copies of sprites, for drop shadows. Built on first use. */
  private readonly silhouettes = new Map<Sprite, Sprite>();
  private decals!: HTMLCanvasElement;
  private decalCtx!: CanvasRenderingContext2D;
  private scenery: SceneryItem[] = [];
  /** Water tile coordinates, for the animated shimmer pass. */
  private waterTiles: Array<[number, number]> = [];
  private drawList: DrawItem[] = [];
  /** One pixel per tile; scaled up with smoothing on for soft-edged fog. */
  private fogMask!: HTMLCanvasElement;
  private fogCtx!: CanvasRenderingContext2D;
  private time = 0;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  /** Rebuilds the baked layers. Called once per map, not per restart. */
  prepare(map: GameMap, world: World): void {
    this.terrain = document.createElement('canvas');
    this.terrain.width = map.pixelWidth;
    this.terrain.height = map.pixelHeight;
    const g = this.terrain.getContext('2d')!;
    g.imageSmoothingEnabled = false;

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
      const sprite = (b.kind === 'factory' ? this.atlas.factory : huts)[0];
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
        building: b,
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

  draw(world: World, camera: Camera, alpha: number, dtSinceLastFrame: number): void {
    this.time += dtSinceLastFrame;
    this.flushDecals(world);

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
    for (const item of this.scenery) {
      if (item.x > viewR + 8 || item.x + item.sprite.width < viewL - 8) continue;
      if (item.y > viewB + 8 || item.y + item.sprite.height < viewT - 20) continue;
      this.drawList.push({ sortY: item.sortY, scenery: item });
    }
    for (const a of world.actors) {
      if (!a.alive) continue;
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
      if (item.scenery) this.drawScenery(item.scenery);
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawScenery(item: SceneryItem): void {
    const ctx = this.ctx;

    // A levelled building swaps to its ruin, which is why buildings are drawn
    // from live state rather than baked into the terrain like everything else.
    if (item.building) {
      const b = item.building;
      const set = b.kind === 'factory' ? this.atlas.factory : this.huts;
      // Wrecked is stage 3; a standing building shows how close it is to it.
      const sprite = set[b.standing ? Math.min(2, b.damageStage) : 3];
      ctx.drawImage(sprite, Math.round(item.x), Math.round(item.y));
      if (b.standing && b.flash > 0) {
        ctx.globalAlpha = b.flash * 0.5;
        ctx.fillStyle = '#fff6d0';
        ctx.fillRect(Math.round(item.x), Math.round(item.y), sprite.width, sprite.height);
        ctx.globalAlpha = 1;
      }
      // Damage bar, once it has taken a real hit. The sprite carries most of
       // the message; this just gives you the exact number.
      if (b.standing && b.hp < b.maxHp) {
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
          : this.atlas.enemy;
    // Which of the baked men this one is. Keyed to the actor's id, so he keeps
    // the same kit for as long as he is alive and gets it back on a restart.
    return set[a.id % set.length];
  }

  private drawActor(a: Actor, alpha: number): void {
    const x = lerp(a.prev.x, a.pos.x, alpha);
    const y = lerp(a.prev.y, a.pos.y, alpha);
    const moving = Math.hypot(a.vel.x, a.vel.y) > 4;
    const frame = moving ? Math.floor(a.walkPhase / 3.2) % WALK_FRAMES : 0;
    this.drawFigure(this.spritesFor(a)[facingIndex(a.angle)][frame], x, y, a.wading);
  }

  private drawHostage(h: Hostage, alpha: number): void {
    const x = lerp(h.prev.x, h.pos.x, alpha);
    const y = lerp(h.prev.y, h.pos.y, alpha);
    const moving = Math.hypot(h.vel.x, h.vel.y) > 4;
    const frame = moving ? Math.floor(h.walkPhase / 3.2) % WALK_FRAMES : 0;
    this.drawFigure(this.atlas.hostage[h.id % this.atlas.hostage.length][facingIndex(h.angle)][frame], x, y, false);

    // A marker over anyone still waiting to be freed.
    if (!h.freed) {
      const ctx = this.ctx;
      const bob = Math.sin(this.time * 3) * 1.5;
      ctx.fillStyle = '#f2e9a0';
      ctx.fillRect(Math.round(x), Math.round(y - 19 + bob), 1, 4);
      ctx.fillRect(Math.round(x), Math.round(y - 14 + bob), 1, 1);
    }
  }

  private drawFigure(sprite: Sprite, x: number, y: number, wading: boolean): void {
    const ctx = this.ctx;
    const drawY = Math.round(y - SOLDIER_ANCHOR.y);

    // The shadow is the figure itself, drawn solid black and offset — the way
    // the original does it, and the reason its men sit on the ground rather
    // than hovering over it. A translucent ellipse under the feet is both an
    // effect the hardware could not produce and much too timid: at this size a
    // soldier's shadow is nearly as big as the soldier.
    ctx.drawImage(
      this.silhouette(sprite),
      Math.round(x - SOLDIER_ANCHOR.x) + FIGURE_SHADOW.x,
      drawY + FIGURE_SHADOW.y,
    );

    ctx.drawImage(sprite, Math.round(x - SOLDIER_ANCHOR.x), drawY);

    if (wading) {
      // Hide the legs and put a ripple at the waterline.
      ctx.fillStyle = '#2f6d92';
      ctx.globalAlpha = 0.72;
      ctx.fillRect(Math.round(x - SOLDIER_ANCHOR.x), drawY + 10, sprite.width, 5);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#9fd8ef';
      ctx.fillRect(Math.round(x - 5), drawY + 10, 10, 1);
      ctx.globalAlpha = 1;
    }
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
    // Three pixels in four, on a checker. Solid black is as visually heavy as
    // the man casting it and the two merge into one blob; dithering keeps the
    // edge hard -- no alpha anywhere -- while letting the ground read through.
    const img = g.getImageData(0, 0, found.width, found.height);
    const data = img.data;
    for (let y = 0; y < found.height; y++) {
      for (let x = 0; x < found.width; x++) {
        if (((x * 3 + y) & 3) === 0) data[(y * found.width + x) * 4 + 3] = 0;
      }
    }
    g.putImageData(img, 0, 0);
    this.silhouettes.set(sprite, found);
    return found;
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

  /** Mines are invisible until triggered -- then a blinking warning. */
  private drawMines(world: World): void {
    const ctx = this.ctx;
    for (const m of world.mines) {
      if (!m.alive || !m.revealed) continue;
      const sprite = this.atlas.mine;
      ctx.drawImage(sprite, Math.round(m.pos.x - sprite.width / 2), Math.round(m.pos.y - sprite.height + 2));
      if (m.fuse >= 0) {
        ctx.globalAlpha = 0.4 + Math.abs(Math.sin(this.time * 24)) * 0.6;
        ctx.strokeStyle = '#ff5a3c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(m.pos.x, m.pos.y, CONFIG.mine.blastRadius * (1 - m.fuse / CONFIG.mine.fuse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawExtractionZones(world: World): void {
    if (world.extraction.length === 0) return;
    const ctx = this.ctx;
    const pulse = 0.4 + Math.sin(this.time * 2.4) * 0.2;
    for (const z of world.extraction) {
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#8fe0ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(z.x, z.y, CONFIG.extraction.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = pulse * 0.4;
      ctx.beginPath();
      ctx.arc(z.x, z.y, CONFIG.extraction.radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
