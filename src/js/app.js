import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

const firebaseConfig = { apiKey: "AIzaSyDwu_7-Dt8S5g9jsyYcZI-5SQ-Wdc5pxqE", authDomain: "songwayc-2fba1.firebaseapp.com", projectId: "songwayc-2fba1", storageBucket: "songwayc-2fba1.firebasestorage.app", messagingSenderId: "560805644727", appId: "1:560805644727:web:3894efaff8479f1203c032", measurementId: "G-BYYK3KEZ72" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentRole = "Teacher";
let currentMode = "day";
let todaySchedules = [];

const adminMenu = ["總覽", "教師排程", "打卡紀錄", "薪資參數", "薪資結算", "班級留言板", "待辦管理"];
const teacherMenu = ["我的課表", "上課打卡", "下課打卡/班級日誌", "我的薪資試算", "我的待辦事項"];

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value); }
  catch (err) { $("loginMsg").textContent = `登入失敗：${err.message}`; }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("dayBtn").addEventListener("click", () => setMode("day"));
$("weekBtn").addEventListener("click", () => setMode("week"));
$("targetDate").addEventListener("change", () => renderCalendar());
$("reloadSchedules").addEventListener("click", async () => loadTodaySchedules());
$("loadMessagesBtn").addEventListener("click", async () => renderMessages($("msgViewClassId").value.trim()));

$("scheduleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (currentRole !== "Admin") return setMsg($("scheduleMsg"), "僅 Admin 可新增排程", true);
  const start = new Date($("startAt").value);
  const end = new Date($("endAt").value);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return setMsg($("scheduleMsg"), "時間格式錯誤", true);

  try {
    await addDoc(collection(db, "schedules"), {
      date: fmtDate(start), startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end),
      region: $("region").value.trim(), instituteName: $("instituteName").value.trim(), grade: $("grade").value.trim(),
      expectedStudents: Number($("expectedStudents").value), courseType: $("courseType").value,
      teacherId: currentUser.uid, createdBy: currentUser.uid, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), status: "scheduled"
    });
    e.target.reset();
    setMsg($("scheduleMsg"), "排程已儲存", false);
    await renderCalendar();
    await loadTodaySchedules();
  } catch (err) { setMsg($("scheduleMsg"), `儲存失敗：${err.message}`, true); }
});

$("checkInForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const schedule = selectedSchedule();
    if (!schedule) return setMsg($("attendanceMsg"), "請先選擇今日排程", true);
    const file = $("checkInPhoto").files[0];
    if (!file) return setMsg($("attendanceMsg"), "上課打卡必須上傳照片", true);

    const photo = await uploadPhoto(file, `checkin/${currentUser.uid}/${Date.now()}_${file.name}`);
    await setDoc(doc(db, "attendanceRecords", schedule.id), {
      scheduleId: schedule.id, teacherId: currentUser.uid, instituteName: schedule.instituteName,
      checkInAt: Timestamp.now(), checkInPhotoUrl: photo.url, checkInPhotoPath: photo.path,
      status: "checked_in", updatedAt: Timestamp.now()
    }, { merge: true });

    setMsg($("attendanceMsg"), "上課打卡成功", false);
    e.target.reset();
  } catch (err) { setMsg($("attendanceMsg"), `上課打卡失敗：${err.message}`, true); }
});

$("checkOutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const schedule = selectedSchedule();
    if (!schedule) return setMsg($("attendanceMsg"), "請先選擇今日排程", true);

    const checkDoc = await getDoc(doc(db, "attendanceRecords", schedule.id));
    if (!checkDoc.exists() || !checkDoc.data().checkInAt) return setMsg($("attendanceMsg"), "請先完成上課打卡", true);

    const file = $("checkOutPhoto").files[0];
    if (!file) return setMsg($("attendanceMsg"), "下課打卡必須上傳照片", true);
    const photo = await uploadPhoto(file, `checkout/${currentUser.uid}/${Date.now()}_${file.name}`);

    await setDoc(doc(db, "attendanceRecords", schedule.id), {
      checkOutAt: Timestamp.now(), checkOutPhotoUrl: photo.url, checkOutPhotoPath: photo.path,
      status: "checked_out", updatedAt: Timestamp.now()
    }, { merge: true });

    await addDoc(collection(db, "classLogs"), {
      scheduleId: schedule.id, teacherId: currentUser.uid, instituteName: schedule.instituteName,
      teachingProgress: $("teachingProgress").value.trim(), testScope: $("testScope").value.trim(),
      scoreRange: $("scoreRange").value.trim(), homework: $("homework").value.trim(),
      specialStudentNotes: $("specialStudentNotes").value.trim(),
      examPaperUsed: { paperCode: $("examPaperCode").value.trim() }, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });

    setMsg($("attendanceMsg"), "下課打卡與班級日誌已提交", false);
    e.target.reset();
  } catch (err) { setMsg($("attendanceMsg"), `下課提交失敗：${err.message}`, true); }
});

