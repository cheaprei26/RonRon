"use client";

import { useState } from "react";

type Shift = "早番" | "遅番" | "休み" | "希望休" | "";

type Staff = {
  id: number;
  name: string;
  target: number;
  shifts: Shift[];
};

const days = [
  { date: 1, day: "月" },
  { date: 2, day: "火" },
  { date: 3, day: "水" },
  { date: 4, day: "木" },
  { date: 5, day: "金" },
  { date: 6, day: "土" },
  { date: 7, day: "日" },
  { date: 8, day: "月" },
  { date: 9, day: "火" },
  { date: 10, day: "水" },
  { date: 11, day: "木" },
  { date: 12, day: "金" },
  { date: 13, day: "土" },
  { date: 14, day: "日" },
];

const initialStaff: Staff[] = [
  {
    id: 1,
    name: "山田",
    target: 10,
    shifts: ["早番", "早番", "休み", "遅番", "早番", "休み", "休み", "早番", "遅番", "早番", "休み", "早番", "休み", "休み"],
  },
  {
    id: 2,
    name: "佐藤",
    target: 8,
    shifts: ["遅番", "休み", "早番", "早番", "休み", "遅番", "休み", "遅番", "早番", "休み", "早番", "休み", "遅番", "休み"],
  },
  {
    id: 3,
    name: "田中",
    target: 9,
    shifts: ["休み", "早番", "遅番", "休み", "早番", "早番", "休み", "休み", "遅番", "早番", "休み", "遅番", "早番", "休み"],
  },
  {
    id: 4,
    name: "鈴木",
    target: 7,
    shifts: ["早番", "休み", "休み", "早番", "遅番", "休み", "早番", "遅番", "休み", "休み", "早番", "早番", "休み", "遅番"],
  },
  {
    id: 5,
    name: "高橋",
    target: 8,
    shifts: ["休み", "遅番", "早番", "休み", "早番", "遅番", "休み", "早番", "休み", "早番", "遅番", "休み", "早番", "休み"],
  },
  {
    id: 6,
    name: "伊藤",
    target: 6,
    shifts: ["早番", "休み", "遅番", "早番", "休み", "休み", "遅番", "休み", "早番", "休み", "早番", "遅番", "休み", "休み"],
  },
];

const shiftOrder: Shift[] = ["", "早番", "遅番", "休み", "希望休"];

export default function Home() {
  const [staff, setStaff] = useState(initialStaff);
  const [message, setMessage] = useState("シフト案を編集中です");

  const changeShift = (staffId: number, dayIndex: number) => {
    setStaff((current) =>
      current.map((person) => {
        if (person.id !== staffId) return person;

        const shifts = [...person.shifts];
        const currentIndex = shiftOrder.indexOf(shifts[dayIndex]);
        shifts[dayIndex] =
          shiftOrder[(currentIndex + 1) % shiftOrder.length];

        return { ...person, shifts };
      })
    );
    setMessage("変更内容があります");
  };

  const countWork = (person: Staff) =>
    person.shifts.filter(
      (shift) => shift === "早番" || shift === "遅番"
    ).length;

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="brandRow">
            <div className="brandMark">R</div>
            <h1>RonRon</h1>
          </div>
          <p className="subtitle">SHIFT MANAGEMENT SYSTEM</p>
        </div>

        <div className="topActions">
          <span className="statusDot"></span>
          <span>{message}</span>
          <button
            className="primaryButton"
            onClick={() => setMessage("シフトを保存しました")}
          >
            保存
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">MONTHLY SCHEDULE</p>
          <h2>2026年 9月</h2>
          <p>
            希望・勤務回数・組み合わせ条件を確認しながら
            シフトを作成します。
          </p>
        </div>

        <div className="heroButtons">
          <button className="secondaryButton">希望シフト入力</button>
          <button
            className="autoButton"
            onClick={() => setMessage("自動作成を実行しました")}
          >
            ✦ 自動作成
          </button>
        </div>
      </section>

      <section className="dashboard">
        <div className="scheduleCard">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">SCHEDULE</p>
              <h3>月間シフト表</h3>
            </div>

            <div className="legend">
              <span><i className="earlyDot"></i>早番</span>
              <span><i className="lateDot"></i>遅番</span>
              <span><i className="offDot"></i>休み</span>
              <span><i className="requestDot"></i>希望休</span>
            </div>
          </div>

          <div className="tableScroll">
            <table>
              <thead>
                <tr>
                  <th className="staffColumn">スタッフ</th>
                  {days.map((day) => (
                    <th
                      key={day.date}
                      className={
                        day.day === "日"
                          ? "sunday"
                          : day.day === "土"
                          ? "saturday"
                          : ""
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
                {staff.map((person) => (
                  <tr key={person.id}>
                    <td className="staffName">
                      <div className="avatar">
                        {person.name.slice(0, 1)}
                      </div>
                      <div>
                        <strong>{person.name}</strong>
                        <small>目標 {person.target}回</small>
                      </div>
                    </td>

                    {person.shifts.map((shift, index) => (
                      <td key={index}>
                        <button
                          className={`shiftCell ${
                            shift === "早番"
                              ? "early"
                              : shift === "遅番"
                              ? "late"
                              : shift === "希望休"
                              ? "request"
                              : shift === "休み"
                              ? "off"
                              : "empty"
                          }`}
                          onClick={() =>
                            changeShift(person.id, index)
                          }
                        >
                          {shift || "＋"}
                        </button>
                      </td>
                    ))}

                    <td className="workCount">
                      <strong>{countWork(person)}</strong>
                      <span>/ {person.target}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="tableHint">
            シフト枠をクリックすると「早番 → 遅番 → 休み → 希望休」と変更できます。
          </p>
        </div>

        <aside className="sidePanel">
          <div className="sideCard">
            <div className="cardHeader">
              <div>
                <p className="eyebrow">RULES</p>
                <h3>シフト条件</h3>
              </div>
              <button className="iconButton">＋</button>
            </div>

            <div className="rule">
              <span className="ruleIcon">↗</span>
              <div>
                <strong>山田さんを多めに配置</strong>
                <p>月10回以上を目標</p>
              </div>
            </div>

            <div className="rule">
              <span className="ruleIcon danger">×</span>
              <div>
                <strong>佐藤 × 田中</strong>
                <p>同じ時間帯への配置NG</p>
              </div>
            </div>

            <div className="rule">
              <span className="ruleIcon">2</span>
              <div>
                <strong>最低配置人数</strong>
                <p>各時間帯2名以上</p>
              </div>
            </div>

            <div className="rule">
              <span className="ruleIcon">5</span>
              <div>
                <strong>連続勤務制限</strong>
                <p>5連勤を超えない</p>
              </div>
            </div>
          </div>

          <div className="sideCard alertCard">
            <div className="cardHeader">
              <div>
                <p className="eyebrow">CHECK</p>
                <h3>シフトチェック</h3>
              </div>
              <span className="alertCount">3</span>
            </div>

            <div className="alertItem">
              <strong>⚠ 人数不足</strong>
              <p>9月4日の遅番が1名です</p>
            </div>

            <div className="alertItem">
              <strong>⚠ NG組み合わせ</strong>
              <p>佐藤さんと田中さんを確認してください</p>
            </div>

            <div className="alertItem">
              <strong>⚠ 勤務回数</strong>
              <p>山田さんが目標回数に達していません</p>
            </div>
          </div>

          <button
            className="confirmButton"
            onClick={() => setMessage("2026年9月のシフトを確定しました")}
          >
            このシフトで確定する
          </button>
        </aside>
      </section>
    </main>
  );
}