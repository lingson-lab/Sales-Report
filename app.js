(() => {
  "use strict";

  const BRAND_COLORS = [
    "#0300CE", "#5856D6", "#7D7AFF", "#A7A5FF", "#CAC9FF",
    "#34329B", "#7674B8", "#9A98C9"
  ];

  const FIELD_ALIASES = {
    date: ["수강시작일", "수강 시작일", "거래일시", "거래 일시", "시작일자", "시작일"],
    facility: ["등록명", "등록 명", "시설명", "강좌명", "프로그램명", "상품명"],
    status: ["거래구분", "거래 구분", "거래상태", "거래 상태", "상태"],
    transactionType: ["거래종류", "거래 종류", "거래유형", "거래 유형"],
    amount: ["실매출액", "실 매출액", "실결제금액", "실 결제금액", "매출금액", "결제금액", "금액"],
    member: ["회원명", "회원 명", "성명", "입주민명"],
    building: ["동", "동명", "동 명"],
    channel: ["담당자", "접수채널", "접수 채널", "채널", "등록담당자"],
    count: ["건수", "수량"]
  };

  const state = {
    rows: [],
    keys: {},
    months: []
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    excelFile: $("excelFile"),
    monthSelect: $("monthSelect"),
    printBtn: $("printBtn"),
    statusText: $("statusText"),
    statusDot: $("statusDot"),
    periodText: $("periodText"),
    totalSales: $("totalSales"),
    totalTransactions: $("totalTransactions"),
    uniqueMembers: $("uniqueMembers"),
    averagePayment: $("averagePayment"),
    facilityMonthLabel: $("facilityMonthLabel"),
    facilityTable: $("facilityTable"),
    donutChart: $("donutChart"),
    donutTotal: $("donutTotal"),
    donutLegend: $("donutLegend"),
    statusSummary: $("statusSummary"),
    channelSummary: $("channelSummary"),
    buildingBars: $("buildingBars"),
    generatedAt: $("generatedAt")
  };

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[()_\-./]/g, "")
      .toLowerCase();
  }

  function findHeader(headers, aliases) {
    const normalized = headers.map(h => ({ raw: h, norm: normalize(h) }));

    for (const alias of aliases) {
      const target = normalize(alias);
      const exact = normalized.find(item => item.norm === target);
      if (exact) return exact.raw;
    }

    for (const alias of aliases) {
      const target = normalize(alias);
      const partial = normalized.find(item =>
        item.norm.includes(target) || target.includes(item.norm)
      );
      if (partial) return partial.raw;
    }
    return null;
  }

  function detectKeys(headers) {
    const keys = {};
    for (const [name, aliases] of Object.entries(FIELD_ALIASES)) {
      keys[name] = findHeader(headers, aliases);
    }
    state.keys = keys;

    const required = ["date", "facility", "amount"];
    const missing = required.filter(k => !keys[k]);

    if (missing.length) {
      throw new Error(
        "필수 헤더를 찾지 못했습니다: " +
        missing.map(k => ({date:"기준일", facility:"등록명", amount:"실매출액"}[k])).join(", ")
      );
    }
  }

  function parseNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value ?? "")
      .replace(/₩|원|,/g, "")
      .replace(/\s/g, "")
      .replace(/[^\d.+-]/g, "");
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === "number" && window.XLSX?.SSF?.parse_date_code) {
      const d = XLSX.SSF.parse_date_code(value);
      if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, Math.floor(d.S || 0));
    }

    const text = String(value ?? "").trim();
    const m = text.match(/^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function monthKey(date) {
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function formatMonth(key) {
    if (!key) return "-";
    const [y, m] = key.split("-");
    return `${y}.${m}`;
  }

  function formatWon(n) {
    return `${Math.round(n).toLocaleString("ko-KR")}원`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message, type = "") {
    els.statusText.textContent = message;
    els.statusDot.className = `status-dot ${type}`.trim();
  }

  function normalizeFacility(value) {
    const text = String(value ?? "").trim();
    if (!text) return "기타";
    const first = text.split(/[▶>›]/)[0].trim();
    return first || text;
  }

  function countOf(row) {
    return state.keys.count ? Math.max(1, parseNumber(row[state.keys.count])) : 1;
  }

  function isCancelled(row) {
    const status = state.keys.status ? String(row[state.keys.status] ?? "") : "";
    const tx = state.keys.transactionType ? String(row[state.keys.transactionType] ?? "") : "";
    return /(취소|환불|반품|무효)/.test(status + " " + tx);
  }

  function prepareRows(rows) {
    return rows.map(row => {
      const d = parseDate(row[state.keys.date]);
      return {
        ...row,
        __date: d,
        __month: monthKey(d),
        __facility: normalizeFacility(row[state.keys.facility]),
        __amount: parseNumber(row[state.keys.amount]),
        __count: countOf(row),
        __cancelled: isCancelled(row)
      };
    }).filter(row => row.__date);
  }

  function group(rows, getKey, valueFn = () => 1) {
    const map = new Map();
    rows.forEach(row => {
      const key = String(getKey(row) ?? "").trim() || "기타";
      map.set(key, (map.get(key) || 0) + valueFn(row));
    });
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }

  function percent(n, d) {
    return d ? (n / d) * 100 : 0;
  }

  function renderSummary(container, items, total) {
    if (!items.length) {
      container.innerHTML = '<div class="empty">데이터 없음</div>';
      return;
    }

    const sorted = [...items].sort((a,b) => b.value - a.value);
    container.innerHTML = sorted.map(item => {
      const p = percent(item.value, total);
      return `
        <div class="summary-row">
          <div class="summary-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          <div class="progress"><i style="width:${Math.max(2, p)}%"></i></div>
          <div class="summary-value">${item.value.toLocaleString("ko-KR")}건 · ${p.toFixed(1)}%</div>
        </div>
      `;
    }).join("");
  }

  function renderFacility(rows) {
    const normalRows = rows.filter(r => !r.__cancelled);
    const map = new Map();

    normalRows.forEach(row => {
      const name = row.__facility;
      if (!map.has(name)) {
        map.set(name, { name, sales: 0, transactions: 0, members: new Set() });
      }
      const item = map.get(name);
      item.sales += row.__amount;
      item.transactions += row.__count;

      if (state.keys.member) {
        const member = String(row[state.keys.member] ?? "").trim();
        if (member) item.members.add(member);
      }
    });

    const items = [...map.values()].sort((a,b) => b.sales - a.sales);
    const totalSales = items.reduce((s, x) => s + x.sales, 0);
    const totalTransactions = items.reduce((s, x) => s + x.transactions, 0);
    const allMembers = new Set(
      normalRows
        .map(r => state.keys.member ? String(r[state.keys.member] ?? "").trim() : "")
        .filter(Boolean)
    );

    if (!items.length) {
      els.facilityTable.innerHTML = '<tr><td colspan="5" class="empty">데이터 없음</td></tr>';
      els.donutChart.style.background = "conic-gradient(#E9ECF3 0 100%)";
      els.donutLegend.innerHTML = "";
      els.donutTotal.textContent = "0원";
      return;
    }

    els.facilityTable.innerHTML = items.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td class="num">${formatWon(item.sales)}</td>
        <td class="num">${item.transactions.toLocaleString("ko-KR")}건</td>
        <td class="num">${state.keys.member ? item.members.size.toLocaleString("ko-KR")+"명" : "-"}</td>
        <td class="num">${percent(item.sales, totalSales).toFixed(1)}%</td>
      </tr>
    `).join("") + `
      <tr class="total-row">
        <td>합계</td>
        <td class="num">${formatWon(totalSales)}</td>
        <td class="num">${totalTransactions.toLocaleString("ko-KR")}건</td>
        <td class="num">${state.keys.member ? allMembers.size.toLocaleString("ko-KR")+"명" : "-"}</td>
        <td class="num">100.0%</td>
      </tr>
    `;

    let cursor = 0;
    const segments = [];
    items.slice(0, 8).forEach((item, i) => {
      const p = percent(item.sales, totalSales);
      const next = cursor + p;
      segments.push(`${BRAND_COLORS[i % BRAND_COLORS.length]} ${cursor}% ${next}%`);
      cursor = next;
    });
    if (cursor < 100) segments.push(`#E9ECF3 ${cursor}% 100%`);

    els.donutChart.style.background = `conic-gradient(${segments.join(",")})`;
    els.donutTotal.textContent = formatWon(totalSales);

    els.donutLegend.innerHTML = items.slice(0, 6).map((item, i) => `
      <div class="legend-row">
        <i class="legend-dot" style="background:${BRAND_COLORS[i % BRAND_COLORS.length]}"></i>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${percent(item.sales, totalSales).toFixed(1)}%</span>
      </div>
    `).join("");
  }

  function renderBuildings(rows) {
    if (!state.keys.building) {
      els.buildingBars.innerHTML = '<div class="empty">"동" 헤더를 찾지 못했습니다.</div>';
      return;
    }

    const map = new Map();

    rows.filter(r => !r.__cancelled).forEach(row => {
      const buildingRaw = String(row[state.keys.building] ?? "").trim();
      if (!buildingRaw) return;
      const building = /동$/.test(buildingRaw) ? buildingRaw : `${buildingRaw}동`;

      if (!map.has(building)) {
        map.set(building, { members: new Set(), transactions: 0, sales: 0 });
      }
      const item = map.get(building);
      item.transactions += row.__count;
      item.sales += row.__amount;

      if (state.keys.member) {
        const member = String(row[state.keys.member] ?? "").trim();
        if (member) item.members.add(member);
      }
    });

    const items = [...map.entries()].map(([name, item]) => ({
      name,
      members: state.keys.member ? item.members.size : item.transactions,
      transactions: item.transactions,
      sales: item.sales
    })).sort((a,b) => b.members - a.members || b.transactions - a.transactions).slice(0,5);

    if (!items.length) {
      els.buildingBars.innerHTML = '<div class="empty">데이터 없음</div>';
      return;
    }

    const max = Math.max(...items.map(x => x.members), 1);

    els.buildingBars.innerHTML = items.map(item => `
      <div class="bar-row">
        <div class="bar-name">${escapeHtml(item.name)}</div>
        <div class="bar-track">
          <i class="bar-fill" style="width:${Math.max(4, item.members/max*100)}%"></i>
        </div>
        <div class="bar-value">${item.members.toLocaleString("ko-KR")}명 · ${formatWon(item.sales)}</div>
      </div>
    `).join("");
  }

  function render(month) {
    const rows = state.rows.filter(r => r.__month === month);
    const normal = rows.filter(r => !r.__cancelled);

    const totalSales = normal.reduce((s, r) => s + r.__amount, 0);
    const totalTransactions = normal.reduce((s, r) => s + r.__count, 0);

    const members = new Set(
      normal
        .map(r => state.keys.member ? String(r[state.keys.member] ?? "").trim() : "")
        .filter(Boolean)
    );

    els.totalSales.textContent = formatWon(totalSales);
    els.totalTransactions.textContent = `${totalTransactions.toLocaleString("ko-KR")}건`;
    els.uniqueMembers.textContent = state.keys.member ? `${members.size.toLocaleString("ko-KR")}명` : "-";
    els.averagePayment.textContent = totalTransactions ? formatWon(totalSales / totalTransactions) : "0원";

    const dates = rows.map(r => r.__date).filter(Boolean).sort((a,b) => a-b);
    if (dates.length) {
      const start = dates[0];
      const end = dates[dates.length - 1];
      const f = d => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
      els.periodText.textContent = `${f(start)} ~ ${f(end)} · 선택 기준월 ${formatMonth(month)}`;
    }

    els.facilityMonthLabel.textContent = formatMonth(month);
    renderFacility(rows);

    const statusItems = state.keys.status
      ? group(rows, r => r[state.keys.status], r => r.__count)
      : [{ name: "정상", value: totalTransactions }];
    renderSummary(els.statusSummary, statusItems, statusItems.reduce((s,x) => s + x.value,0));

    const channelItems = state.keys.channel
      ? group(rows, r => r[state.keys.channel], r => r.__count)
      : [];
    renderSummary(els.channelSummary, channelItems, channelItems.reduce((s,x) => s + x.value,0));

    renderBuildings(rows);

    els.generatedAt.textContent =
      `생성 ${new Intl.DateTimeFormat("ko-KR", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      }).format(new Date())}`;
  }

  function populateMonths() {
    state.months = [...new Set(state.rows.map(r => r.__month).filter(Boolean))].sort().reverse();
    els.monthSelect.innerHTML = "";

    if (!state.months.length) {
      els.monthSelect.disabled = true;
      els.monthSelect.innerHTML = "<option>기준월 없음</option>";
      return;
    }

    state.months.forEach(month => {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = formatMonth(month);
      els.monthSelect.appendChild(option);
    });

    els.monthSelect.disabled = false;
    els.monthSelect.value = state.months[0];
    render(state.months[0]);
  }

  async function loadFile(file) {
    try {
      setStatus(`${file.name} 파일을 읽는 중입니다.`);
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("첫 번째 시트를 찾을 수 없습니다.");

      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
      if (!rows.length) throw new Error("분석할 데이터가 없습니다.");

      detectKeys(Object.keys(rows[0]));
      state.rows = prepareRows(rows);
      populateMonths();

      setStatus(
        `${file.name} · ${state.rows.length.toLocaleString("ko-KR")}행 분석 완료 · 데이터는 브라우저에서만 처리됩니다.`,
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(`분석 실패: ${err.message}`, "error");
    }
  }

  els.excelFile.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  });

  els.monthSelect.addEventListener("change", e => render(e.target.value));
  els.printBtn.addEventListener("click", () => window.print());

  if (!window.XLSX) {
    setStatus("엑셀 분석 라이브러리를 불러오지 못했습니다.", "error");
  }
})();
