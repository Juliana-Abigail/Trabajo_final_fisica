"use strict";

const Physics = (() => {
  const K = 8.9875517923e9;
  const EPSILON_0 = 8.8541878128e-12;
  const LIMIT = 5;
  const COLLISION = 0.08;

  function electricAt(charges, x, y, z) {
    let ex = 0, ey = 0, ez = 0, potential = 0;
    for (const charge of charges) {
      if (charge.q === 0) continue;
      const dx = x - charge.x;
      const dy = y - charge.y;
      const dz = z - charge.z;
      const square = dx * dx + dy * dy + dz * dz;
      if (square === 0) return { ex: NaN, ey: NaN, ez: NaN, potential: NaN };
      const voltage = potentialAtDistance(charge.q, Math.sqrt(square));
      const factor = voltage / square;
      potential += voltage;
      ex += dx * factor;
      ey += dy * factor;
      ez += dz * factor;
    }
    return { ex, ey, ez, potential };
  }

  function potentialAtDistance(chargeMicroCoulombs, distance) {
    return K * chargeMicroCoulombs * 1e-6 / distance;
  }

  function potentialOf(charge, x, y, z) {
    if (charge.q === 0) return 0;
    const distance = Math.hypot(x - charge.x, y - charge.y, z - charge.z);
    return distance === 0 ? NaN : potentialAtDistance(charge.q, distance);
  }

  function capacitance(area, gap, relativePermittivity) {
    return EPSILON_0 * relativePermittivity * area * 1e-4 / (gap * 1e-3);
  }

  function energy(capacitanceFarads, voltage) {
    return 0.5 * capacitanceFarads * voltage ** 2;
  }

  function rk4(state, dt, derivative) {
    const offset = (base, rate, time) => base.map((value, i) => value + rate[i] * time);
    const a = derivative(state);
    const b = derivative(offset(state, a, dt / 2));
    const c = derivative(offset(state, b, dt / 2));
    const d = derivative(offset(state, c, dt));
    return state.map((value, i) => value + dt * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
  }

  function trajectory(charges, initial) {
    const sources = initial.q === 0 ? [] : charges.filter(charge => charge.q !== 0);
    const ratio = initial.q * 1e-3 / initial.mass;
    const points = [];
    let state = [initial.x, initial.y, initial.vx, initial.vy];
    let time = 0;
    let reason = "Duración completada";
    function derivative([x, y, vx, vy]) {
      const { ex, ey } = electricAt(sources, x, y, 0);
      return [vx, vy, ratio * ex, ratio * ey];
    }
    for (let step = 0; ; step++) {
      const [x, y, vx, vy] = state;
      points.push({ x, y, speed: Math.hypot(vx, vy), time });
      const nearest = sources.reduce((distance, charge) =>
        Math.min(distance, Math.hypot(x - charge.x, y - charge.y, charge.z)), Infinity);
      if (nearest <= COLLISION + 1e-9) {
        reason = "Se acercó a una carga fuente";
        break;
      }
      if (Math.abs(x) >= LIMIT || Math.abs(y) >= LIMIT) {
        reason = "Llegó al borde del área visible";
        break;
      }
      if (time >= initial.duration) break;
      if (step >= 20000) {
        reason = "Se alcanzó el límite de pasos de la simulación";
        break;
      }
      const [, , ax, ay] = derivative(state);
      const distance = Math.min(0.035, (nearest - COLLISION) / 2);
      const dt = Math.min(
        initial.duration - time,
        1 / 90,
        distance / Math.max(Math.hypot(vx, vy), 1e-9),
        Math.sqrt(2 * distance / Math.max(Math.hypot(ax, ay), 1e-9))
      );
      if (dt < 1e-9) {
        reason = "Se alcanzó la resolución temporal cerca de una carga";
        break;
      }
      state = rk4(state, dt, derivative);
      time += dt;
    }
    return { points, reason };
  }

  return { electricAt, potentialOf, potentialAtDistance, trajectory, capacitance, energy, LIMIT };
})();
