import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "firebase/auth";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "firebase/firestore";

/* ═══════════════════════════════════════════════════════════
   GACADIGBEMEDIA — CHURCH MEDIA DEPARTMENT SYSTEM
   Firebase Backend · Real-time · Multi-device · Production Ready
   ═══════════════════════════════════════════════════════════ */

// ── Firebase Config (GacAdigbe-Media project) ──
const firebaseConfig = {
  apiKey: "AIzaSyCPIjDEpJXh8vWD-IRu7V1AgFDiJAFNf38",
  authDomain: "gacadigbe-media.firebaseapp.com",
  projectId: "gacadigbe-media",
  storageBucket: "gacadigbe-media.firebasestorage.app",
  messagingSenderId: "1000996370486",
  appId: "1:1000996370486:web:85c6603c0da43eef5b4097"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── AI Backend ──
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";
const ai = {
  call: async (system, message, parseJSON = true) => {
    if (!ANTHROPIC_KEY) { console.warn("No API key"); return null; }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-allow-browser": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system, messages: [{ role: "user", content: message }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      if (!parseJSON) return text;
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (e) { console.error("AI error:", e); return null; }
  },
  suggestIdeas: (theme, service) => ai.call(
    "You are a creative church media strategist. Return ONLY valid JSON array, no markdown.",
    `Generate 4 social media content ideas for a ${service} service about: "${theme}". Return JSON array: [{"title":"...","type":"Video/Reel|Graphic|Story|Copywriting","platform":"Instagram|Facebook|TikTok|YouTube|WhatsApp|All","desc":"...","day":"Monday-Sunday","hook":"One sentence why this will perform well"}]`
  ),
  scoreIdea: (idea) => ai.call(
    "You are a church social media expert. Return ONLY valid JSON, no markdown.",
    `Score this church content idea: Title: "${idea.title}", Type: ${idea.type}, Platform: ${idea.platform}, Desc: "${idea.desc}". Return JSON: {"score":0-100,"virality":"low|medium|high","feedback":"1 sentence","improvement":"1 tip"}`
  ),
  generateCaption: (idea, tone) => ai.call(
    "You are a church social media copywriter. Return ONLY valid JSON, no markdown.",
    `Write a ${tone} caption for: "${idea.title}" on ${idea.platform}. Service: ${idea.service}. Desc: "${idea.desc}". Return JSON: {"caption":"full caption with emojis","hashtags":"space-separated hashtags","callToAction":"short CTA"}`
  ),
  analyzePerformance: (data) => ai.call(
    "You are a church social media analytics expert. Return ONLY valid JSON, no markdown.",
    `Analyze: ${JSON.stringify(data.slice(-10))}. Return JSON: {"topPlatform":"...","bestContentType":"...","bestDay":"...","insight":"2 sentences","recommendation":"1 action","trend":"up|down|stable"}`
  ),
  summarizeWeek: (stats) => ai.call(
    "You are a church media director assistant. Return ONLY valid JSON, no markdown.",
    `Weekly summary: Tasks done: ${stats.tasksDone}/${stats.totalTasks}, Ideas approved: ${stats.approvedIdeas}, Total reach: ${stats.totalReach}, Equipment issues: ${stats.equipIssues}. Return JSON: {"headline":"punchy headline","wins":["win1","win2"],"watchout":"1 thing","motivational":"1 short Bible-inspired encouragement"}`
  ),
};

// ── Helpers ──
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().split("T")[0];
const nowStr = () => new Date().toLocaleString("en-GB").slice(0, 16);
const statusColor = s => ({ "Done": "#3DD68C", "In Progress": "#4F8EF7", "Not Started": "#6B7280", "In Review": "#F0B429" }[s] || "#6B7280");
const condColor = c => ({ "Good": "#3DD68C", "Fair": "#F0B429", "Needs Repair": "#F05252" }[c] || "#6B7280");

// ── Default team accounts (auto-created on first run) ──
const DEFAULT_USERS = [
  { name: "Director Admin", email: "admin@gacadigbe.church", password: "admin123", role: "admin", avatar: "#F0B429" },
  { name: "Amara Osei", email: "amara@gacadigbe.church", password: "pass123", role: "Graphic Designer", avatar: "#4F8EF7" },
  { name: "Kofi Mensah", email: "kofi@gacadigbe.church", password: "pass123", role: "Video Editor", avatar: "#3DD68C" },
  { name: "Grace Acheampong", email: "grace@gacadigbe.church", password: "pass123", role: "Photographer", avatar: "#A78BFA" },
  { name: "David Asante", email: "david@gacadigbe.church", password: "pass123", role: "Slide Operator", avatar: "#FB923C" },
  { name: "Blessing Nkrumah", email: "blessing@gacadigbe.church", password: "pass123", role: "Social Media Manager", avatar: "#F05252" },
  { name: "Esther Darko", email: "esther@gacadigbe.church", password: "pass123", role: "Copywriter", avatar: "#34D399" },
];

// ── Firestore collections ──
const COLS = {
  users: "users", ideas: "ideas", tasks: "tasks",
  checklists: "checklists", equipment: "equipment",
  equipLog: "equipLog", performance: "performance",
  notifications: "notifications", contentFiles: "contentFiles",
};

// ── UI Components ──
const Avatar = ({ user, size = 32 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", background: user?.avatar || "#F0B429",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.3, fontWeight: 800, color: "#0A0C14",
    fontFamily: "'Syne',sans-serif", flexShrink: 0,
  }}>
    {user?.name?.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase()}
  </div>
);

const Badge = ({ children, color = "#6B7280" }) => (
  <span style={{
    display: "inline-block", padding: "2px 9px", borderRadius: 20,
    fontSize: "0.71rem", fontWeight: 600, background: color + "22", color,
    border: `1px solid ${color}33`,
  }}>{children}</span>
);

const Toast = ({ toasts }) => (
  <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
    {toasts.map(t => (
      <div key={t.id} style={{
        background: t.type === "error" ? "#1a0a0a" : "#0d1a0d",
        border: `1px solid ${t.type === "error" ? "#F05252" : "#3DD68C"}`,
        borderRadius: 10, padding: "11px 18px", fontSize: "0.84rem", color: "#EEF0F8",
        maxWidth: 300, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "slideIn 0.3s ease",
      }}>{t.type !== "error" ? "✓ " : "⚠ "}{t.msg}</div>
    ))}
  </div>
);