$("instituteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (currentRole !== "Admin") return;
  await addDoc(collection(db, "institutes"), {
    name: $("insName").value.trim(), ownerName: $("insOwner").value.trim(), directorContact: $("insDirectorContact").value.trim(),
    lineAccount: $("insLine").value.trim(), copierPassword: $("insCopier").value.trim(), parkingRule: $("insParking").value.trim(),
    createdAt: Timestamp.now(), updatedAt: Timestamp.now()
  });
  e.target.reset();
  await renderInstitutes();
});

$("messageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const classId = $("msgClassId").value.trim();
  if (!classId) return;
  await addDoc(collection(db, "classMessageBoards", classId, "messages"), {
    classId, content: $("msgText").value.trim(), senderId: currentUser.uid, senderRole: currentRole, createdAt: Timestamp.now()
  });
  await setDoc(doc(db, "classMessageBoards", classId), { classId, lastMessageAt: Timestamp.now(), updatedAt: Timestamp.now() }, { merge: true });
  e.target.reset();
  $("msgViewClassId").value = classId;
  await renderMessages(classId);
});

$("todoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (currentRole !== "Admin") return;
  await addDoc(collection(db, "todos"), {
    title: $("todoTitle").value.trim(), assignedTo: $("todoAssignee").value.trim(), assignedBy: currentUser.uid,
    status: "open", createdAt: Timestamp.now(), updatedAt: Timestamp.now()
  });
  e.target.reset();
  await renderTodos();
});

$("salaryConfigForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (currentRole !== "Admin") return;
  const teacherId = $("salaryTeacherId").value.trim();
  const regionKey = $("transportRegion").value.trim();
  const amount = Number($("transportAmount").value || 0);
  const cfgRef = doc(db, "salaryConfigs", teacherId);
  const prev = await getDoc(cfgRef);
  const transportByRegion = prev.exists() ? (prev.data().transportByRegion || {}) : {};
  if (regionKey) transportByRegion[regionKey] = amount;

  await setDoc(cfgRef, {
    teacherId,
    baseHourlyRate: Number($("baseRate").value),
    studentBonusRule: { threshold: Number($("bonusThreshold").value), bonusPerExtraStudent: Number($("bonusPerStudent").value) },
    transportByRegion,
    updatedBy: currentUser.uid,
    updatedAt: Timestamp.now()
  }, { merge: true });

  $("salaryResult").textContent = "薪資參數已儲存";
});

