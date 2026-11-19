"use strict";

const Graphics = (() => {
  const color = {
    bg: "#0b1423", grid: "#203147", axis: "#526881", text: "#b7c9da",
    line: "#81dbc9", positive: "#ff9e93", negative: "#8fbaff", neutral: "#bdc9d5"
  };
  const bound = Physics.LIMIT;
  const levels = [-12000, -6000, -3000, 0, 3000, 6000, 12000];

  function chargeColor(charge) {
    if (charge.q === 0) return color.neutral;
    return charge.q > 0 ? color.positive : color.negative;
  }

  function space(canvas) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width, height = canvas.height;
    ctx.lineWidth = 1;
    ctx.fillStyle = color.bg;
    ctx.fillRect(0, 0, width, height);
    return { ctx, width, height };
  }

  function plane(canvas) {
    const { ctx, width, height } = space(canvas);
    const scale = Math.min(width - 84, height - 64) / (2 * bound);
    const px = x => width / 2 + x * scale;
    const py = y => height / 2 - y * scale;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    for (let n = -bound; n <= bound; n++) {
      ctx.strokeStyle = n === 0 ? color.axis : color.grid;
      ctx.beginPath();
      ctx.moveTo(px(n), py(-bound));
      ctx.lineTo(px(n), py(bound));
      ctx.moveTo(px(-bound), py(n));
      ctx.lineTo(px(bound), py(n));
      ctx.stroke();
      ctx.fillStyle = color.text;
      ctx.fillText(n, px(n), py(-bound) + 17);
      ctx.fillText(n, px(-bound) - 18, py(n) + 4);
    }
    ctx.fillText("x (m)", px(bound) + 29, py(-bound) + 17);
    ctx.fillText("y (m)", px(-bound) - 18, py(bound) - 10);
    return { ctx, px, py };
  }

  function dot(ctx, x, y, r, fill, text = "") {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    if (text) {
      ctx.fillStyle = color.bg;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, x, y + 5);
    }
  }

  function marker(ctx, x, y, charge, faded) {
    ctx.globalAlpha = faded ? 0.38 : 1;
    dot(ctx, x, y, 10, chargeColor(charge), charge.q === 0 ? "0" : charge.q > 0 ? "+" : "−");
    ctx.globalAlpha = 1;
  }

  function tracePaths(charges, flat, z = 0) {
    const active = charges.filter(c => c.q !== 0);
    const inPlane = c => Math.abs(c.z - z) < 1e-7;
    const starts = flat ? active.filter(inPlane) : active;
    const paths = [];
    const count = 12;
    const radius = 0.13;
    for (const source of starts) {
      const direction = Math.sign(source.q);
      for (let i = 0; i < count; i++) {
        const ring = flat ? 1 : Math.sqrt(1 - (1 - 2 * (i + 0.5) / count) ** 2);
        const angle = 2 * Math.PI * i * (flat ? 1 / count : 0.381966);
        let x = source.x + radius * ring * Math.cos(angle);
        let y = source.y + radius * ring * Math.sin(angle);
        let height = flat ? z : source.z + radius * (1 - 2 * (i + 0.5) / count);
        const points = [];
        for (let step = 0; step < 250; step++) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(height)) > bound) break;
          points.push([x, y, height]);
          if (active.some(c => Math.hypot(x - c.x, y - c.y, height - c.z) < 0.095)) break;
          const { ex, ey, ez } = Physics.electricAt(active, x, y, height);
          const vertical = flat ? 0 : ez;
          const length = Math.hypot(ex, ey, vertical);
          if (!Number.isFinite(length) || length < 1e-5) break;
          const advance = direction * 0.055 / length;
          x += ex * advance;
          y += ey * advance;
          height += vertical * advance;
        }
        if (points.length > 1) paths.push(direction > 0 ? points : points.reverse());
      }
    }
    if (flat) {
      // Edge seeds also show the projected field of sources outside the selected plane.
      for (let i = -4; i <= 4; i += 2) {
        for (const [sx, sy] of [[i, -bound], [i, bound], [-bound, i], [bound, i]]) {
          let x = sx, y = sy;
          const initial = Physics.electricAt(active, x, y, z);
          const dir = Math.sign(-sx * initial.ex - sy * initial.ey) || 1;
          const path = [];
          for (let step = 0; step < 250; step++) {
            if (Math.max(Math.abs(x), Math.abs(y)) > bound + 1e-6) break;
            path.push([x, y, z]);
            if (active.some(c => Math.hypot(x - c.x, y - c.y, z - c.z) < 0.095)) break;
            const { ex, ey } = Physics.electricAt(active, x, y, z);
            const len = Math.hypot(ex, ey);
            if (!Number.isFinite(len) || len < 1e-5) break;
            x += dir * 0.055 * ex / len;
            y += dir * 0.055 * ey / len;
          }
          if (path.length > 2) paths.push(dir > 0 ? path : path.reverse());
        }
      }
    }
    return paths;
  }

  function samples(charges, size, slice) {
    const flat = slice !== undefined;
    const count = flat ? size ** 2 : size ** 3;
    return Array.from({ length: count }, (_, i) => {
      const coord = axisIndex => -bound + 2 * bound * axisIndex / (size - 1);
      const p = [coord(i % size), coord(Math.floor(i / size) % size), flat ? slice : coord(Math.floor(i / size ** 2))];
      const v = charges.reduce((sum, charge) => {
        const radius = Math.max(0.04, Math.hypot(p[0] - charge.x, p[1] - charge.y, p[2] - charge.z));
        return sum + Physics.potentialAtDistance(charge.q, radius);
      }, 0);
      return { p, v };
    });
  }

  function crossings(vertices, edges, level) {
    const points = [];
    for (const [a, b] of edges) {
      const first = vertices[a], next = vertices[b];
      if ((first.v < level) === (next.v < level)) continue;
      const t = (level - first.v) / (next.v - first.v);
      points.push(first.p.map((value, i) => value + t * (next.p[i] - value)));
    }
    return points;
  }

  function plot2d(canvas, charges, z, showLines, showSurfaces) {
    const { ctx, px, py } = plane(canvas);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px(-bound), py(bound), px(bound) - px(-bound), py(-bound) - py(bound));
    ctx.clip();
    if (showSurfaces) {
      const size = 71;
      const grid = samples(charges, size, z);
      const triangleEdges = [[0, 1], [1, 2], [2, 0]];
      for (const level of levels) {
        ctx.strokeStyle = level === 0 ? "#ebd49a" : level > 0 ? "#a76160" : "#526dc1";
        ctx.beginPath();
        for (let y = 0; y < size - 1; y++) {
          for (let x = 0; x < size - 1; x++) {
            const i = x + y * size;
            for (const triangle of [[i, i + 1, i + size + 1], [i, i + size + 1, i + size]]) {
              const segment = crossings(triangle.map(n => grid[n]), triangleEdges, level);
              if (segment.length < 2) continue;
              ctx.moveTo(px(segment[0][0]), py(segment[0][1]));
              ctx.lineTo(px(segment[1][0]), py(segment[1][1]));
            }
          }
        }
        ctx.stroke();
      }
    }
    if (showLines) {
      ctx.strokeStyle = "#6fbaad";
      ctx.fillStyle = color.line;
      for (const path of tracePaths(charges, true, z)) {
        ctx.beginPath();
        ctx.moveTo(px(path[0][0]), py(path[0][1]));
        for (const [x, y] of path.slice(1)) ctx.lineTo(px(x), py(y));
        ctx.stroke();
        for (let i = 9; i + 2 < path.length; i += 34) {
          const [x, y] = path[i], [nx, ny] = path[i + 2];
          const angle = Math.atan2(y - ny, nx - x);
          ctx.save();
          ctx.translate(px(x), py(y));
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(5, 0);
          ctx.lineTo(-4, -3);
          ctx.lineTo(-4, 3);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
    charges.forEach(c => marker(ctx, px(c.x), py(c.y), c, Math.abs(c.z - z) > 1e-7));
  }

  function surfaceMesh(charges, level) {
    const size = 27;
    const grid = samples(charges, size);
    const layer = size ** 2;
    const faces = [];
    const tetrahedra = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7],
      [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];
    const edges = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    for (let z = 0; z < size - 1; z++) {
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const i = x + y * size + z * layer;
          const corners = [i, i + 1, i + size, i + size + 1, i + layer,
            i + layer + 1, i + layer + size, i + layer + size + 1].map(n => grid[n]);
          const firstBelow = corners[0].v < level;
          if (corners.every(c => (c.v < level) === firstBelow)) continue;
          for (const tet of tetrahedra) {
            const vertices = tet.map(n => corners[n]).sort((a, b) => a.v - b.v);
            const polygon = crossings(vertices, edges, level);
            if (polygon.length === 4) [polygon[2], polygon[3]] = [polygon[3], polygon[2]];
            if (polygon.length >= 3) faces.push(polygon);
          }
        }
      }
    }
    return faces;
  }

  function plot3d(canvas, charges, mesh, paths, yaw, pitch, level) {
    const { ctx, width, height } = space(canvas);
    const scale = Math.min(width, height) / 20;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    function project([x, y, z]) {
      const horizontal = cy * x - sy * y;
      const depth = sy * x + cy * y;
      const vertical = cp * z - sp * depth;
      return [width / 2 + scale * horizontal, height / 2 - scale * vertical, cp * depth + sp * z];
    }
    function drawPath(path, close = false) {
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      path.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
      if (close) ctx.closePath();
    }
    ctx.strokeStyle = color.grid;
    for (let a = -bound; a <= bound; a++) {
      drawPath([project([a, -bound, -bound]), project([a, bound, -bound])]);
      ctx.stroke();
      drawPath([project([-bound, a, -bound]), project([bound, a, -bound])]);
      ctx.stroke();
    }
    ctx.font = "15px sans-serif";
    ctx.textAlign = "left";
    for (const [label, end] of [["x", [bound, 0, 0]], ["y", [0, bound, 0]], ["z", [0, 0, bound]]]) {
      const point = project(end);
      ctx.strokeStyle = color.axis;
      drawPath([project([0, 0, 0]), point]);
      ctx.stroke();
      ctx.fillStyle = color.text;
      ctx.fillText(label, point[0] + 6, point[1]);
    }
    const objects = [];
    function add(points, kind, data) {
      const projected = points.map(project);
      const depth = projected.reduce((sum, p) => sum + p[2], 0) / projected.length;
      objects.push({ projected, depth, kind, data });
    }
    mesh.forEach(face => add(face, "surface"));
    for (const path of paths) {
      for (let i = 1; i < path.length; i += 3) {
        const segment = path.slice(i - 1, i + 3);
        add(segment, "line", i % 24 === 1 && i > 4);
      }
    }
    charges.forEach(c => add([[c.x, c.y, c.z]], "charge", c));
    objects.sort((a, b) => a.depth - b.depth);
    for (const { projected, kind, data } of objects) {
      const [x, y] = projected[0];
      if (kind === "surface") {
        const [a, b, c] = projected;
        const facing = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
        const opacity = 0.15 + Math.min(0.23, facing / 175);
        ctx.fillStyle = (level < 0 ? "rgba(111,145,255," : level > 0 ? "rgba(255,136,122," : "rgba(235,212,154,") + opacity + ")";
        ctx.strokeStyle = ctx.fillStyle;
        drawPath(projected, true);
        ctx.fill();
        ctx.stroke();
      } else if (kind === "line") {
        ctx.strokeStyle = "#63b5a7";
        drawPath(projected);
        ctx.stroke();
        if (data) {
          const [nx, ny] = projected[projected.length - 1];
          const angle = Math.atan2(ny - y, nx - x);
          ctx.fillStyle = color.line;
          ctx.save();
          ctx.translate(nx, ny);
          ctx.rotate(angle);
          drawPath([[4, 0], [-4, -2.5], [-4, 2.5]], true);
          ctx.fill();
          ctx.restore();
        }
      } else {
        marker(ctx, x, y, data, false);
      }
    }
  }

  function plotTrajectory(canvas, charges, points) {
    const { ctx, px, py } = plane(canvas);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px(-bound), py(bound), px(bound) - px(-bound), py(-bound) - py(bound));
    ctx.clip();
    if (points.length) {
      ctx.strokeStyle = color.line;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px(points[0].x), py(points[0].y));
      for (const point of points) ctx.lineTo(px(point.x), py(point.y));
      ctx.stroke();
      dot(ctx, px(points[0].x), py(points[0].y), 4, color.text);
      const end = points.at(-1);
      dot(ctx, px(end.x), py(end.y), 6, color.line);
    }
    ctx.restore();
    charges.forEach(c => marker(ctx, px(c.x), py(c.y), c, Math.abs(c.z) > 1e-7));
  }

  function plotCapacitor(canvas, area, gap, relativePermittivity) {
    const { ctx, width, height } = space(canvas);
    if (![area, gap, relativePermittivity].every(Number.isFinite)) return;
    const halfGap = Math.min(185, Math.max(28, 45 + 36 * Math.log10(gap)));
    const plate = Math.min(190, Math.max(72, 78 + 27 * Math.log10(area)));
    const left = width / 2 - halfGap, right = width / 2 + halfGap;
    const top = 54, bottom = top + plate;
    ctx.fillStyle = relativePermittivity > 1 ? "#234b53" : "#13273b";
    ctx.fillRect(left, top, right - left, plate);
    ctx.strokeStyle = color.positive;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.stroke();
    ctx.strokeStyle = color.negative;
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = color.text;
    ctx.fillText("Placa +", left - 54, top + plate / 2);
    ctx.fillText("Placa −", right + 54, top + plate / 2);
    ctx.fillText("Separación d", width / 2, height - 15);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color.text;
    ctx.beginPath();
    ctx.moveTo(left, bottom + 16);
    ctx.lineTo(right, bottom + 16);
    ctx.moveTo(left, bottom + 12);
    ctx.lineTo(left, bottom + 21);
    ctx.moveTo(right, bottom + 12);
    ctx.lineTo(right, bottom + 21);
    ctx.stroke();
  }

  return { tracePaths, plot2d, surfaceMesh, plot3d, plotTrajectory, plotCapacitor };
})();