const ProgressBar = ({ value, color = "#F0B429", height = 5 }) => (
  <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, height, overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${value}%`, background: `linear-gradient(90deg,${color},${color}cc)`, borderRadius: 4, transition: "width 0.5s ease" }} />
  </div>
);

const Modal = ({ open, onClose, title, children, width = 520 }) => {
  if (!open) return null;
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{
        background: "#181C2E", border: "1px solid rgba(240,180,41,0.2)", borderRadius: 18,
        padding: 32, width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto",
        animation: "popIn 0.2s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <h3 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.15rem", fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Field = ({ label, children, full }) => (
  <div style={{ flex: full ? "1 1 100%" : "1 1 calc(50% - 7px)", minWidth: 0 }}>
    <label style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.6px", textTransform: "uppercase", color: "#9CA3AF", display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

const inputStyle = { width: "100%", background: "#242840", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "9px 12px", color: "#EEF0F8", fontFamily: "'Instrument Sans',sans-serif", fontSize: "0.87rem", outline: "none" };
const Input = (props) => <input {...props} style={{ ...inputStyle, ...props.style }} />;
const Select = ({ children, ...props }) => <select {...props} style={{ ...inputStyle, cursor: "pointer", ...props.style }}>{children}</select>;
const Textarea = (props) => <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: 80, ...props.style }} />;

const Btn = ({ children, variant = "gold", onClick, style, disabled, size }) => {
  const v = {
    gold: { bg: "rgba(240,180,41,0.15)", border: "rgba(240,180,41,0.3)", color: "#F0B429" },
    green: { bg: "rgba(61,214,140,0.12)", border: "rgba(61,214,140,0.25)", color: "#3DD68C" },
    red: { bg: "rgba(240,82,82,0.1)", border: "rgba(240,82,82,0.25)", color: "#F05252" },
    blue: { bg: "rgba(79,142,247,0.12)", border: "rgba(79,142,247,0.25)", color: "#4F8EF7" },
    purple: { bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.25)", color: "#A78BFA" },
    ghost: { bg: "transparent", border: "rgba(255,255,255,0.1)", color: "#9CA3AF" },
  }[variant] || {};
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: v.bg, border: `1px solid ${v.border}`, color: v.color,
      padding: size === "xs" ? "3px 8px" : size === "sm" ? "6px 14px" : "9px 18px",
      borderRadius: 8, fontSize: size === "xs" ? "0.7rem" : size === "sm" ? "0.78rem" : "0.85rem",
      fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      transition: "all 0.15s", fontFamily: "'Instrument Sans',sans-serif", ...style
    }}>{children}</button>
  );
};

// ══════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════
export default function GacAdigbeMedia() {
  const [authUser, setAuthUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState({});
  const [notifOpen, setNotifOpen] = useState(false);
  const [initDone, setInitDone] = useState(false);
  const [appLoading, setAppLoading] = useState(true);

  // Real-time data state
  const [users, setUsers] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [checklists, setChecklists] = useState({ sunday: [], midweek: [] });
  const [equipment, setEquipment] = useState([]);
  const [equipLog, setEquipLog] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [contentFiles, setContentFiles] = useState([]);

  const toast = useCallback((msg, type = "success") => {
    const id = uid();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  const setLoad = (key, val) => setLoading(p => ({ ...p, [key]: val }));

  // ── Auth listener ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthUser(u);
      if (u) {
        const snap = await getDoc(doc(db, COLS.users, u.uid));
        if (snap.exists()) {
          setUserProfile({ id: u.uid, ...snap.data() });
        } else {
          setUserProfile({ id: u.uid, name: u.email, role: "member", avatar: "#F0B429" });
        }
      } else {
        setUserProfile(null);
      }
      setAppLoading(false);
    });
    return unsub;
  }, []);

  // ── Real-time Firestore listeners ──
  useEffect(() => {
    if (!authUser) return;
    const unsubs = [
      onSnapshot(collection(db, COLS.users), s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.ideas), s => setIdeas(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.tasks), s => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.equipment), s => setEquipment(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.equipLog), s => setEquipLog(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.performance), s => setPerformance(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.notifications), s => setNotifications(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.contentFiles), s => setContentFiles(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, COLS.checklists), s => {
        const cl = { sunday: [], midweek: [] };
        s.docs.forEach(d => { const data = d.data(); if (cl[data.type]) cl[data.type].push({ id: d.id, ...data }); });
        cl.sunday.sort((a, b) => (a.order || 0) - (b.order || 0));
        cl.midweek.sort((a, b) => (a.order || 0) - (b.order || 0));
        setChecklists(cl);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [authUser]);

  // ── Initialize default data on first run ──
  useEffect(() => {
    if (!authUser || initDone) return;
    const init = async () => {
      const snap = await getDocs(collection(db, COLS.equipment));
      if (!snap.empty) { setInitDone(true); return; }
      // Seed equipment
      const equip = [
        { name: "Sony ZV-E10 Camera (Main)", cat: "Camera / Video", condition: "Good", loc: "Tech booth", checkedOutBy: null, issues: [] },
        { name: "iPhone 14 Pro (Backup)", cat: "Camera / Video", condition: "Good", loc: "Media cabinet", checkedOutBy: null, issues: [] },
        { name: "Rode Wireless GO II Mic", cat: "Audio", condition: "Good", loc: "Tech booth", checkedOutBy: null, issues: [] },
        { name: "Mixer Board 16ch", cat: "Audio", condition: "Good", loc: "Sound booth", checkedOutBy: null, issues: [] },
        { name: "Lapel Mic (Spare)", cat: "Audio", condition: "Needs Repair", loc: "Media cabinet", checkedOutBy: null, issues: ["Left channel faulty"] },
        { name: "Epson Projector (Main)", cat: "Presentation", condition: "Good", loc: "Ceiling mount", checkedOutBy: null, issues: [] },
        { name: "MacBook Pro (Slides)", cat: "Computer", condition: "Good", loc: "Tech booth", checkedOutBy: null, issues: [] },
        { name: "Tripod Stand", cat: "Camera / Video", condition: "Fair", loc: "Storage room", checkedOutBy: null, issues: ["One leg slightly loose"] },
        { name: "Ring Light (Interview)", cat: "Lighting", condition: "Good", loc: "Storage room", checkedOutBy: null, issues: [] },
        { name: "Softbox Light", cat: "Lighting", condition: "Needs Repair", loc: "Storage room", checkedOutBy: null, issues: ["Bulb blown"] },
      ];
      for (const e of equip) await addDoc(collection(db, COLS.equipment), e);
      // Seed checklists
      const sunChecks = [
        { text: "Confirm sermon title & key scriptures with pastor", tag: "Thu", done: false, role: "Slide Operator", type: "sunday", order: 1 },
        { text: "Design Sunday slides (title, scripture, points)", tag: "Fri", done: false, role: "Slide Operator", type: "sunday", order: 2 },
        { text: "Create sermon promo graphic for social media", tag: "Fri", done: false, role: "Graphic Designer", type: "sunday", order: 3 },
        { text: "Write Saturday invitation caption", tag: "Sat", done: false, role: "Copywriter", type: "sunday", order: 4 },
        { text: "Post Saturday invite graphic on all platforms", tag: "Sat", done: false, role: "Social Media Manager", type: "sunday", order: 5 },
        { text: "Test all slides on projection screen", tag: "Sun AM", done: false, role: "Slide Operator", type: "sunday", order: 6 },
        { text: "Check livestream camera angle & audio levels", tag: "Sun AM", done: false, role: "Video Editor", type: "sunday", order: 7 },
        { text: "Assign photographer positions for service", tag: "Sun AM", done: false, role: "Photographer", type: "sunday", order: 8 },
        { text: "Confirm all equipment charged & ready", tag: "Sun AM", done: false, role: "All", type: "sunday", order: 9 },
        { text: "Export & upload sermon highlight clip", tag: "Sun PM", done: false, role: "Video Editor", type: "sunday", order: 10 },
        { text: "Post Sunday recap story with photos", tag: "Sun PM", done: false, role: "Social Media Manager", type: "sunday", order: 11 },
      ];
      const midChecks = [
        { text: "Confirm Bible study topic with facilitator", tag: "Mon", done: false, role: "Slide Operator", type: "midweek", order: 1 },
        { text: "Design Monday devotional graphic", tag: "Mon", done: false, role: "Graphic Designer", type: "midweek", order: 2 },
        { text: "Write & schedule Tuesday prayer point post", tag: "Mon", done: false, role: "Copywriter", type: "midweek", order: 3 },
        { text: "Design Wednesday Bible study promo graphic", tag: "Tue", done: false, role: "Graphic Designer", type: "midweek", order: 4 },
        { text: "Schedule all midweek posts in advance", tag: "Tue", done: false, role: "Social Media Manager", type: "midweek", order: 5 },
        { text: "Set up midweek service slides", tag: "Wed AM", done: false, role: "Slide Operator", type: "midweek", order: 6 },
        { text: "Check projector & sound equipment", tag: "Wed AM", done: false, role: "All", type: "midweek", order: 7 },
        { text: "Post Thursday engagement poll/question", tag: "Thu", done: false, role: "Social Media Manager", type: "midweek", order: 8 },
        { text: "Collect & edit testimony clip (if applicable)", tag: "Thu", done: false, role: "Video Editor", type: "midweek", order: 9 },
      ];
      for (const c of [...sunChecks, ...midChecks]) await addDoc(collection(db, COLS.checklists), c);
      setInitDone(true);
    };
    init();
  }, [authUser, initDone]);

  const addNotification = async (message, type = "info") => {
    await addDoc(collection(db, COLS.notifications), { message, type, read: false, at: nowStr(), createdAt: serverTimestamp() });
  };

  const unread = notifications.filter(n => !n.read).length;
  const isAdmin = userProfile?.role === "admin";

  if (appLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0C14", color: "#F0B429", fontFamily: "'Syne',sans-serif", fontSize: "1.2rem" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');`}</style>
      ✦ Loading GacAdigbeMedia…
    </div>
  );

  if (!authUser || !userProfile) return (
    <LoginPage auth={auth} db={db} onLogin={() => { }} toast={toast} />
  );

  const navItems = [
    { id: "dashboard", icon: "◈", label: "Dashboard" },
    { id: "ideas", icon: "💡", label: "Ideas" },
    { id: "tasks", icon: "📌", label: "Tasks" },
    { id: "checklist", icon: "✅", label: "Checklist" },
    { id: "equipment", icon: "🎛️", label: "Equipment" },
    { id: "performance", icon: "📊", label: "Performance" },
    { id: "content", icon: "🗂️", label: "Content Hub" },
    ...(isAdmin ? [{ id: "admin", icon: "⚙️", label: "Admin" }] : []),
  ];

  const state = { users, ideas, tasks, checklists, equipment, equipLog, performance, notifications, contentFiles };
  const fns = { addNotification, toast, setLoad, loading, db, auth, ai };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0A0C14", color: "#EEF0F8", fontFamily: "'Instrument Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Instrument+Sans:wght@300;400;500;600&display=swap');
        @keyframes popIn{from{opacity:0;transform:scale(0.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#111420}
        ::-webkit-scrollbar-thumb{background:#242840;border-radius:4px}
        select option{background:#242840;}
      `}</style>

      {/* SIDEBAR */}
      <aside style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 220, background: "#111420", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", zIndex: 50, padding: "20px 0" }}>
        <div style={{ padding: "0 18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 800, color: "#F0B429" }}>✦ GacAdigbeMedia</div>
          <div style={{ fontSize: "0.68rem", color: "#6B7280", marginTop: 2 }}>GAC Adigbe Media Department</div>
        </div>
        <nav style={{ flex: 1, overflowY: "auto" }}>
          {navItems.map(item => (
            <div key={item.id} onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", cursor: "pointer",
              fontSize: "0.84rem", fontWeight: 500, color: page === item.id ? "#F0B429" : "#9CA3AF",
              background: page === item.id ? "rgba(240,180,41,0.07)" : "transparent",
              borderLeft: `3px solid ${page === item.id ? "#F0B429" : "transparent"}`, transition: "all 0.15s",
            }}>
              <span style={{ width: 18, textAlign: "center" }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
        <div style={{ padding: "16px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Avatar user={userProfile} size={32} />
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{userProfile.name?.split(" ")[0]}</div>
              <div style={{ fontSize: "0.7rem", color: "#6B7280" }}>{userProfile.role === "admin" ? "Media Director" : userProfile.role}</div>
            </div>
            <div style={{ marginLeft: "auto", position: "relative", cursor: "pointer" }} onClick={() => setNotifOpen(!notifOpen)}>
              <span>🔔</span>
              {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#F05252", color: "#fff", borderRadius: "50%", width: 14, height: 14, fontSize: "0.6rem", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{unread}</span>}
            </div>
          </div>
          <button onClick={() => signOut(auth)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}>← Sign out</button>
        </div>
      </aside>

      {/* NOTIFICATIONS */}
      {notifOpen && (
        <div style={{ position: "fixed", right: 20, bottom: 80, width: 300, background: "#181C2E", border: "1px solid rgba(240,180,41,0.2)", borderRadius: 14, zIndex: 300, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", animation: "popIn 0.2s ease" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "0.9rem" }}>🔔 Notifications</span>
            <Btn size="xs" variant="ghost" onClick={async () => { for (const n of notifications.filter(x => !x.read)) await updateDoc(doc(db, COLS.notifications, n.id), { read: true }); }}>Mark all read</Btn>
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {notifications.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#6B7280", fontSize: "0.83rem" }}>No notifications yet.</div>
              : notifications.slice(0, 10).map(n => (
                <div key={n.id} onClick={() => updateDoc(doc(db, COLS.notifications, n.id), { read: true })}
                  style={{ padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.03)", background: n.read ? "transparent" : "rgba(240,180,41,0.04)", cursor: "pointer" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: n.read ? 400 : 600 }}>{n.message}</div>
                  <div style={{ fontSize: "0.7rem", color: "#6B7280", marginTop: 2 }}>{n.at}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* MAIN */}
      <main style={{ marginLeft: 220, flex: 1, padding: "32px 36px", minHeight: "100vh", animation: "fadeUp 0.25s ease" }}>
        {page === "dashboard" && <DashboardPage state={state} user={userProfile} fns={fns} setPage={setPage} />}
        {page === "ideas" && <IdeasPage state={state} user={userProfile} fns={fns} />}
        {page === "tasks" && <TasksPage state={state} user={userProfile} fns={fns} isAdmin={isAdmin} />}
        {page === "checklist" && <ChecklistPage state={state} user={userProfile} fns={fns} />}
        {page === "equipment" && <EquipmentPage state={state} user={userProfile} fns={fns} isAdmin={isAdmin} />}
        {page === "performance" && <PerformancePage state={state} user={userProfile} fns={fns} />}
        {page === "content" && <ContentHubPage state={state} user={userProfile} fns={fns} />}
        {page === "admin" && isAdmin && <AdminPage state={state} user={userProfile} fns={fns} />}
      </main>

      <Toast toasts={toasts} />
    </div>
  );
}

// ══════════════════════════════════════════
//  LOGIN PAGE
// ══════════════════════════════════════════
function LoginPage({ auth, db, toast }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);

  const login = async () => {
    if (!email || !pass) { setErr("Please enter email and password."); return; }
    setLoading(true); setErr("");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      setErr("Incorrect email or password. Ask your admin to set up your account.");
      setLoading(false);
    }
  };

  const setupAccounts = async () => {
    setSetupLoading(true);
    for (const u of DEFAULT_USERS) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, u.email, u.password);
        await setDoc(doc(db, COLS.users, cred.user.uid), { name: u.name, email: u.email, role: u.role, avatar: u.avatar, joined: today() });
        await signOut(auth);
      } catch (e) { /* already exists */ }
    }
    setSetupLoading(false);
    setSetupMode(false);
    setErr("✅ All accounts created! You can now log in.");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at 25% 25%,rgba(79,142,247,0.1) 0%,transparent 55%),radial-gradient(ellipse at 80% 80%,rgba(240,180,41,0.07) 0%,transparent 55%),#0A0C14", fontFamily: "'Instrument Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');`}</style>
      <div style={{ background: "#111420", border: "1px solid rgba(240,180,41,0.2)", borderRadius: 20, padding: "48px 44px", width: "100%", maxWidth: 420, textAlign: "center", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✦</div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.9rem", fontWeight: 800, color: "#F0B429" }}>GacAdigbeMedia</h1>
        <div style={{ color: "#9CA3AF", fontSize: "0.83rem", marginBottom: 32 }}>GAC Adigbe Media Department</div>

        {!setupMode ? (
          <>
            <div style={{ textAlign: "left", marginBottom: 14 }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "#9CA3AF", display: "block", marginBottom: 5 }}>Email</label>
              <Input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} />
            </div>
            <div style={{ textAlign: "left", marginBottom: 14 }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "#9CA3AF", display: "block", marginBottom: 5 }}>Password</label>
              <Input type="password" placeholder="Your password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} />
            </div>
            <button onClick={login} disabled={loading} style={{ width: "100%", background: "#F0B429", color: "#0A0C14", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "0.95rem", padding: 13, border: "none", borderRadius: 8, cursor: "pointer", marginTop: 8, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in…" : "Sign In →"}
            </button>
            {err && <div style={{ color: err.startsWith("✅") ? "#3DD68C" : "#F05252", fontSize: "0.8rem", marginTop: 10 }}>{err}</div>}
            <div style={{ marginTop: 24, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10, fontSize: "0.72rem", color: "#6B7280", lineHeight: 1.9 }}>
              <strong style={{ color: "#9CA3AF" }}>First time?</strong> Click below to create all team accounts.<br />
              <button onClick={() => setSetupMode(true)} style={{ background: "none", border: "none", color: "#F0B429", cursor: "pointer", fontSize: "0.78rem", marginTop: 6, fontFamily: "inherit", textDecoration: "underline" }}>Set up team accounts →</button>
            </div>
            <div style={{ marginTop: 12, fontSize: "0.7rem", color: "#6B7280", lineHeight: 1.8 }}>
              <strong style={{ color: "#9CA3AF" }}>Team emails:</strong><br />
              admin@gacadigbe.church / admin123<br />
              amara@gacadigbe.church / pass123<br />
              kofi@gacadigbe.church / pass123<br />
              + more
            </div>
          </>
        ) : (
          <div>
            <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginBottom: 20, lineHeight: 1.6 }}>This will create accounts for all 7 team members in Firebase. Only do this once!</p>
            <Btn onClick={setupAccounts} disabled={setupLoading} style={{ width: "100%", justifyContent: "center" }}>{setupLoading ? "Creating accounts…" : "Create All Team Accounts"}</Btn>
            <button onClick={() => setSetupMode(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: "0.8rem", marginTop: 14, fontFamily: "inherit" }}>← Back to login</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════
function DashboardPage({ state, user, fns, setPage }) {
  const [summary, setSummary] = useState(null);
  const { ideas, tasks, equipment, checklists, performance, notifications } = state;
  const { ai, setLoad, loading } = fns;

  useEffect(() => {
    const fetch = async () => {
      setLoad("summary", true);
      const s = await ai.summarizeWeek({
        tasksDone: tasks.filter(t => t.status === "Done").length,
        totalTasks: tasks.length,
        approvedIdeas: ideas.filter(i => i.status === "approved").length,
        totalReach: performance.reduce((s, p) => s + (p.reach || 0), 0),
        equipIssues: equipment.filter(e => e.condition !== "Good").length,
      });
      setSummary(s);
      setLoad("summary", false);
    };
    if (tasks.length > 0) fetch();
  }, []);

  const myTasks = tasks.filter(t => t.assignedTo === user.id && t.status !== "Done");
  const sunDone = checklists.sunday.filter(c => c.done).length;
  const sunTotal = checklists.sunday.length || 1;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.7rem", fontWeight: 800 }}>
          {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, {user.name?.split(" ")[0]} ✦
        </h1>
        <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Here's everything happening in the media department — live.</p>
      </div>

      {(summary || loading.summary) && (
        <div style={{ background: "linear-gradient(135deg,rgba(240,180,41,0.08),rgba(79,142,247,0.05))", border: "1px solid rgba(240,180,41,0.2)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
          {loading.summary ? <div style={{ color: "#9CA3AF", fontSize: "0.85rem", animation: "pulse 1.5s infinite" }}>✦ AI is summarising your week…</div>
            : summary && (
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#F0B429", marginBottom: 10 }}>✦ {summary.headline}</div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: "0.83rem" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ color: "#9CA3AF", fontSize: "0.72rem", textTransform: "uppercase", marginBottom: 6 }}>Wins</div>
                    {summary.wins?.map((w, i) => <div key={i} style={{ marginBottom: 3 }}>🏆 {w}</div>)}
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ color: "#9CA3AF", fontSize: "0.72rem", textTransform: "uppercase", marginBottom: 6 }}>Watch Out</div>
                    <div style={{ color: "#F0B429" }}>⚠ {summary.watchout}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ color: "#9CA3AF", fontSize: "0.72rem", textTransform: "uppercase", marginBottom: 6 }}>Encouragement</div>
                    <div style={{ color: "#3DD68C", fontStyle: "italic" }}>"{summary.motivational}"</div>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "My Active Tasks", val: myTasks.length, color: "#F0B429", icon: "📌" },
          { label: "Pending Approvals", val: ideas.filter(i => i.status === "pending").length, color: "#A78BFA", icon: "💡" },
          { label: "Total Reach", val: `${(performance.reduce((s, p) => s + (p.reach || 0), 0) / 1000).toFixed(1)}K`, color: "#3DD68C", icon: "📊" },
          { label: "Equipment Issues", val: equipment.filter(e => e.condition !== "Good").length, color: "#F05252", icon: "🎛️" },
        ].map(s => (
          <div key={s.label} style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: "1.1rem", marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.9rem", fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700 }}>📋 My Active Tasks</h2>
            <Btn size="sm" onClick={() => setPage("tasks")}>View All</Btn>
          </div>
          {myTasks.length === 0
            ? <div style={{ textAlign: "center", padding: 20, color: "#6B7280", fontSize: "0.83rem" }}>🎉 All tasks complete!</div>
            : myTasks.slice(0, 4).map(t => (
              <div key={t.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: "0.87rem", fontWeight: 500 }}>{t.title}</span>
                  <Badge color={statusColor(t.status)}>{t.status}</Badge>
                </div>
                <ProgressBar value={t.progress || 0} />
                <div style={{ fontSize: "0.71rem", color: "#6B7280", marginTop: 3 }}>{t.progress || 0}% · Due {t.due}</div>
              </div>
            ))}
        </div>

        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700 }}>☀️ Sunday Checklist</h2>
            <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>{sunDone}/{sunTotal}</span>
          </div>
          <ProgressBar value={Math.round(sunDone / sunTotal * 100)} height={7} />
          <div style={{ marginTop: 14 }}>
            {checklists.sunday.slice(0, 6).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: "0.83rem" }}>
                <span style={{ color: c.done ? "#3DD68C" : "#6B7280" }}>{c.done ? "✓" : "○"}</span>
                <span style={{ textDecoration: c.done ? "line-through" : "none", color: c.done ? "#6B7280" : "#EEF0F8" }}>{c.text}</span>
              </div>
            ))}
          </div>
          <Btn size="sm" style={{ marginTop: 12 }} onClick={() => setPage("checklist")}>Full Checklist →</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700 }}>💡 Recent Ideas</h2>
            <Btn size="sm" onClick={() => setPage("ideas")}>View All</Btn>
          </div>
          {ideas.slice(0, 4).map(idea => {
            const author = state.users.find(u => u.id === idea.by);
            return (
              <div key={idea.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <Avatar user={author} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.84rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{idea.title}</div>
                  <div style={{ fontSize: "0.71rem", color: "#6B7280" }}>{idea.service} · {idea.type}</div>
                </div>
                <Badge color={idea.status === "approved" ? "#3DD68C" : idea.status === "rejected" ? "#F05252" : "#F0B429"}>{idea.status}</Badge>
              </div>
            );
          })}
        </div>

        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700 }}>⚡ Equipment Alerts</h2>
            <Btn size="sm" onClick={() => setPage("equipment")}>View All</Btn>
          </div>
          {equipment.filter(e => e.condition !== "Good").length === 0
            ? <div style={{ textAlign: "center", padding: 20, color: "#6B7280", fontSize: "0.83rem" }}>✅ All equipment operational!</div>
            : equipment.filter(e => e.condition !== "Good").map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: condColor(e.condition), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.84rem", fontWeight: 500 }}>{e.name}</div>
                  <div style={{ fontSize: "0.71rem", color: "#9CA3AF" }}>{e.condition} · {e.loc}</div>
                </div>
                <Badge color={condColor(e.condition)}>{e.condition}</Badge>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  IDEAS PAGE
// ══════════════════════════════════════════
function IdeasPage({ state, user, fns }) {
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [captionModal, setCaptionModal] = useState(null);
  const [captionResult, setCaptionResult] = useState(null);
  const [captionTone, setCaptionTone] = useState("inspirational");
  const [suggestModal, setSuggestModal] = useState(false);
  const [sermonTheme, setSermonTheme] = useState("");
  const [suggestedIdeas, setSuggestedIdeas] = useState([]);
  const [form, setForm] = useState({ title: "", service: "Sunday", type: "Video / Reel", platform: "Instagram", desc: "", day: "Sunday" });
  const { ai, toast, setLoad, loading, db, addNotification } = fns;
  const isAdmin = user.role === "admin";

  const filtered = state.ideas.filter(i => {
    if (filter === "mine") return i.by === user.id;
    if (filter === "pending") return i.status === "pending";
    if (filter === "approved") return i.status === "approved";
    if (filter === "rejected") return i.status === "rejected";
    return true;
  });

  const submitIdea = async () => {
    if (!form.title || !form.desc) { toast("Fill in title and description.", "error"); return; }
    setLoad("scoreIdea", true);
    const score = await ai.scoreIdea(form);
    setLoad("scoreIdea", false);
    try {
      await addDoc(collection(db, COLS.ideas), {
        ...form,
        by: user?.id || "unknown",
        byName: user?.name || "Unknown",
        status: "pending",
        score: score?.score || null,
        aiFeedback: score?.feedback || null,
        aiTip: score?.improvement || null,
        virality: score?.virality || null,
        submittedAt: today(),
      });
      await addNotification(`New idea submitted: "${form.title}" by ${user.name}`, "idea");
    } catch(e) {
      console.error("Idea error:", e);
      toast("Error: " + e.message, "error");
      return;
    }
    setModal(false); setForm({ title: "", service: "Sunday", type: "Video / Reel", platform: "Instagram", desc: "", day: "Sunday" });
    toast("Idea submitted! AI scored it.");
  };

  const approveIdea = async (idea) => {
    await updateDoc(doc(db, COLS.ideas, idea.id), { status: "approved" });
    await addNotification(`"${idea.title}" was approved by the director!`, "approval");
    toast("Idea approved!");
  };

  const generateCaption = async (idea) => {
    setCaptionModal(idea); setCaptionResult(null);
    setLoad("caption", true);
    const result = await ai.generateCaption(idea, captionTone);
    setCaptionResult(result);
    setLoad("caption", false);
  };

  const suggestIdeasAI = async () => {
    if (!sermonTheme) { toast("Enter a sermon theme.", "error"); return; }
    setLoad("suggest", true);
    const ideas = await ai.suggestIdeas(sermonTheme, "Sunday");
    setSuggestedIdeas(ideas || []);
    setLoad("suggest", false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.6rem", fontWeight: 800 }}>💡 Content Ideas</h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Submit, score and track all content ideas. Updates live for the whole team.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="blue" onClick={() => setSuggestModal(true)}>✦ AI Suggest</Btn>
          <Btn onClick={() => setModal(true)}>+ Submit Idea</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#1E2338", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {["all", "pending", "approved", "rejected", "mine"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", background: filter === f ? "#242840" : "transparent", color: filter === f ? "#EEF0F8" : "#9CA3AF", fontSize: "0.82rem", fontWeight: 500, fontFamily: "'Instrument Sans',sans-serif" }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}><div style={{ fontSize: "2.5rem", marginBottom: 10 }}>💡</div><p>No ideas found.</p></div>
        : filtered.map(idea => {
          const author = state.users.find(u => u.id === idea.by);
          return (
            <div key={idea.id} style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 18, marginBottom: 12 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(240,180,41,0.25)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar user={author} size={30} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{idea.title}</div>
                    <div style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>{idea.byName || author?.name} · {idea.submittedAt}</div>
                  </div>
                </div>
                <Badge color={idea.status === "approved" ? "#3DD68C" : idea.status === "rejected" ? "#F05252" : "#F0B429"}>{idea.status}</Badge>
              </div>
              <p style={{ fontSize: "0.83rem", color: "#9CA3AF", lineHeight: 1.6, marginBottom: 10 }}>{idea.desc}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                <Badge color="#4F8EF7">{idea.type}</Badge>
                <Badge color="#6B7280">{idea.service}</Badge>
                <Badge color="#A78BFA">{idea.platform}</Badge>
                <Badge color="#6B7280">📅 {idea.day}</Badge>
                {idea.score && <Badge color={idea.score > 70 ? "#3DD68C" : "#F0B429"}>AI: {idea.score}/100</Badge>}
                {idea.virality && <Badge color="#34D399">Virality: {idea.virality}</Badge>}
              </div>
              {(idea.aiFeedback || idea.aiTip) && (
                <div style={{ background: "rgba(79,142,247,0.07)", border: "1px solid rgba(79,142,247,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: "0.8rem" }}>
                  {idea.aiFeedback && <div style={{ color: "#9CA3AF" }}>✦ <strong style={{ color: "#4F8EF7" }}>AI:</strong> {idea.aiFeedback}</div>}
                  {idea.aiTip && <div style={{ color: "#9CA3AF", marginTop: 4 }}>💡 <strong style={{ color: "#F0B429" }}>Tip:</strong> {idea.aiTip}</div>}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {idea.status === "approved" && <Btn size="xs" variant="purple" onClick={() => generateCaption(idea)}>✦ Generate Caption</Btn>}
                {isAdmin && idea.status === "pending" && <Btn size="xs" variant="green" onClick={() => approveIdea(idea)}>✓ Approve</Btn>}
                {isAdmin && idea.status === "pending" && <Btn size="xs" variant="red" onClick={async () => { await updateDoc(doc(db, COLS.ideas, idea.id), { status: "rejected" }); toast("Idea rejected.", "error"); }}>✗ Reject</Btn>}
                {(idea.by === user.id || isAdmin) && <Btn size="xs" variant="red" onClick={async () => { await deleteDoc(doc(db, COLS.ideas, idea.id)); toast("Idea deleted."); }}>Delete</Btn>}
              </div>
            </div>
          );
        })}

      {/* Submit Idea Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="💡 Submit Content Idea">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Title" full><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sunday Sermon Highlight Reel" /></Field>
          <Field label="Service"><Select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}><option>Sunday</option><option>Midweek</option><option>Both</option></Select></Field>
          <Field label="Content Type"><Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>Video / Reel</option><option>Graphic</option><option>Slides</option><option>Photo</option><option>Copywriting</option><option>Story</option></Select></Field>
          <Field label="Platform"><Select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube</option><option>WhatsApp</option><option>All Platforms</option></Select></Field>
          <Field label="Suggested Day"><Select value={form.day} onChange={e => setForm({ ...form, day: e.target.value })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => <option key={d}>{d}</option>)}</Select></Field>
          <Field label="Description" full><Textarea value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="Describe the idea — message, tone, goal…" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn onClick={submitIdea} disabled={loading.scoreIdea}>{loading.scoreIdea ? "✦ AI Scoring…" : "Submit & AI Score"}</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* AI Suggest Modal */}
      <Modal open={suggestModal} onClose={() => setSuggestModal(false)} title="✦ AI Idea Generator">
        <Field label="Sermon / Study Theme" full><Input value={sermonTheme} onChange={e => setSermonTheme(e.target.value)} placeholder="e.g. Walking by Faith, The Power of Prayer…" /></Field>
        <div style={{ marginTop: 14 }}><Btn onClick={suggestIdeasAI} disabled={loading.suggest}>{loading.suggest ? "✦ Generating…" : "Generate 4 Ideas"}</Btn></div>
        {suggestedIdeas.map((idea, i) => (
          <div key={i} style={{ background: "#242840", borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4 }}>{idea.title}</div>
            <div style={{ fontSize: "0.8rem", color: "#9CA3AF", marginBottom: 8 }}>{idea.desc}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <Badge color="#4F8EF7">{idea.type}</Badge><Badge color="#A78BFA">{idea.platform}</Badge>
            </div>
            {idea.hook && <div style={{ fontSize: "0.77rem", color: "#3DD68C", marginBottom: 8 }}>💡 {idea.hook}</div>}
            <Btn size="xs" variant="green" onClick={async () => {
              await addDoc(collection(db, COLS.ideas), { ...idea, service: "Sunday", by: user.id, byName: user.name, status: "pending", score: null, submittedAt: today(), createdAt: serverTimestamp() });
              toast("Idea added!");
            }}>+ Add to Ideas</Btn>
          </div>
        ))}
      </Modal>

      {/* Caption Modal */}
      <Modal open={!!captionModal} onClose={() => { setCaptionModal(null); setCaptionResult(null); }} title="✦ AI Caption Generator">
        {captionModal && (
          <div>
            <div style={{ background: "#242840", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: "0.84rem" }}><strong>{captionModal.title}</strong> · {captionModal.platform}</div>
            <Field label="Tone"><Select value={captionTone} onChange={e => setCaptionTone(e.target.value)}>
              <option value="inspirational">Inspirational</option><option value="casual and friendly">Casual & Friendly</option>
              <option value="formal">Formal</option><option value="energetic and hype">Energetic</option><option value="devotional">Devotional</option>
            </Select></Field>
            <div style={{ marginTop: 14 }}><Btn onClick={() => generateCaption(captionModal)} disabled={loading.caption}>{loading.caption ? "✦ Generating…" : "Generate Caption"}</Btn></div>
            {captionResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{ background: "rgba(61,214,140,0.07)", border: "1px solid rgba(61,214,140,0.15)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: 6 }}>CAPTION</div>
                  <p style={{ fontSize: "0.87rem", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{captionResult.caption}</p>
                </div>
                <div style={{ background: "rgba(79,142,247,0.07)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: 4 }}>HASHTAGS</div>
                  <div style={{ fontSize: "0.83rem", color: "#4F8EF7" }}>{captionResult.hashtags}</div>
                </div>
                <div style={{ background: "rgba(240,180,41,0.07)", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: 4 }}>CALL TO ACTION</div>
                  <div style={{ fontSize: "0.83rem", color: "#F0B429" }}>{captionResult.callToAction}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════
//  TASKS PAGE
// ══════════════════════════════════════════
function TasksPage({ state, user, fns, isAdmin }) {
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [updateModal, setUpdateModal] = useState(null);
  const [form, setForm] = useState({ title: "", type: "Slides", service: "Sunday", assignedTo: "", due: "", notes: "" });
  const [upForm, setUpForm] = useState({ status: "In Progress", progress: 0, note: "" });
  const { toast, db, addNotification } = fns;

  const filtered = state.tasks.filter(t => {
    if (filter === "mine") return t.assignedTo === user.id;
    if (filter === "unassigned") return !t.assignedTo;
    if (filter === "inprogress") return t.status === "In Progress";
    if (filter === "done") return t.status === "Done";
    return true;
  });

  const createTask = async () => {
    if (!form.title) { toast("Enter a task title.", "error"); return; }
    const assigned = state.users.find(u => u.id === form.assignedTo);
    await addDoc(collection(db, COLS.tasks), {
      ...form, assignedTo: form.assignedTo || null, assignedName: assigned?.name || null,
      status: form.assignedTo ? "In Progress" : "Not Started", progress: 0,
      createdBy: user.id, updates: [], createdAt: serverTimestamp(),
    });
    if (form.assignedTo) await addNotification(`New task assigned to ${assigned?.name}: "${form.title}"`, "task");
    setModal(false); setForm({ title: "", type: "Slides", service: "Sunday", assignedTo: "", due: "", notes: "" });
    toast("Task created!");
  };

  const saveUpdate = async () => {
    const t = updateModal;
    const progress = t.status === "Done" ? 100 : Math.min(100, parseInt(upForm.progress) || t.progress);
    const updates = [...(t.updates || []), { by: user.id, byName: user.name, note: upForm.note, at: nowStr(), status: upForm.status }];
    await updateDoc(doc(db, COLS.tasks, t.id), { status: upForm.status, progress, updates });
    setUpdateModal(null); toast("Task updated!");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.6rem", fontWeight: 800 }}>📌 Task Board</h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Live task tracking — updates visible to the whole team instantly.</p>
        </div>
        {isAdmin && <Btn onClick={() => setModal(true)}>+ Add Task</Btn>}
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#1E2338", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {["all", "mine", "unassigned", "inprogress", "done"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", background: filter === f ? "#242840" : "transparent", color: filter === f ? "#EEF0F8" : "#9CA3AF", fontSize: "0.82rem", fontWeight: 500, fontFamily: "'Instrument Sans',sans-serif" }}>
            {f === "inprogress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Task", "Type", "Service", "Assigned", "Due", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#6B7280", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>No tasks found.</td></tr>
              : filtered.map(t => {
                const assigned = t.assignedTo ? state.users.find(u => u.id === t.assignedTo) : null;
                const isOverdue = t.due && t.due < today() && t.status !== "Done";
                const canClaim = !t.assignedTo && !isAdmin;
                const canUpdate = t.assignedTo === user.id || isAdmin;
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.015)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 500 }}>{t.title}</div>
                      <ProgressBar value={t.progress || 0} height={4} />
                      <div style={{ fontSize: "0.7rem", color: "#6B7280", marginTop: 2 }}>{t.progress || 0}%{isOverdue && <span style={{ color: "#F05252" }}> · OVERDUE</span>}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}><Badge color="#4F8EF7">{t.type}</Badge></td>
                    <td style={{ padding: "12px 16px" }}><Badge color="#6B7280">{t.service}</Badge></td>
                    <td style={{ padding: "12px 16px" }}>
                      {assigned ? <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar user={assigned} size={22} /><span style={{ fontSize: "0.82rem" }}>{assigned.name?.split(" ")[0]}</span></div>
                        : <span style={{ color: "#6B7280", fontSize: "0.8rem" }}>Unassigned</span>}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "0.83rem", color: isOverdue ? "#F05252" : "#EEF0F8" }}>{t.due || "TBD"}</td>
                    <td style={{ padding: "12px 16px" }}><Badge color={statusColor(t.status)}>{t.status}</Badge></td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {canClaim && <Btn size="xs" variant="gold" onClick={async () => { await updateDoc(doc(db, COLS.tasks, t.id), { assignedTo: user.id, assignedName: user.name, status: "In Progress" }); toast("Task claimed!"); }}>Claim</Btn>}
                        {canUpdate && <Btn size="xs" variant="blue" onClick={() => { setUpdateModal(t); setUpForm({ status: t.status, progress: t.progress || 0, note: "" }); }}>Update</Btn>}
                        {isAdmin && <Btn size="xs" variant="red" onClick={async () => { await deleteDoc(doc(db, COLS.tasks, t.id)); toast("Deleted."); }}>Del</Btn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="📌 Add Task">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Task Title" full><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sunday Sermon Slides Week 5" /></Field>
          <Field label="Content Type"><Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>Slides</option><option>Video</option><option>Graphic</option><option>Photo</option><option>Copywriting</option><option>Livestream</option><option>Other</option></Select></Field>
          <Field label="Service"><Select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}><option>Sunday</option><option>Midweek</option><option>Special Event</option></Select></Field>
          <Field label="Assign To"><Select value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
            <option value="">-- Unassigned --</option>
            {state.users.filter(u => u.role !== "admin").map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </Select></Field>
          <Field label="Due Date"><Input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} /></Field>
          <Field label="Notes" full><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any specific instructions?" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn onClick={createTask}>Create Task</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={!!updateModal} onClose={() => setUpdateModal(null)} title="✏️ Update Task">
        {updateModal && (
          <div>
            <div style={{ background: "#242840", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.85rem", fontWeight: 500 }}>{updateModal.title}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <Field label="Status"><Select value={upForm.status} onChange={e => setUpForm({ ...upForm, status: e.target.value })}><option>Not Started</option><option>In Progress</option><option>In Review</option><option>Done</option></Select></Field>
              <Field label="Progress %"><Input type="number" min={0} max={100} value={upForm.progress} onChange={e => setUpForm({ ...upForm, progress: e.target.value })} /></Field>
              <Field label="Update Note" full><Textarea value={upForm.note} onChange={e => setUpForm({ ...upForm, note: e.target.value })} placeholder="What did you work on? Any blockers?" /></Field>
            </div>
            {updateModal.updates?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: "0.72rem", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 8 }}>History</div>
                {updateModal.updates.slice(-3).map((u, i) => (
                  <div key={i} style={{ fontSize: "0.8rem", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#9CA3AF" }}>
                    <strong style={{ color: "#EEF0F8" }}>{u.byName}</strong>: {u.note} <span style={{ color: "#6B7280" }}>· {u.at}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Btn onClick={saveUpdate}>Save Update</Btn>
              <Btn variant="ghost" onClick={() => setUpdateModal(null)}>Cancel</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════
//  CHECKLIST PAGE
// ══════════════════════════════════════════
function ChecklistPage({ state, user, fns }) {
  const [which, setWhich] = useState("sunday");
  const { db, toast } = fns;
  const cl = state.checklists[which] || [];
  const done = cl.filter(c => c.done).length;
  const pct = cl.length ? Math.round(done / cl.length * 100) : 0;
  const roleColors = { "Slide Operator": "#4F8EF7", "Graphic Designer": "#A78BFA", "Video Editor": "#3DD68C", "Photographer": "#FB923C", "Social Media Manager": "#F05252", "Copywriter": "#34D399", "All": "#F0B429" };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.6rem", fontWeight: 800 }}>✅ Service Checklists</h1>
        <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Tick items as done — everyone sees the updates live.</p>
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "#1E2338", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[{ id: "sunday", label: "☀️ Sunday" }, { id: "midweek", label: "🌙 Midweek" }].map(s => (
          <button key={s.id} onClick={() => setWhich(s.id)} style={{ padding: "8px 20px", borderRadius: 7, border: "none", cursor: "pointer", background: which === s.id ? "#242840" : "transparent", color: which === s.id ? "#EEF0F8" : "#9CA3AF", fontSize: "0.84rem", fontWeight: 500, fontFamily: "'Instrument Sans',sans-serif" }}>{s.label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700 }}>{which === "sunday" ? "☀️ Sunday" : "🌙 Midweek"} Pre-Service</h2>
            <span style={{ fontSize: "0.82rem", color: "#9CA3AF" }}>{done}/{cl.length} ({pct}%)</span>
          </div>
          <ProgressBar value={pct} height={7} />
          <div style={{ marginTop: 18 }}>
            {cl.map(item => (
              <div key={item.id} onClick={async () => { await updateDoc(doc(db, COLS.checklists, item.id), { done: !item.done }); if (!item.done) toast("✓ Checked off!"); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer" }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.done ? "#3DD68C" : "transparent", border: item.done ? "none" : "1.5px solid #6B7280", fontSize: "0.7rem", color: "#fff", transition: "all 0.2s" }}>{item.done && "✓"}</div>
                <span style={{ flex: 1, fontSize: "0.87rem", textDecoration: item.done ? "line-through" : "none", color: item.done ? "#6B7280" : "#EEF0F8" }}>{item.text}</span>
                <span style={{ fontSize: "0.7rem", color: "#6B7280", background: "#242840", padding: "2px 8px", borderRadius: 10 }}>{item.tag}</span>
                <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: 10, background: (roleColors[item.role] || "#6B7280") + "22", color: roleColors[item.role] || "#6B7280" }}>{item.role}</span>
              </div>
            ))}
          </div>
          {pct === 100 && <div style={{ marginTop: 16, textAlign: "center", padding: 14, background: "rgba(61,214,140,0.08)", borderRadius: 10, color: "#3DD68C", fontWeight: 600 }}>🎉 All done! Ready for service.</div>}
        </div>
        <div>
          <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22, marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 14 }}>🗓️ Timeline</h2>
            {(which === "sunday" ? [
              { day: "Thursday", tasks: "Confirm sermon details with pastor" },
              { day: "Friday", tasks: "Design slides & promo graphic" },
              { day: "Saturday", tasks: "Post invitation content" },
              { day: "Sunday AM", tasks: "Final tech checks" },
              { day: "Sunday PM", tasks: "Post sermon clip + recap" },
            ] : [
              { day: "Monday", tasks: "Confirm topic, design devotional" },
              { day: "Tuesday", tasks: "Prayer point, Bible study promo" },
              { day: "Wednesday AM", tasks: "Set up slides & check equipment" },
              { day: "Thursday", tasks: "Post poll, edit testimony" },
            ]).map(r => (
              <div key={r.day} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width: 90, fontSize: "0.78rem", fontWeight: 600, color: "#F0B429", flexShrink: 0 }}>{r.day}</div>
                <div style={{ fontSize: "0.82rem", color: "#9CA3AF" }}>{r.tasks}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 14 }}>🎨 Role Key</h2>
            {Object.entries(roleColors).map(([role, color]) => (
              <div key={role} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: "0.83rem" }}>{role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  EQUIPMENT PAGE
// ══════════════════════════════════════════
function EquipmentPage({ state, user, fns, isAdmin }) {
  const [addModal, setAddModal] = useState(false);
  const [ciModal, setCiModal] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [form, setForm] = useState({ name: "", cat: "Camera / Video", condition: "Good", loc: "" });
  const [ciForm, setCiForm] = useState({ equipId: "", action: "out", note: "" });
  const [riForm, setRiForm] = useState({ equipId: "", sev: "Minor", desc: "" });
  const { db, toast, addNotification } = fns;
  const { equipment, equipLog, users } = state;

  const stats = [
    { label: "Total Assets", val: equipment.length, color: "#F0B429" },
    { label: "Good", val: equipment.filter(e => e.condition === "Good").length, color: "#3DD68C" },
    { label: "Fair", val: equipment.filter(e => e.condition === "Fair").length, color: "#F0B429" },
    { label: "Needs Repair", val: equipment.filter(e => e.condition === "Needs Repair").length, color: "#F05252" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.6rem", fontWeight: 800 }}>🎛️ Equipment Tracker</h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Check equipment in/out, report issues. All updates are live.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => { setCiForm({ equipId: equipment[0]?.id || "", action: "out", note: "" }); setCiModal(true); }}>📦 Check In/Out</Btn>
          <Btn variant="red" size="sm" onClick={() => { setRiForm({ equipId: equipment[0]?.id || "", sev: "Minor", desc: "" }); setReportModal(true); }}>⚠ Report Issue</Btn>
          {isAdmin && <Btn variant="green" size="sm" onClick={() => setAddModal(true)}>+ Add Equipment</Btn>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.9rem", fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 16 }}>All Equipment</h2>
          {[...new Set(equipment.map(e => e.cat))].map(cat => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", color: "#9CA3AF", marginBottom: 8, letterSpacing: "0.8px" }}>{cat}</div>
              {equipment.filter(e => e.cat === cat).map(e => {
                const co = e.checkedOutBy ? users.find(u => u.id === e.checkedOutBy) : null;
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: condColor(e.condition), flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.87rem", fontWeight: 500 }}>{e.name}</div>
                      <div style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>
                        {e.loc}{co && <span style={{ color: "#FB923C" }}> · Out: {co.name?.split(" ")[0]}</span>}
                        {e.issues?.length > 0 && <span style={{ color: "#F05252" }}> · ⚠ {e.issues[e.issues.length - 1]}</span>}
                      </div>
                    </div>
                    <Badge color={condColor(e.condition)}>{e.condition}</Badge>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 16 }}>📋 Activity Log</h2>
          {equipLog.length === 0
            ? <div style={{ textAlign: "center", padding: 30, color: "#6B7280", fontSize: "0.83rem" }}>No activity yet.</div>
            : equipLog.slice(0, 12).map(l => (
              <div key={l.id} style={{ padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: "0.8rem", color: l.action === "out" ? "#FB923C" : l.action === "issue" ? "#F05252" : "#3DD68C", fontWeight: 600 }}>
                    {l.action === "out" ? "↑ Out" : l.action === "in" ? "↓ In" : "⚠ Issue"}
                  </span>
                  <span style={{ fontSize: "0.83rem", fontWeight: 500 }}>{l.equip}</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#6B7280" }}>{l.user} · {l.at}{l.note && ` · ${l.note}`}</div>
              </div>
            ))}
        </div>
      </div>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="🎛️ Add Equipment">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Equipment Name" full><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Canon EOS R50" /></Field>
          <Field label="Category"><Select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}><option>Camera / Video</option><option>Audio</option><option>Presentation</option><option>Lighting</option><option>Computer</option><option>Other</option></Select></Field>
          <Field label="Condition"><Select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}><option>Good</option><option>Fair</option><option>Needs Repair</option></Select></Field>
          <Field label="Location"><Input value={form.loc} onChange={e => setForm({ ...form, loc: e.target.value })} placeholder="e.g. Tech booth" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn onClick={async () => { if (!form.name) { toast("Enter name.", "error"); return; } await addDoc(collection(db, COLS.equipment), { ...form, loc: form.loc || "Unspecified", checkedOutBy: null, issues: [] }); setAddModal(false); toast("Equipment added!"); }}>Add Equipment</Btn>
          <Btn variant="ghost" onClick={() => setAddModal(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={ciModal} onClose={() => setCiModal(false)} title="📦 Check In / Out">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Equipment" full><Select value={ciForm.equipId} onChange={e => setCiForm({ ...ciForm, equipId: e.target.value })}>{equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
          <Field label="Action"><Select value={ciForm.action} onChange={e => setCiForm({ ...ciForm, action: e.target.value })}><option value="out">Check Out (Taking it)</option><option value="in">Check In (Returning it)</option></Select></Field>
          <Field label="Note (optional)" full><Input value={ciForm.note} onChange={e => setCiForm({ ...ciForm, note: e.target.value })} placeholder="e.g. For Sunday recording" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn onClick={async () => {
            const eq = equipment.find(e => e.id === ciForm.equipId);
            await updateDoc(doc(db, COLS.equipment, ciForm.equipId), { checkedOutBy: ciForm.action === "out" ? user.id : null });
            await addDoc(collection(db, COLS.equipLog), { at: nowStr(), user: user.name, equip: eq.name, action: ciForm.action, note: ciForm.note, createdAt: serverTimestamp() });
            setCiModal(false); toast(ciForm.action === "out" ? "Checked out!" : "Returned!");
          }}>Confirm</Btn>
          <Btn variant="ghost" onClick={() => setCiModal(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={reportModal} onClose={() => setReportModal(false)} title="⚠️ Report Issue">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Equipment" full><Select value={riForm.equipId} onChange={e => setRiForm({ ...riForm, equipId: e.target.value })}>{equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
          <Field label="Severity"><Select value={riForm.sev} onChange={e => setRiForm({ ...riForm, sev: e.target.value })}><option>Minor</option><option>Major</option><option>Broken / Unusable</option></Select></Field>
          <Field label="Describe the Issue" full><Textarea value={riForm.desc} onChange={e => setRiForm({ ...riForm, desc: e.target.value })} placeholder="What's wrong?" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn variant="red" onClick={async () => {
            if (!riForm.desc) { toast("Describe the issue.", "error"); return; }
            const eq = equipment.find(e => e.id === riForm.equipId);
            const newCondition = riForm.sev === "Broken / Unusable" ? "Needs Repair" : "Fair";
            await updateDoc(doc(db, COLS.equipment, riForm.equipId), { condition: newCondition, issues: [...(eq.issues || []), riForm.desc] });
            await addDoc(collection(db, COLS.equipLog), { at: nowStr(), user: user.name, equip: eq.name, action: "issue", note: `⚠ ${riForm.sev}: ${riForm.desc}`, createdAt: serverTimestamp() });
            await addNotification(`Equipment issue: ${eq.name} — ${riForm.sev} reported by ${user.name}`, "equipment");
            setReportModal(false); toast("Issue reported!", "error");
          }}>Submit Report</Btn>
          <Btn variant="ghost" onClick={() => setReportModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════
//  PERFORMANCE PAGE
// ══════════════════════════════════════════
function PerformancePage({ state, user, fns }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", platform: "Instagram", reach: 0, likes: 0, shares: 0, comments: 0 });
  const [insights, setInsights] = useState(null);
  const { db, toast, ai, setLoad, loading } = fns;
  const { performance, users } = state;

  const totalReach = performance.reduce((s, p) => s + (p.reach || 0), 0);
  const avgEng = performance.length ? (performance.reduce((s, p) => s + ((p.likes + p.shares + p.comments) / Math.max(p.reach, 1) * 100), 0) / performance.length).toFixed(1) : 0;
  const platforms = ["Instagram", "Facebook", "TikTok", "YouTube", "WhatsApp"];
  const platColors = ["#E05C5C", "#4F8EF7", "#3DD68C", "#A78BFA", "#F0B429"];
  const maxReach = Math.max(...platforms.map(pl => performance.filter(p => p.platform === pl).reduce((s, p) => s + (p.reach || 0), 0)), 1);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.6rem", fontWeight: 800 }}>📊 Performance</h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Track and analyse social media metrics across all platforms.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="blue" onClick={async () => { setLoad("insights", true); const r = await ai.analyzePerformance(performance); setInsights(r); setLoad("insights", false); }} disabled={loading.insights}>{loading.insights ? "✦ Analysing…" : "✦ AI Insights"}</Btn>
          <Btn onClick={() => setModal(true)}>+ Log Performance</Btn>
        </div>
      </div>

      {insights && (
        <div style={{ background: "linear-gradient(135deg,rgba(79,142,247,0.08),rgba(61,214,140,0.04))", border: "1px solid rgba(79,142,247,0.2)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#4F8EF7", marginBottom: 10 }}>✦ AI Performance Insights</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: "0.83rem" }}>
            <div><span style={{ color: "#9CA3AF" }}>Best Platform: </span><strong style={{ color: "#3DD68C" }}>{insights.topPlatform}</strong></div>
            <div><span style={{ color: "#9CA3AF" }}>Best Content: </span><strong style={{ color: "#F0B429" }}>{insights.bestContentType}</strong></div>
            <div><span style={{ color: "#9CA3AF" }}>Best Day: </span><strong style={{ color: "#A78BFA" }}>{insights.bestDay}</strong></div>
            <div><span style={{ color: "#9CA3AF" }}>Trend: </span><strong style={{ color: insights.trend === "up" ? "#3DD68C" : insights.trend === "down" ? "#F05252" : "#F0B429" }}>{insights.trend === "up" ? "↑ Growing" : insights.trend === "down" ? "↓ Declining" : "→ Stable"}</strong></div>
          </div>
          <div style={{ marginTop: 10, fontSize: "0.84rem", color: "#9CA3AF" }}>{insights.insight}</div>
          <div style={{ marginTop: 6, fontSize: "0.84rem", color: "#3DD68C" }}>💡 {insights.recommendation}</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total Reach", val: `${(totalReach / 1000).toFixed(1)}K`, color: "#F0B429" },
          { label: "Avg Engagement", val: `${avgEng}%`, color: "#3DD68C" },
          { label: "Posts Logged", val: performance.length, color: "#4F8EF7" },
          { label: "Total Likes", val: performance.reduce((s, p) => s + (p.likes || 0), 0), color: "#A78BFA" },
        ].map(s => (
          <div key={s.label} style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.9rem", fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 18 }}>Platform Reach</h2>
          {platforms.map((pl, i) => {
            const reach = performance.filter(p => p.platform === pl).reduce((s, p) => s + (p.reach || 0), 0);
            return (
              <div key={pl} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 5 }}>
                  <span>{pl}</span><span style={{ fontWeight: 600, color: platColors[i] }}>{reach.toLocaleString()}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 5, height: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round(reach / maxReach * 100)}%`, background: platColors[i], borderRadius: 5, transition: "width 0.6s ease" }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 16 }}>🏆 Top Content</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
            <thead><tr>{["Post", "Platform", "Reach", "Eng%"].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#6B7280", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {[...performance].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 5).map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td style={{ padding: "9px 10px", fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</td>
                  <td style={{ padding: "9px 10px" }}><Badge color="#4F8EF7">{p.platform}</Badge></td>
                  <td style={{ padding: "9px 10px" }}>{(p.reach || 0).toLocaleString()}</td>
                  <td style={{ padding: "9px 10px", color: "#3DD68C", fontWeight: 600 }}>{(((p.likes + p.shares + p.comments) / Math.max(p.reach, 1)) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="📊 Log Performance">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Post Title" full><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sunday Sermon Reel – Week 4" /></Field>
          <Field label="Platform"><Select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube</option><option>WhatsApp</option></Select></Field>
          <Field label="Reach / Views"><Input type="number" value={form.reach} onChange={e => setForm({ ...form, reach: e.target.value })} placeholder="0" /></Field>
          <Field label="Likes"><Input type="number" value={form.likes} onChange={e => setForm({ ...form, likes: e.target.value })} placeholder="0" /></Field>
          <Field label="Shares"><Input type="number" value={form.shares} onChange={e => setForm({ ...form, shares: e.target.value })} placeholder="0" /></Field>
          <Field label="Comments"><Input type="number" value={form.comments} onChange={e => setForm({ ...form, comments: e.target.value })} placeholder="0" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn onClick={async () => {
            if (!form.title) { toast("Enter post title.", "error"); return; }
            try {
              await addDoc(collection(db, COLS.performance), {
                ...form,
                reach: parseInt(form.reach) || 0,
                likes: parseInt(form.likes) || 0,
                shares: parseInt(form.shares) || 0,
                comments: parseInt(form.comments) || 0,
                by: user?.id || "unknown",
                byName: user?.name || "Unknown",
                date: today(),
              });
              setModal(false);
              setForm({ title: "", platform: "Instagram", reach: 0, likes: 0, shares: 0, comments: 0 });
              toast("Performance logged!");
            } catch(e) {
              console.error("Perf error:", e);
              toast("Error saving: " + e.message, "error");
            }
          }}>Log Data</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════
//  CONTENT HUB
// ══════════════════════════════════════════
function ContentHubPage({ state, user, fns }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", desc: "", type: "Graphic", service: "Sunday", platform: "Instagram" });
  const [search, setSearch] = useState("");
  const { db, toast } = fns;
  const { contentFiles, users } = state;

  const filtered = contentFiles.filter(f => f.title?.toLowerCase().includes(search.toLowerCase()));
  const typeIcon = t => ({ "Video / Reel": "🎬", "Graphic": "🖼️", "Slides": "🖥️", "Photo": "📸", "Copywriting": "✍️", "Story": "📱" }[t] || "📄");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.6rem", fontWeight: 800 }}>🗂️ Content Hub</h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Shared content library — upload and access files as a team.</p>
        </div>
        <Btn onClick={() => setModal(true)}>+ Upload Content</Btn>
      </div>

      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search content…" style={{ maxWidth: 360, marginBottom: 20 }} />

      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: 80, color: "#6B7280" }}><div style={{ fontSize: "3rem", marginBottom: 12 }}>🗂️</div><p>No content uploaded yet.</p></div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
          {filtered.map(item => {
            const author = users.find(u => u.id === item.uploadedBy);
            return (
              <div key={item.id} style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(240,180,41,0.25)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}>
                <div style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "#111420", fontSize: "2.5rem" }}>{typeIcon(item.type)}</div>
                <div style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4 }}>{item.title}</div>
                  {item.desc && <div style={{ fontSize: "0.79rem", color: "#9CA3AF", marginBottom: 10, lineHeight: 1.5 }}>{item.desc}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    <Badge color="#4F8EF7">{item.type}</Badge>
                    <Badge color="#6B7280">{item.service}</Badge>
                    <Badge color="#A78BFA">{item.platform}</Badge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "#9CA3AF" }}>
                    <Avatar user={author} size={18} />
                    <span>{author?.name?.split(" ")[0]} · {item.uploadedAt}</span>
                  </div>
                  {(user.id === item.uploadedBy || user.role === "admin") && (
                    <Btn size="xs" variant="red" style={{ marginTop: 10 }} onClick={async () => { await deleteDoc(doc(db, COLS.contentFiles, item.id)); toast("Deleted."); }}>Delete</Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>}

      <Modal open={modal} onClose={() => setModal(false)} title="🗂️ Upload Content">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Title" full><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sunday Sermon Slides Week 4" /></Field>
          <Field label="Content Type"><Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>Graphic</option><option>Video / Reel</option><option>Slides</option><option>Photo</option><option>Copywriting</option><option>Story</option></Select></Field>
          <Field label="Service"><Select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}><option>Sunday</option><option>Midweek</option><option>Both</option></Select></Field>
          <Field label="Platform"><Select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube</option><option>WhatsApp</option><option>All Platforms</option></Select></Field>
          <Field label="Description" full><Textarea value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="Brief description…" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn onClick={async () => {
            if (!form.title) { toast("Enter a title.", "error"); return; }
            try {
              const docRef = await addDoc(collection(db, COLS.contentFiles), {
                ...form,
                uploadedBy: user?.id || "unknown",
                uploadedByName: user?.name || "Unknown",
                uploadedAt: today(),
              });
              console.log("Content saved:", docRef.id);
              setModal(false);
              setForm({ title: "", desc: "", type: "Graphic", service: "Sunday", platform: "Instagram" });
              toast("Content added to hub!");
            } catch(e) {
              console.error("Save error:", e);
              toast("Error: " + e.message, "error");
            }
          }}>Add to Hub</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════
//  ADMIN PAGE
// ══════════════════════════════════════════
function AdminPage({ state, user, fns }) {
  const [tab, setTab] = useState("members");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Graphic Designer", avatar: "#4F8EF7" });
  const { db, toast, auth } = fns;
  const { users, ideas, tasks, equipment, notifications } = state;

  const addMember = async () => {
    if (!form.name || !form.email || !form.password) { toast("Fill all fields.", "error"); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await setDoc(doc(db, COLS.users, cred.user.uid), { name: form.name, email: form.email, role: form.role, avatar: form.avatar, joined: today() });
      await signOut(auth);
      // Re-login as admin would be needed in real app — for now just notify
      setModal(false); setForm({ name: "", email: "", password: "", role: "Graphic Designer", avatar: "#4F8EF7" });
      toast("Member added! They can now log in.");
    } catch (e) { toast("Error: " + e.message, "error"); }
  };

  const doneTasks = tasks.filter(t => t.status === "Done").length;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.6rem", fontWeight: 800 }}>⚙️ Admin Panel</h1>
        <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: 4 }}>Full control over the team, approvals, and department overview.</p>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "#1E2338", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[{ id: "members", label: "👥 Members" }, { id: "approvals", label: "✅ Approvals" }, { id: "overview", label: "📈 Overview" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer", background: tab === t.id ? "#242840" : "transparent", color: tab === t.id ? "#EEF0F8" : "#9CA3AF", fontSize: "0.82rem", fontWeight: 500, fontFamily: "'Instrument Sans',sans-serif" }}>{t.label}</button>
        ))}
      </div>

      {tab === "members" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700 }}>Team Members ({users.filter(u => u.role !== "admin").length})</h2>
            <Btn onClick={() => setModal(true)}>+ Add Member</Btn>
          </div>
          <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Member", "Email", "Role", "Tasks", "Ideas", "Joined"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#6B7280", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {users.filter(u => u.role !== "admin").map(u => (
                  <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.015)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar user={u} size={30} />{u.name}</div></td>
                    <td style={{ padding: "12px 16px", color: "#9CA3AF", fontSize: "0.8rem" }}>{u.email}</td>
                    <td style={{ padding: "12px 16px" }}><Badge color="#A78BFA">{u.role}</Badge></td>
                    <td style={{ padding: "12px 16px" }}>{tasks.filter(t => t.assignedTo === u.id).length}</td>
                    <td style={{ padding: "12px 16px" }}>{ideas.filter(i => i.by === u.id).length}</td>
                    <td style={{ padding: "12px 16px", color: "#9CA3AF", fontSize: "0.78rem" }}>{u.joined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 16 }}>
            Pending Approvals <Badge color="#F0B429">{ideas.filter(i => i.status === "pending").length}</Badge>
          </h2>
          {ideas.filter(i => i.status === "pending").length === 0
            ? <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}><div style={{ fontSize: "2rem", marginBottom: 10 }}>✅</div><p>No pending approvals!</p></div>
            : ideas.filter(i => i.status === "pending").map(idea => (
              <div key={idea.id} style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 18, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{idea.title}</div>
                    <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: 2 }}>{idea.byName} · {idea.submittedAt}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn size="sm" variant="green" onClick={async () => { await updateDoc(doc(db, COLS.ideas, idea.id), { status: "approved" }); await fns.addNotification(`"${idea.title}" was approved!`, "approval"); toast("Approved!"); }}>✓ Approve</Btn>
                    <Btn size="sm" variant="red" onClick={async () => { await updateDoc(doc(db, COLS.ideas, idea.id), { status: "rejected" }); toast("Rejected.", "error"); }}>✗ Reject</Btn>
                  </div>
                </div>
                <p style={{ fontSize: "0.83rem", color: "#9CA3AF", marginBottom: 10 }}>{idea.desc}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color="#4F8EF7">{idea.type}</Badge>
                  <Badge color="#6B7280">{idea.service}</Badge>
                  <Badge color="#A78BFA">{idea.platform}</Badge>
                  {idea.score && <Badge color={idea.score > 70 ? "#3DD68C" : "#F0B429"}>AI: {idea.score}/100</Badge>}
                </div>
              </div>
            ))}
        </div>
      )}

      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
            {[
              { label: "Tasks Completed", val: `${doneTasks}/${tasks.length}`, pct: Math.round(doneTasks / Math.max(tasks.length, 1) * 100), color: "#3DD68C" },
              { label: "Ideas Approved", val: `${ideas.filter(i => i.status === "approved").length}/${ideas.length}`, pct: Math.round(ideas.filter(i => i.status === "approved").length / Math.max(ideas.length, 1) * 100), color: "#4F8EF7" },
              { label: "Equipment Issues", val: equipment.filter(e => e.condition !== "Good").length, pct: null, color: "#F05252" },
            ].map(s => (
              <div key={s.label} style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "2rem", fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.val}</div>
                <div style={{ fontSize: "0.8rem", color: "#9CA3AF", marginBottom: s.pct !== null ? 10 : 0 }}>{s.label}</div>
                {s.pct !== null && <ProgressBar value={s.pct} color={s.color} />}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 14 }}>Team Productivity</h2>
              {users.filter(u => u.role !== "admin").map(u => {
                const uTasks = tasks.filter(t => t.assignedTo === u.id);
                const done = uTasks.filter(t => t.status === "Done").length;
                return (
                  <div key={u.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Avatar user={u} size={22} />
                      <span style={{ fontSize: "0.83rem", fontWeight: 500 }}>{u.name?.split(" ")[0]}</span>
                      <span style={{ fontSize: "0.72rem", color: "#9CA3AF", marginLeft: "auto" }}>{done}/{uTasks.length}</span>
                    </div>
                    <ProgressBar value={uTasks.length ? Math.round(done / uTasks.length * 100) : 0} color={u.avatar} />
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#1E2338", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22 }}>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: 14 }}>Recent Notifications</h2>
              {notifications.slice(0, 8).map(n => (
                <div key={n.id} style={{ padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", fontSize: "0.82rem" }}>
                  <div style={{ fontWeight: n.read ? 400 : 600 }}>{n.message}</div>
                  <div style={{ fontSize: "0.7rem", color: "#6B7280", marginTop: 2 }}>{n.at}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="👤 Add Team Member">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Full Name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amara Osei" /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="amara@gacadigbe.church" /></Field>
          <Field label="Password"><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Temporary password" /></Field>
          <Field label="Role"><Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option>Graphic Designer</option><option>Video Editor</option><option>Photographer</option><option>Slide Operator</option><option>Social Media Manager</option><option>Copywriter</option></Select></Field>
          <Field label="Avatar Color" full>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {["#F0B429", "#4F8EF7", "#3DD68C", "#A78BFA", "#FB923C", "#F05252", "#34D399"].map(c => (
                <div key={c} onClick={() => setForm({ ...form, avatar: c })} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${form.avatar === c ? "#fff" : "transparent"}`, transition: "border 0.2s" }} />
              ))}
            </div>
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <Btn onClick={addMember}>Add Member</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}
