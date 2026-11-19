"use strict";

(() => {
  const select = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const presets = {
    single: [{ q: 1, x: 0, y: 0, z: 0 }],
    dipole: [{ q: 2, x: -1.5, y: 0, z: 0 }, { q: -2, x: 1.5, y: 0, z: 0 }]
  };
  let charges = presets.dipole.map(charge => ({ ...charge }));
  let unit = "1";
  let module = "campo";
  let view3d = false;
  let yaw = 0.62;
  let pitch = 0.43;
  let mesh = null;
  let paths = null;
  let animation = 0;
  let fieldFrame = 0;
  let particlePoints = [];
  let particleDirty = true;
  let dragStart;
  const numberFormat = new Intl.NumberFormat("es-PE", { maximumSignificantDigits: 5 });
  const scientificFormat = new Intl.NumberFormat("es-PE", {
    notation: "scientific", maximumSignificantDigits: 5
  });
  const fieldPlot = select("field-plot");
  const particlePlot = select("particle-plot");
  const particleForm = select("particle-form");
  const potentialForm = select("potential-form");
  const capacitorForm = select("capacitor-form");
  const energyForm = select("energy-form");

  function format(value) {
    const magnitude = Math.abs(value);
    return (magnitude >= 1e7 || (magnitude > 0 && magnitude < 0.001)
      ? scientificFormat : numberFormat).format(value);
  }

  function metric(id, value, unit, label, emptyMessage) {
    const container = select(id);
    if (!Number.isFinite(value)) {
      container.textContent = emptyMessage;
      return;
    }
    const strong = document.createElement("strong");
    strong.textContent = format(value) + " " + unit;
    container.replaceChildren(strong, document.createTextNode(label));
  }

  function formNumbers(form, names) {
    return Object.fromEntries(names.map(name => [name, form.elements[name].valueAsNumber]));
  }

  function setPressed(button, pressed) {
    button.setAttribute("aria-pressed", String(pressed));
  }

  function renderCharges() {
    const list = select("charge-list");
    list.replaceChildren();
    charges.forEach((charge, i) => {
      const row = document.createElement("div");
      row.className = "charge-item";
      row.innerHTML = '<div class="toolbar"><strong></strong><button type="button">Quitar</button></div><div class="charge-values"></div>';
      const title = row.querySelector("strong");
      function updateTitle() {
        title.textContent = "Carga " + (i + 1);
        title.className = charge.q === 0 ? "" : charge.q > 0 ? "positive" : "negative";
      }
      updateTitle();
      const remove = row.querySelector("button");
      remove.setAttribute("aria-label", "Quitar carga " + (i + 1));
      remove.addEventListener("click", () => {
        charges.splice(i, 1);
        renderCharges();
        chargesChanged();
        const remaining = list.querySelectorAll("button");
        (remaining[Math.min(i, remaining.length - 1)] || select("add-charge")).focus();
      });
      const fields = row.querySelector(".charge-values");
      for (const [key, label, limit] of [["q", "µC", 100], ["x", "x", 5], ["y", "y", 5], ["z", "z", 5]]) {
        const element = document.createElement("label");
        element.textContent = label;
        const input = document.createElement("input");
        input.type = "number";
        input.required = true;
        input.step = "any";
        input.min = -limit;
        input.max = limit;
        input.value = charge[key];
        input.setAttribute("aria-label", label + " de la carga " + (i + 1));
        input.addEventListener("input", () => {
          input.setAttribute("aria-invalid", String(!input.validity.valid));
          if (input.validity.valid) {
            charge[key] = input.valueAsNumber;
            updateTitle();
            chargesChanged();
          }
        });
        input.addEventListener("blur", () => {
          if (!input.validity.valid) input.value = charge[key];
          input.removeAttribute("aria-invalid");
        });
        element.append(input);
        fields.append(element);
      }
      list.append(row);
    });
    select("charge-count").textContent = charges.length + " / 10";
    select("add-charge").disabled = charges.length >= 10;
  }

  function chargesChanged() {
    mesh = paths = null;
    resetParticle();
    if (unit !== "1") return;
    if (module === "campo") scheduleField();
    if (module === "potencial") updatePotential();
  }

  function scheduleField() {
    if (!fieldFrame) fieldFrame = requestAnimationFrame(drawField);
  }

  function drawField() {
    fieldFrame = 0;
    if (unit !== "1" || module !== "campo") return;
    const slice = select("slice");
    const levelInput = select("level");
    const showLines = select("lines").checked;
    const showSurfaces = select("surfaces").checked;
    const note = select("field-note");
    if (!view3d) {
      const validSlice = slice.value !== "" && slice.validity.valid;
      Graphics.plot2d(fieldPlot, charges, validSlice ? slice.valueAsNumber : 0,
        showLines, showSurfaces);
      note.textContent = validSlice
        ? "Plano XY. Flechas verdes: dirección del campo en el plano. Equipotenciales: positivas en coral, negativas en azul y cero en dorado. Las cargas fuera del corte aparecen atenuadas."
        : "Ingresa un valor de z entre −5 y 5 m. La vista muestra temporalmente z = 0.";
      return;
    }
    const level = levelInput.valueAsNumber;
    if (showLines && paths === null) paths = Graphics.tracePaths(charges, false);
    if (showSurfaces && Number.isFinite(level) && mesh === null) {
      mesh = Graphics.surfaceMesh(charges, level);
    }
    Graphics.plot3d(fieldPlot, charges, showSurfaces && mesh ? mesh : [],
      showLines && paths ? paths : [], yaw, pitch, level);
    note.textContent = "Arrastra sobre el gráfico o usa las flechas del teclado para girar. ";
    if (showSurfaces) {
      note.textContent += !Number.isFinite(level) ? "Ingresa un potencial en voltios."
        : mesh.length ? "Superficie de " + format(level) + " V dentro de ±5 m."
        : "La malla no encontró una superficie para ese potencial dentro de ±5 m. Prueba otro valor.";
    }
  }

  function setView(spatial) {
    view3d = spatial;
    setPressed(select("view2d"), !spatial);
    setPressed(select("view3d"), spatial);
    select("slice-label").hidden = spatial;
    select("level-label").hidden = !spatial;
    fieldPlot.classList.toggle("rotatable", spatial);
    scheduleField();
  }

  function rotate(dx, dy) {
    yaw += dx;
    pitch = Math.max(-1.5, Math.min(1.5, pitch + dy));
    scheduleField();
  }

  function updatePotential() {
    const { x, y, z } = formNumbers(potentialForm, ["x", "y", "z"]);
    const container = select("contributions");
    container.replaceChildren();
    if (![x, y, z].every(Number.isFinite)) {
      metric("potential-result", NaN, "", "", "Completa las tres coordenadas.");
      return;
    }
    const values = charges.map(c => Physics.potentialOf(c, x, y, z));
    const total = values.reduce((sum, value) => sum + value, 0);
    const overlaps = charges.some(c => c.q !== 0 && c.x === x && c.y === y && c.z === z);
    metric("potential-result", total, "V", "Potencial eléctrico total",
      overlaps ? "El potencial no está definido en la posición de una carga puntual."
        : "El resultado excede el rango numérico.");
    if (values.length === 0) return;
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th scope='col'>Carga</th><th scope='col'>Distancia (m)</th><th scope='col'>Aporte (V)</th></tr></thead>";
    const tbody = table.createTBody();
    charges.forEach((c, i) => {
      const row = tbody.insertRow();
      row.insertCell().textContent = "Carga " + (i + 1);
      row.insertCell().textContent = format(Math.hypot(x - c.x, y - c.y, z - c.z));
      row.insertCell().textContent = Number.isFinite(values[i]) ? format(values[i]) : "Indefinido";
    });
    container.append(table);
  }

  function resetParticle() {
    cancelAnimationFrame(animation);
    animation = 0;
    particlePoints = [];
    particleDirty = true;
    select("particle-status").textContent = "Configura las condiciones iniciales y pulsa Lanzar partícula.";
    if (unit === "1" && module === "trayectoria") updateParticle();
  }

  function updateParticle() {
    if (!particleDirty) return;
    Graphics.plotTrajectory(particlePlot, charges, particlePoints);
    particleDirty = false;
  }

  function launchParticle(event) {
    event.preventDefault();
    if (!particleForm.reportValidity()) return;
    cancelAnimationFrame(animation);
    const initial = formNumbers(particleForm, ["x", "y", "vx", "vy", "q", "mass", "duration"]);
    const { points, reason } = Physics.trajectory(charges, initial);
    const last = points.at(-1);
    const status = select("particle-status");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animationDuration = reduced ? 0 : Math.min(2800, last.time * 850);
    let cursor = 0;
    let started;
    status.textContent = "Simulación en curso…";
    function draw(now) {
      started ??= now;
      const fraction = animationDuration === 0 ? 1 : Math.min(1, (now - started) / animationDuration);
      const time = fraction * last.time;
      while (cursor < points.length && points[cursor].time <= time) cursor++;
      particlePoints = points.slice(0, cursor);
      particleDirty = true;
      updateParticle();
      if (fraction < 1) {
        animation = requestAnimationFrame(draw);
        return;
      }
      animation = 0;
      status.textContent = reason + " · " + format(last.time) + " s · Rapidez final: " + format(last.speed) + " m/s";
    }
    animation = requestAnimationFrame(draw);
  }

  let manualCapacitance = "";
  function updateCapacitor() {
    const material = capacitorForm.elements.material.value;
    const custom = material === "custom";
    select("custom-label").hidden = !custom;
    capacitorForm.elements.permittivity.disabled = !custom;
    const { area, gap, permittivity } = formNumbers(capacitorForm, ["area", "gap", "permittivity"]);
    const relative = custom ? permittivity : Number(material);
    const valid = capacitorForm.checkValidity();
    const capacitance = valid ? Physics.capacitance(area, gap, relative) : NaN;
    Graphics.plotCapacitor(select("capacitor-plot"), valid ? area : NaN, gap, relative);
    metric("capacitance-result", capacitance * 1e12, "pF", "Capacitancia", "Revisa el área, la separación y el dieléctrico.");
    const linked = energyForm.elements.linked.checked;
    const field = energyForm.elements.capacitance;
    field.readOnly = linked;
    if (linked) field.value = Number.isFinite(capacitance) ? capacitance * 1e12 : "";
    updateEnergy();
  }

  function updateEnergy() {
    const { capacitance, voltage } = formNumbers(energyForm, ["capacitance", "voltage"]);
    const valid = capacitance >= 0 && Number.isFinite(voltage);
    const energy = valid ? Physics.energy(capacitance * 1e-12, voltage) : NaN;
    metric("energy-result", energy, "J", "Energía almacenada",
      valid ? "El resultado excede el rango numérico." : "Ingresa una capacitancia válida y un voltaje.");
  }

  function refresh() {
    if (unit === "2") updateCapacitor();
    else if (module === "campo") scheduleField();
    else if (module === "potencial") updatePotential();
    else updateParticle();
  }

  document.addEventListener("laboratory:navigate", event => {
    unit = event.detail;
    if (unit === "1" || unit === "2") refresh();
  });
  all("[data-module]").forEach(button => button.addEventListener("click", () => {
    module = button.dataset.module;
    all("[data-module]").forEach(item => setPressed(item, item === button));
    all(".module").forEach(panel => panel.hidden = panel.id !== module);
    refresh();
  }));
  all("[data-preset]").forEach(button => button.addEventListener("click", () => {
    charges = presets[button.dataset.preset].map(charge => ({ ...charge }));
    renderCharges();
    chargesChanged();
  }));
  select("add-charge").addEventListener("click", () => {
    if (charges.length >= 10) return;
    let x = -4;
    while (charges.some(c => c.x === x && c.y === 0 && c.z === 0)) x++;
    charges.push({ q: 1, x, y: 0, z: 0 });
    renderCharges();
    chargesChanged();
    select("charge-list").lastElementChild.querySelector("input").focus();
  });
  select("view2d").addEventListener("click", () => setView(false));
  select("view3d").addEventListener("click", () => setView(true));
  for (const id of ["lines", "surfaces", "slice", "level"]) {
    select(id).addEventListener("input", () => {
      if (id === "level") mesh = null;
      scheduleField();
    });
  }
  fieldPlot.addEventListener("pointerdown", event => {
    if (!view3d || event.button !== 0) return;
    fieldPlot.setPointerCapture(event.pointerId);
    dragStart = [event.clientX, event.clientY];
  });
  fieldPlot.addEventListener("pointermove", event => {
    if (!dragStart || !fieldPlot.hasPointerCapture(event.pointerId)) return;
    rotate((event.clientX - dragStart[0]) * 0.012, (event.clientY - dragStart[1]) * 0.012);
    dragStart = [event.clientX, event.clientY];
  });
  fieldPlot.addEventListener("lostpointercapture", () => { dragStart = null; });
  fieldPlot.addEventListener("keydown", event => {
    const directions = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };
    if (!view3d || !directions[event.key]) return;
    event.preventDefault();
    rotate(...directions[event.key]);
  });
  for (const form of [potentialForm, capacitorForm, energyForm]) {
    form.addEventListener("submit", event => event.preventDefault());
  }
  potentialForm.addEventListener("input", updatePotential);
  particleForm.addEventListener("submit", launchParticle);
  particleForm.addEventListener("input", resetParticle);
  select("reset-particle").addEventListener("click", () => {
    particleForm.reset();
    resetParticle();
  });
  capacitorForm.addEventListener("input", updateCapacitor);
  energyForm.addEventListener("input", event => {
    const { linked, capacitance } = energyForm.elements;
    if (event.target === linked) {
      if (linked.checked) manualCapacitance = capacitance.value;
      else if (manualCapacitance !== "") capacitance.value = manualCapacitance;
      updateCapacitor();
    } else updateEnergy();
  });
  renderCharges();
  resetParticle();
  updateCapacitor();
  refresh();
})();
