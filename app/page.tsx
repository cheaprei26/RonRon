"use client";

import { useEffect, useMemo, useState } from "react";

type Shift = "早番" | "遅番" | "通し" | "休み" | "希望休" | "";
type RequestShift = "指定なし" | "早番希望" | "遅番希望" | "どちらも可能" | "休み希望";
type Availability = "早番のみ" | "遅番のみ" | "どちらも可能";
type Priority = "多め" | "標準" | "少なめ";
type Staff = { id: number; name: string; shifts: Shift[] };
type Requests = Record<number, Record<number, RequestShift>>;
type DailyNeed = { early: number; late: number };
type Rules = { weekdays: DailyNeed[]; maxStreak: number; ngPairs: [number, number][]; priorities: Record<number, Priority>; availability: Record<number, Availability> };
type Day = { date: number; day: string; weekday: number };
const weekNames = ["日", "月", "火", "水", "木", "金", "土"];
const initialNames = ["山田", "佐藤", "田中", "鈴木", "高橋", "伊藤"];
const defaultRules: Rules = {
  weekdays: Array.from({ length: 7 }, () => ({ early: 2, late: 2 })),
  maxStreak: 5,
  ngPairs: [[2, 3]],
  priorities: {},
  availability: {},
};
const shiftOrder: Shift[] = ["", "早番", "遅番", "通し", "休み", "希望休"];
const isWork = (s: Shift) => s === "早番" || s === "遅番" || s === "通し";
const coversEarly = (s: Shift) => s === "早番" || s === "通し";
const coversLate = (s: Shift) => s === "遅番" || s === "通し";
const store = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const read = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const periodId = (year: number, month: number, half: 1 | 2) => `${year}-${String(month).padStart(2, "0")}-${half}`;
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
function previousPeriod(year: number, month: number, half: 1 | 2) {
  if (half === 2) return periodId(year, month, 1);
  return periodId(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1, 2);
}
function initialStaff(): Staff[] { return initialNames.map((name, i) => ({ id: i + 1, name, shifts: [] })); }
function priorStreaks(people: Staff[], previous: Staff[]): number[] {
  return people.map(p => {
    const old = previous.find(x => x.id === p.id)?.shifts ?? [];
    let streak = 0;
    for (let i = old.length - 1; i >= 0 && isWork(old[i]); i--) streak++;
    return streak;
  });
}
function dayOptions(people: Staff[], day: Day, wishes: Requests, rules: Rules): Shift[][] {
  const need = rules.weekdays[day.weekday];
  const n = people.length;
  const available = people.map((p, i) => ({ p, i })).filter(({ p }) => wishes[p.id]?.[day.date] !== "休み希望").map(x => x.i);
  const result: Shift[][] = [];
  const row: Shift[] = Array(n).fill("休み");
  const conflicts = (i: number, candidate: Shift) => rules.ngPairs.some(([a, b]) => {
    const id = people[i].id;
    const otherId = a === id ? b : b === id ? a : -1;
    const j = people.findIndex(p => p.id === otherId);
    if (j < 0) return false;
    return (coversEarly(candidate) && coversEarly(row[j])) || (coversLate(candidate) && coversLate(row[j]));
  });
  const assign = (idx: number, e: number, l: number) => {
    if (e === need.early && l === need.late) { result.push([...row]); return; }
    if (idx >= available.length) return;
    if (e + available.length - idx < need.early || l + available.length - idx < need.late) return;
    const i = available[idx];
    const availability = rules.availability?.[people[i].id] ?? "どちらも可能";
    const choices: Shift[] = [];
    if (availability === "どちらも可能" && e < need.early && l < need.late) choices.push("通し");
    if (availability !== "遅番のみ" && e < need.early) choices.push("早番");
    if (availability !== "早番のみ" && l < need.late) choices.push("遅番");
    choices.push("休み");
    for (const shift of choices) {
      if (shift !== "休み" && conflicts(i, shift)) continue;
      row[i] = shift;
      assign(idx + 1, e + (coversEarly(shift) ? 1 : 0), l + (coversLate(shift) ? 1 : 0));
    }
    row[i] = "休み";
  };
  assign(0, 0, 0);
  return result;
}
function diagnose(people: Staff[], days: Day[], wishes: Requests, rules: Rules, previousStreaks: number[]) {
  const errors: string[] = [];
  if (rules.maxStreak < 1) errors.push("連続勤務上限を1日以上にしてください");
  days.forEach((day, d) => {
    const need = rules.weekdays[day.weekday];
    if (Math.max(need.early, need.late) > people.length) errors.push(`${day.date}日：早番${need.early}名・遅番${need.late}名に対して登録${people.length}名`);
    else if (dayOptions(people, day, wishes, rules).length === 0) errors.push(`${day.date}日：希望休とNGペアを守る配置がありません`);
    if (d === 0 && Math.max(need.early, need.late) > people.filter((_, i) => previousStreaks[i] < rules.maxStreak).length) errors.push(`${day.date}日：前半・後半をまたぐ連勤上限で人数が不足する可能性があります`);
  });
  return errors;
}
function generate(people: Staff[], days: Day[], wishes: Requests, rules: Rules, previousStreaks: number[]): Shift[][] | null {
  const choices = days.map(day => dayOptions(people, day, wishes, rules));
  if (choices.some(c => !c.length)) return null;
  const n = people.length;
  const counts = Array(n).fill(0) as number[];
  const failed = new Set<string>();
  const result: Shift[][] = [];
  let visited = 0;
  const limit = 300000;
  const search = (d: number, streaks: number[]): boolean => {
    if (d === days.length) return true;
    if (++visited > limit) return false;
    const key = `${d}:${streaks.join(",")}`;
    if (failed.has(key)) return false;
    const ranked = choices[d].map(option => {
      let score = 0;
      for (let i = 0; i < n; i++) {
        const work = isWork(option[i]);
        if (work && streaks[i] >= rules.maxStreak) return { option, score: -Infinity };
        const wish = wishes[people[i].id]?.[days[d].date];
        if (wish === "早番希望") score += coversEarly(option[i]) ? 12 : work ? -3 : -6;
        if (wish === "遅番希望") score += coversLate(option[i]) ? 12 : work ? -3 : -6;
        const priority = rules.priorities[people[i].id] ?? "標準";
        const weight = priority === "多め" ? 1.35 : priority === "少なめ" ? 0.7 : 1;
        if (work) score += 5 * weight - counts[i] / weight - streaks[i] * 0.5;
        else if (streaks[i] >= rules.maxStreak - 1) score += 3;
      }
      return { option, score };
    }).filter(x => Number.isFinite(x.score)).sort((a, b) => b.score - a.score);
    for (const { option } of ranked) {
      const next = streaks.map((s, i) => isWork(option[i]) ? s + 1 : 0);
      option.forEach((s, i) => { if (isWork(s)) counts[i]++; });
      result.push(option);
      if (search(d + 1, next)) return true;
      result.pop();
      option.forEach((s, i) => { if (isWork(s)) counts[i]--; });
      if (visited > limit) return false;
    }
    failed.add(key);
    return false;
  };
  return search(0, previousStreaks) ? result : null;
}
const fieldStyle = { padding: "8px 10px", borderRadius: 9, border: "1px solid #cbdce8", background: "white", color: "#17334c" };
const modalStyle = { position: "fixed" as const, inset: 0, background: "rgba(15,35,55,.48)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 };
const dialogStyle = { width: "min(660px,100%)", maxHeight: "85vh", overflowY: "auto" as const, background: "white", borderRadius: 18, padding: 24, color: "#17334c" };
export default function Home() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2);
  const [staff, setStaff] = useState<Staff[]>(initialStaff);
  const [roster, setRoster] = useState<{ id: number; name: string }[]>(() => initialStaff().map(({ id, name }) => ({ id, name })));
  const [staffOpen, setStaffOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [requests, setRequests] = useState<Requests>({});
  const [rules, setRules] = useState<Rules>(defaultRules);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("半月シフトを編集中です");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(1);
  const [pairA, setPairA] = useState(1);
  const [pairB, setPairB] = useState(2);
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const days = useMemo(() => makeDays(year, month, half), [year, month, half]);
  const period = periodId(year, month, half);
  const prevPeriod = previousPeriod(year, month, half);
  const previousStaff = useMemo(() => read<Staff[]>(`ronron-schedule-${prevPeriod}`, []), [prevPeriod]);
  const previousStreaks = useMemo(() => priorStreaks(staff, previousStaff), [staff, previousStaff]);

  useEffect(() => {
    const savedRoster = read<{ id: number; name: string }[]>("ronron-staff-roster-v1", []);
    if (savedRoster.length) setRoster(savedRoster);
    const saved = read<Partial<Rules>>("ronron-rules-v2", {});
    setRules({ ...defaultRules, ...saved, weekdays: Array.from({ length: 7 }, (_, i) => ({ ...defaultRules.weekdays[i], ...(saved.weekdays?.[i] ?? {}) })), priorities: saved.priorities ?? {}, availability: saved.availability ?? {} });
  }, []);
  useEffect(() => {
    setReady(false);
    const savedStaff = read<Staff[]>(`ronron-schedule-${period}`, []);
    setStaff(old => roster.map(p => ({ ...p, shifts: savedStaff.find(x => x.id === p.id)?.shifts?.slice(0, days.length) ?? old.find(x => x.id === p.id)?.shifts?.slice(0, days.length) ?? Array(days.length).fill("") })));
    setRequests(read<Requests>(`ronron-requests-${period}`, {}));
    setConfirmed(read<boolean>(`ronron-confirmed-${period}`, false));
    setDiagnosis([]); setSearchFailed(false);
    setMessage(`${year}年${month}月${half === 1 ? "前半" : "後半"}を表示中`);
    setReady(true);
  }, [period, days.length, year, month, half, roster]);
  useEffect(() => { if (ready) store("ronron-rules-v2", rules); }, [rules, ready]);
  const persistCurrent = () => { store(`ronron-schedule-${period}`, staff); store(`ronron-requests-${period}`, requests); };
  const renameStaff = (id: number, value: string) => {
    persistCurrent();
    const name = value.slice(0, 40);
    const next = roster.map(p => p.id === id ? { ...p, name } : p);
    store("ronron-staff-roster-v1", next); setRoster(next);
    setConfirmed(false);
  };
  const addStaff = () => {
    persistCurrent();
    const name = newName.trim();
    if (!name) { setMessage("スタッフ名を入力してください"); return; }
    if (roster.some(p => p.name === name)) { setMessage("同じ名前のスタッフがいます"); return; }
    const id = Math.max(Date.now(), ...roster.map(p => p.id)) + 1;
    const next = [...roster, { id, name }];
    store("ronron-staff-roster-v1", next); setRoster(next);
    setNewName(""); setMessage(`${name}さんを追加しました。シフトは保存してください`);
  };
  const removeStaff = (id: number) => {
    persistCurrent();
    const person = roster.find(p => p.id === id);
    if (!person || !window.confirm(`${person.name}さんをスタッフ一覧から削除しますか？\n過去の保存済みシフトは残ります。`)) return;
    if (roster.length <= 1) { setMessage("スタッフは最低1人必要です"); return; }
    const next = roster.filter(p => p.id !== id);
    store("ronron-staff-roster-v1", next); setRoster(next);
    setRules(old => ({ ...old, ngPairs: old.ngPairs.filter(([a,b]) => a !== id && b !== id), priorities: Object.fromEntries(Object.entries(old.priorities).filter(([k]) => Number(k) !== id)) as Record<number, Priority>, availability: Object.fromEntries(Object.entries(old.availability).filter(([k]) => Number(k) !== id)) as Record<number, Availability> }));
    setSelectedStaffId(old => old === id ? roster.find(p => p.id !== id)!.id : old);
    setPairA(old => old === id ? roster.find(p => p.id !== id)!.id : old);
    setPairB(old => old === id ? roster.find(p => p.id !== id)!.id : old);
    setConfirmed(false); setMessage(`${person.name}さんを一覧から削除しました`);
  };
  useEffect(() => {
    if (!ready) return;
    store("ronron-staff-roster-v1", roster);
  }, [roster, ready]);
  const save = () => {
    const ok = store(`ronron-schedule-${period}`, staff) && store(`ronron-requests-${period}`, requests) && store(`ronron-confirmed-${period}`, confirmed);
    setMessage(ok ? "この半月のシフト・希望を保存しました（このブラウザ内）" : "保存に失敗しました。ブラウザの保存容量を確認してください");
  };
  const changeRequest = (id: number, date: number, value: RequestShift) => {
    const next = { ...requests, [id]: { ...(requests[id] ?? {}), [date]: value } };
    setRequests(next); store(`ronron-requests-${period}`, next);
    setMessage("希望を保存しました（このブラウザ内）");
  };
  const changeShift = (id: number, index: number) => {
    setStaff(old => old.map(p => p.id !== id ? p : ({ ...p, shifts: p.shifts.map((s, i) => i === index ? shiftOrder[(shiftOrder.indexOf(s) + 1) % shiftOrder.length] : s) })));
    setConfirmed(false); setMessage("変更内容があります。保存してください");
  };
  const autoCreate = () => {
    const errors = diagnose(staff, days, requests, rules, previousStreaks);
    setDiagnosis(errors); setSearchFailed(false);
    if (errors.length) { setMessage(`自動作成できません：${errors.length}件の条件を確認してください`); return; }
    if (!window.confirm(`${year}年${month}月${half === 1 ? "前半" : "後半"}のシフト案を置き換えます。よろしいですか？`)) return;
    const generated = generate(staff, days, requests, rules, previousStreaks);
    if (!generated) { setSearchFailed(true); setMessage("条件を満たす案を探索範囲内で見つけられませんでした。現在のシフトは維持しています"); return; }
    setStaff(old => old.map((p, i) => ({ ...p, shifts: generated.map(row => row[i]) })));
    setConfirmed(false); setMessage("自動作成しました。内容を確認して保存してください");
  };
  const alerts = useMemo(() => {
    const items: string[] = [];
    days.forEach((day, i) => {
      const need = rules.weekdays[day.weekday];
      const early = staff.filter(p => coversEarly(p.shifts[i])).length;
      const late = staff.filter(p => coversLate(p.shifts[i])).length;
      if (early < need.early) items.push(`${month}月${day.date}日：早番${early}/${need.early}名`);
      if (late < need.late) items.push(`${month}月${day.date}日：遅番${late}/${need.late}名`);
      staff.forEach(p => { if (requests[p.id]?.[day.date] === "休み希望" && isWork(p.shifts[i])) items.push(`${month}月${day.date}日：${p.name}さんの希望休と衝突`); });
      rules.ngPairs.forEach(([a, b]) => {
        const x = staff.find(p => p.id === a), y = staff.find(p => p.id === b);
        if (x && y && ((coversEarly(x.shifts[i]) && coversEarly(y.shifts[i])) || (coversLate(x.shifts[i]) && coversLate(y.shifts[i])))) items.push(`${month}月${day.date}日：${x.name}さん・${y.name}さんが同じ時間帯`);
      });
    });
    staff.forEach((p, i) => {
      let streak = previousStreaks[i];
      p.shifts.forEach((s, d) => { streak = isWork(s) ? streak + 1 : 0; if (streak === rules.maxStreak + 1) items.push(`${p.name}さん：${month}月${days[d].date}日に連勤上限超過`); });
    });
    return items;
  }, [staff, days, rules, requests, month, previousStreaks]);
  const workCount = (p: Staff) => p.shifts.filter(isWork).length;
  const updateNeed = (weekday: number, key: keyof DailyNeed, value: number) => {
    if (!Number.isInteger(value) || value < 0 || value > 30) return;
    setRules(r => ({ ...r, weekdays: r.weekdays.map((need, i) => i === weekday ? { ...need, [key]: value } : need) }));
  };
  const changeMonth = (value: string) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const [y, m] = value.split("-").map(Number);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) { setYear(y); setMonth(m); }
  };
  return (
    <main className="app">
      <style>{`
        /* RonRon mobile enhancement: desktop styles remain in globals.css */
        .app { min-width: 0; }
        .tableScroll { overflow-x: auto; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; max-width: 100%; }
        .tableScroll table { border-collapse: separate; border-spacing: 0; }
        .tableScroll th, .tableScroll td { white-space: nowrap; }
        .tableScroll .staffColumn, .tableScroll .staffName { position: sticky; left: 0; z-index: 3; background: #fff; box-shadow: 2px 0 5px rgba(18,58,84,.08); }
        .tableScroll thead .staffColumn { z-index: 4; background: #f0f7fc; }
        .shiftCell { touch-action: manipulation; }
        @media (max-width: 760px) {
          html, body { overflow-x: hidden; }
          .app { width: 100%; max-width: 100%; box-sizing: border-box; padding: 12px !important; }
          .topbar { display: flex !important; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 12px 0 !important; }
          .topActions { display: flex !important; flex-wrap: wrap; width: 100%; gap: 8px; align-items: center; }
          .topActions > span:nth-child(2) { flex: 1 1 180px; min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
          .topActions .primaryButton { margin-left: auto; }
          .hero { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 14px !important; padding: 18px 14px !important; }
          .hero h2 { font-size: clamp(20px, 5.5vw, 28px); line-height: 1.4; }
          .heroButtons { display: grid !important; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px !important; width: 100%; }
          .heroButtons button { min-width: 0 !important; width: 100%; padding: 12px 6px !important; font-size: 13px; white-space: normal; min-height: 44px; }
          .heroButtons .autoButton { grid-column: 1 / -1; }
          .dashboard { display: flex !important; flex-direction: column !important; grid-template-columns: minmax(0,1fr) !important; gap: 16px !important; min-width: 0; }
          .scheduleCard, .sidePanel, .sideCard { min-width: 0 !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
          .scheduleCard { padding: 12px 8px !important; }
          .cardHeader { flex-wrap: wrap; gap: 10px; }
          .legend { display: flex; flex-wrap: wrap; gap: 8px 12px; }
          .tableScroll { width: 100%; overflow-x: auto !important; }
          .tableScroll table { width: max-content !important; min-width: 100%; font-size: 12px; }
          .tableScroll th, .tableScroll td { padding: 5px !important; min-width: 54px; }
          .tableScroll .staffColumn, .tableScroll .staffName { min-width: 92px !important; max-width: 112px; }
          .staffName .avatar { display: none; }
          .staffName strong { display: block; overflow: hidden; text-overflow: ellipsis; max-width: 95px; }
          .staffName small { font-size: 10px; }
          .shiftCell { min-width: 46px !important; min-height: 44px !important; padding: 6px 4px !important; font-size: 12px !important; }
          .workCount { min-width: 48px !important; }
          .tableHint { font-size: 12px; line-height: 1.6; }
          [role="dialog"] { width: min(100%, 540px) !important; max-width: 100% !important; max-height: 88dvh !important; overflow-y: auto !important; padding: 16px !important; box-sizing: border-box; }
          [role="dialog"] h2 { font-size: 19px; }
          [role="dialog"] input, [role="dialog"] select, [role="dialog"] button { max-width: 100%; font-size: 16px; min-height: 42px; }
          [role="dialog"] label { flex-wrap: wrap; gap: 8px; }
          .confirmButton { min-height: 48px; }
        }
        @media (max-width: 360px) {
          .heroButtons { grid-template-columns: 1fr; }
          .heroButtons .autoButton { grid-column: auto; }
          .app { padding: 8px !important; }
        }
      `}</style>

      <header className="topbar">
        <div><div className="brandRow"><div className="brandMark">R</div><h1>RonRon</h1></div><p className="subtitle">SHIFT MANAGEMENT SYSTEM</p></div>
        <div className="topActions"><span className="statusDot"/><span>{message}</span><button className="primaryButton" onClick={save}>保存</button></div>
      </header>
      <section className="hero">
        <div><p className="eyebrow">HALF-MONTH SCHEDULE</p><h2>{year}年 {month}月 {half === 1 ? "前半（1〜15日）" : `後半（16〜${days[days.length - 1]?.date}日）`}</h2><p>必要人数・希望休・勤務優先度を考慮して半月ごとに作成します。</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
            <input type="month" aria-label="対象年月" value={`${year}-${String(month).padStart(2, "0")}`} onChange={e => changeMonth(e.target.value)} style={fieldStyle}/>
            <select aria-label="前半・後半" value={half} onChange={e => setHalf(Number(e.target.value) as 1 | 2)} style={fieldStyle}><option value={1}>前半：1〜15日</option><option value={2}>後半：16日〜末日</option></select>
          </div>
        </div>
        <div className="heroButtons"><button className="secondaryButton" onClick={() => setStaffOpen(true)}>スタッフ管理</button><button className="secondaryButton" onClick={() => setRequestOpen(true)}>希望シフト入力</button><button className="autoButton" onClick={autoCreate}>✦ 自動作成</button></div>
      </section>
      {(diagnosis.length > 0 || searchFailed) && <section role="status" style={{ margin: "12px 0 18px", padding: 16, borderRadius: 14, border: "1px solid #f1c8a8", background: "#fff8f1", color: "#71431f" }}><strong>自動作成の条件診断</strong><button style={{ float: "right" }} onClick={() => { setDiagnosis([]); setSearchFailed(false); }}>閉じる ×</button>{diagnosis.map((x, i) => <p key={i}>⚠ {x}</p>)}{searchFailed && <p>⚠ 全期間の配置を探索上限内で発見できませんでした。必ずしも不可能とは限りません。</p>}</section>}
      <section className="dashboard">
        <div className="scheduleCard">
          <div className="cardHeader"><div><p className="eyebrow">SCHEDULE</p><h3>半月シフト表 {confirmed ? "✓ 確定済み" : ""}</h3></div><div className="legend"><span><i className="earlyDot"/>早番</span><span><i className="lateDot"/>遅番</span><span>🔁 通し</span><span><i className="offDot"/>休み</span><span><i className="requestDot"/>希望休</span></div></div>
          <div className="tableScroll"><table><thead><tr><th className="staffColumn">スタッフ</th>{days.map(day => <th key={day.date} className={day.day === "日" ? "sunday" : day.day === "土" ? "saturday" : ""}><strong>{day.date}</strong><small>{day.day}</small></th>)}<th>勤務</th></tr></thead><tbody>
            {staff.map(person => <tr key={person.id}><td className="staffName"><div className="avatar">{person.name.slice(0, 1)}</div><div><strong>{person.name}</strong><small>{rules.priorities[person.id] ?? "標準"}</small></div></td>{days.map((day, i) => { const shift = person.shifts[i] ?? ""; return <td key={day.date}><button className={`shiftCell ${shift === "早番" ? "early" : shift === "遅番" ? "late" : shift === "通し" ? "early" : shift === "希望休" ? "request" : shift === "休み" ? "off" : "empty"}`} onClick={() => changeShift(person.id, i)}>{shift || "＋"}</button></td>; })}<td className="workCount"><strong>{workCount(person)}</strong><span>回</span></td></tr>)}
          </tbody></table></div><p className="tableHint">セルをクリックすると「空欄 → 早番 → 遅番 → 通し → 休み → 希望休」の順で変更できます。</p>
        </div>
        <aside className="sidePanel"><div className="sideCard"><div className="cardHeader"><div><p className="eyebrow">RULES</p><h3>シフト条件</h3></div><button className="iconButton" onClick={() => setRulesOpen(true)} aria-label="シフト条件を編集">＋</button></div>
          <div className="rule"><span className="ruleIcon">↗</span><div><strong>勤務優先度・勤務可能時間帯</strong><p>多め・標準・少なめ／早番のみ・遅番のみ・両方</p></div></div>
          <div className="rule"><span className="ruleIcon">7</span><div><strong>曜日別の必要人数</strong><p>月〜日ごとに早番・遅番を設定</p></div></div>
          <div className="rule"><span className="ruleIcon danger">×</span><div><strong>NG組み合わせ</strong><p>{rules.ngPairs.length}組</p></div></div>
          <div className="rule"><span className="ruleIcon">5</span><div><strong>連続勤務制限</strong><p>{rules.maxStreak}連勤まで</p></div></div></div>
          <div className="sideCard alertCard"><div className="cardHeader"><div><p className="eyebrow">CHECK</p><h3>シフトチェック</h3></div><span className="alertCount">{alerts.length}</span></div>{alerts.length ? alerts.slice(0, 8).map((a, i) => <div className="alertItem" key={i}><strong>⚠ 要確認</strong><p>{a}</p></div>) : <div className="alertItem"><strong>✓ 問題ありません</strong><p>現在のシフトに警告はありません。</p></div>}{alerts.length > 8 && <p>ほか{alerts.length - 8}件の警告があります。</p>}</div>
          <button className="confirmButton" onClick={() => { if (alerts.length) { setMessage(`警告が${alerts.length}件あります。修正してから確定してください`); return; } if (!staff.some(p => p.shifts.some(isWork))) { setMessage("勤務が入力されていません"); return; } const ok = store(`ronron-schedule-${period}`, staff) && store(`ronron-requests-${period}`, requests) && store(`ronron-confirmed-${period}`, true); if (ok) { setConfirmed(true); setMessage(`${year}年${month}月${half === 1 ? "前半" : "後半"}のシフトを確定・保存しました`); } else setMessage("保存に失敗しました"); }}>このシフトで確定する</button>
        </aside>
      </section>
      {staffOpen && <div role="presentation" style={modalStyle} onMouseDown={e => { if (e.target === e.currentTarget) setStaffOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-label="スタッフ管理" style={dialogStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2>スタッフ管理</h2><button onClick={() => setStaffOpen(false)}>閉じる ×</button></div>
          <p style={{ fontSize: 13 }}>名前の変更・スタッフの追加・削除ができます。名前はすべての期間で共通です。</p>
          {roster.map(p => <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
            <input aria-label={`${p.name}の名前`} value={p.name} maxLength={40} onChange={e => renameStaff(p.id, e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 0 }}/>
            <button type="button" onClick={() => removeStaff(p.id)} style={{ ...fieldStyle, color: "#a33" }}>削除</button>
          </div>)}
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <input aria-label="新しいスタッフ名" placeholder="追加するスタッフの名前" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addStaff(); }} style={{ ...fieldStyle, flex: 1, minWidth: 0 }}/>
            <button type="button" onClick={addStaff} style={{ ...fieldStyle, background: "#419ed0", color: "white" }}>＋ 追加</button>
          </div>
          <p style={{ fontSize: 12 }}>※ 登録情報はこのブラウザ内に保存されます。勤務表の変更は「保存」を押してください。</p>
          <button onClick={() => setStaffOpen(false)} style={{ width: "100%", padding: 12, background: "#419ed0", color: "white", border: 0, borderRadius: 10, fontWeight: 700 }}>完了</button>
        </div>
      </div>}
      {rulesOpen && <div role="presentation" style={modalStyle} onMouseDown={e => { if (e.target === e.currentTarget) setRulesOpen(false); }}><div role="dialog" aria-modal="true" aria-label="シフト条件設定" style={dialogStyle}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2>シフト条件設定</h2><button onClick={() => setRulesOpen(false)}>閉じる ×</button></div><p>設定はこのブラウザに自動保存されます。</p>
        <h3>スタッフ別の勤務優先度</h3>{staff.map(p => <label key={p.id} style={{ display: "flex", justifyContent: "space-between", margin: "9px 0" }}><span>{p.name}</span><select style={fieldStyle} value={rules.priorities[p.id] ?? "標準"} onChange={e => setRules(r => ({ ...r, priorities: { ...r.priorities, [p.id]: e.target.value as Priority } }))}><option>少なめ</option><option>標準</option><option>多め</option></select></label>)}
        <h3>スタッフ別の勤務可能時間帯</h3><p style={{ fontSize: 13 }}>配置できる時間帯を指定します。「どちらも可能」は早番・遅番・通し勤務に配置できます。</p>{staff.map(p => <label key={p.id} style={{ display: "flex", justifyContent: "space-between", margin: "9px 0" }}><span>{p.name}</span><select style={fieldStyle} value={rules.availability?.[p.id] ?? "どちらも可能"} onChange={e => setRules(r => ({ ...r, availability: { ...(r.availability ?? {}), [p.id]: e.target.value as Availability } }))}><option>早番のみ</option><option>遅番のみ</option><option>どちらも可能</option></select></label>)}
        <h3>曜日別の必要人数</h3><p style={{ fontSize: 13 }}>日曜〜土曜の必要人数。前半・後半どちらにも適用されます。</p>{weekNames.map((day, i) => <div key={day} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "9px 0" }}><strong>{day}曜日</strong><label>早番 <input aria-label={`${day}曜の早番人数`} type="number" min={0} max={30} style={{ ...fieldStyle, width: 65 }} value={rules.weekdays[i].early} onChange={e => updateNeed(i, "early", Number(e.target.value))}/></label><label>遅番 <input aria-label={`${day}曜の遅番人数`} type="number" min={0} max={30} style={{ ...fieldStyle, width: 65 }} value={rules.weekdays[i].late} onChange={e => updateNeed(i, "late", Number(e.target.value))}/></label></div>)}
        <h3>連続勤務の上限</h3><label>最大 <input type="number" min={1} max={31} style={{ ...fieldStyle, width: 75 }} value={rules.maxStreak} onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= 31) setRules(r => ({ ...r, maxStreak: v })); }}/> 日</label>
        <h3>同じ時間帯に配置しない組み合わせ</h3>{rules.ngPairs.map(([a, b]) => <div key={`${a}-${b}`} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span>{staff.find(p => p.id === a)?.name} × {staff.find(p => p.id === b)?.name}</span><button onClick={() => setRules(r => ({ ...r, ngPairs: r.ngPairs.filter(([x, y]) => x !== a || y !== b) }))}>削除</button></div>)}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><select style={fieldStyle} value={pairA} onChange={e => setPairA(Number(e.target.value))}>{staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select style={fieldStyle} value={pairB} onChange={e => setPairB(Number(e.target.value))}>{staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button onClick={() => { if (pairA === pairB || rules.ngPairs.some(([a, b]) => (a === pairA && b === pairB) || (a === pairB && b === pairA))) return; setRules(r => ({ ...r, ngPairs: [...r.ngPairs, [pairA, pairB]] })); }}>＋ ペアを追加</button></div>
        <p style={{ fontSize: 12 }}>※ 勤務優先度と早番・遅番希望は希望条件です。勤務可能時間帯・必要人数・希望休・NGペア・連勤上限は必須条件です。</p><button style={{ width: "100%", padding: 12, background: "#419ed0", color: "white", border: 0, borderRadius: 10, fontWeight: 700 }} onClick={() => setRulesOpen(false)}>設定を完了する</button>
      </div></div>}
      {requestOpen && <div role="presentation" style={modalStyle} onMouseDown={e => { if (e.target === e.currentTarget) setRequestOpen(false); }}><div role="dialog" aria-modal="true" aria-label="希望シフト入力" style={dialogStyle}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2>希望シフト入力</h2><button onClick={() => setRequestOpen(false)}>閉じる ×</button></div><p>管理者が希望を入力します。希望は半月ごとにブラウザへ保存されます。</p><label>スタッフを選択 <select style={fieldStyle} value={selectedStaffId} onChange={e => setSelectedStaffId(Number(e.target.value))}>{staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div style={{ marginTop: 15 }}>{days.map(day => <div key={day.date} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #edf2f7" }}><span>{month}月{day.date}日（{day.day}）</span><select aria-label={`${month}月${day.date}日の希望`} style={fieldStyle} value={requests[selectedStaffId]?.[day.date] ?? "指定なし"} onChange={e => changeRequest(selectedStaffId, day.date, e.target.value as RequestShift)}>{(["指定なし", "早番希望", "遅番希望", "どちらも可能", "休み希望"] as RequestShift[]).map(v => <option key={v}>{v}</option>)}</select></div>)}</div><button style={{ width: "100%", padding: 12, marginTop: 15, background: "#419ed0", color: "white", border: 0, borderRadius: 10 }} onClick={() => setRequestOpen(false)}>入力を終える</button></div></div>}
    </main>
  );
}
