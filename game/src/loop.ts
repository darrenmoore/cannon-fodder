import { CONFIG } from './config.js';

/**
 * Fixed-timestep simulation with an interpolated render. The sim always
 * advances in equal 1/60s slices -- so steering, collision and fire rates
 * behave identically on any monitor -- while the render draws between the last
 * two states, which is what keeps movement smooth on a 144Hz display.
 */
export function startLoop(step: (dt: number) => void, draw: (alpha: number) => void): () => void {
  const dt = 1 / CONFIG.STEP_HZ;
  let accumulator = 0;
  let last = performance.now();
  let running = true;

  const frame = (now: number): void => {
    if (!running) return;
    requestAnimationFrame(frame);

    // Clamp the delta so a backgrounded tab does not stampede the simulation.
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    accumulator += elapsed;

    let steps = 0;
    while (accumulator >= dt && steps < CONFIG.MAX_STEPS_PER_FRAME) {
      step(dt);
      accumulator -= dt;
      steps++;
    }
    // Whatever we could not simulate this frame is dropped rather than owed.
    if (steps === CONFIG.MAX_STEPS_PER_FRAME) accumulator = 0;

    draw(accumulator / dt);
  };

  requestAnimationFrame(frame);
  return () => { running = false; };
}

/** Linear blend used by the renderer for interpolated positions. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
