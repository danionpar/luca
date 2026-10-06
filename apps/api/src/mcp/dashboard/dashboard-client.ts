/**
 * The dashboard's browser script, as a string embedded in the rendered
 * file. Rules this source must follow, because it is inlined verbatim:
 * no backticks and no dollar-brace sequences (it lives in a template
 * literal), and no URL literals (the page may not reference any network
 * resource, so the SVG namespace is read off a markup-declared <svg>
 * instead of being spelled out).
 *
 * Every figure drawn here is a SQL aggregate from the embedded data; the
 * script only adds whole aggregate cells to scope a period, and divides
 * once for the categorised percentage.
 */
export const DASHBOARD_CLIENT_JS = String.raw`
(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("luca-data").textContent);
  var NS = document.getElementById("ns").namespaceURI;
  var MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var UNCAT_KEY = "null";
  var MAX_SLOTS = 7;
  var TOP_CITIES = 10;

  var state = { year: "all", month: "all", tables: {} };

  // ---------- formatting ----------
  function clp(n) { return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-CL"); }
  function short(n) {
    var a = Math.abs(n), sign = n < 0 ? "-" : "";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " M";
    if (a >= 1e3) return sign + "$" + (a / 1e3).toLocaleString("es-CL", { maximumFractionDigits: 0 }) + " mil";
    return sign + "$" + a;
  }
  function pct(n, d) { return d === 0 ? "0 %" : (n / d * 100).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %"; }
  function monthLong(ym) { return MONTHS_ES[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4); }
  function monthShort(ym) { return MONTHS_ES[Number(ym.slice(5, 7)) - 1].slice(0, 3) + " " + ym.slice(2, 4); }
  function plural(n, one, many) { return n.toLocaleString("es-CL") + " " + (n === 1 ? one : many); }

  // ---------- DOM helpers (text always via textContent) ----------
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function s(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }

  // ---------- entity colours: fixed by all-time rank, never by the current filter ----------
  var slotOf = {};
  (function () {
    var rank = 0;
    DATA.categories.forEach(function (c) {
      if (c.categoryId === null) return;
      rank += 1;
      slotOf[c.categoryId] = rank <= MAX_SLOTS ? rank : 0;
    });
  })();
  var catName = {};
  DATA.categories.forEach(function (c) {
    catName[c.categoryId === null ? UNCAT_KEY : c.categoryId] = c.categoryId === null ? "Sin categorizar" : c.name;
  });
  // A series key: "u" uncategorised, "1".."7" a named category's slot, "o" the folded tail.
  function seriesKeyOf(categoryId) {
    if (categoryId === null) return "u";
    var slot = slotOf[categoryId];
    return slot ? String(slot) : "o";
  }
  var SERIES_ORDER = ["u", "1", "2", "3", "4", "5", "6", "7", "o"];
  var SERIES_CLASS = { u: "c-uncat", o: "c-other" };
  function swatchClass(key) { return SERIES_CLASS[key] || "c" + key; }
  function seriesName(key) {
    if (key === "u") return "Sin categorizar";
    if (key === "o") return "Otros";
    var found = "";
    DATA.categories.forEach(function (c) { if (c.categoryId !== null && String(slotOf[c.categoryId]) === key) found = c.name; });
    return found;
  }

  // ---------- scoping ----------
  function inYear(m) { return state.year === "all" || m.slice(0, 4) === state.year; }
  function inScope(m) { return inYear(m) && (state.month === "all" || m === state.month); }
  function sum(arr, f) { var t = 0; arr.forEach(function (x) { t += f(x); }); return t; }

  // ---------- tooltip ----------
  var tip = document.getElementById("tip");
  function showTip(title, rows, x, y) {
    clear(tip);
    tip.appendChild(h("div", { "class": "t-title", text: title }));
    rows.forEach(function (r) {
      var key = h("span", { "class": "t-key" }, [
        r.cls ? h("span", { "class": "t-line " + r.cls }) : null,
        h("span", { text: r.label })
      ]);
      tip.appendChild(h("div", { "class": "t-row" }, [key, h("span", { "class": "t-val", text: r.value })]));
    });
    tip.style.display = "block";
    var w = tip.offsetWidth, hh = tip.offsetHeight;
    var left = Math.min(Math.max(8, x + 14), window.innerWidth - w - 8);
    var top = y + 14 + hh > window.innerHeight ? Math.max(8, y - hh - 14) : y + 14;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.style.display = "none"; }
  function bindTip(el, fn) {
    function at(ev) { var t = fn(); showTip(t.title, t.rows, ev.clientX, ev.clientY); }
    el.addEventListener("pointermove", at);
    el.addEventListener("pointerenter", at);
    el.addEventListener("pointerleave", hideTip);
    el.addEventListener("focus", function () {
      var r = el.getBoundingClientRect(), t = fn();
      showTip(t.title, t.rows, r.left + r.width / 2, r.top + r.height / 2);
    });
    el.addEventListener("blur", hideTip);
  }

  // ---------- scales ----------
  function niceTicks(lo, hi) {
    if (hi <= lo) hi = lo + 1;
    var span = hi - lo, raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag, step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    var start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step, ticks = [];
    for (var v = start; v <= end + step / 2; v += step) ticks.push(v);
    return ticks;
  }

  // ---------- card scaffolding ----------
  function card(id, title, sub, cls, buildChart, buildTable, extra) {
    var shown = !!state.tables[id];
    var chartBox = h("div", { "class": "chart" });
    var tableBox = h("div", { "class": "tablewrap" });
    var btn = h("button", { "class": "btn", type: "button", "aria-pressed": String(shown), text: shown ? "Ver gráfico" : "Ver tabla" });
    var el = h("section", { "class": "card " + cls, "aria-labelledby": id + "-t" }, [
      h("div", { "class": "card-head" }, [h("h2", { id: id + "-t", text: title }), btn]),
      h("p", { "class": "sub", text: sub }),
      extra || null,
      chartBox, tableBox
    ]);
    function paint() {
      chartBox.style.display = state.tables[id] ? "none" : "";
      tableBox.style.display = state.tables[id] ? "" : "none";
      btn.textContent = state.tables[id] ? "Ver gráfico" : "Ver tabla";
      btn.setAttribute("aria-pressed", String(!!state.tables[id]));
    }
    btn.addEventListener("click", function () {
      state.tables[id] = !state.tables[id];
      hideTip();
      paint();
      if (!state.tables[id]) buildChart(chartBox);
    });
    buildTable(tableBox);
    paint();
    el._build = function () { if (!state.tables[id]) buildChart(chartBox); };
    return el;
  }
  function makeTable(headers, rows) {
    var thead = h("thead", null, [h("tr", null, headers.map(function (x) { return h("th", { scope: "col", text: x }); }))]);
    var tbody = h("tbody");
    rows.forEach(function (r) {
      tbody.appendChild(h("tr", null, r.map(function (c, i) { return i === 0 ? h("th", { scope: "row", text: c }) : h("td", { text: c }); })));
    });
    return h("table", null, [thead, tbody]);
  }
  function emptyNote(box, msg) { clear(box); box.appendChild(h("div", { "class": "empty", text: msg || "Sin datos para este periodo." })); }

  // ---------- chart 1: spend by month (line) ----------
  function lineChart(box, months) {
    clear(box);
    if (!months.length) return emptyNote(box);
    var W = Math.max(280, box.clientWidth || 600), H = 230, m = { l: 62, r: 20, t: 20, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var vals = months.map(function (x) { return x.total; });
    var ticks = niceTicks(Math.min(0, Math.min.apply(null, vals)), Math.max.apply(null, vals));
    var lo = ticks[0], hi = ticks[ticks.length - 1];
    var n = months.length, step = pw / n;
    function X(i) { return m.l + step * (i + 0.5); }
    function Y(v) { return m.t + ph - (v - lo) / (hi - lo) * ph; }
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Gasto por mes" });
    ticks.forEach(function (t) {
      svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), "class": t === 0 ? "axis-line" : "grid-line" }));
      svg.appendChild(s("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, short(t)));
    });
    var every = Math.max(1, Math.ceil(50 / step));
    months.forEach(function (d, i) {
      if (i % every === 0) svg.appendChild(s("text", { x: X(i), y: H - 8, "text-anchor": "middle" }, monthShort(d.month)));
    });
    var pts = months.map(function (d, i) { return X(i) + "," + Y(d.total); });
    if (n > 1) {
      var area = "M" + X(0) + "," + Y(Math.max(lo, 0)) + " L" + pts.join(" L") + " L" + X(n - 1) + "," + Y(Math.max(lo, 0)) + " Z";
      svg.appendChild(s("path", { d: area, style: "fill: var(--s1); fill-opacity: 0.10" }));
      svg.appendChild(s("path", { d: "M" + pts.join(" L"), style: "fill: none; stroke: var(--s1); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round" }));
    }
    var cross = s("line", { "class": "cross", y1: m.t, y2: m.t + ph, style: "display: none" });
    svg.appendChild(cross);
    // End dot (with surface ring) and selective labels: the last value and the peak.
    function dot(i, selected) {
      svg.appendChild(s("circle", { cx: X(i), cy: Y(months[i].total), r: selected ? 5 : 4, style: "fill: var(--s1); stroke: var(--surface); stroke-width: 2" }));
    }
    var peak = 0;
    months.forEach(function (d, i) { if (d.total > months[peak].total) peak = i; });
    dot(n - 1, false);
    if (peak !== n - 1) dot(peak, false);
    function label(i, anchor) {
      svg.appendChild(s("text", { x: X(i) + (anchor === "end" ? 4 : 0), y: Y(months[i].total) - 10, "text-anchor": anchor, "class": "endlabel" }, short(months[i].total)));
    }
    label(n - 1, n > 2 ? "end" : "middle");
    if (peak !== n - 1 && Math.abs(X(peak) - X(n - 1)) > 64) label(peak, "middle");
    var selIndex = -1;
    months.forEach(function (d, i) { if (d.month === state.month) selIndex = i; });
    if (selIndex >= 0 && selIndex !== n - 1 && selIndex !== peak) dot(selIndex, true);
    months.forEach(function (d, i) {
      var hit = s("rect", { "class": "hit", x: X(i) - step / 2, y: m.t, width: step, height: ph, tabindex: "0", role: "img",
        "aria-label": monthLong(d.month) + ": " + clp(d.total) + ", " + plural(d.count, "transacción", "transacciones") });
      function on() { cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.display = ""; }
      hit.addEventListener("pointerenter", on); hit.addEventListener("focus", on);
      hit.addEventListener("pointerleave", function () { cross.style.display = "none"; });
      hit.addEventListener("blur", function () { cross.style.display = "none"; });
      bindTip(hit, function () {
        return { title: monthLong(d.month), rows: [
          { cls: "c1", label: "Gasto", value: clp(d.total) },
          { label: "Transacciones", value: d.count.toLocaleString("es-CL") }
        ] };
      });
      svg.appendChild(hit);
    });
    box.appendChild(svg);
  }

  // ---------- chart 3: category x month (stacked columns) ----------
  function stackedChart(box, months, cellsByMonth) {
    clear(box);
    if (!months.length) return emptyNote(box);
    var W = Math.max(280, box.clientWidth || 600), H = 260, m = { l: 62, r: 12, t: 12, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var perMonth = months.map(function (d) {
      var pos = 0, neg = 0, seg = {};
      SERIES_ORDER.forEach(function (k) { seg[k] = 0; });
      (cellsByMonth[d.month] || []).forEach(function (c) { seg[seriesKeyOf(c.categoryId)] += c.total; });
      SERIES_ORDER.forEach(function (k) { if (seg[k] > 0) pos += seg[k]; else neg += seg[k]; });
      return { month: d.month, seg: seg, pos: pos, neg: neg, total: d.total };
    });
    var ticks = niceTicks(Math.min(0, Math.min.apply(null, perMonth.map(function (p) { return p.neg; }))), Math.max.apply(null, perMonth.map(function (p) { return p.pos; })));
    var lo = ticks[0], hi = ticks[ticks.length - 1];
    var n = months.length, step = pw / n, bw = Math.min(24, Math.max(4, step * 0.6));
    function X(i) { return m.l + step * (i + 0.5); }
    function Y(v) { return m.t + ph - (v - lo) / (hi - lo) * ph; }
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Gasto por categoría y mes" });
    var defs = s("defs");
    var pat = s("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    pat.appendChild(s("rect", { width: 6, height: 6, style: "fill: var(--uncat-a)" }));
    pat.appendChild(s("rect", { width: 3, height: 6, style: "fill: var(--uncat-b)" }));
    defs.appendChild(pat); svg.appendChild(defs);
    ticks.forEach(function (t) {
      svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), "class": t === 0 ? "axis-line" : "grid-line" }));
      svg.appendChild(s("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, short(t)));
    });
    var every = Math.max(1, Math.ceil(50 / step));
    months.forEach(function (d, i) {
      if (i % every === 0) svg.appendChild(s("text", { x: X(i), y: H - 8, "text-anchor": "middle" }, monthShort(d.month)));
    });
    function fillFor(k) { return k === "u" ? "url(#hatch)" : k === "o" ? "var(--other)" : "var(--s" + k + ")"; }
    perMonth.forEach(function (p, i) {
      var up = 0, down = 0, lastPos = null;
      SERIES_ORDER.forEach(function (k) { if (p.seg[k] > 0) lastPos = k; });
      SERIES_ORDER.forEach(function (k) {
        var v = p.seg[k];
        if (v === 0) return;
        var y0 = v > 0 ? up : down, y1 = y0 + v;
        if (v > 0) up = y1; else down = y1;
        var top = Math.min(Y(y0), Y(y1)), hgt = Math.abs(Y(y0) - Y(y1));
        var gap = hgt > 4 ? 1 : 0; // 2px surface gap between touching segments (1px trimmed on each side)
        var x = X(i) - bw / 2, y = top + gap, ht = Math.max(1, hgt - gap * 2), r = 4;
        var rounded = v > 0 && k === lastPos && ht > r;
        var d = rounded
          ? "M" + x + "," + (y + ht) + " V" + (y + r) + " Q" + x + "," + y + " " + (x + r) + "," + y + " H" + (x + bw - r) + " Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + " V" + (y + ht) + " Z"
          : "M" + x + "," + y + " H" + (x + bw) + " V" + (y + ht) + " H" + x + " Z";
        svg.appendChild(s("path", { d: d, style: "fill: " + fillFor(k) }));
      });
    });
    perMonth.forEach(function (p, i) {
      var hit = s("rect", { "class": "hit", x: X(i) - step / 2, y: m.t, width: step, height: ph, tabindex: "0", role: "img",
        "aria-label": monthLong(p.month) + ": " + clp(p.total) });
      bindTip(hit, function () {
        var rows = [];
        SERIES_ORDER.slice().reverse().forEach(function (k) {
          if (p.seg[k] !== 0) rows.push({ cls: swatchClass(k), label: seriesName(k), value: clp(p.seg[k]) });
        });
        rows.push({ label: "Total", value: clp(p.total) });
        return { title: monthLong(p.month), rows: rows };
      });
      svg.appendChild(hit);
    });
    box.appendChild(svg);
  }

  // ---------- horizontal bars (HTML rows; labels never collide) ----------
  function barRows(box, rows) {
    clear(box);
    if (!rows.length) return emptyNote(box);
    var max = Math.max.apply(null, rows.map(function (r) { return r.total; }));
    var grid = h("div", { "class": "bars" });
    rows.forEach(function (r) {
      var p = max > 0 ? Math.max(0, r.total) / max : 0;
      var track = h("div", { "class": "track", tabindex: "0", role: "img", "aria-label": r.label + ": " + clp(r.total) }, [
        h("div", { "class": "bar " + r.cls, style: "--p:" + p }),
        h("span", { "class": "val", style: "--p:" + p, text: clp(r.total) })
      ]);
      bindTip(track, function () {
        return { title: r.label, rows: [{ cls: r.cls, label: "Gasto", value: clp(r.total) }, { label: "Transacciones", value: r.count.toLocaleString("es-CL") }] };
      });
      grid.appendChild(h("div", { "class": "lab", title: r.label, text: r.label }));
      grid.appendChild(track);
    });
    box.appendChild(grid);
  }

  // ---------- render ----------
  function render() {
    hideTip();
    var app = document.getElementById("app");
    clear(app);
    if (!DATA.months.length) { app.appendChild(h("div", { "class": "empty", text: "Aún no hay transacciones importadas." })); return; }

    var scopeMonths = DATA.months.filter(function (d) { return inScope(d.month); });
    var yearMonths = DATA.months.filter(function (d) { return inYear(d.month); });
    var total = sum(scopeMonths, function (d) { return d.total; });
    var count = sum(scopeMonths, function (d) { return d.count; });
    var categorized = sum(scopeMonths, function (d) { return d.categorizedCount; });
    var scopeLabel = state.month !== "all" ? monthLong(state.month) : state.year !== "all" ? "Año " + state.year : "Todo el historial";

    // Headline row
    var kpis = h("div", { "class": "kpis" }, [
      h("div", { "class": "card kpi hero" }, [h("div", { "class": "label", text: "Gasto total · " + scopeLabel }), h("div", { "class": "value", text: clp(total) })]),
      h("div", { "class": "card kpi" }, [h("div", { "class": "label", text: "Meses cubiertos" }), h("div", { "class": "value", text: String(scopeMonths.length) })]),
      h("div", { "class": "card kpi" }, [h("div", { "class": "label", text: "Transacciones" }), h("div", { "class": "value", text: count.toLocaleString("es-CL") })]),
      h("div", { "class": "card kpi" }, [h("div", { "class": "label", text: "Categorizado" }), h("div", { "class": "value", text: pct(categorized, count) }),
        h("div", { "class": "sub", text: categorized.toLocaleString("es-CL") + " de " + count.toLocaleString("es-CL") })])
    ]);
    app.appendChild(kpis);

    var grid = h("div", { "class": "grid" });
    var built = [];

    // Chart 1: month series (year scope; selected month marked)
    var monthSub = "Ciclo de facturación. " + (state.month !== "all" ? "Mes seleccionado marcado." : "");
    var c1 = card("c-month", "Gasto por mes", monthSub, "wide",
      function (box) { lineChart(box, yearMonths); },
      function (box) {
        box.appendChild(makeTable(["Mes", "Gasto", "Transacciones"], yearMonths.map(function (d) { return [monthLong(d.month), clp(d.total), d.count.toLocaleString("es-CL")]; })));
      });
    grid.appendChild(c1); built.push(c1);

    // Category totals for the full scope
    var catTotals = {}, catCounts = {};
    DATA.categoryMonths.forEach(function (c) {
      if (!inScope(c.month)) return;
      var k = c.categoryId === null ? UNCAT_KEY : c.categoryId;
      catTotals[k] = (catTotals[k] || 0) + c.total;
      catCounts[k] = (catCounts[k] || 0) + c.count;
    });
    var catList = Object.keys(catTotals).map(function (k) { return { key: k, id: k === UNCAT_KEY ? null : k, total: catTotals[k], count: catCounts[k] }; })
      .sort(function (a, b) { return Math.abs(b.total) - Math.abs(a.total); });
    var barList = [], other = { label: "Otros", cls: "c-other", total: 0, count: 0 };
    catList.forEach(function (c) {
      var key = seriesKeyOf(c.id);
      if (key === "o") { other.total += c.total; other.count += c.count; }
      else barList.push({ label: catName[c.key], cls: swatchClass(key), total: c.total, count: c.count });
    });
    if (other.count) barList.push(other);

    var c2 = card("c-cat", "Gasto por categoría", scopeLabel + ". Las categorías menores se agrupan en «Otros».", "",
      function (box) { barRows(box, barList); },
      function (box) {
        box.appendChild(makeTable(["Categoría", "Gasto", "Transacciones", "% del gasto"], catList.map(function (c) {
          return [catName[c.key], clp(c.total), c.count.toLocaleString("es-CL"), pct(c.total, total)];
        })));
      });
    grid.appendChild(c2); built.push(c2);

    // City totals for the full scope
    var cityTotals = {}, cityCounts = {};
    DATA.cityMonths.forEach(function (c) {
      if (!inScope(c.month)) return;
      var k = c.city === null ? "\u0000" : c.city;
      cityTotals[k] = (cityTotals[k] || 0) + c.total;
      cityCounts[k] = (cityCounts[k] || 0) + c.count;
    });
    var cityList = Object.keys(cityTotals).map(function (k) { return { label: k === "\u0000" ? "Sin ciudad" : k, none: k === "\u0000", total: cityTotals[k], count: cityCounts[k] }; })
      .sort(function (a, b) { return Math.abs(b.total) - Math.abs(a.total); });
    var cityBars = [], rest = { label: "Otras ciudades", cls: "c1", total: 0, count: 0 }, shownNamed = 0;
    cityList.forEach(function (c) {
      if (c.none) { cityBars.push({ label: c.label, cls: "c1", total: c.total, count: c.count }); return; }
      if (shownNamed < TOP_CITIES) { shownNamed += 1; cityBars.push({ label: c.label, cls: "c1", total: c.total, count: c.count }); }
      else { rest.total += c.total; rest.count += c.count; }
    });
    if (rest.count) cityBars.push(rest);
    cityBars.sort(function (a, b) { return (a.label === "Otras ciudades") - (b.label === "Otras ciudades") || Math.abs(b.total) - Math.abs(a.total); });

    var c4 = card("c-city", "Gasto por ciudad", scopeLabel + ". Ciudad tal como la imprime el banco (algunas vienen truncadas).", "",
      function (box) { barRows(box, cityBars); },
      function (box) {
        box.appendChild(makeTable(["Ciudad", "Gasto", "Transacciones"], cityList.map(function (c) { return [c.label, clp(c.total), c.count.toLocaleString("es-CL")]; })));
      });
    grid.appendChild(c4); built.push(c4);

    // Chart 3: category x month (year scope)
    var cellsByMonth = {};
    DATA.categoryMonths.forEach(function (c) { if (inYear(c.month)) (cellsByMonth[c.month] = cellsByMonth[c.month] || []).push(c); });
    var present = {};
    Object.keys(cellsByMonth).forEach(function (mk) { cellsByMonth[mk].forEach(function (c) { present[seriesKeyOf(c.categoryId)] = true; }); });
    var legend = h("ul", { "class": "legend", "aria-label": "Leyenda de categorías" });
    SERIES_ORDER.forEach(function (k) {
      if (present[k]) legend.appendChild(h("li", null, [h("span", { "class": "sw " + swatchClass(k) }), h("span", { text: seriesName(k) })]));
    });
    var allCatKeys = DATA.categories.map(function (c) { return c.categoryId; });
    var c3 = card("c-catmonth", "Categoría por mes", "Gasto apilado por categoría en cada ciclo. Pasa el cursor sobre un mes para ver el detalle.", "wide",
      function (box) { stackedChart(box, yearMonths, cellsByMonth); },
      function (box) {
        var heads = ["Mes"].concat(allCatKeys.map(function (id) { return catName[id === null ? UNCAT_KEY : id]; })).concat(["Total"]);
        var rows = yearMonths.map(function (d) {
          var byCat = {};
          (cellsByMonth[d.month] || []).forEach(function (c) { byCat[c.categoryId === null ? UNCAT_KEY : c.categoryId] = c.total; });
          return [monthLong(d.month)].concat(allCatKeys.map(function (id) { var v = byCat[id === null ? UNCAT_KEY : id]; return v === undefined ? "–" : clp(v); })).concat([clp(d.total)]);
        });
        box.appendChild(makeTable(heads, rows));
      }, legend);
    // On screen: month line, then category and city bars side by side, then category x month.
    grid.appendChild(c3); built.push(c3);

    app.appendChild(grid);
    built.forEach(function (c) { c._build(); });
  }

  // ---------- controls ----------
  var yearSel = document.getElementById("f-year"), monthSel = document.getElementById("f-month"), themeSel = document.getElementById("f-theme");
  function fillControls() {
    DATA.years.forEach(function (y) { yearSel.appendChild(h("option", { value: y.year, text: y.year })); });
    refillMonths();
  }
  function refillMonths() {
    clear(monthSel);
    monthSel.appendChild(h("option", { value: "all", text: "Todos los meses" }));
    DATA.months.filter(function (d) { return inYear(d.month); }).forEach(function (d) { monthSel.appendChild(h("option", { value: d.month, text: monthLong(d.month) })); });
    monthSel.value = state.month;
  }
  yearSel.addEventListener("change", function () { state.year = yearSel.value; state.month = "all"; refillMonths(); render(); });
  monthSel.addEventListener("change", function () { state.month = monthSel.value; render(); });
  themeSel.addEventListener("change", function () {
    if (themeSel.value === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", themeSel.value);
  });
  window.addEventListener("resize", function () { render(); });

  fillControls();
  render();
})();
`;