$("salaryCalcForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const teacherId = $("settleTeacherId").value.trim();
    const month = $("settleMonth").value;
    const cfgSnap = await getDoc(doc(db, "salaryConfigs", teacherId));
    if (!cfgSnap.exists()) return $("salaryResult").textContent = "找不到該教師薪資參數";
    const cfg = cfgSnap.data();

    const attSnap = await getDocs(query(collection(db, "attendanceRecords"), where("teacherId", "==", teacherId)));
    let totalHours = 0, bonus = 0, transport = 0;
    const sourceAttendanceIds = [];
    const sourceScheduleIds = [];

    for (const item of attSnap.docs) {
      const a = item.data();
      if (!a.checkInAt || !a.checkOutAt) continue;
      const d = a.checkInAt.toDate();
      const rowMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (rowMonth !== month) continue;
      sourceAttendanceIds.push(item.id);
      if (a.scheduleId) sourceScheduleIds.push(a.scheduleId);

      const hours = (a.checkOutAt.toDate().getTime() - a.checkInAt.toDate().getTime()) / 3600000;
      totalHours += Math.max(0, hours);

      const sc = a.scheduleId ? await getDoc(doc(db, "schedules", a.scheduleId)) : null;
      if (sc && sc.exists()) {
        const sv = sc.data();
        const extra = Math.max(0, Number(sv.expectedStudents || 0) - Number(cfg.studentBonusRule?.threshold || 0));
        bonus += extra * Number(cfg.studentBonusRule?.bonusPerExtraStudent || 0);
        transport += Number(cfg.transportByRegion?.[sv.region] || 0);
      }
    }

    const basePay = totalHours * Number(cfg.baseHourlyRate || 0);
    const grandTotal = basePay + bonus + transport;

    await addDoc(collection(db, "salarySettlements"), {
      teacherId, month,
      summary: { totalHours, basePay, studentBonus: bonus, transportAllowance: transport, adjustments: 0, grandTotal },
      sourceAttendanceIds, sourceScheduleIds,
      formulaSnapshot: {
        baseHourlyRate: Number(cfg.baseHourlyRate || 0),
        threshold: Number(cfg.studentBonusRule?.threshold || 0),
        bonusPerExtraStudent: Number(cfg.studentBonusRule?.bonusPerExtraStudent || 0),
        transportByRegion: cfg.transportByRegion || {}
      },
      status: "draft", createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });

    $("salaryResult").textContent = `月結算完成：${month} | 時數 ${totalHours.toFixed(2)} | 總額 ${Math.round(grandTotal)}`;
  } catch (err) { $("salaryResult").textContent = `計算失敗：${err.message}`; }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) { $("loginView").classList.remove("hidden"); $("dashboardView").classList.add("hidden"); return; }

  currentRole = await ensureAndGetRole(user);
  $("loginView").classList.add("hidden");
  $("dashboardView").classList.remove("hidden");
  $("userInfo").textContent = `${user.email} | 角色：${currentRole} | UID: ${user.uid}`;

  drawNav(currentRole);
  $("targetDate").value = fmtDate(new Date());
  setMode("day");
  await renderCalendar();
  await loadTodaySchedules();
  await renderInstitutes();
  await renderTodos();
});

async function ensureAndGetRole(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return snap.data().role || "Teacher";

  const email = (user.email || "").toLowerCase();
  const isDefaultAdmin = email.includes("song") || email.includes("eric");
  const role = isDefaultAdmin ? "Admin" : "Teacher";
  await setDoc(userRef, {
    displayName: user.displayName || "", email: user.email || "", role, isSuperAdmin: isDefaultAdmin,
    status: "active", createdAt: Timestamp.now(), updatedAt: Timestamp.now()
  }, { merge: true });
  return role;
}

async function renderInstitutes() {
  const container = $("instituteCards");
  const snap = await getDocs(query(collection(db, "institutes"), orderBy("createdAt", "desc")));
  container.innerHTML = "";
  snap.forEach((d) => {
    const i = d.data();
    const card = document.createElement("div");
    card.className = "p-3 rounded-lg border border-slate-600 bg-slate-900/60";
    card.innerHTML = `<div class="font-semibold text-amber-300">${i.name || "-"}</div><div class="text-xs text-slate-300 mt-1">負責人：${i.ownerName || "-"}</div><div class="text-xs text-slate-300">主任：${i.directorContact || "-"}</div><div class="text-xs text-slate-300">LINE：${i.lineAccount || "-"}</div><div class="text-xs text-slate-300">影印機：${i.copierPassword || "-"}</div><div class="text-xs text-slate-300">停車：${i.parkingRule || "-"}</div>`;
    container.appendChild(card);
  });
}

async function renderMessages(classId) {
  const container = $("messageList");
  if (!classId) { container.innerHTML = '<div class="text-slate-400">請輸入班級 ID 後載入留言</div>'; return; }
  const snap = await getDocs(query(collection(db, "classMessageBoards", classId, "messages"), orderBy("createdAt", "desc")));
  container.innerHTML = "";
  snap.forEach((d) => {
    const m = d.data();
    const row = document.createElement("div");
    row.className = "p-2 rounded border border-slate-700 bg-slate-900/40";
    row.textContent = `[${m.classId}] ${m.senderRole}: ${m.content}`;
    container.appendChild(row);
  });
}

