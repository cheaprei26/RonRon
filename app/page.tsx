
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Shift = "" | "早番" | "遅番" | "通し" | "休み" | "希望休";
type Wish = "指定なし" | "早番希望" | "遅番希望" | "どちらも可能" | "休み希望";
type Availability = "早番のみ" | "遅番のみ" | "どちらも可能";
type Priority = "多め" | "標準" | "少なめ";
type Person = { id: number; name: string; shifts: Shift[] };
type Day = { date: number; day: string; weekday: number };
type Requests = Record<number, Record<number, Wish>>;
type Rules = {
  weekdays: { early: number; late: number }[];
  maxStreak: number;
  ngPairs: [number, number][];
  priorities: Record<number, Priority>;
  availability: Record<number, Availability>;
};

const weekNames = ["日", "月", "火", "水", "木", "金", "土"];
const shiftOrder: Shift[] = ["", "早番", "遅番", "通し", "休み", "希望休"];
const defaultNames = ["山田", "佐藤", "田中", "鈴木", "高橋", "伊藤"];
const initialRoster = defaultNames.map((name, i) => ({ id: i + 1, name }));
const defaultRules: Rules = {
  weekdays: Array.from({ length: 7 }, () => ({ early: 2, late: 2 })),
  maxStreak: 5,
  ngPairs: [[2, 3]],
  priorities: {},
  availability: {},
};

const working = (s: Shift) => s === "早番" || s === "遅番" || s === "通し";
const earlyWork = (s: Shift) => s === "早番" || s === "通し";
const lateWork = (s: Shift) => s === "遅番" || s === "通し";

function saveLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function periodKey(year: number, month: number, half: 1 | 2) {
  return `${year}-${String(month).padStart(2, "0")}-${half}`;
}

function previousKey(year: number, month: number, half: 1 | 2) {
  if (half === 2) return periodKey(year, month, 1);
  return periodKey(
    month === 1 ? year - 1 : year,
    month === 1 ? 12 : month - 1,
    2
  );
}

function makeDays(year: number, month: number, half: 1 | 2): Day[] {
  const last = new Date(year, month, 0).getDate();
  const start = half === 1 ? 1 : 16;
  const end = half === 1 ? 15 : last;
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const date = start + i;
    const weekday = new Date(year, month - 1, date).getDay();
    return { date, day: weekNames[weekday], weekday };
  });
}

function getPreviousStreaks(staff: Person[], previous: Person[]) {
  return staff.map(p => {
    const shifts = previous.find(x => x.id === p.id)?.shifts ?? [];
    let count = 0;
    for (let i = shifts.length - 1; i >= 0 && working(shifts[i]); i--) {
      count++;
    }
    return count;
  });
}

function generateSchedule(
  staff: Person[],
  days: Day[],
  requests: Requests,
  rules: Rules,
  previousStreaks: number[]
): Shift[][] {
  const streaks = [...previousStreaks];
  const counts = staff.map(() => 0);
  const result: Shift[][] = [];

  for (const day of days) {
    const need = rules.weekdays[day.weekday];
    const row: Shift[] = staff.map(p =>
      requests[p.id]?.[day.date] === "休み希望" ? "希望休" : "休み"
    );

    let early = 0;
    let late = 0;

    const canAssign = (i: number, shift: Shift) => {
      const person = staff[i];

      if (requests[person.id]?.[day.date] === "休み希望") return false;
      if (streaks[i] >= rules.maxStreak) return false;

      const availability = rules.availability[person.id] ?? "どちらも可能";
      if (shift === "早番" && availability === "遅番のみ") return false;
      if (shift === "遅番" && availability === "早番のみ") return false;
      if (shift === "通し" && availability !== "どちらも可能") return false;

      return !rules.ngPairs.some(([a, b]) => {
        const otherId = a === person.id ? b : b === person.id ? a : -1;
        const j = staff.findIndex(p => p.id === otherId);
        if (j < 0) return false;

        return (
          (earlyWork(shift) && earlyWork(row[j])) ||
          (lateWork(shift) && lateWork(row[j]))
        );
      });
    };

    while (early < need.early || late < need.late) {
      let bestIndex = -1;
      let bestShift: Shift = "";
      let bestScore = -Infinity;

      staff.forEach((person, i) => {
        if (working(row[i])) return;

        const wish = requests[person.id]?.[day.date];
        const priority = rules.priorities[person.id] ?? "標準";
        const weight = priority === "多め" ? 1.35 :
          priority === "少なめ" ? 0.7 : 1;

        (["通し", "早番", "遅番"] as Shift[]).forEach(shift => {
          if (!canAssign(i, shift)) return;

          const coverage =
            (earlyWork(shift) && early < need.early ? 1 : 0) +
            (lateWork(shift) && late < need.late ? 1 : 0);

          if (!coverage) return;

          let score = coverage * 1000;
          score += weight * 10;
          score -= (counts[i] / weight) * 6;
          score -= streaks[i] * 3;

          if (wish === "早番希望") {
            score += earlyWork(shift) ? 20 : -10;
          }
          if (wish === "遅番希望") {
            score += lateWork(shift) ? 20 : -10;
          }
          if (shift === "通し") score -= 5;

          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
            bestShift = shift;
          }
        });
      });

      // 人員不足でも作成を中止しない
      if (bestIndex === -1) break;

      row[bestIndex] = bestShift;
      if (earlyWork(bestShift)) early++;
      if (lateWork(bestShift)) late++;
    }

    staff.forEach((_, i) => {
      if (working(row[i])) {
        streaks[i]++;
        counts[i]++;
      } else {
        streaks[i] = 0;
      }
    });

    result.push(row);
  }

  return result;
}

const fieldStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 9,
  border: "1px solid #cbdce8",
  background: "#fff",
  color: "#17334c",
};

const modalStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15,35,55,.55)",
  display: "grid",
  placeItems: "center",
  padding: 12,
};

const dialogStyle: React.CSSProperties = {
  background: "white",
  color: "#17334c",
  width: "min(680px,100%)",
  maxHeight: "88vh",
  overflowY: "auto",
  borderRadius: 18,
  padding: 22,
};

const shiftColors: Record<string, string> = {
  "早番": "#d9edff",
  "遅番": "#ffe1e9",
  "通し": "#e5dcff",
};

const shiftTextColors: Record<string, string> = {
  "早番": "#17588c",
  "遅番": "#a52e59",
  "通し": "#633ca3",
};

function ShiftCalendar({
  year, month, half, days, staff,
}: {
  year: number;
  month: number;
  half: 1 | 2;
  days: Day[];
  staff: Person[];
}) {
  const [saving, setSaving] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const cells: (Day | null)[] = [
    ...Array(days[0]?.weekday ?? 0).fill(null),
    ...days,
  ];

  const getWorkers = (index: number) =>
    staff
      .map(p => ({
        id: p.id,
        name: p.name,
        shift: p.shifts[index] ?? "" as Shift,
      }))
      .filter(p => working(p.shift));

  const savePng = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const scale = 2;
      const width = 1400;
      const cellWidth = width / 7;
      const maxWorkers = Math.max(
        1,
        ...days.map((_, i) => getWorkers(i).length)
      );
      const cellHeight = Math.max(145, 55 + maxWorkers * 34);
      const rows = Math.ceil(cells.length / 7);
      const height = 155 + rows * cellHeight + 48;

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("画像生成に失敗しました");

      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#17334c";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText("RonRon", 35, 55);

      ctx.font = "25px sans-serif";
      ctx.fillText(
        `${year}年${month}月 ${half === 1 ? "前半" : "後半"}シフト`,
        35, 101
      );

      weekNames.forEach((day, col) => {
        const x = col * cellWidth;
        ctx.fillStyle = "#edf5fa";
        ctx.fillRect(x, 115, cellWidth, 40);
        ctx.fillStyle = col === 0 ? "#c84444" :
          col === 6 ? "#3278ba" : "#17334c";
        ctx.font = "bold 19px sans-serif";
        ctx.fillText(day, x + 15, 142);
      });

      cells.forEach((day, position) => {
        const col = position % 7;
        const row = Math.floor(position / 7);
        const x = col * cellWidth;
        const y = 155 + row * cellHeight;

        ctx.fillStyle = day ? "#ffffff" : "#f5f7fa";
        ctx.fillRect(x, y, cellWidth, cellHeight);
        ctx.strokeStyle = "#d8e3ec";
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        if (!day) return;

        ctx.fillStyle = col === 0 ? "#c84444" :
          col === 6 ? "#3278ba" : "#17334c";
        ctx.font = "bold 22px sans-serif";
        ctx.fillText(String(day.date), x + 12, y + 29);

        const index = days.findIndex(d => d.date === day.date);

        getWorkers(index).forEach((worker, i) => {
          const itemY = y + 42 + i * 34;
          ctx.fillStyle = shiftColors[worker.shift];
          ctx.beginPath();
          ctx.roundRect(x + 8, itemY, cellWidth - 16, 29, 6);
          ctx.fill();

          ctx.fillStyle = shiftTextColors[worker.shift];
          ctx.font = "16px sans-serif";

          const label = `${worker.name} ${worker.shift}`;
          let visible = label;

          while (
            ctx.measureText(visible).width > cellWidth - 30 &&
            visible.length > 1
          ) {
            visible = visible.slice(0, -1);
          }
          if (visible !== label) visible += "…";
          ctx.fillText(visible, x + 15, itemY + 20);
        });
      });

      ctx.fillStyle = "#8294a4";
      ctx.font = "17px sans-serif";
      ctx.fillText("Created with RonRon", 35, height - 16);

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("画像を生成できません");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        `RonRon_${year}-${month}_${half === 1 ? "前半" : "後半"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error(error);
      alert("画像保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={calendarRef} className="calendarCard">
      <div className="calendarHeading">
        <div>
          <p className="eyebrow">CALENDAR VIEW</p>
          <h3>{year}年{month}月 {half === 1 ? "前半" : "後半"}</h3>
          <p>日付ごとの出勤スタッフ</p>
        </div>
        <button className="primaryButton" onClick={savePng} disabled={saving}>
          {saving ? "画像作成中…" : "📷 PNG画像を保存"}
        </button>
      </div>

      <div className="calendarScroll">
        <div className="calendarGrid">
          {weekNames.map((day, i) => (
            <div
              className={`calendarWeekday ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}
              key={day}
            >
              {day}
            </div>
          ))}

          {cells.map((day, position) => {
            if (!day) {
              return <div className="calendarEmpty" key={`empty-${position}`} />;
            }

            const index = days.findIndex(d => d.date === day.date);
            const workers = getWorkers(index);

            return (
              <div className="calendarDay" key={day.date}>
                <strong className={
                  day.weekday === 0 ? "sun" :
                  day.weekday === 6 ? "sat" : ""
                }>
                  {day.date}
                </strong>

                {workers.map(worker => (
                  <div
                    key={worker.id}
                    className="calendarWorker"
                    style={{
                      background: shiftColors[worker.shift],
                      color: shiftTextColors[worker.shift],
                    }}
                    title={`${worker.name} ${worker.shift}`}
                  >
                    <span>{worker.name}</span>
                    <small>{worker.shift}</small>
                  </div>
                ))}

                {workers.length === 0 && (
                  <span className="noWorkers">出勤者なし</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="tableHint">
        シフト表の変更はカレンダーにも反映されます。
        画像にはスタッフ名が含まれるため、共有先に注意してください。
      </p>
    </div>
  );
}

export default function Home() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");

  const [roster, setRoster] = useState(initialRoster);
  const [staff, setStaff] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Requests>({});
  const [rules, setRules] = useState<Rules>(defaultRules);
  const [confirmed, setConfirmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("RonRonを準備しています");

  const [staffOpen, setStaffOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState(1);
  const [pairA, setPairA] = useState(1);
  const [pairB, setPairB] = useState(2);

  const days = useMemo(
    () => makeDays(year, month, half),
    [year, month, half]
  );
  const period = periodKey(year, month, half);

  const previousStaff = useMemo(() => {
    if (!ready) return [];
    return loadLocal<Person[]>(
      `ronron-schedule-${previousKey(year, month, half)}`,
      []
    );
  }, [ready, year, month, half]);

  const previousStreaks = useMemo(
    () => getPreviousStreaks(staff, previousStaff),
    [staff, previousStaff]
  );

  // 初期設定を読み込む
  useEffect(() => {
    const savedRoster = loadLocal(
      "ronron-staff-roster-v1",
      initialRoster
    );
    setRoster(savedRoster.length ? savedRoster : initialRoster);

    const saved = loadLocal<Partial<Rules>>("ronron-rules-v2", {});
    setRules({
      ...defaultRules,
      ...saved,
      weekdays: Array.from({ length: 7 }, (_, i) => ({
        ...defaultRules.weekdays[i],
        ...(saved.weekdays?.[i] ?? {}),
      })),
      priorities: saved.priorities ?? {},
      availability: saved.availability ?? {},
    });
    setReady(true);
  }, []);

  // 半月のデータを読み込む
  useEffect(() => {
    if (!ready) return;

    const saved = loadLocal<Person[]>(`ronron-schedule-${period}`, []);
    setStaff(roster.map(p => ({
      ...p,
      shifts: Array.from({ length: days.length }, (_, i) =>
        saved.find(s => s.id === p.id)?.shifts?.[i] ?? ""
      ),
    })));
    setRequests(loadLocal<Requests>(`ronron-requests-${period}`, {}));
    setConfirmed(loadLocal<boolean>(`ronron-confirmed-${period}`, false));
    setMessage(`${year}年${month}月${half === 1 ? "前半" : "後半"}を表示中`);
  }, [ready, roster, period, days.length, year, month, half]);

  useEffect(() => {
    if (ready) saveLocal("ronron-rules-v2", rules);
  }, [rules, ready]);

  const persist = () => {
    const ok =
      saveLocal(`ronron-schedule-${period}`, staff) &&
      saveLocal(`ronron-requests-${period}`, requests) &&
      saveLocal(`ronron-confirmed-${period}`, confirmed);
    setMessage(ok ? "シフトを保存しました" : "保存に失敗しました");
  };

  const updateRoster = (next: typeof roster) => {
    // スタッフ編集前に現在のシフトを退避
    saveLocal(`ronron-schedule-${period}`, staff);
    saveLocal(`ronron-requests-${period}`, requests);
    saveLocal("ronron-staff-roster-v1", next);
    setRoster(next);
    setConfirmed(false);
    saveLocal(`ronron-confirmed-${period}`, false);
  };

  const addStaff = () => {
    const name = newName.trim();
    if (!name) return setMessage("名前を入力してください");
    if (roster.some(p => p.name === name)) {
      return setMessage("同じ名前のスタッフがいます");
    }

    const id = Math.max(Date.now(), ...roster.map(p => p.id)) + 1;
    updateRoster([...roster, { id, name }]);
    setNewName("");
    setMessage(`${name}さんを追加しました`);
  };

  const removeStaff = (id: number) => {
    if (roster.length <= 1) return;
    const person = roster.find(p => p.id === id);
    if (!window.confirm(`${person?.name}さんを削除しますか？`)) return;

    const next = roster.filter(p => p.id !== id);
    updateRoster(next);

    setRules(r => ({
      ...r,
      ngPairs: r.ngPairs.filter(([a, b]) => a !== id && b !== id),
      priorities: Object.fromEntries(
        Object.entries(r.priorities).filter(([key]) => Number(key) !== id)
      ) as Record<number, Priority>,
      availability: Object.fromEntries(
        Object.entries(r.availability).filter(([key]) => Number(key) !== id)
      ) as Record<number, Availability>,
    }));

    if (selectedStaffId === id) setSelectedStaffId(next[0].id);
    if (pairA === id) setPairA(next[0].id);
    if (pairB === id) setPairB(next[0].id);
  };

  const changeShift = (id: number, index: number) => {
    setStaff(old => old.map(p =>
      p.id === id ? {
        ...p,
        shifts: p.shifts.map((s, i) =>
          i === index
            ? shiftOrder[(shiftOrder.indexOf(s) + 1) % shiftOrder.length]
            : s
        ),
      } : p
    ));
    setConfirmed(false);
    setMessage("変更内容があります。保存してください");
  };

  const changeRequest = (id: number, date: number, wish: Wish) => {
    const next = {
      ...requests,
      [id]: { ...(requests[id] ?? {}), [date]: wish },
    };
    setRequests(next);
    saveLocal(`ronron-requests-${period}`, next);
    setConfirmed(false);
  };

  const alerts = useMemo(() => {
    const items: string[] = [];

    days.forEach((day, i) => {
      const need = rules.weekdays[day.weekday];
      const early = staff.filter(p => earlyWork(p.shifts[i])).length;
      const late = staff.filter(p => lateWork(p.shifts[i])).length;

      if (early < need.early) {
        items.push(`${month}月${day.date}日：早番が${need.early - early}名不足（${early}/${need.early}名）`);
      }
      if (late < need.late) {
        items.push(`${month}月${day.date}日：遅番が${need.late - late}名不足（${late}/${need.late}名）`);
      }

      staff.forEach(p => {
        const shift = p.shifts[i];
        if (requests[p.id]?.[day.date] === "休み希望" && working(shift)) {
          items.push(`${month}月${day.date}日：${p.name}さんの希望休と衝突`);
        }

        const available = rules.availability[p.id] ?? "どちらも可能";
        if (
          (available === "早番のみ" && (shift === "遅番" || shift === "通し")) ||
          (available === "遅番のみ" && (shift === "早番" || shift === "通し"))
        ) {
          items.push(`${month}月${day.date}日：${p.name}さんの勤務可能時間帯と衝突`);
        }
      });

      rules.ngPairs.forEach(([a, b]) => {
        const x = staff.find(p => p.id === a);
        const y = staff.find(p => p.id === b);
        if (
          x && y &&
          ((earlyWork(x.shifts[i]) && earlyWork(y.shifts[i])) ||
            (lateWork(x.shifts[i]) && lateWork(y.shifts[i])))
        ) {
          items.push(`${month}月${day.date}日：${x.name}さん・${y.name}さんが同じ時間帯`);
        }
      });
    });

    staff.forEach((p, i) => {
      let streak = previousStreaks[i];
      p.shifts.forEach((shift, d) => {
        streak = working(shift) ? streak + 1 : 0;
        if (streak === rules.maxStreak + 1) {
          items.push(`${p.name}さん：${month}月${days[d].date}日に連勤上限超過`);
        }
      });
    });

    return items;
  }, [staff, days, rules, requests, month, previousStreaks]);

  const autoCreate = () => {
    if (!window.confirm("現在の半月シフトを自動作成で置き換えますか？")) {
      return;
    }

    const generated = generateSchedule(
      staff, days, requests, rules, previousStreaks
    );

    const next = staff.map((p, i) => ({
      ...p,
      shifts: generated.map(row => row[i]),
    }));

    const shortage = generated.reduce((sum, row, i) => {
      const need = rules.weekdays[days[i].weekday];
      return sum +
        Math.max(0, need.early - row.filter(earlyWork).length) +
        Math.max(0, need.late - row.filter(lateWork).length);
    }, 0);

    setStaff(next);
    setConfirmed(false);
    setMessage(
      shortage
        ? `シフト案を作成しました。延べ${shortage}人枠が不足しています`
        : "シフト案を作成しました"
    );
  };

  const confirmSchedule = () => {
    if (!staff.some(p => p.shifts.some(working))) {
      setMessage("勤務が入力されていません");
      return;
    }

    if (
      alerts.length &&
      !window.confirm(`警告が${alerts.length}件あります。確認のうえ確定しますか？`)
    ) return;

    const ok =
      saveLocal(`ronron-schedule-${period}`, staff) &&
      saveLocal(`ronron-requests-${period}`, requests) &&
      saveLocal(`ronron-confirmed-${period}`, true);

    if (ok) {
      setConfirmed(true);
      setMessage(
        alerts.length
          ? `警告${alerts.length}件を残して確定しました`
          : "シフトを確定しました"
      );
    } else {
      setMessage("保存に失敗しました");
    }
  };

  const updateNeed = (
    weekday: number,
    key: "early" | "late",
    value: number
  ) => {
    if (!Number.isInteger(value) || value < 0 || value > 30) return;
    setRules(r => ({
      ...r,
      weekdays: r.weekdays.map((need, i) =>
        i === weekday ? { ...need, [key]: value } : need
      ),
    }));
  };

  const changeMonth = (value: string) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const [y, m] = value.split("-").map(Number);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
      setYear(y);
      setMonth(m);
    }
  };

  return (
    <main className="app">
      <style>{`
        .app { min-width:0; color:#17334c; }
        .app button { cursor:pointer; }
        .app button:disabled { opacity:.6; cursor:not-allowed; }
        .tableScroll { overflow-x:auto; max-width:100%; }
        .tableScroll table { border-collapse:separate; border-spacing:0; }
        .tableScroll th,.tableScroll td { white-space:nowrap; }
        .tableScroll .staffColumn,.tableScroll .staffName {
          position:sticky; left:0; z-index:3; background:#fff;
          box-shadow:2px 0 5px rgba(18,58,84,.08);
        }
        .tableScroll thead .staffColumn {
          z-index:4; background:#f0f7fc;
        }
        .viewSwitcher {
          display:flex; gap:10px; margin:18px 0;
          flex-wrap:wrap;
        }
        .viewButton {
          padding:12px 20px; border-radius:10px;
          border:0; background:#e6edf3; color:#17334c;
          font-weight:700;
        }
        .viewButton.active { background:#419ed0; color:white; }
        .calendarCard {
          background:white; border-radius:16px;
          padding:18px; width:100%; box-sizing:border-box;
          box-shadow:0 4px 20px rgba(20,55,80,.07);
        }
        .calendarHeading {
          display:flex; justify-content:space-between;
          align-items:center; gap:15px; flex-wrap:wrap;
          margin-bottom:20px;
        }
        .calendarHeading h3 { margin:5px 0; }
        .calendarHeading p { margin:5px 0; }
        .calendarScroll { overflow-x:auto; }
        .calendarGrid {
          display:grid; grid-template-columns:repeat(7,minmax(0,1fr));
          gap:4px; min-width:700px;
        }
        .calendarWeekday {
          text-align:center; padding:10px;
          background:#edf5fa; border-radius:6px;
          font-weight:700;
        }
        .calendarWeekday.sun,.calendarDay .sun { color:#c84444; }
        .calendarWeekday.sat,.calendarDay .sat { color:#3278ba; }
        .calendarEmpty {
          min-height:130px; background:#f5f7fa; border-radius:8px;
        }
        .calendarDay {
          border:1px solid #e0e9ef; border-radius:8px;
          padding:7px; min-height:130px;
          background:white; overflow:hidden;
        }
        .calendarDay>strong {
          display:block; margin-bottom:8px;
        }
        .calendarWorker {
          padding:5px 4px; border-radius:5px;
          margin-bottom:4px; font-size:11px;
          font-weight:700; overflow-wrap:anywhere;
        }
        .calendarWorker span,.calendarWorker small {
          display:block;
        }
        .calendarWorker small { font-size:10px; }
        .noWorkers { color:#9aabb8; font-size:11px; }
        .shiftCell { touch-action:manipulation; }
        .modalRow {
          display:flex; align-items:center;
          justify-content:space-between; gap:10px;
          margin:10px 0; flex-wrap:wrap;
        }
        .modalSection { margin-top:22px; }
        .modalClose {
          padding:8px 12px; border-radius:8px;
          border:1px solid #d5e0e9; background:white;
        }
        @media(max-width:760px) {
          html,body { overflow-x:hidden; }
          .app {
            width:100%; max-width:100%;
            box-sizing:border-box; padding:12px !important;
          }
          .topbar {
            display:flex !important; flex-wrap:wrap;
            gap:10px; padding:12px 0 !important;
          }
          .topActions {
            display:flex !important; flex-wrap:wrap;
            width:100%; gap:8px;
          }
          .hero {
            display:flex !important; flex-direction:column !important;
            align-items:stretch !important;
            gap:14px !important; padding:18px 14px !important;
          }
          .heroButtons {
            display:grid !important;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:8px !important; width:100%;
          }
          .heroButtons button {
            width:100%; min-width:0 !important;
            min-height:44px; padding:12px 6px !important;
          }
          .heroButtons .autoButton { grid-column:1/-1; }
          .dashboard {
            display:flex !important; flex-direction:column !important;
            gap:16px !important;
          }
          .scheduleCard,.sidePanel,.sideCard {
            width:100% !important; max-width:100% !important;
            min-width:0 !important; box-sizing:border-box;
          }
          .scheduleCard { padding:12px 8px !important; }
          .cardHeader { flex-wrap:wrap; gap:10px; }
          .legend { display:flex; flex-wrap:wrap; gap:8px; }
          .tableScroll { width:100%; overflow-x:auto !important; }
          .tableScroll table {
            width:max-content !important;
            min-width:100%; font-size:12px;
          }
          .tableScroll th,.tableScroll td {
            padding:5px !important; min-width:54px;
          }
          .tableScroll .staffColumn,.tableScroll .staffName {
            min-width:92px !important;
          }
          .staffName .avatar { display:none; }
          .shiftCell {
            min-width:46px !important;
            min-height:44px !important;
            padding:6px 4px !important;
          }
          .calendarCard { padding:12px; }
          .calendarHeading { align-items:flex-start; }
          [role="dialog"] {
            width:min(100%,540px) !important;
            max-height:88dvh !important;
            overflow-y:auto !important;
            padding:16px !important;
            box-sizing:border-box;
          }
          [role="dialog"] input,
          [role="dialog"] select,
          [role="dialog"] button {
            max-width:100%; min-height:42px;
          }
        }
      `}</style>

      <header className="topbar">
        <div>
          <div className="brandRow">
            <div className="brandMark">R</div>
            <h1>RonRon</h1>
          </div>
          <p className="subtitle">SHIFT MANAGEMENT SYSTEM</p>
        </div>
        <div className="topActions">
          <span className="statusDot" />
          <span>{message}</span>
          <button className="primaryButton" onClick={persist}>
            保存
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">HALF-MONTH SCHEDULE</p>
          <h2>
            {year}年 {month}月{" "}
            {half === 1
              ? "前半（1〜15日）"
              : `後半（16〜${days[days.length - 1]?.date}日）`}
          </h2>
          <p>必要人数・希望休・勤務優先度を考慮して半月ごとに作成します。</p>
          <div style={{
            display:"flex", gap:10, flexWrap:"wrap",
            marginTop:12, alignItems:"center"
          }}>
            <input
              type="month"
              aria-label="対象年月"
              value={`${year}-${String(month).padStart(2,"0")}`}
              onChange={e => changeMonth(e.target.value)}
              style={fieldStyle}
            />
            <select
              aria-label="前半・後半"
              value={half}
              onChange={e => setHalf(Number(e.target.value) as 1 | 2)}
              style={fieldStyle}
            >
              <option value={1}>前半：1〜15日</option>
              <option value={2}>後半：16日〜末日</option>
            </select>
          </div>
        </div>
        <div className="heroButtons">
          <button className="secondaryButton" onClick={() => setStaffOpen(true)}>
            スタッフ管理
          </button>
          <button className="secondaryButton" onClick={() => setRequestOpen(true)}>
            希望シフト入力
          </button>
          <button className="autoButton" onClick={autoCreate}>
            ✦ 自動作成
          </button>
        </div>
      </section>

      <div className="viewSwitcher">
        <button
          className={`viewButton ${viewMode === "table" ? "active" : ""}`}
          onClick={() => setViewMode("table")}
        >
          📋 シフト表
        </button>
        <button
          className={`viewButton ${viewMode === "calendar" ? "active" : ""}`}
          onClick={() => setViewMode("calendar")}
        >
          📅 カレンダー
        </button>
      </div>

      {viewMode === "calendar" ? (
        <ShiftCalendar
          year={year}
          month={month}
          half={half}
          days={days}
          staff={staff}
        />
      ) : (
        <section className="dashboard">
          <div className="scheduleCard">
            <div className="cardHeader">
              <div>
                <p className="eyebrow">SCHEDULE</p>
                <h3>半月シフト表 {confirmed ? "✓ 確定済み" : ""}</h3>
              </div>
              <div className="legend">
                <span><i className="earlyDot" />早番</span>
                <span><i className="lateDot" />遅番</span>
                <span>🔁 通し</span>
                <span><i className="offDot" />休み</span>
                <span><i className="requestDot" />希望休</span>
              </div>
            </div>

            <div className="tableScroll">
              <table>
                <thead>
                  <tr>
                    <th className="staffColumn">スタッフ</th>
                    {days.map(day => (
                      <th
                        key={day.date}
                        className={
                          day.day === "日" ? "sunday" :
                          day.day === "土" ? "saturday" : ""
                        }
                      >
                        <strong>{day.date}</strong>
                        <small>{day.day}</small>
                      </th>
                    ))}
                    <th>勤務</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(person => (
                    <tr key={person.id}>
                      <td className="staffName">
                        <div className="avatar">{person.name.slice(0,1)}</div>
                        <div>
                          <strong>{person.name}</strong>
                          <small>{rules.priorities[person.id] ?? "標準"}</small>
                        </div>
                      </td>
                      {days.map((day, i) => {
                        const shift = person.shifts[i] ?? "";
                        return (
                          <td key={day.date}>
                            <button
                              className={`shiftCell ${
                                shift === "早番" || shift === "通し" ? "early" :
                                shift === "遅番" ? "late" :
                                shift === "希望休" ? "request" :
                                shift === "休み" ? "off" : "empty"
                              }`}
                              onClick={() => changeShift(person.id, i)}
                            >
                              {shift || "＋"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="workCount">
                        <strong>{person.shifts.filter(working).length}</strong>
                        <span>回</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tableHint">
              セルをクリックすると「空欄 → 早番 → 遅番 → 通し → 休み → 希望休」
              の順で変更できます。
            </p>
          </div>

          <aside className="sidePanel">
            <div className="sideCard">
              <div className="cardHeader">
                <div>
                  <p className="eyebrow">RULES</p>
                  <h3>シフト条件</h3>
                </div>
                <button
                  className="iconButton"
                  onClick={() => setRulesOpen(true)}
                  aria-label="シフト条件を編集"
                >
                  ＋
                </button>
              </div>
              <div className="rule">
                <span className="ruleIcon">↗</span>
                <div>
                  <strong>勤務優先度・勤務可能時間帯</strong>
                  <p>多め・標準・少なめ／早番・遅番・両方</p>
                </div>
              </div>
              <div className="rule">
                <span className="ruleIcon">7</span>
                <div>
                  <strong>曜日別の必要人数</strong>
                  <p>月〜日ごとに早番・遅番を設定</p>
                </div>
              </div>
              <div className="rule">
                <span className="ruleIcon danger">×</span>
                <div>
                  <strong>NG組み合わせ</strong>
                  <p>{rules.ngPairs.length}組</p>
                </div>
              </div>
              <div className="rule">
                <span className="ruleIcon">5</span>
                <div>
                  <strong>連続勤務制限</strong>
                  <p>{rules.maxStreak}連勤まで</p>
                </div>
              </div>
            </div>

            <div className="sideCard alertCard">
              <div className="cardHeader">
                <div>
                  <p className="eyebrow">CHECK</p>
                  <h3>シフトチェック</h3>
                </div>
                <span className="alertCount">{alerts.length}</span>
              </div>
              {alerts.length ? alerts.map((alert, i) => (
                <div className="alertItem" key={i}>
                  <strong>⚠ 要確認</strong>
                  <p>{alert}</p>
                </div>
              )) : (
                <div className="alertItem">
                  <strong>✓ 問題ありません</strong>
                  <p>現在のシフトに警告はありません。</p>
                </div>
              )}
            </div>

            <button className="confirmButton" onClick={confirmSchedule}>
              このシフトで確定する
            </button>
          </aside>
        </section>
      )}

      {staffOpen && (
        <div
          role="presentation"
          style={modalStyle}
          onMouseDown={e => {
            if (e.target === e.currentTarget) setStaffOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="スタッフ管理" style={dialogStyle}>
            <div className="modalRow">
              <h2>スタッフ管理</h2>
              <button className="modalClose" onClick={() => setStaffOpen(false)}>
                閉じる ×
              </button>
            </div>
            <p>スタッフの名前・追加・削除を管理します。</p>
            {roster.map(p => (
              <div className="modalRow" key={p.id}>
                <input
                  aria-label={`${p.name}の名前`}
                  value={p.name}
                  maxLength={40}
                  style={{...fieldStyle, flex:1, minWidth:0}}
                  onChange={e => updateRoster(roster.map(x =>
                    x.id === p.id ? {...x, name:e.target.value} : x
                  ))}
                />
                <button onClick={() => removeStaff(p.id)}>削除</button>
              </div>
            ))}
            <div className="modalRow">
              <input
                placeholder="追加するスタッフ名"
                aria-label="新しいスタッフ名"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStaff(); }}
                style={{...fieldStyle, flex:1, minWidth:0}}
              />
              <button onClick={addStaff}>＋ 追加</button>
            </div>
            <button
              className="primaryButton"
              style={{width:"100%",marginTop:18}}
              onClick={() => setStaffOpen(false)}
            >
              完了
            </button>
          </div>
        </div>
      )}

      {rulesOpen && (
        <div
          role="presentation"
          style={modalStyle}
          onMouseDown={e => {
            if (e.target === e.currentTarget) setRulesOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="シフト条件設定" style={dialogStyle}>
            <div className="modalRow">
              <h2>シフト条件設定</h2>
              <button className="modalClose" onClick={() => setRulesOpen(false)}>
                閉じる ×
              </button>
            </div>
            <p>設定はこのブラウザに保存されます。</p>

            <h3 className="modalSection">スタッフ別の勤務優先度</h3>
            {staff.map(p => (
              <label className="modalRow" key={p.id}>
                <span>{p.name}</span>
                <select
                  style={fieldStyle}
                  value={rules.priorities[p.id] ?? "標準"}
                  onChange={e => setRules(r => ({
                    ...r,
                    priorities:{
                      ...r.priorities,
                      [p.id]:e.target.value as Priority,
                    },
                  }))}
                >
                  <option>少なめ</option>
                  <option>標準</option>
                  <option>多め</option>
                </select>
              </label>
            ))}

            <h3 className="modalSection">スタッフ別の勤務可能時間帯</h3>
            {staff.map(p => (
              <label className="modalRow" key={p.id}>
                <span>{p.name}</span>
                <select
                  style={fieldStyle}
                  value={rules.availability[p.id] ?? "どちらも可能"}
                  onChange={e => setRules(r => ({
                    ...r,
                    availability:{
                      ...r.availability,
                      [p.id]:e.target.value as Availability,
                    },
                  }))}
                >
                  <option>早番のみ</option>
                  <option>遅番のみ</option>
                  <option>どちらも可能</option>
                </select>
              </label>
            ))}

            <h3 className="modalSection">曜日別の必要人数</h3>
            {weekNames.map((day, i) => (
              <div className="modalRow" key={day}>
                <strong>{day}曜日</strong>
                <label>
                  早番{" "}
                  <input
                    type="number"
                    min={0}
                    max={30}
                    style={{...fieldStyle,width:65}}
                    value={rules.weekdays[i].early}
                    onChange={e => updateNeed(i,"early",Number(e.target.value))}
                  />
                </label>
                <label>
                  遅番{" "}
                  <input
                    type="number"
                    min={0}
                    max={30}
                    style={{...fieldStyle,width:65}}
                    value={rules.weekdays[i].late}
                    onChange={e => updateNeed(i,"late",Number(e.target.value))}
                  />
                </label>
              </div>
            ))}

            <h3 className="modalSection">最大連勤日数</h3>
            <label>
              最大{" "}
              <input
                type="number"
                min={1}
                max={31}
                style={{...fieldStyle,width:75}}
                value={rules.maxStreak}
                onChange={e => {
                  const value = Number(e.target.value);
                  if (Number.isInteger(value) && value >= 1 && value <= 31) {
                    setRules(r => ({...r,maxStreak:value}));
                  }
                }}
              />{" "}
              日
            </label>

            <h3 className="modalSection">NG組み合わせ</h3>
            {rules.ngPairs.map(([a,b]) => (
              <div className="modalRow" key={`${a}-${b}`}>
                <span>
                  {staff.find(p => p.id === a)?.name ?? a} ×{" "}
                  {staff.find(p => p.id === b)?.name ?? b}
                </span>
                <button onClick={() => setRules(r => ({
                  ...r,
                  ngPairs:r.ngPairs.filter(([x,y]) => x !== a || y !== b),
                }))}>
                  削除
                </button>
              </div>
            ))}
            <div className="modalRow">
              <select
                style={fieldStyle}
                value={pairA}
                onChange={e => setPairA(Number(e.target.value))}
              >
                {staff.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                style={fieldStyle}
                value={pairB}
                onChange={e => setPairB(Number(e.target.value))}
              >
                {staff.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button onClick={() => {
                if (pairA === pairB) return;
                if (rules.ngPairs.some(([a,b]) =>
                  (a === pairA && b === pairB) ||
                  (a === pairB && b === pairA)
                )) return;

                setRules(r => ({
                  ...r,
                  ngPairs:[...r.ngPairs,[pairA,pairB]],
                }));
              }}>
                ＋ ペア追加
              </button>
            </div>

            <p style={{fontSize:12,marginTop:18}}>
              ※ 人員不足でもシフト案を作成します。
              不足や条件違反は警告として表示します。
            </p>
            <button
              className="primaryButton"
              style={{width:"100%",marginTop:12}}
              onClick={() => setRulesOpen(false)}
            >
              設定を完了する
            </button>
          </div>
        </div>
      )}

      {requestOpen && (
        <div
          role="presentation"
          style={modalStyle}
          onMouseDown={e => {
            if (e.target === e.currentTarget) setRequestOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="希望シフト入力" style={dialogStyle}>
            <div className="modalRow">
              <h2>希望シフト入力</h2>
              <button className="modalClose" onClick={() => setRequestOpen(false)}>
                閉じる ×
              </button>
            </div>
            <p>希望は半月ごとにブラウザへ保存されます。</p>
            <label>
              スタッフ{" "}
              <select
                style={fieldStyle}
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(Number(e.target.value))}
              >
                {staff.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <div style={{marginTop:15}}>
              {days.map(day => (
                <div className="modalRow" key={day.date}>
                  <span>{month}月{day.date}日（{day.day}）</span>
                  <select
                    style={fieldStyle}
                    value={requests[selectedStaffId]?.[day.date] ?? "指定なし"}
                    onChange={e => changeRequest(
                      selectedStaffId,
                      day.date,
                      e.target.value as Wish
                    )}
                  >
                    {([
                      "指定なし",
                      "早番希望",
                      "遅番希望",
                      "どちらも可能",
                      "休み希望",
                    ] as Wish[]).map(w => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              className="primaryButton"
              style={{width:"100%",marginTop:15}}
              onClick={() => setRequestOpen(false)}
            >
              入力を終える
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
