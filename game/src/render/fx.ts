import { CONFIG } from '../config.js';
import type { Particle, Vec2 } from '../types.js';

/**
 * Short-lived visual noise: muzzle flashes, blood, explosions and tracers.
 * Blood and corpses are handed to a persistent decal layer instead of being
 * simulated forever -- the original left the battlefield marked, and it costs
 * nothing once burnt in.
 */

export interface Flash {
  pos: Vec2;
  angle: number;
  life: number;
}

/** Who a corpse decal belonged to, which picks its palette. */
export type CorpseKind = 'player' | 'enemy' | 'hostage';

/** A request to stamp something permanent onto the decal canvas. */
export interface Decal {
  kind: 'blood' | 'corpse' | 'scorch';
  pos: Vec2;
  /** Corpse only. */
  who?: CorpseKind;
  seed: number;
}

/** Which badge a floating label carries. */
export type PopupIcon = 'grenade' | 'hostage';

/**
 * A label that floats off something you just collected. The HUD counter tells
 * you what you now have; this tells you what you just got, where you got it,
 * which is the half the sidebar cannot do while your eyes are on the squad.
 */
export interface Popup {
  /** Where it lifts off from; fixed, so it does not chase the collector. */
  pos: Vec2;
  text: string;
  color: string;
  icon: PopupIcon | null;
  life: number;
  maxLife: number;
}

export class Fx {
  particles: Particle[] = [];
  flashes: Flash[] = [];
  popups: Popup[] = [];
  /** Drained by the renderer each frame and burnt into the decal layer. */
  pendingDecals: Decal[] = [];

  step(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].life -= dt;
      if (this.popups[i].life <= 0) this.popups.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      // Drag, so debris settles rather than sliding away. Smoke keeps rising
      // instead, which is what separates a plume from a shower of dirt.
      if (p.maxLife > 2) {
        p.vel.x *= Math.exp(-0.7 * dt);
        p.vel.y = Math.max(-34, p.vel.y - 6 * dt);
      } else {
        const drag = Math.exp(-5.5 * dt);
        p.vel.x *= drag;
        p.vel.y *= drag;
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
  }

  muzzle(pos: Vec2, angle: number): void {
    this.flashes.push({ pos: { ...pos }, angle, life: 0.055 });
  }

  /**
   * Announces a collection at the spot it happened. Two crates opened at once
   * would otherwise print on top of each other, so a new label stacks above any
   * it would land on rather than fighting it for the same pixels.
   */
  popup(pos: Vec2, text: string, color: string, icon: PopupIcon | null = null): void {
    let y = pos.y;
    for (const p of this.popups) {
      if (Math.abs(p.pos.x - pos.x) < 40 && Math.abs(p.pos.y - y) < 9) y = p.pos.y - 9;
    }
    this.popups.push({
      pos: { x: pos.x, y },
      text,
      color,
      icon,
      life: CONFIG.fx.popupLife,
      maxLife: CONFIG.fx.popupLife,
    });
  }