async function renderTodos() {
  const container = $("todoList");
  const snap = await getDocs(query(collection(db, "todos"), orderBy("createdAt", "desc")));
  container.innerHTML = "";
  snap.forEach((d) => {
    const t = d.data();
    if (currentRole !== "Admin" && t.assignedTo !== currentUser.uid) return;
    const li = document.createElement("li");
    li.className = "p-2 rounded border border-slate-700 bg-slate-900/40 flex items-center justify-between";

    const label = document.createElement("span");
    label.className = t.status === "done" ? "todo-done" : "";
    label.textContent = `${t.title} | 指派:${t.assignedTo}`;

    const btn = document.createElement("button");
    btn.className = "btn bg-emerald-700";
    btn.textContent = t.status === "done" ? "已完成" : "完成";
    btn.disabled = t.status === "done";
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "todos", d.id), { status: "done", doneAt: Timestamp.now(), updatedAt: Timestamp.now() });
      await renderTodos();
    });

    li.appendChild(label);
    li.appendChild(btn);
    container.appendChild(li);
  });
}

async function loadTodaySchedules() {
  const dateStr = fmtDate(new Date());
  const events = await getEventsByDate(dateStr);
  todaySchedules = currentRole === "Admin" ? events : events.filter((e) => e.teacherId === currentUser.uid);
  const select = $("attendanceSchedule");
  select.innerHTML = '<option value="">請選擇今日排程</option>' + todaySchedules.map((s) => `<option value="${s.id}">${hhmm(s.startAt.toDate())}-${hhmm(s.endAt.toDate())} ${s.instituteName} (${s.grade})</option>`).join("");
}

async function getEventsByDate(dateStr) {
  const snap = await getDocs(query(collection(db, "schedules"), where("date", "==", dateStr), orderBy("startAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function uploadPhoto(file, path) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

function selectedSchedule() { return todaySchedules.find((s) => s.id === $("attendanceSchedule").value); }
function drawNav(role) {
  const navList = $("navList");
  navList.innerHTML = "";
  (role === "Admin" ? adminMenu : teacherMenu).forEach((item) => {
    const li = document.createElement("li");
    li.className = "px-2 py-1 rounded bg-slate-900/70 border border-slate-700";
    li.textContent = item;
    navList.appendChild(li);
  });
}

function setMode(mode) {
  currentMode = mode;
  $("dayBtn").className = `btn ${mode === "day" ? "bg-slate-900" : "bg-slate-700"}`;
  $("weekBtn").className = `btn ${mode === "week" ? "bg-slate-900" : "bg-slate-700"}`;
  renderCalendar();
}

async function renderCalendar() {
  const base = new Date($("targetDate").value || fmtDate(new Date()));
  const days = currentMode === "day" ? [base] : weekDays(base);
  const header = $("calendarHeader");
  const body = $("calendarBody");
  header.style.gridTemplateColumns = `72px repeat(${days.length}, minmax(160px, 1fr))`;
  header.innerHTML = `<div></div>${days.map((d) => `<div class="px-2">${d.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit", weekday: "short" })}</div>`).join("")}`;
  body.style.gridTemplateColumns = `72px repeat(${days.length}, minmax(160px, 1fr))`;
  body.innerHTML = "";

  const allByDate = await Promise.all(days.map((d) => getEventsByDate(fmtDate(d))));
  for (let hour = 7; hour <= 23; hour += 1) {
    const timeCell = document.createElement("div");
    timeCell.className = "time-cell";
    timeCell.textContent = `${String(hour).padStart(2, "0")}:00`;
    body.appendChild(timeCell);

    days.forEach((_, idx) => {
      const slot = document.createElement("div");
      slot.className = "slot-cell";
      allByDate[idx].filter((ev) => ev.startAt.toDate().getHours() === hour).forEach((ev) => {
        const pill = document.createElement("div");
        pill.className = "event-pill";
        pill.textContent = `${hhmm(ev.startAt.toDate())}-${hhmm(ev.endAt.toDate())} ${ev.instituteName} (${ev.grade})`;
        slot.appendChild(pill);
      });
      body.appendChild(slot);
    });
  }
}

function setMsg(el, text, isError) { el.className = `text-sm mt-2 ${isError ? "text-rose-300" : "text-emerald-300"}`; el.textContent = text; }
function weekDays(date) { const day = date.getDay(); const mondayOffset = day === 0 ? -6 : 1 - day; const monday = new Date(date); monday.setDate(date.getDate() + mondayOffset); return Array.from({ length: 7 }).map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; }); }
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function hhmm(d) { return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
