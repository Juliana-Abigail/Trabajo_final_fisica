"use strict";

const LabModels = (() => {
  function circuit(voltage, series, branches) {
    const sum = items => items.reduce((total, item) => total + item.value, 0);
    const resistances = branches.map(sum);
    const parallel = resistances.length ? 1 / resistances.reduce((total, ohms) => total + 1 / ohms, 0) : 0;
    const equivalent = sum(series) + parallel;
    const current = voltage / equivalent;
    const results = new Map();

    function measure(items, amps) {
      items.forEach(({ id, value }) => {
        results.set(id, { current: amps, voltage: amps * value, power: amps * amps * value });
      });
    }

    measure(series, current);
    branches.forEach((branch, index) => measure(branch, current * parallel / resistances[index]));
    return { equivalent, current, power: voltage * current, results };
  }

  function lorentz({ electric, magnetic, charge, mass, vx, vy, duration }) {
    // mC / g has the same numerical ratio as C / kg.
    const ratio = charge / mass;
    const acceleration = ratio * electric;
    const omega = ratio * magnetic;

    function point(time) {
      const theta = omega * time;
      const small = Math.abs(theta) < 0.02;
      const square = theta ** 2;
      const sinc = small ? 1 - square / 6 + square ** 2 / 120 : Math.sin(theta) / theta;
      const coscOverTheta = small ? 0.5 - square / 24 + square ** 2 / 720 : 2 * (Math.sin(theta / 2) / theta) ** 2;
      const cosc = theta * coscOverTheta;
      const oneMinusSincOverTheta = small ? theta * (1 / 6 - square / 120 + square ** 2 / 5040) : (1 - sinc) / theta;
      return {
        x: time * (vx * sinc + vy * cosc) + acceleration * time ** 2 * oneMinusSincOverTheta,
        y: time * vy * sinc + (acceleration - vx * omega) * time ** 2 * coscOverTheta
      };
    }

    const count = Math.min(3200, Math.max(240, Math.ceil(Math.abs(omega) * duration * 14)));
    const points = Array.from({ length: count + 1 }, (_, index) => point(duration * index / count));
    return { points, point, omega, aliased: Math.abs(omega) * duration * 14 > count };
  }

  function magneticProbe(wire, strength) {
    const distance = 0.2;
    // μ₀/(4π) ≈ 10⁻⁷ T·m/A. Dipole measured on its equatorial plane.
    return wire ? 2e-7 * strength / distance : -1e-7 * strength / distance ** 3;
  }

  return { circuit, lorentz, magneticProbe };
})();