  /** The little shower of light that says something was taken, not destroyed. */
  sparkle(pos: Vec2, color: string): void {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 16 + Math.random() * 42;
      this.particles.push({
        pos: { x: pos.x, y: pos.y - 2 },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed - 24 },
        life: 0.22 + Math.random() * 0.3,
        maxLife: 0.55,
        color: Math.random() < 0.45 ? '#fffbe0' : color,
        size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  blood(pos: Vec2): void {
    const n = CONFIG.fx.bloodParticles;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 62;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
        life: 0.25 + Math.random() * 0.4,
        maxLife: 0.65,
        color: Math.random() < 0.35 ? '#a51f14' : '#d63a22',
        size: Math.random() < 0.3 ? 2 : 1,
      });
    }
    if (CONFIG.fx.decals) {
      this.pendingDecals.push({ kind: 'blood', pos: { ...pos }, seed: (Math.random() * 1e9) | 0 });
    }
  }

  corpse(pos: Vec2, who: CorpseKind): void {
    if (!CONFIG.fx.decals) return;
    this.pendingDecals.push({ kind: 'corpse', pos: { ...pos }, who, seed: (Math.random() * 1e9) | 0 });
  }

  explosion(pos: Vec2): void {
    const n = CONFIG.fx.explosionParticles;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 170;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
        life: 0.3 + Math.random() * 0.55,
        maxLife: 0.85,
        color: ['#fff3c4', '#ffc93c', '#ff7a1a', '#8a3b12', '#453026'][(Math.random() * 5) | 0],
        size: Math.random() < 0.4 ? 2 : 1,
      });
    }
    this.flashes.push({ pos: { ...pos }, angle: 0, life: 0.09 });
    if (CONFIG.fx.decals) {
      this.pendingDecals.push({ kind: 'scorch', pos: { ...pos }, seed: (Math.random() * 1e9) | 0 });
    }
  }

  /**
   * A round that hit a building and did not matter.
   *
   * A rifle does 1 damage to a hut's 60, which is the design -- rifles are not
   * how you level a building -- but on screen it was indistinguishable from
   * doing nothing at all: the same white flash as a real hit, and a damage bar
   * moving by a sixtieth of its width, which is under half a pixel. Players
   * reported the huts as invulnerable, and they were describing what they could
   * see accurately.
   *
   * So a scratch gets its own answer: chips thrown back off the wall, along the
   * direction the round came in rather than in a ring. It reads as a ricochet,
   * which is the true statement -- you hit it, and it did not care.
   */
  spall(pos: Vec2, from: Vec2): void {
    // Back the way it came, so the shower leans toward the shooter.
    const away = Math.atan2(pos.y - from.y, pos.x - from.x) + Math.PI;
    for (let i = 0; i < 7; i++) {
      const a = away + (Math.random() - 0.5) * 1.5;
      const speed = 26 + Math.random() * 54;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed - 10 },
        life: 0.14 + Math.random() * 0.2,
        maxLife: 0.34,
        color: Math.random() < 0.3 ? '#fff2c4' : '#9a8c6d',
        size: 1,
      });
    }
  }

  /** Chips of bark or dust where a round strikes scenery. */
  impact(pos: Vec2): void {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 12 + Math.random() * 40;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
        life: 0.1 + Math.random() * 0.18,
        maxLife: 0.28,
        color: '#d9cfa8',
        size: 1,
      });
    }
  }

  /**
   * Smoke off a burning or wrecked building. Drifts up and thins out, so a
   * levelled hut reads as destroyed from anywhere on the map.
   */
  smoke(pos: Vec2, heat: number): void {
    const dark = Math.random() < heat * 0.6;
    this.particles.push({
      pos: { x: pos.x + (Math.random() - 0.5) * 4, y: pos.y },
      vel: { x: (Math.random() - 0.5) * 9, y: -14 - Math.random() * 16 * heat },
      life: 0.9 + Math.random() * 1.5,
      maxLife: 2.4,
      color: dark ? '#3a3630' : Math.random() < 0.5 ? '#6b6459' : '#8d867a',
      size: Math.random() < 0.55 ? 2 : 1,
    });
    // The odd ember while it is still burning hard.
    if (heat > 0.5 && Math.random() < 0.2) {
      this.particles.push({
        pos: { x: pos.x, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 22, y: -30 - Math.random() * 24 },
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.7,
        color: Math.random() < 0.5 ? '#ffb43c' : '#ff7a1a',
        size: 1,
      });
    }
  }

  /** Rings on the surface when someone wades through the river. */
  /**
   * Someone wading. `thick` is mud rather than water, and it is not a recolour.
   *
   * This threw pale blue droplets whatever you were standing in, so crossing a
   * quicksand flat sprayed water -- the one place mud borrowed the water's
   * idiom and should not have. Mud is heavier: fewer clods, thrown lower and
   * dying sooner, so they land rather than mist.
   */
  splash(pos: Vec2, thick = false): void {
    for (let i = 0; i < (thick ? 2 : 3); i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = thick ? 8 : 14;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed - (thick ? 6 : 0) },
        life: thick ? 0.12 + Math.random() * 0.14 : 0.18 + Math.random() * 0.2,
        maxLife: thick ? 0.26 : 0.38,
        color: thick ? (Math.random() < 0.4 ? '#a89355' : '#6b5c30') : '#9fd8ef',
        size: 1,
      });
    }
  }
}
