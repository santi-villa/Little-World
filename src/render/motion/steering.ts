/**
 * Steering behaviors: matemática pura del movimiento (sin Pixi ni DOM), para
 * poder testearla. Unidades: centímetros y segundos, con el origen arriba a
 * la izquierda del agua (x hacia la derecha, y hacia el fondo).
 */

export interface Vec {
  x: number;
  y: number;
}

/** Lo mínimo que se necesita para mover algo. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rumbo en radianes (0 = derecha, π/2 = hacia el fondo). */
  heading: number;
  /** Ángulo interno del vagabundeo. */
  wanderAngle: number;
}

export interface Limits {
  /** cm/s */
  maxSpeed: number;
  /** cm/s² */
  maxAccel: number;
  /** rad/s */
  maxTurn: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export const length = (x: number, y: number): number => Math.sqrt(x * x + y * y);

function scaled(x: number, y: number, size: number): Vec {
  const l = length(x, y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: (x / l) * size, y: (y / l) * size };
}

/** Diferencia de ángulos llevada a (-π, π]. */
export function angleDiff(to: number, from: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Ir hacia un punto a toda velocidad. Devuelve la velocidad deseada. */
export function seek(body: Body, tx: number, ty: number, speed: number): Vec {
  return scaled(tx - body.x, ty - body.y, speed);
}

/** Ir hacia un punto frenando al acercarse. */
export function arrive(body: Body, tx: number, ty: number, speed: number, slowRadius: number): Vec {
  const dx = tx - body.x;
  const dy = ty - body.y;
  const distance = length(dx, dy);
  if (distance < 1e-6) return { x: 0, y: 0 };
  return scaled(dx, dy, distance < slowRadius ? (speed * distance) / slowRadius : speed);
}

/** Escapar de un punto; con más fuerza cuanto más cerca (nada si está lejos). */
export function flee(body: Body, fx: number, fy: number, speed: number, panicRadius: number): Vec {
  const dx = body.x - fx;
  const dy = body.y - fy;
  const distance = length(dx, dy);
  if (distance >= panicRadius) return { x: 0, y: 0 };
  if (distance < 1e-6) return { x: speed, y: 0 };
  return scaled(dx, dy, speed * (1 - (0.5 * distance) / panicRadius));
}

/** Vagabundeo: el rumbo deriva de a poco. `random` da valores en [0, 1). */
export function wander(body: Body, speed: number, jitter: number, dt: number, random: () => number): Vec {
  body.wanderAngle += (random() - 0.5) * 2 * jitter * dt;
  // Los peces nadan más en horizontal que en vertical.
  return { x: Math.cos(body.wanderAngle) * speed, y: Math.sin(body.wanderAngle) * speed * 0.45 };
}

/** Boids: alejarse de los vecinos que están demasiado cerca. */
export function separation(body: Body, neighbors: readonly Body[], radius: number): Vec {
  let x = 0;
  let y = 0;
  for (const other of neighbors) {
    if (other === body) continue;
    const dx = body.x - other.x;
    const dy = body.y - other.y;
    const distance = length(dx, dy);
    if (distance >= radius) continue;
    if (distance < 1e-6) {
      x += 1;
      continue;
    }
    const push = (radius - distance) / radius;
    x += (dx / distance) * push;
    y += (dy / distance) * push;
  }
  return { x, y };
}

/** Boids: velocidad media de los vecinos. */
export function alignment(body: Body, neighbors: readonly Body[]): Vec {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const other of neighbors) {
    if (other === body) continue;
    x += other.vx;
    y += other.vy;
    count++;
  }
  return count === 0 ? { x: 0, y: 0 } : { x: x / count, y: y / count };
}

/** Boids: vector hacia el centro del grupo. */
export function cohesion(body: Body, neighbors: readonly Body[]): Vec {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const other of neighbors) {
    if (other === body) continue;
    x += other.x;
    y += other.y;
    count++;
  }
  return count === 0 ? { x: 0, y: 0 } : { x: x / count - body.x, y: y / count - body.y };
}

/** Empuje hacia adentro cerca de los vidrios, la superficie y el fondo. */
export function containment(body: Body, bounds: Bounds, margin: number, speed: number): Vec {
  let x = 0;
  let y = 0;
  if (body.x < margin) x = (margin - body.x) / margin;
  else if (body.x > bounds.width - margin) x = -(body.x - (bounds.width - margin)) / margin;
  if (body.y < margin) y = (margin - body.y) / margin;
  else if (body.y > bounds.height - margin) y = -(body.y - (bounds.height - margin)) / margin;
  return { x: x * speed, y: y * speed };
}

/**
 * Avanza un cuerpo hacia la velocidad deseada respetando sus límites:
 * aceleración, giro y velocidad máximos. Después lo deja dentro de la pecera.
 */
export function integrate(
  body: Body,
  desiredVx: number,
  desiredVy: number,
  limits: Limits,
  dt: number,
  bounds?: Bounds,
): void {
  // Aceleración limitada.
  let ax = desiredVx - body.vx;
  let ay = desiredVy - body.vy;
  const want = length(ax, ay);
  const maxDv = limits.maxAccel * dt;
  if (want > maxDv) {
    ax = (ax / want) * maxDv;
    ay = (ay / want) * maxDv;
  }
  let vx = body.vx + ax;
  let vy = body.vy + ay;
  let speed = length(vx, vy);

  // Giro limitado: el rumbo no puede cambiar más rápido que maxTurn.
  if (speed > 1e-4) {
    const target = Math.atan2(vy, vx);
    const turn = angleDiff(target, body.heading);
    const maxTurn = limits.maxTurn * dt;
    if (Math.abs(turn) > maxTurn) {
      body.heading += Math.sign(turn) * maxTurn;
      // Girando fuerte se pierde velocidad.
      speed *= Math.max(0.2, Math.cos(Math.min(Math.PI / 2, Math.abs(turn) - maxTurn)));
    } else {
      body.heading = target;
    }
    body.heading = angleDiff(body.heading, 0);
    if (speed > limits.maxSpeed) speed = limits.maxSpeed;
    vx = Math.cos(body.heading) * speed;
    vy = Math.sin(body.heading) * speed;
  }

  body.vx = vx;
  body.vy = vy;
  body.x += vx * dt;
  body.y += vy * dt;

  if (bounds) {
    if (body.x < 0) {
      body.x = 0;
      if (body.vx < 0) body.vx = 0;
    } else if (body.x > bounds.width) {
      body.x = bounds.width;
      if (body.vx > 0) body.vx = 0;
    }
    if (body.y < 0) {
      body.y = 0;
      if (body.vy < 0) body.vy = 0;
    } else if (body.y > bounds.height) {
      body.y = bounds.height;
      if (body.vy > 0) body.vy = 0;
    }
  }
}
