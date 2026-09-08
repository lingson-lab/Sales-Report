(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const COLORS = [
    "#0300CE",
    "#4C49E8",
    "#7774F0",
    "#A09EF5",
    "#C8C7FA",
    "#34329B"
  ];

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

  let allRows = [];

  function setStatus(text, type = "") {
    els.statusText.textContent = text;
    els.statusDot.className = "status-dot " + type;
  }

  function num(v) {
    if (typeof v === "number") return v;

    const parsed = Number(
      String(v || "")
        .replace(/,/g, "")
        .replace(/원/g, "")
        .trim()
    );

    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatWon(v) {
    return Math.round(v).toLocaleString("ko-KR") + "원";
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return v;

    if (typeof v === "number" && XLSX?.SSF?.parse_date_code) {
      const d = XLSX.SSF.parse_date_code(v);

      if (d) {
        return new Date(
          d.y,
          d.m - 1,
          d.d,
          d.H || 0,
          d.M || 0,
          d.S || 0
        );
      }
    }

    const text = String(v || "").trim();

    const match = text.match(
      /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/
    );

    if (match) {
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      );
    }

    const d = new Date(text);

    return isNaN(d) ? null : d;
  }

  function monthKey(date) {
    if (!date) return "";

    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0")
    );
  }

  function monthLabel(key) {
    if (!key) return "-";

    const [y, m] = key.split("-");

    return y + "." + m;
  }

  function facilityName(value) {
    const text = String(value || "").trim();

    if (!text) return "기타";

    return text.split(/[▶>›]/)[0].trim() || "기타";
  }

  function isCancelled(row) {
    const text =
      String(row["거래구분"] || "") +
      " " +
      String(row["거래종류"] || "");

    return /취소|환불|반품|무효/.test(text);
  }

  function transactionCount(row) {
    const count = num(row["건수"]);

    return count > 0 ? count : 1;
  }

  function prepareRows(rows) {
    return rows
      .map((row) => {
        const date =
          parseDate(row["수강시작일"]) ||
          parseDate(row["거래일시"]);

        return {
          ...row,

          __date: date,
          __month: monthKey(date),
          __facility: facilityName(row["등록명"]),
          __amount: num(row["실매출액"]),
          __count: transactionCount(row),
          __cancelled: isCancelled(row)
        };
      })
      .filter((row) => row.__date);
  }

  function buildMonths() {
    const months = [
      ...new Set(
        allRows
          .map((row) => row.__month)
          .filter(Boolean)
      )
    ].sort().reverse();

    els.monthSelect.innerHTML = "";

    if (!months.length) {
      els.monthSelect.disabled = true;
      els.monthSelect.innerHTML =
        "<option>기준월 없음</option>";

      return;
    }

    months.forEach((month) => {
      const option = document.createElement("option");

      option.value = month;
      option.textContent = monthLabel(month);

      els.monthSelect.appendChild(option);
    });

    els.monthSelect.disabled = false;
    els.monthSelect.value = months[0];

    render(months[0]);
  }

  function render(month) {
    const rows = allRows.filter(
      (row) => row.__month === month
    );

    const normalRows = rows.filter(
      (row) => !row.__cancelled
    );

    renderKpi(normalRows);
    renderFacility(normalRows);
    renderStatus(rows);
    renderChannel(rows);
    renderBuildings(normalRows);

    const dates = rows
      .map((r) => r.__date)
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (dates.length) {
      const formatDate = (d) =>
        `${d.getFullYear()}.${String(
          d.getMonth() + 1
        ).padStart(2, "0")}.${String(
          d.getDate()
        ).padStart(2, "0")}`;

      els.periodText.textContent =
        `${formatDate(dates[0])} ~ ` +
        `${formatDate(dates[dates.length - 1])}`;
    }

    els.facilityMonthLabel.textContent =
      monthLabel(month);

    els.generatedAt.textContent =
      "생성 " +
      new Date().toLocaleString("ko-KR");
  }

  function renderKpi(rows) {
    const sales = rows.reduce(
      (sum, row) => sum + row.__amount,
      0
    );

    const transactions = rows.reduce(
      (sum, row) => sum + row.__count,
      0
    );

    const members = new Set(
      rows
        .map((row) =>
          String(row["회원명"] || "").trim()
        )
        .filter(Boolean)
    );

    els.totalSales.textContent =
      formatWon(sales);

    els.totalTransactions.textContent =
      transactions.toLocaleString("ko-KR") +
      "건";

    els.uniqueMembers.textContent =
      members.size.toLocaleString("ko-KR") +
      "명";

    els.averagePayment.textContent =
      transactions
        ? formatWon(sales / transactions)
        : "0원";
  }

  function renderFacility(rows) {
    const map = new Map();

    rows.forEach((row) => {
      const key = row.__facility;

      if (!map.has(key)) {
        map.set(key, {
          name: key,
          sales: 0,
          count: 0,
          members: new Set()
        });
      }

      const item = map.get(key);

      item.sales += row.__amount;
      item.count += row.__count;

      const member =
        String(row["회원명"] || "").trim();

      if (member) {
        item.members.add(member);
      }
    });

    const items = [...map.values()]
      .sort((a, b) => b.sales - a.sales);

    const totalSales = items.reduce(
      (sum, item) => sum + item.sales,
      0
    );

    const totalCount = items.reduce(
      (sum, item) => sum + item.count,
      0
    );

    const totalMembers = new Set(
      rows
        .map((row) =>
          String(row["회원명"] || "").trim()
        )
        .filter(Boolean)
    );

    if (!items.length) {
      els.facilityTable.innerHTML = `
        <tr>
          <td colspan="5" class="empty">
            데이터 없음
          </td>
        </tr>
      `;

      return;
    }

    els.facilityTable.innerHTML =
      items
        .map((item) => {
          const share = totalSales
            ? (item.sales / totalSales) * 100
            : 0;

          return `
            <tr>
              <td>
                <strong>
                  ${escapeHtml(item.name)}
                </strong>
              </td>

              <td class="num">
                ${formatWon(item.sales)}
              </td>

              <td class="num">
                ${item.count.toLocaleString(
                  "ko-KR"
                )}건
              </td>

              <td class="num">
                ${item.members.size.toLocaleString(
                  "ko-KR"
                )}명
              </td>

              <td class="num">
                ${share.toFixed(1)}%
              </td>
            </tr>
          `;
        })
        .join("") +
      `
        <tr class="total-row">
          <td>합계</td>

          <td class="num">
            ${formatWon(totalSales)}
          </td>

          <td class="num">
            ${totalCount.toLocaleString(
              "ko-KR"
            )}건
          </td>

          <td class="num">
            ${totalMembers.size.toLocaleString(
              "ko-KR"
            )}명
          </td>

          <td class="num">
            100.0%
          </td>
        </tr>
      `;

    renderDonut(items, totalSales);
  }

  function renderDonut(items, totalSales) {
    let start = 0;

    const segments = [];

    items.slice(0, 6).forEach(
      (item, index) => {
        const share = totalSales
          ? (item.sales / totalSales) * 100
          : 0;

        const end = start + share;

        segments.push(
          `${COLORS[index % COLORS.length]} ` +
          `${start}% ${end}%`
        );

        start = end;
      }
    );

    if (start < 100) {
      segments.push(
        `#E9ECF3 ${start}% 100%`
      );
    }

    els.donutChart.style.background =
      `conic-gradient(${segments.join(",")})`;

    els.donutTotal.textContent =
      formatWon(totalSales);

    els.donutLegend.innerHTML =
      items
        .slice(0, 6)
        .map((item, index) => {
          const share = totalSales
            ? (item.sales / totalSales) * 100
            : 0;

          return `
            <div class="legend-row">

              <i
                class="legend-dot"
                style="
                  background:
                  ${COLORS[index % COLORS.length]}
                "
              ></i>

              <strong>
                ${escapeHtml(item.name)}
              </strong>

              <span>
                ${share.toFixed(1)}%
              </span>

            </div>
          `;
        })
        .join("");
  }

  function renderStatus(rows) {
    const map = new Map();

    rows.forEach((row) => {
      const name =
        String(
          row["거래구분"] || "미분류"
        ).trim();

      map.set(
        name,
        (map.get(name) || 0) +
          row.__count
      );
    });

    renderSummary(
      els.statusSummary,
      [...map.entries()]
    );
  }

  function renderChannel(rows) {
    const map = new Map();

    rows.forEach((row) => {
      const name =
        String(
          row["담당자"] || "미분류"
        ).trim();

      map.set(
        name,
        (map.get(name) || 0) +
          row.__count
      );
    });

    renderSummary(
      els.channelSummary,
      [...map.entries()]
    );
  }

  function renderSummary(container, entries) {
    if (!entries.length) {
      container.innerHTML =
        '<div class="empty">데이터 없음</div>';

      return;
    }

    entries.sort(
      (a, b) => b[1] - a[1]
    );

    const total = entries.reduce(
      (sum, item) => sum + item[1],
      0
    );

    container.innerHTML =
      entries
        .map(([name, value]) => {
          const share = total
            ? (value / total) * 100
            : 0;

          return `
            <div class="summary-row">

              <div class="summary-name">
                ${escapeHtml(name)}
              </div>

              <div class="progress">
                <i
                  style="
                    width:
                    ${Math.max(2, share)}%
                  "
                ></i>
              </div>

              <div class="summary-value">
                ${value.toLocaleString(
                  "ko-KR"
                )}건 ·
                ${share.toFixed(1)}%
              </div>

            </div>
          `;
        })
        .join("");
  }

  function renderBuildings(rows) {
    const map = new Map();

    rows.forEach((row) => {
      let building =
        String(row["동"] || "").trim();

      if (!building) return;

      if (!building.endsWith("동")) {
        building += "동";
      }

      if (!map.has(building)) {
        map.set(building, {
          members: new Set(),
          sales: 0,
          count: 0
        });
      }

      const item = map.get(building);

      item.sales += row.__amount;
      item.count += row.__count;

      const member =
        String(row["회원명"] || "").trim();

      if (member) {
        item.members.add(member);
      }
    });

    const items = [...map.entries()]
      .map(([name, item]) => ({
        name,
        members: item.members.size,
        sales: item.sales,
        count: item.count
      }))
      .sort(
        (a, b) =>
          b.members - a.members
      )
      .slice(0, 5);

    if (!items.length) {
      els.buildingBars.innerHTML =
        '<div class="empty">데이터 없음</div>';

      return;
    }

    const max =
      Math.max(
        ...items.map((item) => item.members),
        1
      );

    els.buildingBars.innerHTML =
      items
        .map((item) => {
          const width =
            (item.members / max) * 100;

          return `
            <div class="bar-row">

              <div class="bar-name">
                ${escapeHtml(item.name)}
              </div>

              <div class="bar-track">
                <i
                  class="bar-fill"
                  style="
                    width:
                    ${Math.max(4, width)}%
                  "
                ></i>
              </div>

              <div class="bar-value">
                ${item.members.toLocaleString(
                  "ko-KR"
                )}명 ·
                ${formatWon(item.sales)}
              </div>

            </div>
          `;
        })
        .join("");
  }

  async function loadExcel(file) {
    try {
      setStatus(
        `${file.name} 읽는 중...`
      );

      if (!window.XLSX) {
        throw new Error(
          "엑셀 라이브러리를 불러오지 못했습니다."
        );
      }

      const buffer =
        await file.arrayBuffer();

      const workbook = XLSX.read(
        buffer,
        {
          type: "array",
          cellDates: true
        }
      );

      const firstSheetName =
        workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error(
          "엑셀 시트를 찾지 못했습니다."
        );
      }

      const sheet =
        workbook.Sheets[firstSheetName];

      const rows =
        XLSX.utils.sheet_to_json(
          sheet,
          {
            defval: "",
            raw: true
          }
        );

      if (!rows.length) {
        throw new Error(
          "엑셀 데이터가 없습니다."
        );
      }

      const requiredColumns = [
        "등록명",
        "실매출액"
      ];

      const headers =
        Object.keys(rows[0]);

      const missing =
        requiredColumns.filter(
          (column) =>
            !headers.includes(column)
        );

      if (missing.length) {
        throw new Error(
          "필수 컬럼 없음: " +
          missing.join(", ")
        );
      }

      allRows = prepareRows(rows);

      if (!allRows.length) {
        throw new Error(
          "수강시작일 또는 거래일시를 읽지 못했습니다."
        );
      }

      buildMonths();

      setStatus(
        `${file.name} · ` +
        `${allRows.length.toLocaleString(
          "ko-KR"
        )}건 분석 완료`,
        "ok"
      );
    } catch (error) {
      console.error(error);

      setStatus(
        "분석 실패: " +
        error.message,
        "error"
      );
    }
  }

  els.excelFile.addEventListener(
    "change",
    (event) => {
      const file =
        event.target.files?.[0];

      if (file) {
        loadExcel(file);
      }
    }
  );

  els.monthSelect.addEventListener(
    "change",
    (event) => {
      render(event.target.value);
    }
  );

  els.printBtn.addEventListener(
    "click",
    () => {
      window.print();
    }
  );

  if (!window.XLSX) {
    setStatus(
      "엑셀 라이브러리를 불러오지 못했습니다.",
      "error"
    );
  }
})();
