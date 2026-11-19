"use strict";

(() => {
  const select = id => document.getElementById(id);
  const navy = "#0b1423";
  const text = "#b7c9da";
  const teal = "#75ecd4";
  const amber = "#ffd18d";
  const format = new Intl.NumberFormat("es-PE", { maximumSignificantDigits: 5 });
  const scientific = new Intl.NumberFormat("es-PE", { notation: "scientific", maximumSignificantDigits: 4 });
  const number = value => (value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 1e5) ? scientific : format).format(value);
  const tau = 2 * Math.PI;
  const circuitForm = select("circuit-form");
  const ohmForm = select("ohm-form");
  const magneticForm = select("magnetic-form");
  const lorentzForm = select("lorentz-form");
  const resistors = select("resistors");
  const addResistor = select("add-resistor");
  const pause = select("pause-lorentz");
  const lorentzCanvas = select("lorentz-plot");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let nextResistor = 1;
  let trajectory = null;
  let animation = 0;
  let elapsed = 0;
  let started = null;
  let magneticAngle = 0.48;
  let dragX = null;

  function metric(id, title, primary = "", extra = "") {
    const result = select(id);
    result.textContent = title;
    if (primary) {
      const value = document.createElement("strong");
      value.textContent = primary;
      result.append(value, extra);
    }
  }

  function stroke(ctx, points, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  }

  function write(ctx, x, y, label, color = text, size = 15) {
    ctx.fillStyle = color;
    ctx.font = `${size}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(label, x, y);
  }

  function circle(ctx, x, y, radius, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, tau);
    ctx.fill();
  }

  function surface(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  function arrow(ctx, first, second, color) {
    const angle = Math.atan2(second[1] - first[1], second[0] - first[0]);
    const [x, y] = second;
    const side = offset => [x - 8 * Math.cos(angle + offset), y - 8 * Math.sin(angle + offset)];
    stroke(ctx, [side(-.48), second, side(.48)], color, 1.8);
  }

  function resistorDiagram(canvas, series, branches, voltage) {
    const ctx = surface(canvas);
    const left = 61, right = 759, bottom = 278;
    const parallelStart = left + (right - left) * series.length / Math.max(1, series.length + Math.max(0, ...branches.map(branch => branch.length)));
    const top = branches.length ? 143 : 128;
    const startRail = branches.length ? parallelStart : right;
    const wire = "#7492a7";

    function row(items, x1, x2, y) {
      const step = (x2 - x1) / items.length;
      items.forEach((item, index) => {
        const x = x1 + step * (index + .5);
        const half = Math.min(29, step * .28);
        const zigzag = Array.from({ length: 9 }, (_, part) => [
          x - half + half * part / 4,
          y + (!part || part === 8 ? 0 : part % 2 ? -7 : 7)
        ]);
        stroke(ctx, [[x1 + step * index, y], zigzag[0]], wire, 1.8);
        stroke(ctx, zigzag, amber, 2.4);
        stroke(ctx, [zigzag.at(-1), [x1 + step * (index + 1), y]], wire, 1.8);
        write(ctx, x, y - 13, `R${item.id} · ${number(item.value)} Ω`, text, 12);
      });
    }

    stroke(ctx, [[left, top], [left, 208]], wire, 1.8);
    stroke(ctx, [[left - 13, 208], [left + 13, 208]], teal, 2);
    stroke(ctx, [[left - 8, 220], [left + 8, 220]], teal, 2);
    stroke(ctx, [[left, 220], [left, bottom], [right, bottom], [right, top]], wire, 1.8);
    write(ctx, left + 39, 219, `${number(voltage)} V`, teal);
    if (series.length) row(series, left, startRail, top);
    if (branches.length) {
      const spacing = Math.min(56, 180 / Math.max(1, branches.length - 1));
      const from = top - (branches.length - 1) * spacing / 2;
      const to = top + (branches.length - 1) * spacing / 2;
      for (const x of [startRail, right]) {
        stroke(ctx, [[x, from], [x, to]], wire, 1.8);
        circle(ctx, x, top, 3.5, teal);
      }
      branches.forEach((branch, index) => row(branch, startRail, right, from + index * spacing));
    }
  }

  function updateCircuit() {
    const { voltage, topology } = circuitForm.elements;
    const mixed = topology.value === "mixed";
    select("circuit-mixed-note").hidden = !mixed;
    const items = [...resistors.children].map(row => {
      const input = row.querySelector("input");
      const selectBranch = row.querySelector("select");
      selectBranch.parentElement.hidden = !mixed;
      return { id: Number(input.dataset.resistor), value: input.valueAsNumber, branch: Number(selectBranch.value) };
    });
    const series = items.filter(item => topology.value === "series" || (mixed && item.branch === 0));
    const branches = topology.value === "parallel"
      ? items.map(item => [item])
      : mixed ? [1, 2, 3].map(branch => items.filter(item => item.branch === branch)).filter(branch => branch.length) : [];
    const rows = select("circuit-rows");
    rows.replaceChildren();
    const canvas = select("circuit-plot");
    select("circuit-help").textContent = mixed
      ? "Las resistencias de una misma rama se conectan entre sí en serie."
      : "Los resultados cambian al editar la fuente o las resistencias.";
    const valid = circuitForm.checkValidity();
    if (!valid || (mixed && (!series.length || branches.length < 2))) {
      const explanation = !valid
        ? "Completa los valores dentro del rango de cada entrada."
        : "Coloca al menos una resistencia en el tramo en serie y otra en cada una de dos ramas.";
      metric("circuit-total", explanation);
      const ctx = surface(canvas);
      write(ctx, canvas.width / 2, canvas.height / 2, "Configura el circuito para ver el esquema");
      return;
    }
    const result = LabModels.circuit(voltage.valueAsNumber, series, branches);
    resistorDiagram(canvas, series, branches, voltage.valueAsNumber);
    metric("circuit-total", "Resistencia equivalente", `${number(result.equivalent)} Ω`,
      `Corriente total: ${number(result.current)} A · Potencia total: ${number(result.power)} W`);
    for (const item of items) {
      const values = result.results.get(item.id);
      const row = rows.insertRow();
      const heading = document.createElement("th");
      heading.scope = "row";
      heading.textContent = `R${item.id} · ${number(item.value)} Ω`;
      row.append(heading);
      for (const value of [values.current, values.voltage, values.power]) row.insertCell().textContent = number(value);
    }
  }

  function updateResistorButtons() {
    addResistor.disabled = resistors.children.length >= 6;
    resistors.querySelectorAll("button").forEach(button => {
      button.disabled = resistors.children.length <= 2;
    });
  }

  function addResistance(value, branch) {
    const id = nextResistor++;
    const row = document.createElement("div");
    row.className = "resistor-row";
    row.innerHTML = `<label>R${id} (Ω)<input type="number" min="0.01" max="100000000" step="any" data-resistor="${id}" required></label>
      <label>Conexión de R${id}<select><option value="0">Tramo en serie</option><option value="1">Rama A</option>
      <option value="2">Rama B</option><option value="3">Rama C</option></select></label>
      <button type="button" aria-label="Quitar R${id}">×</button>`;
    row.querySelector("input").value = value;
    row.querySelector("select").value = branch;
    row.querySelector("button").onclick = () => {
      row.remove();
      updateResistorButtons();
      updateCircuit();
      if (addResistor.disabled) resistors.lastElementChild.querySelector("input").focus();
      else addResistor.focus();
    };
    resistors.append(row);
    updateResistorButtons();
    return row.querySelector("input");
  }

  function chart(canvas, bounds, labels) {
    const ctx = surface(canvas);
    const left = 88, right = canvas.width - 43, top = 30, bottom = canvas.height - 67;
    const px = x => left + (x - bounds.x0) * (right - left) / (bounds.x1 - bounds.x0);
    const py = y => bottom - (y - bounds.y0) * (bottom - top) / (bounds.y1 - bounds.y0);
    for (let i = 0; i <= 5; i++) {
      const x = bounds.x0 + (bounds.x1 - bounds.x0) * i / 5;
      const y = bounds.y0 + (bounds.y1 - bounds.y0) * i / 5;
      stroke(ctx, [[px(x), bottom], [px(x), top]], "#22354b");
      stroke(ctx, [[left, py(y)], [right, py(y)]], "#22354b");
      write(ctx, px(x), bottom + 21, number(x), text, 12);
      write(ctx, left - 40, py(y) + 4, number(y), text, 12);
    }
    if (bounds.x0 <= 0 && bounds.x1 >= 0) stroke(ctx, [[px(0), bottom], [px(0), top]], "#526982");
    if (bounds.y0 <= 0 && bounds.y1 >= 0) stroke(ctx, [[left, py(0)], [right, py(0)]], "#526982");
    write(ctx, (left + right) / 2, bottom + 49, labels[0]);
    ctx.save();
    ctx.translate(19, (top + bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    write(ctx, 0, 0, labels[1]);
    ctx.restore();
    return { ctx, project: ({ x, y }) => [px(x), py(y)] };
  }

  function updateOhm() {
    const { solve, current, resistance, voltage } = ohmForm.elements;
    const fields = { current, resistance, voltage };
    const output = fields[solve.value];
    for (const field of Object.values(fields)) field.disabled = field === output;
    let amps = current.valueAsNumber, volts = voltage.valueAsNumber, ohms = resistance.valueAsNumber;
    let issue = "";
    if (!ohmForm.checkValidity()) issue = "Completa los valores dentro del rango de cada entrada.";
    else if (solve.value === "current") amps = volts / ohms;
    else if (solve.value === "voltage") volts = amps * ohms;
    else if (amps === 0) issue = volts === 0 ? "Con V = 0 e I = 0, la resistencia es indeterminada." : "Con I = 0 y V > 0, no hay una resistencia finita.";
    else ohms = volts / amps;
    const result = { current: [amps, "A", "Corriente"], voltage: [volts, "V", "Voltaje"], resistance: [ohms, "Ω", "Resistencia"] }[solve.value];
    output.value = issue ? "" : Number(result[0].toPrecision(12));
    const canvas = select("ohm-plot");
    const maxX = amps > 0 && !issue ? amps * 1.35 : 1;
    const endY = issue ? 0 : maxX * ohms;
    const view = chart(canvas, { x0: 0, x1: maxX, y0: 0, y1: endY || 1 }, ["Corriente (A)", "Voltaje (V)"]);
    if (issue) {
      metric("ohm-result", issue);
      return;
    }
    stroke(view.ctx, [view.project({ x: 0, y: 0 }), view.project({ x: maxX, y: endY })], teal, 3);
    circle(view.ctx, ...view.project({ x: amps, y: volts }), 6, amber);
    metric("ohm-result", result[2], `${number(result[0])} ${result[1]}`, `V = ${number(volts)} V · I = ${number(amps)} A · R = ${number(ohms)} Ω`);
  }

  function dipoleLines(radii, planes) {
    return planes.flatMap(plane => radii.map(radius =>
      Array.from({ length: 101 }, (_, index) => {
        const angle = Math.PI * index / 100;
        const r = radius * Math.sin(angle) ** 2;
        const transverse = r * Math.sin(angle);
        return [r * Math.cos(angle), transverse * Math.cos(plane), transverse * Math.sin(plane)];
      })
    ));
  }

  function drawHome() {
    const canvas = select("hero-field");
    const ctx = surface(canvas);
    for (let x = 16; x < canvas.width; x += 22) {
      for (let y = 20; y < canvas.height; y += 22) circle(ctx, x, y, 1, "#598d9840");
    }
    const project = ([x, y, z]) => [322 + x * 1.42 + z * .72, 150 - y * .92 - z * .48];
    const planes = Array.from({ length: 10 }, (_, index) => tau * index / 10);
    dipoleLines([65, 96, 126, 156], planes).forEach((line, index) => {
      stroke(ctx, line.map(project), index % 4 === 3 ? "#89f5db85" : "#6de2da48", 1.12);
    });
    const glow = ctx.createRadialGradient(322, 150, 0, 322, 150, 76);
    glow.addColorStop(0, "#a3ffe9bd");
    glow.addColorStop(0.24, "#6af4db59");
    glow.addColorStop(1, "#6af4db00");
    circle(ctx, 322, 150, 76, glow);
    circle(ctx, 322, 150, 5, "#d1fff3");
  }

  function magneticProjection(space, wire) {
    const centerY = 230;
    const scale = wire ? 105 : 65;
    if (!space) return ([x, y]) => [410 + scale * x, centerY - scale * y];
    const yaw = magneticAngle;
    const pitch = .6;
    return ([x, y, z]) => {
      const sideways = x * Math.cos(yaw) + y * Math.sin(yaw);
      const depth = -x * Math.sin(yaw) + y * Math.cos(yaw);
      return [410 + sideways * scale, centerY + (depth * Math.sin(pitch) - z * Math.cos(pitch)) * scale];
    };
  }

  function wireLines(space) {
    const heights = space ? [-1.3, 0, 1.3] : [0];
    return heights.flatMap(height => [.42, .76, 1.15, 1.55, 1.95].map(radius =>
      Array.from({ length: 97 }, (_, index) => {
        const angle = tau * index / 96;
        return [radius * Math.cos(angle), radius * Math.sin(angle), height];
      })
    ));
  }

  function updateMagnetic() {
    const { source, direction, moment, current, view } = magneticForm.elements;
    const wire = source.value === "wire";
    const space = view.value === "space";
    const sign = Number(direction.value);
    moment.disabled = wire;
    current.disabled = !wire;
    select("magnet-strength").hidden = wire;
    select("wire-strength").hidden = !wire;
    const input = wire ? current : moment;
    const canvas = select("magnetic-plot");
    canvas.classList.toggle("rotatable", space);
    const ctx = surface(canvas);
    const project = magneticProjection(space, wire);
    select("magnetic-note").textContent =
      (wire ? "Modelo de conductor recto infinito. El campo rodea al conductor según la regla de la mano derecha."
        : "Modelo de dipolo ideal. Fuera del imán, el campo apunta del polo norte al sur.") +
      (space ? " Arrastra la vista o usa ← y → para girarla." : "");
    if (!input.checkValidity()) {
      metric("magnetic-result", "Ingresa una intensidad válida.");
      return;
    }

    const strength = input.valueAsNumber * sign;
    const b = LabModels.magneticProbe(wire, strength);
    const component = wire ? "Bᵧ en (0,2 m; 0; 0)" : "Bₓ en (0; 0,2 m; 0)";
    metric("magnetic-result", component, `${number(b * 1e6)} µT`,
      wire ? `I = ${number(strength)} A` : `mₓ = ${number(strength)} A·m²`);
    if (strength !== 0) {
      const planes = space ? Array.from({ length: 8 }, (_, i) => tau * i / 8) : [0, Math.PI];
      const lines = wire ? wireLines(space) : dipoleLines([1.75, 2.2, 2.65, 3.12], planes);
      for (const line of lines) {
        const points = line.map(project);
        stroke(ctx, points, space ? "#8db5f887" : "#92bcf2ba", 1.55);
        const index = wire ? 15 : 30;
        arrow(ctx, points[index - sign * 3], points[index], "#b0d2ff");
        if (wire) arrow(ctx, points[index + 48 - sign * 3], points[index + 48], "#b0d2ff");
      }
    }
    if (wire) {
      const center = project([0, 0, 0]);
      if (space) {
        const top = project([0, 0, 1.95]), bottom = project([0, 0, -1.95]);
        stroke(ctx, [bottom, top], amber, 4);
        if (strength) arrow(ctx, center, sign > 0 ? top : bottom, amber);
        write(ctx, top[0] + 22, top[1] + 10, "+z", amber);
      } else {
        circle(ctx, ...center, 13, amber);
        write(ctx, center[0], center[1] + 5, !strength ? "0" : sign > 0 ? "•" : "×", navy, 18);
      }
    } else {
      ctx.lineCap = "round";
      const center = project([0, 0, 0]);
      for (const side of [-1, 1]) {
        const end = project([.5 * side, 0, 0]);
        const pole = sign === side ? "N" : "S";
        stroke(ctx, [center, end], !strength ? "#637489" : pole === "N" ? "#ff9e93" : "#8fbaff", 24);
        if (strength) write(ctx, end[0], end[1] + 5, pole, navy);
      }
      ctx.lineCap = "butt";
    }
    write(ctx, 410, 470, wire && !space ? "Plano XY · corriente en el eje z" : space ? "Vista 3D · arrastra para girar" : "Plano XY · dipolo en el eje x");
  }

  function drawLorentz(canvas, path, time) {
    if (!path) {
      const view = chart(canvas, { x0: -1.75, x1: 1.75, y0: -1, y1: 1 }, ["x (m)", "y (m)"]);
      circle(view.ctx, ...view.project({ x: 0, y: 0 }), 6, amber);
      return;
    }
    const xs = path.points.map(point => point.x);
    const ys = path.points.map(point => point.y);
    const xMid = (Math.max(...xs) + Math.min(...xs)) / 2;
    const yMid = (Math.max(...ys) + Math.min(...ys)) / 2;
    const aspect = (canvas.width - 131) / (canvas.height - 97);
    const halfY = Math.max(.05, (Math.max(...ys) - Math.min(...ys)) * .59, (Math.max(...xs) - Math.min(...xs)) * .59 / aspect);
    const halfX = halfY * aspect;
    const view = chart(canvas, { x0: xMid - halfX, x1: xMid + halfX, y0: yMid - halfY, y1: yMid + halfY }, ["x (m)", "y (m)"]);
    const index = Math.floor(time / path.duration * (path.points.length - 1));
    const point = path.point(time);
    stroke(view.ctx, path.points.map(view.project), "#66829a72", 1.25);
    stroke(view.ctx, [...path.points.slice(0, index + 1), point].map(view.project), teal, 2.5);
    circle(view.ctx, ...view.project(point), 5, amber);
  }

  function reportTrajectory() {
    const point = trajectory.point(elapsed);
    const label = elapsed >= trajectory.duration ? "Posición final" : "Posición de la partícula";
    metric("lorentz-result", label, `x = ${number(point.x)} m · y = ${number(point.y)} m`,
      `t = ${number(elapsed)} s · |ω| = ${number(Math.abs(trajectory.omega))} rad/s` +
      (trajectory.aliased ? " · La vista simplifica las oscilaciones muy rápidas." : ""));
  }

  function animate(timestamp) {
    if (started === null) started = timestamp;
    const speed = Math.max(1, trajectory.duration / 7);
    elapsed = Math.min(trajectory.duration, elapsed + (timestamp - started) / 1000 * speed);
    started = timestamp;
    drawLorentz(lorentzCanvas, trajectory, elapsed);
    if (elapsed < trajectory.duration) animation = requestAnimationFrame(animate);
    else {
      animation = 0;
      pause.disabled = true;
      reportTrajectory();
    }
  }

  function stopAnimation() {
    cancelAnimationFrame(animation);
    animation = 0;
    started = null;
  }

  function resetTrajectory() {
    stopAnimation();
    trajectory = null;
    elapsed = 0;
    pause.disabled = true;
    pause.textContent = "Pausar";
    drawLorentz(lorentzCanvas, null, 0);
    metric("lorentz-result", "Lanza la partícula para calcular su trayectoria.");
  }

  function applyPreset() {
    const { preset } = lorentzForm.elements;
    const examples = {
      selector: [2, 1, 10, 10, 2, 0, 8],
      circle: [0, 1, 10, 10, 3, 0, 10],
      crossed: [2, 1, 10, 10, 0, 3, 12]
    };
    const values = examples[preset.value];
    if (values) ["electric", "magnetic", "charge", "mass", "vx", "vy", "duration"]
      .forEach((name, index) => lorentzForm.elements[name].value = values[index]);
    resetTrajectory();
  }

  function handleRoute(moveFocus) {
    const match = location.hash.match(/^#unidad-([1-4])$/);
    const unit = match ? match[1] : "0";
    if (animation && unit !== "4") pause.click();
    for (let index = 0; index <= 4; index++) select(`unit${index}`).hidden = String(index) !== unit;
    for (const link of document.querySelectorAll("[data-route]")) {
      if (link.dataset.route === unit) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (moveFocus) {
      select(`heading${unit}`).focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    document.dispatchEvent(new CustomEvent("laboratory:navigate", { detail: unit }));
  }

  document.querySelectorAll("[data-panel]").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.panel === "magnetic-panel" && animation) pause.click();
    for (const item of button.parentElement.querySelectorAll("[data-panel]")) {
      item.setAttribute("aria-pressed", String(item === button));
      select(item.dataset.panel).hidden = item !== button;
    }
  }));

  [circuitForm, ohmForm, magneticForm].forEach(form => form.addEventListener("submit", event => event.preventDefault()));
  circuitForm.addEventListener("input", updateCircuit);
  addResistor.addEventListener("click", () => {
    const input = addResistance(100, 1);
    updateCircuit();
    input.focus();
  });
  [[10, 0], [20, 1], [30, 2]].forEach(([value, branch]) => addResistance(value, branch));
  ohmForm.addEventListener("input", updateOhm);
  magneticForm.addEventListener("input", updateMagnetic);
  const magneticCanvas = select("magnetic-plot");
  magneticCanvas.addEventListener("pointerdown", event => {
    if (magneticForm.elements.view.value !== "space") return;
    dragX = event.clientX;
    magneticCanvas.setPointerCapture(event.pointerId);
  });
  magneticCanvas.addEventListener("pointermove", event => {
    if (dragX === null) return;
    magneticAngle += .013 * (event.clientX - dragX);
    dragX = event.clientX;
    updateMagnetic();
  });
  magneticCanvas.addEventListener("lostpointercapture", () => { dragX = null; });
  magneticCanvas.addEventListener("keydown", event => {
    if (magneticForm.elements.view.value !== "space" || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    magneticAngle += event.key === "ArrowLeft" ? -.15 : .15;
    updateMagnetic();
  });
  lorentzForm.addEventListener("input", event => {
    if (event.target.name === "preset") applyPreset();
    else {
      lorentzForm.elements.preset.value = "custom";
      resetTrajectory();
    }
  });
  lorentzForm.addEventListener("submit", event => {
    event.preventDefault();
    stopAnimation();
    const initial = Object.fromEntries(["electric", "magnetic", "charge", "mass", "vx", "vy", "duration"]
      .map(name => [name, lorentzForm.elements[name].valueAsNumber]));
    trajectory = { ...LabModels.lorentz(initial), duration: initial.duration };
    elapsed = reducedMotion.matches ? trajectory.duration : 0;
    pause.disabled = reducedMotion.matches;
    pause.textContent = "Pausar";
    drawLorentz(lorentzCanvas, trajectory, elapsed);
    reportTrajectory();
    if (!reducedMotion.matches) animation = requestAnimationFrame(animate);
  });
  pause.addEventListener("click", () => {
    if (animation) {
      stopAnimation();
      pause.textContent = "Reanudar";
      reportTrajectory();
    } else {
      pause.textContent = "Pausar";
      animation = requestAnimationFrame(animate);
    }
  });
  select("reset-lorentz").addEventListener("click", () => {
    lorentzForm.reset();
    applyPreset();
  });
  window.addEventListener("hashchange", () => handleRoute(true));
  drawHome();
  updateCircuit();
  updateOhm();
  updateMagnetic();
  resetTrajectory();
  handleRoute(false);
})();
