(() => {
  "use strict";

  const BRAND_COLORS = [
    "#0300CE", "#5856D6", "#7D7AFF", "#A7A5FF", "#CAC9FF",
    "#34329B", "#7674B8", "#9A98C9"
  ];

  const SALES_ALIASES = {
    period: [
      "수강시작월", "수강 시작월", "수강월", "시작월",
      "수강시작일", "수강 시작일", "시작일자", "시작일",
      "거래일시", "거래 일시"
    ],
    facility: ["등록명", "등록 명", "시설명", "시설", "강좌명", "프로그램명", "상품명"],
    status: ["거래구분", "거래 구분", "거래상태", "거래 상태", "상태"],
    transactionType: ["거래종류", "거래 종류", "거래유형", "거래 유형"],
    amount: ["실매출액", "실 매출액", "실결제금액", "실 결제금액", "매출금액", "결제금액", "금액"],
    member: ["회원명", "회원 명", "성명", "입주민명", "이름"],
    building: ["동", "동명", "동 명", "동호수", "동 호수", "동/호", "동호"],
    count: ["건수", "수량"]
  };

  const ACCESS_ALIASES = {
    dateTime: [
      "출입일시", "출입 일시", "입장일시", "입장 일시",
      "인증일시", "인증 일시", "이용일시", "이용 일시",
      "처리일시", "처리 일시", "일시"
    ],
    date: ["출입일자", "출입 일자", "출입일", "입장일자", "입장 일자", "일자", "날짜"],
    time: ["출입시간", "출입 시간", "출입시각", "입장시간", "입장 시간", "인증시간", "인증 시간", "시간", "시각"],
    building: ["동", "동명", "동 명", "아파트동", "동호수", "동 호수", "동/호", "동호"],
    count: ["건수", "수량"]
  };

  const state = {
    viewMode: "month",
    salesRows: [],
    salesMonths: [],
    salesWeeks: [],
    salesSourceRowCount: 0,
    salesFiles: [],
    accessRows: [],
    accessMonths: [],
    accessWeeks: [],
    accessSourceRowCount: 0,
    accessFiles: []
  };

  const $ = id => document.getElementById(id);

  const els = {
    dataFiles: $("dataFiles"),
    accessFiles: $("accessFiles"),
    monthlyMode: $("monthlyMode"),
    weeklyMode: $("weeklyMode"),
    periodSelect: $("periodSelect"),
    printBtn: $("printBtn"),
    statusText: $("statusText"),
    statusDot: $("statusDot"),
    accessStatusText: $("accessStatusText"),
    accessStatusDot: $("accessStatusDot"),
    periodText: $("periodText"),
    salesPeriodRule: $("salesPeriodRule"),
    currentSalesHeader: $("currentSalesHeader"),
    previousSalesHeader: $("previousSalesHeader"),
    comparisonSalesHeader: $("comparisonSalesHeader"),

    totalSales: $("totalSales"),
    uniqueMembers: $("uniqueMembers"),
    averagePayment: $("averagePayment"),
    totalTransactions: $("totalTransactions"),

    salesDelta: $("salesDelta"),
    membersDelta: $("membersDelta"),
    averageDelta: $("averageDelta"),
    transactionsDelta: $("transactionsDelta"),
    comparisonNote: $("comparisonNote"),

    topFacilityName: $("topFacilityName"),
    topFacilitySales: $("topFacilitySales"),
    topFacilityDelta: $("topFacilityDelta"),
    bottomFacilityName: $("bottomFacilityName"),
    bottomFacilitySales: $("bottomFacilitySales"),
    bottomFacilityDelta: $("bottomFacilityDelta"),

    facilityMonthLabel: $("facilityMonthLabel"),
    facilityTable: $("facilityTable"),
    donutChart: $("donutChart"),
    donutTotal: $("donutTotal"),
    donutLegend: $("donutLegend"),

    peakAccessTime: $("peakAccessTime"),
    peakAccessCount: $("peakAccessCount"),
    peakAccessShare: $("peakAccessShare"),
    peakAccessMonth: $("peakAccessMonth"),
    accessMonthLabel: $("accessMonthLabel"),
    accessHourTable: $("accessHourTable"),
    accessIncludedCount: $("accessIncludedCount"),
    accessExcludedNote: $("accessExcludedNote"),

    sourceRowCount: $("sourceRowCount"),
    testExcludedCount: $("testExcludedCount"),
    refundExcludedCount: $("refundExcludedCount"),
    refundExcludedAmount: $("refundExcludedAmount"),
    cancelExcludedCount: $("cancelExcludedCount"),
    includedRowCount: $("includedRowCount"),

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

  function detectSalesKeys(headers, fileName) {
    const keys = {};
    for (const [name, aliases] of Object.entries(SALES_ALIASES)) {
      keys[name] = findHeader(headers, aliases);
    }

    const missing = ["period", "facility", "amount"].filter(k => !keys[k]);
    if (!keys.status && !keys.transactionType) missing.push("statusOrType");

    if (missing.length) {
      const labelMap = {
        period: "수강 시작월/수강 시작일",
        facility: "시설명/등록명",
        amount: "실매출액/결제금액",
        statusOrType: "거래구분 또는 거래종류"
      };
      throw new Error(`${fileName}: 필수 헤더를 찾지 못했습니다 - ${missing.map(k => labelMap[k]).join(", ")}`);
    }

    return keys;
  }

  function detectAccessKeys(headers, fileName) {
    const keys = {};
    for (const [name, aliases] of Object.entries(ACCESS_ALIASES)) {
      keys[name] = findHeader(headers, aliases);
    }

    const hasCombined = Boolean(keys.dateTime);
    const hasSeparated = Boolean(keys.date && keys.time);

    if (!hasCombined && !hasSeparated) {
      throw new Error(`${fileName}: 출입일시 통합 컬럼 또는 출입일자 + 출입시간 컬럼을 찾지 못했습니다.`);
    }

    return keys;
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

  function excelSerialToDate(value) {
    if (typeof value !== "number" || !window.XLSX?.SSF?.parse_date_code) return null;
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d || 1, d.H || 0, d.M || 0, Math.floor(d.S || 0));
  }

  function parsePeriod(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    const serial = excelSerialToDate(value);
    if (serial) return serial;

    const text = String(value ?? "").trim();
    if (!text) return null;

    const fullDate = text.match(/^(\d{4})[.\-/년\s]+(\d{1,2})(?:[.\-/월\s]+(\d{1,2}))?/);
    if (fullDate) {
      return new Date(Number(fullDate[1]), Number(fullDate[2]) - 1, Number(fullDate[3] || 1));
    }

    const compact = text.match(/^(\d{4})(\d{2})$/);
    if (compact) return new Date(Number(compact[1]), Number(compact[2]) - 1, 1);

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function hasDayPrecision(value, headerName = "") {
    const header = normalize(headerName);
    const monthOnlyHeaders = ["수강시작월", "수강월", "시작월"].map(normalize);
    if (monthOnlyHeaders.includes(header)) return false;

    if (/일|일시|날짜|date/.test(header)) return true;

    if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
    if (typeof value === "number" && Number.isFinite(value)) return true;

    const text = String(value ?? "").trim();
    if (!text) return false;

    if (/^\d{8}$/.test(text)) return true;
    if (/\d{4}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}/.test(text)) return true;
    return false;
  }

  function parseHour(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getHours();

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.floor(((((value % 1) + 1) % 1) * 24) + 1e-7) % 24;
    }

    const text = String(value ?? "").trim().toLowerCase();
    const match = text.match(/(오전|오후|am|pm)?\s*(\d{1,2})(?:[:시]\s*(\d{1,2}))?/i);
    if (!match) return null;

    let hour = Number(match[2]);
    const mark = (match[1] || "").toLowerCase();
    if ((mark === "오후" || mark === "pm") && hour < 12) hour += 12;
    if ((mark === "오전" || mark === "am") && hour === 12) hour = 0;
    return hour >= 0 && hour <= 23 ? hour : null;
  }

  function parseDateTime(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    const serial = excelSerialToDate(value);
    if (serial) return serial;

    const text = String(value ?? "").trim();
    if (!text) return null;

    const matched = text.match(
      /(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})(?:일)?(?:\s+|T)?(\d{1,2})?(?::(\d{1,2}))?(?::(\d{1,2}))?/
    );

    if (matched) {
      return new Date(
        Number(matched[1]),
        Number(matched[2]) - 1,
        Number(matched[3]),
        Number(matched[4] || 0),
        Number(matched[5] || 0),
        Number(matched[6] || 0)
      );
    }

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function monthKey(date) {
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function previousMonthKey(key) {
    if (!key) return null;
    const [year, month] = key.split("-").map(Number);
    return monthKey(new Date(year, month - 2, 1));
  }

  function dateKey(date) {
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function weekStart(date) {
    if (!date) return null;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKey(date) {
    return dateKey(weekStart(date));
  }

  function parseDateKey(key) {
    if (!key) return null;
    const matched = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return null;
    return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  }

  function previousWeekKey(key) {
    const d = parseDateKey(key);
    if (!d) return null;
    d.setDate(d.getDate() - 7);
    return dateKey(d);
  }

  function formatMonth(key) {
    if (!key) return "-";
    const [y, m] = key.split("-");
    return `${y}.${m}`;
  }

  function formatWeek(key) {
    const start = parseDateKey(key);
    if (!start) return "-";
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startText = `${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, "0")}.${String(start.getDate()).padStart(2, "0")}`;
    const endText = start.getFullYear() === end.getFullYear()
      ? `${String(end.getMonth() + 1).padStart(2, "0")}.${String(end.getDate()).padStart(2, "0")}`
      : `${end.getFullYear()}.${String(end.getMonth() + 1).padStart(2, "0")}.${String(end.getDate()).padStart(2, "0")}`;
    return `${startText} ~ ${endText}`;
  }

  function formatPeriod(key) {
    return state.viewMode === "week" ? formatWeek(key) : formatMonth(key);
  }

  function previousPeriodKey(key) {
    return state.viewMode === "week" ? previousWeekKey(key) : previousMonthKey(key);
  }

  function comparisonWord() {
    return state.viewMode === "week" ? "전주" : "전월";
  }

  function periodWord() {
    return state.viewMode === "week" ? "주간" : "월간";
  }

  function periodKeyOf(row) {
    return state.viewMode === "week" ? row.__week : row.__month;
  }

  function formatWon(n) {
    return `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
  }

  function formatHour(hour) {
    if (hour === null || hour === undefined || Number.isNaN(hour)) return "-";
    const start = String(hour).padStart(2, "0");
    const end = String(hour).padStart(2, "0");
    return `${start}:00 ~ ${end}:59`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message, type = "", kind = "sales") {
    const textEl = kind === "access" ? els.accessStatusText : els.statusText;
    const dotEl = kind === "access" ? els.accessStatusDot : els.statusDot;
    textEl.textContent = message;
    dotEl.className = `status-dot ${type}`.trim();
  }

  function normalizeFacility(value) {
    const text = String(value ?? "").trim();
    if (!text) return "기타";
    const first = text.split(/[▶>›]/)[0].trim();
    return first || text;
  }

  function normalizeBuilding(value) {
    return String(value ?? "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/\.0$/, "");
  }

  function isTestBuilding(value) {
    const text = normalizeBuilding(value);
    if (!text) return false;
    if (["999", "9999", "999동", "9999동"].includes(text)) return true;
    return /^(999|9999)동/.test(text);
  }

  function countOf(row, keys) {
    if (!keys.count) return 1;
    const count = parseNumber(row[keys.count]);
    return count > 0 ? count : 1;
  }

  function classifyTransaction(row, keys) {
    const status = keys.status ? String(row[keys.status] ?? "").trim() : "";
    const tx = keys.transactionType ? String(row[keys.transactionType] ?? "").trim() : "";
    const combined = `${status} ${tx}`;
    if (/환불/.test(combined)) return "refund";
    if (/취소/.test(combined)) return "cancel";
    return "sale";
  }

  function prepareSalesRows(rows, keys, fileName) {
    return rows.map((row, index) => {
      const rawPeriod = row[keys.period];
      const date = parsePeriod(rawPeriod);
      const dayPrecision = hasDayPrecision(rawPeriod, keys.period);
      const building = keys.building ? row[keys.building] : "";
      const member = keys.member ? String(row[keys.member] ?? "").trim() : "";

      return {
        __sourceFile: fileName,
        __sourceRow: index + 2,
        __date: date,
        __month: monthKey(date),
        __week: date && dayPrecision ? weekKey(date) : null,
        __hasDayPrecision: dayPrecision,
        __facility: normalizeFacility(row[keys.facility]),
        __amount: parseNumber(row[keys.amount]),
        __member: member,
        __building: normalizeBuilding(building),
        __transactionClass: classifyTransaction(row, keys),
        __count: countOf(row, keys),
        __isTestBuilding: isTestBuilding(building),
        __hasMemberColumn: Boolean(keys.member),
        __validPeriod: Boolean(date)
      };
    });
  }

  function prepareAccessRows(rows, keys, fileName) {
    return rows.map((row, index) => {
      let dateTime = null;
      let hour = null;

      if (keys.dateTime) {
        dateTime = parseDateTime(row[keys.dateTime]);
        hour = dateTime ? dateTime.getHours() : null;
      } else {
        const date = parsePeriod(row[keys.date]);
        hour = parseHour(row[keys.time]);
        if (date && hour !== null) {
          dateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0);
        }
      }

      const building = keys.building ? row[keys.building] : "";

      return {
        __sourceFile: fileName,
        __sourceRow: index + 2,
        __dateTime: dateTime,
        __month: monthKey(dateTime),
        __week: weekKey(dateTime),
        __hour: hour,
        __count: countOf(row, keys),
        __building: normalizeBuilding(building),
        __isTestBuilding: isTestBuilding(building),
        __validDateTime: Boolean(dateTime && hour !== null)
      };
    });
  }

  function percent(n, d) {
    return d ? (n / d) * 100 : 0;
  }

  function netSalesAmount(row) {
    const amount = Math.abs(row.__amount);
    if (row.__transactionClass === "sale") return amount;
    if (row.__transactionClass === "refund") return -amount;
    return 0;
  }

  function getEligibleSalesRows(period) {
    // 실매출 반영 행: 테스트동/취소 제외, 매출은 +, 환불은 -
    if (!period) return [];
    return state.salesRows.filter(row =>
      periodKeyOf(row) === period &&
      row.__validPeriod &&
      !row.__isTestBuilding &&
      ["sale", "refund"].includes(row.__transactionClass)
    );
  }

  function getSaleOnlyRows(period) {
    if (!period) return [];
    return state.salesRows.filter(row =>
      periodKeyOf(row) === period &&
      row.__validPeriod &&
      !row.__isTestBuilding &&
      row.__transactionClass === "sale"
    );
  }

  function getPeriodRawSalesRows(period) {
    if (!period) return [];
    return state.salesRows.filter(row => periodKeyOf(row) === period && row.__validPeriod);
  }

  function getSalesMetrics(period) {
    const rows = getEligibleSalesRows(period);
    const saleRows = getSaleOnlyRows(period);
    const sales = rows.reduce((sum, row) => sum + netSalesAmount(row), 0);
    const transactions = saleRows.reduce((sum, row) => sum + row.__count, 0);
    const hasMemberColumn = saleRows.some(row => row.__hasMemberColumn) || state.salesRows.some(row => row.__hasMemberColumn);
    const members = new Set(saleRows.map(row => row.__member).filter(Boolean));

    return {
      rows,
      saleRows,
      sales,
      transactions,
      members: hasMemberColumn ? members.size : null,
      average: transactions ? sales / transactions : 0
    };
  }

  function aggregateFacilities(period) {
    const map = new Map();
    getEligibleSalesRows(period).forEach(row => {
      const name = row.__facility;
      if (!map.has(name)) {
        map.set(name, { name, sales: 0, transactions: 0, members: new Set() });
      }
      const item = map.get(name);
      item.sales += netSalesAmount(row);

      // 거래건수와 회원수는 실제 매출 등록 건만 집계
      if (row.__transactionClass === "sale") {
        item.transactions += row.__count;
        if (row.__member) item.members.add(row.__member);
      }
    });
    return map;
  }

  function deltaInfo(current, previous, available = true) {
    const compare = comparisonWord();
    if (!available || previous === null || previous === undefined) {
      return { text: `${compare} 비교 -`, cls: "neutral" };
    }
    if (previous === 0) {
      if (current === 0) return { text: `${compare} 대비 0.0%`, cls: "flat" };
      return { text: `${compare} 대비 신규`, cls: "up" };
    }
    const rate = ((current - previous) / previous) * 100;
    if (Math.abs(rate) < 0.05) return { text: `${compare} 대비 0.0%`, cls: "flat" };
    return {
      text: `${compare} 대비 ${rate > 0 ? "▲" : "▼"} ${Math.abs(rate).toFixed(1)}%`,
      cls: rate > 0 ? "up" : "down"
    };
  }

  function compactDelta(current, previous, available = true) {
    if (!available) return { text: "-", cls: "neutral" };
    if (previous === 0) {
      if (current === 0) return { text: "0.0%", cls: "flat" };
      return { text: "신규", cls: "up" };
    }
    const rate = ((current - previous) / previous) * 100;
    if (Math.abs(rate) < 0.05) return { text: "0.0%", cls: "flat" };
    return {
      text: `${rate > 0 ? "▲" : "▼"} ${Math.abs(rate).toFixed(1)}%`,
      cls: rate > 0 ? "up" : "down"
    };
  }

  function setDeltaElement(el, info, baseClass = "kpi-delta") {
    if (!el) return;
    el.textContent = info.text;
    el.className = `${baseClass} ${info.cls}`;
  }

  function renderFacilityHighlights(month, previousMonth, comparisonAvailable) {
    const currentMap = aggregateFacilities(month);
    const previousMap = aggregateFacilities(previousMonth);
    const items = [...currentMap.values()]
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "ko"));

    if (!items.length) {
      els.topFacilityName.textContent = "-";
      els.topFacilitySales.textContent = "-";
      setDeltaElement(els.topFacilityDelta, { text: `${comparisonWord()} 비교 -`, cls: "neutral" }, "mini-delta");
      els.bottomFacilityName.textContent = "-";
      els.bottomFacilitySales.textContent = "-";
      setDeltaElement(els.bottomFacilityDelta, { text: `${comparisonWord()} 비교 -`, cls: "neutral" }, "mini-delta");
      return;
    }

    const top = items[0];
    const bottom = items[items.length - 1];
    const topPrev = previousMap.get(top.name)?.sales ?? 0;
    const bottomPrev = previousMap.get(bottom.name)?.sales ?? 0;

    els.topFacilityName.textContent = top.name;
    els.topFacilitySales.textContent = formatWon(top.sales);
    setDeltaElement(els.topFacilityDelta, deltaInfo(top.sales, topPrev, comparisonAvailable), "mini-delta");

    els.bottomFacilityName.textContent = bottom.name;
    els.bottomFacilitySales.textContent = formatWon(bottom.sales);
    setDeltaElement(els.bottomFacilityDelta, deltaInfo(bottom.sales, bottomPrev, comparisonAvailable), "mini-delta");
  }

  function renderFacilityTable(month, previousMonth, comparisonAvailable) {
    const currentMap = aggregateFacilities(month);
    const previousMap = aggregateFacilities(previousMonth);
    const names = new Set([...currentMap.keys(), ...(comparisonAvailable ? previousMap.keys() : [])]);

    const items = [...names].map(name => {
      const current = currentMap.get(name) || { name, sales: 0, transactions: 0, members: new Set() };
      const previous = previousMap.get(name) || { name, sales: 0, transactions: 0, members: new Set() };
      return {
        name,
        sales: current.sales,
        prevSales: previous.sales,
        transactions: current.transactions,
        members: current.members
      };
    }).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "ko"));

    const totalSales = [...currentMap.values()].reduce((sum, item) => sum + item.sales, 0);
    const totalTransactions = [...currentMap.values()].reduce((sum, item) => sum + item.transactions, 0);
    const allMembers = new Set(getSaleOnlyRows(month).map(row => row.__member).filter(Boolean));
    const hasMemberColumn = state.salesRows.some(row => row.__hasMemberColumn);

    if (!items.length) {
      els.facilityTable.innerHTML = '<tr><td colspan="7" class="empty">데이터 없음</td></tr>';
      els.donutChart.style.background = "conic-gradient(#E9ECF3 0 100%)";
      els.donutLegend.innerHTML = "";
      els.donutTotal.textContent = "0원";
      return;
    }

    els.facilityTable.innerHTML = items.map(item => {
      const delta = compactDelta(item.sales, item.prevSales, comparisonAvailable);
      return `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td class="num">${formatWon(item.sales)}</td>
          <td class="num prev-sales">${comparisonAvailable ? formatWon(item.prevSales) : "-"}</td>
          <td class="num"><span class="mom-value ${delta.cls}">${delta.text}</span></td>
          <td class="num">${item.transactions.toLocaleString("ko-KR")}건</td>
          <td class="num">${hasMemberColumn ? item.members.size.toLocaleString("ko-KR") + "명" : "-"}</td>
          <td class="num">${totalSales ? percent(item.sales, totalSales).toFixed(1) : "0.0"}%</td>
        </tr>
      `;
    }).join("") + `
      <tr class="total-row">
        <td>합계</td>
        <td class="num">${formatWon(totalSales)}</td>
        <td class="num prev-sales">${comparisonAvailable ? formatWon([...previousMap.values()].reduce((sum, item) => sum + item.sales, 0)) : "-"}</td>
        <td class="num">-</td>
        <td class="num">${totalTransactions.toLocaleString("ko-KR")}건</td>
        <td class="num">${hasMemberColumn ? allMembers.size.toLocaleString("ko-KR") + "명" : "-"}</td>
        <td class="num">100.0%</td>
      </tr>
    `;

    const donutItems = [...currentMap.values()].filter(item => item.sales > 0).sort((a, b) => b.sales - a.sales);
    const donutBase = donutItems.reduce((sum, item) => sum + item.sales, 0);
    let cursor = 0;
    const segments = [];

    donutItems.slice(0, 8).forEach((item, i) => {
      const p = percent(item.sales, donutBase);
      const next = cursor + p;
      segments.push(`${BRAND_COLORS[i % BRAND_COLORS.length]} ${cursor}% ${next}%`);
      cursor = next;
    });

    if (cursor < 100) segments.push(`#E9ECF3 ${cursor}% 100%`);

    els.donutChart.style.background = segments.length
      ? `conic-gradient(${segments.join(",")})`
      : "conic-gradient(#E9ECF3 0 100%)";

    els.donutTotal.textContent = formatWon(totalSales);
    els.donutLegend.innerHTML = donutItems.slice(0, 6).map((item, i) => `
      <div class="legend-row">
        <i class="legend-dot" style="background:${BRAND_COLORS[i % BRAND_COLORS.length]}"></i>
        <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
        <span>${percent(item.sales, donutBase).toFixed(1)}%</span>
      </div>
    `).join("");
  }

  function renderExclusionDetails(period, currentMetrics) {
    const periodRows = getPeriodRawSalesRows(period);
    const testRows = periodRows.filter(row => row.__isTestBuilding);
    const nonTestRows = periodRows.filter(row => !row.__isTestBuilding);
    const refundRows = nonTestRows.filter(row => row.__transactionClass === "refund");
    const cancelRows = nonTestRows.filter(row => row.__transactionClass === "cancel");
    const refundAmount = refundRows.reduce((sum, row) => sum + Math.abs(row.__amount), 0);

    els.sourceRowCount.textContent = `${state.salesSourceRowCount.toLocaleString("ko-KR")}행`;
    els.testExcludedCount.textContent = `${testRows.length.toLocaleString("ko-KR")}행`;
    els.refundExcludedCount.textContent = `${refundRows.length.toLocaleString("ko-KR")}행`;
    els.refundExcludedAmount.textContent = `환불금액 ${formatWon(refundAmount)}`;
    els.cancelExcludedCount.textContent = `${cancelRows.length.toLocaleString("ko-KR")}행`;
    els.includedRowCount.textContent = `${currentMetrics.rows.length.toLocaleString("ko-KR")}행`;
  }

  function getSalesPeriods() {
    return state.viewMode === "week" ? state.salesWeeks : state.salesMonths;
  }

  function getAccessPeriods() {
    return state.viewMode === "week" ? state.accessWeeks : state.accessMonths;
  }

  function refreshSalesPeriods() {
    state.salesMonths = [...new Set(
      state.salesRows
        .filter(row => row.__validPeriod && !row.__isTestBuilding)
        .map(row => row.__month)
        .filter(Boolean)
    )].sort().reverse();

    state.salesWeeks = [...new Set(
      state.salesRows
        .filter(row => row.__validPeriod && row.__hasDayPrecision && !row.__isTestBuilding)
        .map(row => row.__week)
        .filter(Boolean)
    )].sort().reverse();
  }

  function refreshAccessPeriods() {
    state.accessMonths = [...new Set(
      state.accessRows
        .filter(row => row.__validDateTime && !row.__isTestBuilding)
        .map(row => row.__month)
        .filter(Boolean)
    )].sort().reverse();

    state.accessWeeks = [...new Set(
      state.accessRows
        .filter(row => row.__validDateTime && !row.__isTestBuilding)
        .map(row => row.__week)
        .filter(Boolean)
    )].sort().reverse();
  }

  function updateModeUI() {
    const weekly = state.viewMode === "week";
    els.monthlyMode?.classList.toggle("active", !weekly);
    els.weeklyMode?.classList.toggle("active", weekly);
    els.monthlyMode?.setAttribute("aria-pressed", String(!weekly));
    els.weeklyMode?.setAttribute("aria-pressed", String(weekly));

    if (els.salesPeriodRule) {
      els.salesPeriodRule.textContent = weekly
        ? "수강 시작일 기준 · 실매출 = 매출 − 환불 · 취소 제외"
        : "수강 시작월 기준 · 실매출 = 매출 − 환불 · 취소 제외";
    }
    if (els.currentSalesHeader) els.currentSalesHeader.textContent = weekly ? "당주 실매출" : "당월 실매출";
    if (els.previousSalesHeader) els.previousSalesHeader.textContent = weekly ? "전주 실매출" : "전월 실매출";
    if (els.comparisonSalesHeader) els.comparisonSalesHeader.textContent = weekly ? "전주 대비" : "전월 대비";
  }

  function getAccessAnalysisPeriod(selectedSalesPeriod) {
    const periods = getAccessPeriods();
    if (!periods.length) return null;
    if (selectedSalesPeriod && periods.includes(selectedSalesPeriod)) return selectedSalesPeriod;
    return periods[0];
  }

  function getEligibleAccessRows(period) {
    if (!period) return [];
    return state.accessRows.filter(row =>
      periodKeyOf(row) === period &&
      row.__validDateTime &&
      !row.__isTestBuilding
    );
  }

  function aggregateAccessByHour(period) {
    const rows = getEligibleAccessRows(period);
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    rows.forEach(row => {
      if (row.__hour === null || row.__hour === undefined) return;
      hourly[row.__hour].count += row.__count;
    });
    return {
      rows,
      hourly,
      total: hourly.reduce((sum, item) => sum + item.count, 0)
    };
  }

  function renderAccess(selectedSalesPeriod = null) {
    const period = getAccessAnalysisPeriod(selectedSalesPeriod);

    if (!period) {
      els.peakAccessTime.textContent = "-";
      els.peakAccessCount.textContent = "-";
      setDeltaElement(els.peakAccessShare, { text: "시간대 비중 -", cls: "neutral" }, "mini-delta");
      els.peakAccessMonth.textContent = "출입내역 파일 미업로드";
      els.accessMonthLabel.textContent = "-";
      els.accessHourTable.innerHTML = '<tr><td colspan="3" class="empty">출입내역 데이터 없음</td></tr>';
      els.accessIncludedCount.textContent = "-";
      els.accessExcludedNote.textContent = "999동·9999동은 자동 제외합니다.";
      return;
    }

    const analysis = aggregateAccessByHour(period);
    const sorted = [...analysis.hourly].sort((a, b) => b.count - a.count || a.hour - b.hour);
    const peak = sorted[0];
    const excluded = state.accessRows.filter(row => periodKeyOf(row) === period && row.__validDateTime && row.__isTestBuilding).length;

    if (!analysis.total || !peak || peak.count === 0) {
      els.peakAccessTime.textContent = "-";
      els.peakAccessCount.textContent = "0건";
      setDeltaElement(els.peakAccessShare, { text: "분석 데이터 없음", cls: "neutral" }, "mini-delta");
    } else {
      els.peakAccessTime.textContent = formatHour(peak.hour);
      els.peakAccessCount.textContent = `${peak.count.toLocaleString("ko-KR")}건`;
      setDeltaElement(
        els.peakAccessShare,
        { text: `전체 출입의 ${percent(peak.count, analysis.total).toFixed(1)}%`, cls: "up" },
        "mini-delta"
      );
    }

    els.peakAccessMonth.textContent = `${formatPeriod(period)} ${periodWord()} 출입내역 기준`;
    els.accessMonthLabel.textContent = formatPeriod(period);
    els.accessIncludedCount.textContent = `${analysis.total.toLocaleString("ko-KR")}건`;
    els.accessExcludedNote.textContent = `원본 ${state.accessSourceRowCount.toLocaleString("ko-KR")}행 · 선택기간 테스트동 ${excluded.toLocaleString("ko-KR")}행 제외`;

    const nonZeroHours = analysis.hourly.filter(item => item.count > 0);
    if (!nonZeroHours.length) {
      els.accessHourTable.innerHTML = `<tr><td colspan="3" class="empty">해당 ${periodWord()} 출입 데이터 없음</td></tr>`;
      return;
    }

    const peakHour = peak.hour;
    els.accessHourTable.innerHTML = nonZeroHours
      .sort((a, b) => a.hour - b.hour)
      .map(item => `
        <tr class="${item.hour === peakHour ? "peak-row" : ""}">
          <td><strong>${formatHour(item.hour)}</strong>${item.hour === peakHour ? '<span class="peak-badge">최다</span>' : ""}</td>
          <td class="num">${item.count.toLocaleString("ko-KR")}건</td>
          <td class="num">${percent(item.count, analysis.total).toFixed(1)}%</td>
        </tr>
      `).join("");
  }

  function renderSales(period) {
    const periods = getSalesPeriods();
    if (!period || !periods.includes(period)) {
      els.totalSales.textContent = "-";
      els.uniqueMembers.textContent = "-";
      els.averagePayment.textContent = "-";
      els.totalTransactions.textContent = "-";
      setDeltaElement(els.salesDelta, { text: `${comparisonWord()} 비교 -`, cls: "neutral" });
      setDeltaElement(els.membersDelta, { text: `${comparisonWord()} 비교 -`, cls: "neutral" });
      setDeltaElement(els.averageDelta, { text: `${comparisonWord()} 비교 -`, cls: "neutral" });
      renderFacilityHighlights(null, null, false);
      renderFacilityTable(null, null, false);
      if (state.viewMode === "week" && state.salesRows.length && !state.salesWeeks.length) {
        els.comparisonNote.textContent = "주간 분석 불가 · 매출 원본에 수강 시작일처럼 날짜(일자) 정보가 필요합니다.";
        els.periodText.textContent = "월 단위 수강 시작월 데이터만 있어 주간 매출을 정확히 나눌 수 없습니다.";
      }
      return;
    }

    const previousPeriod = previousPeriodKey(period);
    const comparisonAvailable = periods.includes(previousPeriod);
    const current = getSalesMetrics(period);
    const previous = comparisonAvailable ? getSalesMetrics(previousPeriod) : null;

    els.totalSales.textContent = formatWon(current.sales);
    els.uniqueMembers.textContent = current.members === null ? "-" : `${current.members.toLocaleString("ko-KR")}명`;
    els.averagePayment.textContent = formatWon(current.average);
    els.totalTransactions.textContent = `${current.transactions.toLocaleString("ko-KR")}건`;

    setDeltaElement(els.salesDelta, deltaInfo(current.sales, previous?.sales, comparisonAvailable));
    setDeltaElement(
      els.membersDelta,
      current.members === null
        ? { text: "회원명 컬럼 없음", cls: "neutral" }
        : deltaInfo(current.members, previous?.members, comparisonAvailable)
    );
    setDeltaElement(els.averageDelta, deltaInfo(current.average, previous?.average, comparisonAvailable));

    const txDelta = deltaInfo(current.transactions, previous?.transactions, comparisonAvailable);
    els.transactionsDelta.textContent = txDelta.text;
    els.transactionsDelta.className = `detail-delta ${txDelta.cls}`;

    const basis = state.viewMode === "week" ? "수강 시작일" : "수강 시작월";
    els.comparisonNote.textContent = comparisonAvailable
      ? `${formatPeriod(period)} ${basis} 기준 · ${comparisonWord()} ${formatPeriod(previousPeriod)} 대비 자동 비교 중`
      : `${formatPeriod(period)} ${basis} 기준 · ${formatPeriod(previousPeriod)} 데이터가 없어 ${comparisonWord()} 비교는 표시하지 않습니다.`;

    els.periodText.textContent = `${formatPeriod(period)} ${periodWord()} 기준 · 실매출 = 매출 − 환불 · 취소 및 999동·9999동 제외`;
    els.facilityMonthLabel.textContent = comparisonAvailable
      ? `${formatPeriod(period)} vs ${formatPeriod(previousPeriod)}`
      : formatPeriod(period);

    renderFacilityHighlights(period, previousPeriod, comparisonAvailable);
    renderFacilityTable(period, previousPeriod, comparisonAvailable);
    renderExclusionDetails(period, current);
  }

  function renderAll(period = null) {
    updateModeUI();
    renderSales(period);
    renderAccess(period);
    els.generatedAt.textContent = `생성 ${new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date())}`;
  }

  function populatePeriodSelect(preferredPeriod = null) {
    updateModeUI();
    const salesPeriods = getSalesPeriods();
    const accessPeriods = getAccessPeriods();
    const periods = salesPeriods.length ? salesPeriods : accessPeriods;

    els.periodSelect.innerHTML = "";

    if (!periods.length) {
      els.periodSelect.disabled = true;
      els.periodSelect.innerHTML = `<option>${state.viewMode === "week" ? "기준주 없음" : "기준월 없음"}</option>`;
      renderAll(null);
      return;
    }

    periods.forEach(period => {
      const option = document.createElement("option");
      option.value = period;
      option.textContent = formatPeriod(period);
      els.periodSelect.appendChild(option);
    });

    els.periodSelect.disabled = false;
    const target = preferredPeriod && periods.includes(preferredPeriod) ? preferredPeriod : periods[0];
    els.periodSelect.value = target;
    renderAll(target);
  }

  function setViewMode(mode) {
    if (!['month', 'week'].includes(mode) || state.viewMode === mode) return;
    state.viewMode = mode;
    populatePeriodSelect();

    if (mode === "week" && state.salesRows.length) {
      const imprecise = state.salesRows.filter(row => row.__validPeriod && !row.__hasDayPrecision).length;
      if (!state.salesWeeks.length) {
        setStatus("주간 매출 분석 불가: 수강 시작월만 있고 수강 시작일(일자) 정보가 없습니다.", "warn");
      } else if (imprecise) {
        setStatus(`주간 분석 중 · 일자 없는 월 단위 데이터 ${imprecise.toLocaleString("ko-KR")}행은 주간 집계에서 제외됩니다.`, "warn");
      }
    }
  }

  async function workbookFromFile(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();

    if (extension === "csv") {
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch (_) {
        text = new TextDecoder("euc-kr").decode(buffer);
      }
      return XLSX.read(text, { type: "string", cellDates: true });
    }

    return XLSX.read(buffer, { type: "array", cellDates: true });
  }

  async function rowsFromFirstSheet(file) {
    const wb = await workbookFromFile(file);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error(`${file.name}: 첫 번째 시트를 찾을 수 없습니다.`);
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    if (!rows.length) throw new Error(`${file.name}: 분석할 데이터가 없습니다.`);
    return rows;
  }

  async function parseSalesFile(file) {
    const rows = await rowsFromFirstSheet(file);
    const keys = detectSalesKeys(Object.keys(rows[0]), file.name);
    return {
      rows: prepareSalesRows(rows, keys, file.name),
      sourceRowCount: rows.length
    };
  }

  async function parseAccessFile(file) {
    const rows = await rowsFromFirstSheet(file);
    const keys = detectAccessKeys(Object.keys(rows[0]), file.name);
    return {
      rows: prepareAccessRows(rows, keys, file.name),
      sourceRowCount: rows.length
    };
  }

  async function loadSalesFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;

    try {
      setStatus(`${files.length}개 매출 파일을 읽는 중입니다.`);
      const parsed = [];
      for (const file of files) parsed.push(await parseSalesFile(file));

      state.salesRows = parsed.flatMap(item => item.rows);
      state.salesSourceRowCount = parsed.reduce((sum, item) => sum + item.sourceRowCount, 0);
      state.salesFiles = files.map(file => file.name);

      refreshSalesPeriods();
      populatePeriodSelect();

      const invalidCount = state.salesRows.filter(row => !row.__validPeriod).length;
      const testCount = state.salesRows.filter(row => row.__isTestBuilding).length;
      const extra = [];
      if (invalidCount) extra.push(`수강 기준일 미인식 ${invalidCount.toLocaleString("ko-KR")}행`);
      if (testCount) extra.push(`테스트동 제외 ${testCount.toLocaleString("ko-KR")}행`);

      setStatus(
        `${files.length}개 파일 · ${state.salesSourceRowCount.toLocaleString("ko-KR")}행 분석 완료 · 실매출 = 매출 − 환불 · 취소 제외${extra.length ? ` · ${extra.join(" · ")}` : ""}`,
        invalidCount ? "warn" : "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(`매출 분석 실패: ${err.message}`, "error");
    }
  }

  async function loadAccessFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;

    try {
      setStatus(`${files.length}개 출입 파일을 읽는 중입니다.`, "", "access");
      const parsed = [];
      for (const file of files) parsed.push(await parseAccessFile(file));

      state.accessRows = parsed.flatMap(item => item.rows);
      state.accessSourceRowCount = parsed.reduce((sum, item) => sum + item.sourceRowCount, 0);
      state.accessFiles = files.map(file => file.name);

      refreshAccessPeriods();
      populatePeriodSelect(els.periodSelect.disabled ? null : els.periodSelect.value);

      const invalidCount = state.accessRows.filter(row => !row.__validDateTime).length;
      const testCount = state.accessRows.filter(row => row.__isTestBuilding).length;
      const extra = [];
      if (invalidCount) extra.push(`시간 미인식 ${invalidCount.toLocaleString("ko-KR")}행`);
      if (testCount) extra.push(`테스트동 제외 ${testCount.toLocaleString("ko-KR")}행`);

      setStatus(
        `${files.length}개 파일 · ${state.accessSourceRowCount.toLocaleString("ko-KR")}행 출입 분석 완료${extra.length ? ` · ${extra.join(" · ")}` : ""}`,
        invalidCount ? "warn" : "ok",
        "access"
      );
    } catch (err) {
      console.error(err);
      setStatus(`출입 분석 실패: ${err.message}`, "error", "access");
    }
  }

  els.dataFiles.addEventListener("change", event => {
    if (event.target.files?.length) loadSalesFiles(event.target.files);
  });

  els.accessFiles.addEventListener("change", event => {
    if (event.target.files?.length) loadAccessFiles(event.target.files);
  });

  els.periodSelect.addEventListener("change", event => {
    renderAll(event.target.value);
  });

  els.monthlyMode.addEventListener("click", () => setViewMode("month"));
  els.weeklyMode.addEventListener("click", () => setViewMode("week"));

  // A4 인쇄 시 상세 영역 자동 펼침
  window.addEventListener("beforeprint", () => {
    document.querySelectorAll("details.detail-card")
      .forEach(detail => {
        detail.setAttribute("open", "");
      });
  });

  els.printBtn.addEventListener("click", () => window.print());

  if (!window.XLSX) {
    setStatus("엑셀/CSV 분석 라이브러리를 불러오지 못했습니다.", "error");
    setStatus("엑셀/CSV 분석 라이브러리를 불러오지 못했습니다.", "error", "access");
  }
})();
