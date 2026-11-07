// Creates (or resets) the demo accounts and their placeholder school.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> npm run seed:demo
//
// The secret key is in Supabase -> Project Settings -> API Keys. Never put it in .env or the app.
// Safe to re-run: it resets the demo accounts and replaces all demo data.
// Demo accounts carry app_metadata.demo = true and demo classes/subjects/terms have is_demo = true;
// the database keeps that data completely separate from real accounts.

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}

const PASSWORD = "schoolhub-demo"; // must match DEMO_PASSWORD in src/lib/demo.ts
const ACCOUNTS = [
  { key: "admin", role: "admin", name: "School Admin (Demo)", email: "demo.admin@example.com" },
  { key: "teacher", role: "teacher", name: "Mrs. Ngozi Adeyemi", email: "demo.teacher@example.com" },
  { key: "student", role: "student", name: "Chinedu Okafor", email: "demo.student@example.com" },
  // Placeholder staff and classmates. Nobody signs in as them.
  { key: "teacher2", role: "teacher", name: "Mr. Musa Ibrahim", email: "demo.teacher2@example.com" },
  { key: "s2", role: "student", name: "Aisha Bello", email: "demo.student2@example.com" },
  { key: "s3", role: "student", name: "Tobi Adewale", email: "demo.student3@example.com" },
  { key: "s4", role: "student", name: "Grace Eze", email: "demo.student4@example.com" },
  { key: "s5", role: "student", name: "Ibrahim Sani", email: "demo.student5@example.com" },
  { key: "s6", role: "student", name: "Funmi Lawal", email: "demo.student6@example.com" },
];

