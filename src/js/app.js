import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwu_7-Dt8S5g9jsyYcZI-5SQ-Wdc5pxqE",
  authDomain: "songwayc-2fba1.firebaseapp.com",
  projectId: "songwayc-2fba1",
  storageBucket: "songwayc-2fba1.firebasestorage.app",
  messagingSenderId: "560805644727",
  appId: "1:560805644727:web:3894efaff8479f1203c032",
  measurementId: "G-BYYK3KEZ72"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const loginView = $("loginView");
const dashboardView = $("dashboardView");
const navList = $("navList");
const userInfo = $("userInfo");
const calendarHeader = $("calendarHeader");
const calendarBody = $("calendarBody");
const targetDate = $("targetDate");

let currentUser = null;
let currentRole = "Teacher";
let currentMode = "day";

const adminMenu = ["總覽", "教師排程", "打卡紀錄", "薪資參數", "薪資結算", "班級留言板", "待辦管理"];
const teacherMenu = ["我的課表", "上課打卡", "下課打卡/班級日誌", "我的薪資試算", "我的待辦事項"];

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginMsg").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (err) {
    $("loginMsg").textContent = `登入失敗：${err.message}`;
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("dayBtn").addEventListener("click", () => setMode("day"));
$("weekBtn").addEventListener("click", () => setMode("week"));
targetDate.addEventListener("change", () => renderCalendar());

$("scheduleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("scheduleMsg");
  msg.textContent = "";

  if (currentRole !== "Admin") {
    msg.className = "text-sm mt-2 text-rose-600";
    msg.textContent = "僅 Admin 可新增排程";
    return;
  }

  const start = new Date($("startAt").value);
  const end = new Date($("endAt").value);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    msg.className = "text-sm mt-2 text-rose-600";
    msg.textContent = "時間格式錯誤或結束時間需大於開始時間";
    return;
  }

  try {
    await addDoc(collection(db, "schedules"), {
      date: fmtDate(start),
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      region: $("region").value.trim(),
      instituteName: $("instituteName").value.trim(),
      grade: $("grade").value.trim(),
      expectedStudents: Number($("expectedStudents").value),
      courseType: $("courseType").value,
      teacherId: currentUser.uid,
      createdBy: currentUser.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      status: "scheduled"
    });
    msg.className = "text-sm mt-2 text-emerald-700";
    msg.textContent = "排程已儲存";
    e.target.reset();
    await renderCalendar();
  } catch (err) {
    msg.className = "text-sm mt-2 text-rose-600";
    msg.textContent = `儲存失敗：${err.message}`;
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    return;
  }

  currentRole = await deriveRole(user);
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  userInfo.textContent = `${user.email} | 角色：${currentRole}`;
  drawNav(currentRole);

  const today = new Date();
  targetDate.value = fmtDate(today);
  setMode("day");
  await renderCalendar();
});

function drawNav(role) {
  navList.innerHTML = "";
  (role === "Admin" ? adminMenu : teacherMenu).forEach((item) => {
    const li = document.createElement("li");
    li.className = "px-2 py-1 rounded bg-slate-50 border";
    li.textContent = item;
    navList.appendChild(li);
  });
}

async function deriveRole(user) {
  const email = (user.email || "").toLowerCase();
  if (email.includes("song") || email.includes("eric")) return "Admin";
  return "Teacher";
}

function setMode(mode) {
  currentMode = mode;
  $("dayBtn").className = `px-3 py-1.5 rounded text-sm ${mode === "day" ? "bg-slate-900 text-white" : "bg-slate-200"}`;
  $("weekBtn").className = `px-3 py-1.5 rounded text-sm ${mode === "week" ? "bg-slate-900 text-white" : "bg-slate-200"}`;
  renderCalendar();
}

async function renderCalendar() {
  const base = new Date(targetDate.value || fmtDate(new Date()));
  const days = currentMode === "day" ? [base] : weekDays(base);
  calendarHeader.style.gridTemplateColumns = `72px repeat(${days.length}, minmax(160px, 1fr))`;
  calendarHeader.innerHTML = `<div></div>${days.map((d) => `<div class="px-2">${d.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit", weekday: "short" })}</div>`).join("")}`;

  calendarBody.style.gridTemplateColumns = `72px repeat(${days.length}, minmax(160px, 1fr))`;
  calendarBody.innerHTML = "";

  const allByDate = await Promise.all(days.map((d) => getEventsByDate(fmtDate(d))));

  for (let hour = 7; hour <= 23; hour += 1) {
    const timeCell = document.createElement("div");
    timeCell.className = "time-cell";
    timeCell.textContent = `${String(hour).padStart(2, "0")}:00`;
    calendarBody.appendChild(timeCell);

    days.forEach((_, idx) => {
      const slot = document.createElement("div");
      slot.className = "slot-cell";
      const events = allByDate[idx].filter((ev) => {
        const h = ev.startAt.toDate().getHours();
        return h === hour;
      });
      events.forEach((ev) => {
        const pill = document.createElement("div");
        pill.className = "event-pill";
        pill.textContent = `${hhmm(ev.startAt.toDate())}-${hhmm(ev.endAt.toDate())} ${ev.instituteName} (${ev.grade})`;
        slot.appendChild(pill);
      });
      calendarBody.appendChild(slot);
    });
  }
}

async function getEventsByDate(dateStr) {
  const q = query(collection(db, "schedules"), where("date", "==", dateStr), orderBy("startAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function weekDays(date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
