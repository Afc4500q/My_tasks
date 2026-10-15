/*
 * ضع رابط تطبيق Google Apps Script المنشور في WEB_APP_URL.
 * هذا الملف يتوقع أن يدعم Apps Script طلبات JSONP عبر doGet.
 */
const WEB_APP_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
const $ = (id) => document.getElementById(id);
let currentUser = null;
let sessionToken = null;
let tasks = [];

function setMessage(id, text, success=false) {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("success", Boolean(success));
}
function showApp(loggedIn) {
  $("loginView").classList.toggle("hidden", loggedIn);
  $("appView").classList.toggle("hidden", !loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
}
function api(action, params={}) {
  return new Promise((resolve, reject) => {
    if (!WEB_APP_URL.startsWith("https://script.google.com/")) {
      reject(new Error("أضف رابط تطبيق الويب في أعلى ملف app.js أولًا."));
      return;
    }
    const callbackName = "smCallback_" + Date.now() + "_" + Math.floor(Math.random()*100000);
    const script = document.createElement("script");
    const timeout = setTimeout(() => finish(new Error("انتهت مهلة الاتصال. تحقق من نشر تطبيق Apps Script ورابطه.")), 20000);
    function finish(error, data) {
      clearTimeout(timeout);
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      script.remove();
      if (error) reject(error); else resolve(data);
    }
    window[callbackName] = (data) => finish(null, data);
    const query = new URLSearchParams({...params, action, callback: callbackName});
    script.src = WEB_APP_URL + (WEB_APP_URL.includes("?") ? "&" : "?") + query.toString();
    script.onerror = () => finish(new Error("تعذر الاتصال بتطبيق الويب. تأكد من أن الرابط ينتهي بـ /exec وأن النشر متاح."));
    document.body.appendChild(script);
  });
}
function normalizeTask(t) {
  return {
    id: String(t.id ?? t.taskId ?? ""),
    title: String(t.title ?? t.subject ?? "مهمة بلا عنوان"),
    type: String(t.type ?? "واجب"),
    subject: String(t.subject ?? ""),
    details: String(t.details ?? ""),
    dueDate: String(t.dueDate ?? t.due_date ?? ""),
    status: String(t.status ?? "open").toLowerCase()
  };
}
function isDone(t) {
  return ["done","completed","complete","مكتمل","مكتملة","منجز","منجزة","true"].includes(t.status);
}
function renderTasks() {
  const filter = $("filterSelect").value;
  const visible = tasks.filter(t => filter === "all" || (filter === "done" ? isDone(t) : !isDone(t)));
  $("totalCount").textContent = tasks.length;
  $("doneCount").textContent = tasks.filter(isDone).length;
  $("openCount").textContent = tasks.filter(t => !isDone(t)).length;
  $("tasksList").replaceChildren();
  $("emptyState").classList.toggle("hidden", visible.length > 0);
  visible.forEach(task => {
    const card = document.createElement("article");
    card.className = "task-card" + (isDone(task) ? " is-done" : "");
    const main = document.createElement("div");
    const title = document.createElement("h4"); title.className = "task-title"; title.textContent = task.title; main.append(title);
    const meta = document.createElement("div"); meta.className = "task-meta";
    [task.type, task.subject, task.dueDate ? "التسليم: " + task.dueDate : ""].filter(Boolean).forEach(value => {
      const chip = document.createElement("span"); chip.className = "chip"; chip.textContent = value; meta.append(chip);
    });
    const state = document.createElement("span"); state.className = "chip " + (isDone(task) ? "done" : ""); state.textContent = isDone(task) ? "مكتملة" : "غير مكتملة"; meta.append(state);
    main.append(meta);
    if (task.details) { const details = document.createElement("p"); details.className = "task-details"; details.textContent = task.details; main.append(details); }
    const actions = document.createElement("div"); actions.className = "task-actions";
    const toggle = document.createElement("button"); toggle.className = "btn btn-secondary"; toggle.textContent = isDone(task) ? "إعادة فتح" : "إنجاز"; toggle.onclick = () => changeStatus(task, !isDone(task));
    const edit = document.createElement("button"); edit.className = "btn btn-quiet"; edit.textContent = "تعديل"; edit.onclick = () => editTask(task);
    const del = document.createElement("button"); del.className = "btn btn-quiet"; del.textContent = "حذف"; del.onclick = () => deleteTask(task);
    actions.append(toggle, edit, del); card.append(main, actions); $("tasksList").append(card);
  });
}
async function loadTasks() {
  setMessage("taskMessage", "جارٍ تحميل المهام...");
  try {
    const result = await api("listTasks", {token: sessionToken});
    if (!result || result.success !== true) throw new Error(result?.message || "لم نتمكن من تحميل المهام.");
    tasks = (Array.isArray(result.tasks) ? result.tasks : []).map(normalizeTask);
    renderTasks(); setMessage("taskMessage", "", true);
  } catch (err) { setMessage("taskMessage", err.message); }
}
function resetTaskForm() {
  $("taskForm").reset(); $("taskId").value = "";
  $("formHeading").textContent = "إضافة مهمة جديدة";
  $("saveTaskBtn").textContent = "حفظ المهمة";
  $("cancelEditBtn").classList.add("hidden");
}
function editTask(task) {
  $("taskId").value = task.id; $("taskTitle").value = task.title;
  $("taskType").value = task.type || "واجب"; $("taskSubject").value = task.subject;
  $("taskDue").value = task.dueDate; $("taskDetails").value = task.details;
  $("formHeading").textContent = "تعديل المهمة"; $("saveTaskBtn").textContent = "حفظ التعديلات";
  $("cancelEditBtn").classList.remove("hidden");
  window.scrollTo({top: $("taskForm").getBoundingClientRect().top + window.scrollY - 20, behavior:"smooth"});
}
async function submitTask(event) {
  event.preventDefault();
  const id = $("taskId").value;
  const payload = {
    token: sessionToken, id, title: $("taskTitle").value.trim(),
    type: $("taskType").value, subject: $("taskSubject").value.trim(),
    dueDate: $("taskDue").value, details: $("taskDetails").value.trim()
  };
  if (!payload.title) return setMessage("taskMessage", "اكتب عنوان المهمة أولًا.");
  $("saveTaskBtn").disabled = true;
  try {
    const result = await api(id ? "updateTask" : "addTask", payload);
    if (!result || result.success !== true) throw new Error(result?.message || "تعذر حفظ المهمة.");
    resetTaskForm(); setMessage("taskMessage", "تم حفظ المهمة بنجاح.", true); await loadTasks();
  } catch (err) { setMessage("taskMessage", err.message); }
  finally { $("saveTaskBtn").disabled = false; }
}
async function changeStatus(task, completed) {
  try {
    const result = await api("setTaskStatus", {token: sessionToken, id: task.id, status: completed ? "done" : "open"});
    if (!result?.success) throw new Error(result?.message || "تعذر تغيير حالة المهمة.");
    await loadTasks();
  } catch(err) { setMessage("taskMessage", err.message); }
}
async function deleteTask(task) {
  if (!confirm("هل تريد حذف هذه المهمة نهائيًا؟")) return;
  try {
    const result = await api("deleteTask", {token: sessionToken, id: task.id});
    if (!result?.success) throw new Error(result?.message || "تعذر حذف المهمة.");
    await loadTasks();
  } catch(err) { setMessage("taskMessage", err.message); }
}
$("loginForm").addEventListener("submit", async event => {
  event.preventDefault(); setMessage("loginMessage", "جارٍ تسجيل الدخول...");
  try {
    const result = await api("login", {accessCode: $("accessCode").value.trim()});
    if (!result?.success || !result.token) throw new Error(result?.message || "رمز الدخول غير صحيح.");
    sessionToken = result.token; currentUser = result.user || {};
    $("userName").textContent = currentUser.name || "المستخدم";
    $("accessCode").value = ""; showApp(true); await loadTasks();
  } catch(err) { setMessage("loginMessage", err.message); }
});
$("taskForm").addEventListener("submit", submitTask);
$("cancelEditBtn").addEventListener("click", resetTaskForm);
$("refreshBtn").addEventListener("click", loadTasks);
$("filterSelect").addEventListener("change", renderTasks);
$("logoutBtn").addEventListener("click", async () => {
  try { await api("logout", {token: sessionToken}); } catch (_) {}
  sessionToken = null; currentUser = null; tasks = []; showApp(false); resetTaskForm();
  setMessage("loginMessage", "تم تسجيل الخروج.", true);
});
showApp(false);