const headers = { apikey: KEY, "Content-Type": "application/json" };
async function call(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}${path}`, { method, headers: { ...headers, ...extra }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const rest = (method, table, body, query = "") =>
  call(method, `/rest/v1/${table}${query}`, body, { Prefer: "return=representation" });
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 1. Accounts: create or reset, confirmed so they can sign in straight away.
const { users } = await call("GET", "/auth/v1/admin/users?per_page=1000");
const ids = {};
for (const a of ACCOUNTS) {
  const existing = users.find((u) => u.email === a.email);
  const attrs = { email: a.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: a.name }, app_metadata: { demo: true } };
  const user = existing
    ? await call("PUT", `/auth/v1/admin/users/${existing.id}`, attrs)
    : await call("POST", "/auth/v1/admin/users", attrs);
  ids[a.key] = user.id;
  await rest("PATCH", "profiles", { full_name: a.name }, `?user_id=eq.${user.id}`);
}
const demoUserIds = Object.values(ids).join(",");

// 2. Clear previous demo data. Deleting demo students removes their results and attendance,
//    which would otherwise block deleting classes, subjects and terms.
await rest("DELETE", "students", null, `?user_id=in.(${demoUserIds})`);
await rest("DELETE", "classes", null, "?is_demo=eq.true");
await rest("DELETE", "subjects", null, "?is_demo=eq.true");
await rest("DELETE", "terms", null, "?is_demo=eq.true");

// 3. Exactly one role each, plus the matching teacher or student record.
for (const a of ACCOUNTS) {
  await call("POST", "/rest/v1/user_roles?on_conflict=user_id,role", { user_id: ids[a.key], role: a.role }, { Prefer: "resolution=ignore-duplicates" });
  await rest("DELETE", "user_roles", null, `?user_id=eq.${ids[a.key]}&role=neq.${a.role}`);
}
await call("POST", "/rest/v1/teachers?on_conflict=user_id", [
  { user_id: ids.teacher, staff_id: "DEMO-T01", phone: "+234 803 000 1001", specialization: "Mathematics & Basic Science" },
  { user_id: ids.teacher2, staff_id: "DEMO-T02", phone: "+234 803 000 1002", specialization: "English & Social Studies" },
], { Prefer: "resolution=merge-duplicates" });
const teacherRows = await rest("GET", "teachers", null, `?user_id=in.(${ids.teacher},${ids.teacher2})&select=id,user_id`);
const T = Object.fromEntries(teacherRows.map((t) => [t.user_id === ids.teacher ? "teacher" : "teacher2", t.id]));

// 4. Classes, subjects and terms.
const classes = await rest("POST", "classes", [
  { name: "JSS1A", level: "JSS1", stream: "A", academic_year: "2025/2026", is_demo: true },
  { name: "JSS1B", level: "JSS1", stream: "B", academic_year: "2025/2026", is_demo: true },
  { name: "SS1A", level: "SS1", stream: "A", academic_year: "2025/2026", is_demo: true },
]);
const C = Object.fromEntries(classes.map((c) => [c.name, c.id]));
const subjects = await rest("POST", "subjects", [
  { name: "Mathematics", code: "MTH", description: "Number, algebra, geometry and statistics.", is_demo: true },
  { name: "English Language", code: "ENG", description: "Reading, writing, grammar and oral English.", is_demo: true },
  { name: "Basic Science", code: "BSC", description: "Living things, matter, energy and the environment.", is_demo: true },
  { name: "Social Studies", code: "SST", description: "Family, community, culture and citizenship.", is_demo: true },
]);
const S = Object.fromEntries(subjects.map((s) => [s.code, s.id]));
const terms = await rest("POST", "terms", [
  { name: "First Term", academic_year: "2025/2026", start_date: "2025-09-08", end_date: "2025-12-12", is_active: false, is_demo: true },
  { name: "Second Term", academic_year: "2025/2026", start_date: "2026-01-05", end_date: "2026-04-03", is_active: true, is_demo: true },
]);
const TERM = Object.fromEntries(terms.map((t) => [t.name, t.id]));

// 5. Who teaches what.
await rest("POST", "class_subjects", [
  { class_id: C.JSS1A, subject_id: S.MTH, teacher_id: T.teacher },
  { class_id: C.JSS1A, subject_id: S.BSC, teacher_id: T.teacher },
  { class_id: C.JSS1A, subject_id: S.ENG, teacher_id: T.teacher2 },
  { class_id: C.JSS1A, subject_id: S.SST, teacher_id: T.teacher2 },
  { class_id: C.JSS1B, subject_id: S.MTH, teacher_id: T.teacher },
  { class_id: C.JSS1B, subject_id: S.ENG, teacher_id: T.teacher2 },
]);

// 6. Students: five in JSS1A, one still waiting to be placed in a class.
const studentRows = await rest("POST", "students", [
  { user_id: ids.student, class_id: C.JSS1A, admission_number: "DEMO/2025/001", gender: "male", date_of_birth: "2013-05-14", guardian_name: "Mrs. Okafor", guardian_phone: "+234 803 000 2001" },
  { user_id: ids.s2, class_id: C.JSS1A, admission_number: "DEMO/2025/002", gender: "female", date_of_birth: "2013-08-02", guardian_name: "Mr. Bello", guardian_phone: "+234 803 000 2002" },
  { user_id: ids.s3, class_id: C.JSS1A, admission_number: "DEMO/2025/003", gender: "male", date_of_birth: "2013-02-21", guardian_name: "Mrs. Adewale", guardian_phone: "+234 803 000 2003" },
  { user_id: ids.s4, class_id: C.JSS1A, admission_number: "DEMO/2025/004", gender: "female", date_of_birth: "2012-11-30", guardian_name: "Mr. Eze", guardian_phone: "+234 803 000 2004" },
  { user_id: ids.s5, class_id: C.JSS1A, admission_number: "DEMO/2025/005", gender: "male", date_of_birth: "2013-07-09", guardian_name: "Mallam Sani", guardian_phone: "+234 803 000 2005" },
  { user_id: ids.s6, class_id: null, admission_number: null, gender: "female", date_of_birth: null, guardian_name: null, guardian_phone: null },
]);
const jss1a = studentRows.filter((s) => s.class_id === C.JSS1A);

// 7. Timetable for JSS1A (and one JSS1B lesson for the teacher).
const slot = (cls, subj, teacher, d, start, end, room) => ({ class_id: cls, subject_id: subj, teacher_id: teacher, day_of_week: d, start_time: start, end_time: end, room });
await rest("POST", "timetable_entries", [
  slot(C.JSS1A, S.MTH, T.teacher, "Monday", "08:00", "08:40", "Room 1"),
  slot(C.JSS1A, S.ENG, T.teacher2, "Monday", "08:40", "09:20", "Room 1"),
  slot(C.JSS1A, S.BSC, T.teacher, "Tuesday", "08:00", "08:40", "Lab"),
  slot(C.JSS1A, S.SST, T.teacher2, "Tuesday", "09:20", "10:00", "Room 1"),
  slot(C.JSS1A, S.MTH, T.teacher, "Wednesday", "10:30", "11:10", "Room 1"),
  slot(C.JSS1A, S.ENG, T.teacher2, "Thursday", "08:00", "08:40", "Room 1"),
  slot(C.JSS1A, S.BSC, T.teacher, "Friday", "09:20", "10:00", "Lab"),
  slot(C.JSS1B, S.MTH, T.teacher, "Monday", "09:20", "10:00", "Room 2"),
]);

// 8. Results: a full first term, and second-term Mathematics so far (the rest is for the demo teacher to enter).
const scores = [[32, 48], [28, 41], [35, 52], [22, 30], [30, 44]];
const results = [];
for (const [i, st] of jss1a.entries()) {
  for (const [j, code] of ["MTH", "ENG", "BSC", "SST"].entries()) {
    const [ca, exam] = scores[(i + j) % scores.length];
    results.push({ student_id: st.id, subject_id: S[code], term_id: TERM["First Term"], class_id: C.JSS1A, ca_score: ca, exam_score: exam });
  }
  const [ca, exam] = scores[(i + 2) % scores.length];
  results.push({ student_id: st.id, subject_id: S.MTH, term_id: TERM["Second Term"], class_id: C.JSS1A, ca_score: ca, exam_score: exam });
}
await rest("POST", "results", results);

// 9. Attendance for the last five weekdays.
const weekdays = [];
for (let off = -1; weekdays.length < 5; off--) {
  const d = new Date();
  d.setDate(d.getDate() + off);
  if (d.getDay() !== 0 && d.getDay() !== 6) weekdays.push(day(off));
}
const statuses = ["present", "present", "present", "late", "present", "absent", "present", "excused"];
const attendance = [];
for (const [i, st] of jss1a.entries()) {
  for (const [j, date] of weekdays.entries()) {
    attendance.push({ student_id: st.id, class_id: C.JSS1A, date, status: statuses[(i * 3 + j) % statuses.length], marked_by: ids.teacher });
  }
}
await rest("POST", "attendance", attendance);

console.log("Demo ready. Sign-in accounts (password: %s):", PASSWORD);
for (const a of ACCOUNTS.slice(0, 3)) console.log(`  ${a.role.padEnd(8)} ${a.email}`);
