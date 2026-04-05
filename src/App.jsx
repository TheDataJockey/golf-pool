import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";



const BILLS_BLUE = "#00338D";
const BILLS_RED = "#C60C30";
const BILLS_WHITE = "#FFFFFF";
const BG = "#040d1f";
const BG2 = "#071128";
const BORDER = "rgba(0,51,141,0.25)";
const COLORS = ["#C60C30","#00338D","#E8193C","#1A4FAD","#FF6B81","#4A7FD4","#FFFFFF"];

const PREVIOUS_WINNERS = {
  'WM Phoenix Open': 'Thomas Detry',
  'AT&T Pebble Beach Pro-Am': 'Rory McIlroy',
  'Cognizant Classic': 'Joe Highsmith',
  'Arnold Palmer Invitational pres. by Mastercard': 'Russell Henley',
  'THE PLAYERS Championship': 'Rory McIlroy',
  'Valspar Championship': 'Victor Hovland',
  "Texas Children's Houston Open": 'Min Woo Lee',
  'Valero Texas Open': 'Brian Harman',
  'Masters Tournament': 'Rory McIlroy',
  'RBC Heritage': 'Justin Thomas',
  'Zurich Classic of New Orleans': 'A. Novak / B. Griffin',
  'Cadillac Championship': '—',
  'Truist Championship': 'Sepp Straka',
  'ONEflight Myrtle Beach Classic': 'Ryan Fox',
  'PGA Championship': 'Scottie Scheffler',
  'THE CJ CUP Byron Nelson': 'Scottie Scheffler',
  'Charles Schwab Challenge': 'Ben Griffin',
  'the Memorial Tournament pres. by Workday': 'Scottie Scheffler',
  'RBC Canadian Open': 'Ryan Fox',
  'U.S. Open': 'J.J. Spaun',
  'Travelers Championship': 'Keegan Bradley',
  'John Deere Classic': 'Brian Campbell',
  'Genesis Scottish Open': 'Chris Gotterup',
  'ISCO Championship': 'William Mouw',
  'The Open': 'Scottie Scheffler',
  'Corales Puntacana Championship': 'Garrick Higgo',
  '3M Open': 'Kurt Kitayama',
  'Rocket Classic': 'Aldrich Potgieter',
  'Wyndham Championship': 'Cameron Young',
  'FedEx St. Jude Championship': 'Justin Rose',
  'BMW Championship': 'Scottie Scheffler',
  'TOUR Championship': 'Tommy Fleetwood',
};

const PRESET_AVATARS = ["🏌️","🦬","⛳","🏆","🦅","💪","🎯","🔥","😎","🤠","👑","💰","🎱","🦁","🐯","🦊","🐻","🤑","😤","🏅"];
const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n.toLocaleString()}`;
const fmtFull = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "thisweek", label: "This Week", icon: "⛳" },
  { id: "mypick", label: "My Pick", icon: "🎯" },
  { id: "picks", label: "Picks by Week", icon: "🏌️" },
  { id: "board", label: "Board", icon: "📌" },
  { id: "schedule", label: "Schedule", icon: "📅" },
  { id: "members", label: "Members", icon: "👥" },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [baggers, setBaggers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [field, setField] = useState([]);
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState("");
  const [postCategory, setPostCategory] = useState("banter");
  const [currentBagger, setCurrentBagger] = useState(null);
  const [loggedInBagger, setLoggedInBagger] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [fieldSearch, setFieldSearch] = useState("");
  const [fieldSort, setFieldSort] = useState("owgr");

useEffect(() => {
    // Handle password recovery from URL hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if (type === "recovery" && accessToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || "",
      }).then(({ error }) => {
        if (!error) {
          setIsResetting(true);
          setSession(null);
        }
        setLoading(false);
      });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") {
        setIsResetting(true);
        setSession(null);
        setLoading(false);
        return;
      }
      if (!isResetting) {
        setSession(session);
      }
    });

    const handleUnload = () => {
      supabase.auth.signOut();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  async function fetchData() {
    const [{ data: b }, { data: p }, { data: t }, { data: f }, { data: po }] = await Promise.all([
      supabase.from("baggers").select("*"),
      supabase.from("picks").select("*, baggers(name, avatar_url), tournaments(week_number, name)"),
      supabase.from("tournaments").select("*").order("week_number"),
      supabase.from("weekly_field").select("*").order("owgr_rank", { ascending: true, nullsFirst: false }),
      supabase.from("posts").select("*").order("created_at", { ascending: false }),
    ]);
    if (b) setBaggers(b);
    if (p) setPicks(p);
    if (t) setTournaments(t);
    if (f) setField(f);
    if (po) setPosts(po);
    // Match logged in user to their bagger record
    const userEmail = session?.user?.email;
    if (userEmail && b) {
      const match = b.find(bagger => bagger.email.toLowerCase() === userEmail.toLowerCase());
      if (match) {
        setLoggedInBagger(match);
        setCurrentBagger(match.name);
      }
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
  }

async function uploadAvatar(baggerId, file) {
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `public/${baggerId}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      console.error("Upload error:", error);
      setUploadingAvatar(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("baggers").update({ avatar_url: publicUrl }).eq("id", baggerId);
    setBaggers(prev => prev.map(b => b.id === baggerId ? { ...b, avatar_url: publicUrl } : b));
    setUploadingAvatar(false);
    setShowAvatarPicker(null);
  }

  async function setEmojiAvatar(baggerId, emoji) {
    await supabase.from("baggers").update({ avatar_url: emoji }).eq("id", baggerId);
    setBaggers(prev => prev.map(b => b.id === baggerId ? { ...b, avatar_url: emoji } : b));
    setShowAvatarPicker(null);
  }

  function Avatar({ bagger, size = 40, i = 0 }) {
    const isEmoji = bagger?.avatar_url && !bagger.avatar_url.startsWith("http");
    const isPhoto = bagger?.avatar_url && bagger.avatar_url.startsWith("http");
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: `${COLORS[i % COLORS.length]}22`, border: `2px solid ${COLORS[i % COLORS.length]}66`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {isPhoto ? <img src={bagger.avatar_url} alt={bagger.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : isEmoji ? <span style={{ fontSize: size * 0.5 }}>{bagger.avatar_url}</span>
        : <span style={{ fontFamily: "'Playfair Display', serif", fontSize: size * 0.45, color: COLORS[i % COLORS.length], fontWeight: 700 }}>{bagger?.name?.[0]}</span>}
      </div>
    );
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>Loading...</div>
  );
if (isResetting) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width: 140 }} />
      <div style={{ width: "100%", maxWidth: 360, background: "rgba(0,51,141,0.15)", border: `1px solid ${BORDER}`, borderRadius: 20, padding: 40 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: BILLS_WHITE, marginBottom: 4, textAlign: "center" }}>Set New Password</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 28, textAlign: "center" }}>Enter your new password below</div>
        {resetMessage && (
          <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "10px 14px", color: "#22c55e", fontSize: 13, marginBottom: 16 }}>{resetMessage}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <input
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              type={showPassword ? "text" : "password"}
              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", paddingRight: 44, color: BILLS_WHITE, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
            <button
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button
            onClick={async () => {
              if (!newPassword || newPassword.length < 6) {
                alert("Password must be at least 6 characters.");
                return;
              }
              const { error } = await supabase.auth.updateUser({ password: newPassword });
              if (error) {
                console.error("Password update error:", error);
                // Try exchanging the token from URL first
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                const accessToken = hashParams.get("access_token");
                const refreshToken = hashParams.get("refresh_token");
                if (accessToken) {
                  const { error: sessionError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken || "",
                  });
                  if (!sessionError) {
                    const { error: retryError } = await supabase.auth.updateUser({ password: newPassword });
                    if (!retryError) {
                      setResetMessage("Password updated successfully! Redirecting...");
                      setTimeout(() => {
                        setIsResetting(false);
                        setNewPassword("");
                        window.location.href = "https://baggersgolf.com";
                      }, 2000);
                      return;
                    }
                  }
                }
                alert("Your reset link has expired. Please request a new one.");
                setIsResetting(false);
              } else {
                setResetMessage("Password updated successfully! Redirecting...");
                setTimeout(() => {
                  setIsResetting(false);
                  setNewPassword("");
                  window.location.href = "https://baggersgolf.com";
                }, 2000);
              }
            }}
            style={{ background: BILLS_RED, border: "none", borderRadius: 10, padding: "12px", color: BILLS_WHITE, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            UPDATE PASSWORD
          </button>
        </div>
      </div>
    </div>
  );
    if (!session) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width: isMobile ? 140 : 180 }} />
      <div style={{ width: "100%", maxWidth: 360, background: "rgba(0,51,141,0.15)", border: `1px solid ${BORDER}`, borderRadius: 20, padding: isMobile ? 24 : 40 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: BILLS_WHITE, marginBottom: 4, textAlign: "center" }}>Welcome Back</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 28, textAlign: "center" }}>Sign in to access the pool</div>
        {authError && <div style={{ background: "rgba(198,12,48,0.1)", border: "1px solid rgba(198,12,48,0.3)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>{authError}</div>}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", color: BILLS_WHITE, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
          <div style={{ position: "relative" }}>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type={showPassword ? "text" : "password"} required
              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", paddingRight: 44, color: BILLS_WHITE, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
            <button onClick={() => setShowPassword(!showPassword)} type="button"
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
<button type="submit" style={{ background: BILLS_RED, border: "none", borderRadius: 10, padding: "12px", color: BILLS_WHITE, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>SIGN IN</button>
        </form>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={async () => {
            if (!email) { alert("Enter your email address first then click Forgot Password."); return; }
const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: "https://baggersgolf.com/#recovery",
            });
            if (error) { alert("Error sending reset email: " + error.message); }
            else { alert(`Password reset email sent to ${email}! Check your inbox and click the link within 10 minutes.`); }
          }}
            style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>
            Forgot Password?
          </button>
        </div>
      </div>
    </div>
  );

  const totals = {};
  baggers.forEach(b => { totals[b.name] = 0; });
  picks.forEach(p => { if (p.baggers?.name) totals[p.baggers.name] = (totals[p.baggers.name] || 0) + Number(p.earnings || 0); });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const weekNums = [...new Set(picks.map(p => p.tournaments?.week_number))].filter(Boolean).sort((a,b)=>a-b);
  const trendData = weekNums.map(w => {
    const row = { week: `W${w}` };
    baggers.forEach(b => {
      const pick = picks.find(p => p.tournaments?.week_number === w && p.baggers?.name === b.name);
      row[b.name] = pick ? Number(pick.earnings || 0) : 0;
    });
    return row;
  });
  const barData = sorted.map(([name, total]) => ({ name, total }));
  const today = new Date();

  const m = isMobile;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: BILLS_WHITE, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />

      {/* ── MOBILE HEADER ── */}
      {m && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: BG2, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}>
            <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ height: 40 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>{weekNums.length}/32 wks</div>
              <button onClick={handleLogout} style={{ background: "rgba(198,12,48,0.15)", border: `1px solid rgba(198,12,48,0.3)`, borderRadius: 8, padding: "6px 12px", color: BILLS_RED, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Out</button>
            </div>
          </div>
          <div style={{ display: "flex", overflowX: "auto", borderTop: `1px solid ${BORDER}` }}>
            {NAV.map(item => (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ flex: "0 0 auto", background: "transparent", border: "none", borderBottom: page === item.id ? `2px solid ${BILLS_RED}` : "2px solid transparent", padding: "8px 14px", color: page === item.id ? BILLS_RED : "#64748b", fontFamily: "'DM Sans', sans-serif", fontSize: 10, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 56, fontWeight: page === item.id ? 600 : 400 }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      {!m && (
        <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 210, background: BG2, borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", padding: "24px 14px", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
            <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width: 140 }} />
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {NAV.map(item => (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ background: page === item.id ? "rgba(198,12,48,0.15)" : "transparent", border: page === item.id ? "1px solid rgba(198,12,48,0.4)" : "1px solid transparent", borderRadius: 10, padding: "10px 14px", color: page === item.id ? "#ff6b6b" : "#64748b", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
          <div style={{ background: "rgba(0,51,141,0.2)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: BILLS_RED, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 4 }}>2025 SEASON</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{weekNums.length} of 32 weeks complete</div>
          </div>
          <button onClick={handleLogout} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 14px", color: "#475569", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Sign Out</button>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{ marginLeft: m ? 0 : 210, padding: m ? "100px 16px 24px" : "32px 36px" }}>
        
        {/* Page header — desktop only */}
        {!m && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: BILLS_WHITE, margin: 0 }}>
              {NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: BILLS_RED }} />
              <span style={{ fontSize: 12, color: "#64748b" }}>Season Active</span>
            </div>
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {page === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: m ? 16 : 24 }}>
            
            {/* Stat cards */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { label: "Leader", value: sorted[0]?.[0] || "—", sub: fmtFull(sorted[0]?.[1] || 0), color: BILLS_RED },
                { label: "Weeks", value: weekNums.length, sub: "of 32" },
                { label: "Baggers", value: baggers.length, sub: "In pool" },
                { label: "Total", value: fmt(sorted.reduce((a,b) => a + b[1], 0)), sub: "Earnings", color: "#4a90d9" },
              ].map(c => (
                <div key={c.label} style={{ flex: 1, minWidth: m ? "calc(50% - 6px)" : 140, background: "rgba(0,51,141,0.12)", border: `1px solid ${BORDER}`, borderRadius: 14, padding: m ? "14px 16px" : "20px 24px", borderTop: `3px solid ${c.color || BILLS_BLUE}` }}>
                  <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: m ? 20 : 26, fontFamily: "'Playfair Display', serif", color: c.color || BILLS_WHITE }}>{c.value}</div>
                  {c.sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Leaderboard */}
            <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 4, height: 18, background: BILLS_RED, borderRadius: 2 }} />
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: BILLS_WHITE }}>Season Leaderboard</span>
              </div>
              {sorted.map(([name, total], i) => {
                const bagger = baggers.find(b => b.name === name);
                return (
                  <div key={name} style={{ display: "flex", alignItems: "center", padding: m ? "10px 16px" : "10px 24px", background: i === 0 ? "rgba(198,12,48,0.08)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", borderLeft: i === 0 ? `3px solid ${BILLS_RED}` : "3px solid transparent", gap: 10 }}>
                    <div style={{ width: 24, fontFamily: "'DM Mono', monospace", fontSize: 12, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                    {bagger && <Avatar bagger={bagger} size={28} i={i} />}
                    <div style={{ flex: 1, fontSize: 14, color: i === 0 ? BILLS_WHITE : "#94a3b8", fontWeight: i === 0 ? 600 : 400 }}>{name}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: i === 0 ? BILLS_RED : "#64748b" }}>{m ? fmt(total) : fmtFull(total)}</div>
                  </div>
                );
              })}
            </div>

            {/* Bar chart */}
            <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, padding: m ? 16 : 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 4, height: 18, background: BILLS_RED, borderRadius: 2 }} />
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: BILLS_WHITE }}>Earnings by Bagger</span>
              </div>
              <ResponsiveContainer width="100%" height={m ? 180 : 220}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: m ? 10 : 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip formatter={v => fmtFull(v)} contentStyle={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, color: BILLS_WHITE }} />
                  <Bar dataKey="total" radius={[6,6,0,0]}>
                    {barData.map((entry, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Trend line */}
            {trendData.length > 0 && (
              <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, padding: m ? 16 : 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 4, height: 18, background: BILLS_RED, borderRadius: 2 }} />
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: BILLS_WHITE }}>Weekly Earnings Trend</span>
                </div>
                <ResponsiveContainer width="100%" height={m ? 180 : 220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,51,141,0.2)" />
                    <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: m ? 10 : 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip formatter={v => fmtFull(v)} contentStyle={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, color: BILLS_WHITE }} />
                    <Legend wrapperStyle={{ color: "#94a3b8", fontSize: m ? 10 : 12 }} />
                    {baggers.map((b, i) => <Line key={b.name} type="monotone" dataKey={b.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weekly table */}
            <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 4, height: 18, background: BILLS_RED, borderRadius: 2 }} />
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: BILLS_WHITE }}>Weekly Breakdown</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: m ? 11 : 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <th style={{ padding: m ? "8px 12px" : "10px 24px", textAlign: "left", color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>Bagger</th>
                      {weekNums.map(w => <th key={w} style={{ padding: m ? "8px 8px" : "10px 16px", textAlign: "right", color: "#64748b", fontWeight: 500 }}>W{w}</th>)}
                      <th style={{ padding: m ? "8px 12px" : "10px 24px", textAlign: "right", color: BILLS_WHITE, fontWeight: 600 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(([name, total], ri) => (
                      <tr key={name} style={{ borderBottom: `1px solid rgba(0,51,141,0.1)`, background: ri % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                        <td style={{ padding: m ? "8px 12px" : "10px 24px", color: "#e2e8f0", fontWeight: 500, whiteSpace: "nowrap" }}>{name}</td>
                        {weekNums.map(w => {
                          const pick = picks.find(p => p.tournaments?.week_number === w && p.baggers?.name === name);
                          const amt = pick ? Number(pick.earnings || 0) : 0;
                          return <td key={w} style={{ padding: m ? "8px 8px" : "10px 16px", textAlign: "right", color: amt > 500000 ? BILLS_RED : "#64748b", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>{m ? fmt(amt) : fmtFull(amt)}</td>;
                        })}
                        <td style={{ padding: m ? "8px 12px" : "10px 24px", textAlign: "right", color: BILLS_WHITE, fontWeight: 700, fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>{m ? fmt(total) : fmtFull(total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── THIS WEEK ── */} 
{/* ── THIS WEEK ── */}
{page === "thisweek" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {(() => {
      const current = tournaments.find(t => {
        const s = new Date(t.start_date), e = new Date(t.end_date);
        return s <= today && e >= today;
      });
      return current ? (
        <div style={{ background: "rgba(198,12,48,0.08)", border: "1px solid rgba(198,12,48,0.25)", borderRadius: 16, padding: m ? "16px" : "20px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: BILLS_RED, letterSpacing: "0.1em", fontWeight: 700, marginBottom: 6 }}>🔴 LIVE THIS WEEK</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: m ? 18 : 22, color: BILLS_WHITE, marginBottom: 4 }}>{current.name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{current.course}</div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>PURSE</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#4a90d9", fontWeight: 700 }}>${(current.purse/1000000).toFixed(1)}M</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>FIELD</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: BILLS_WHITE, fontWeight: 700 }}>{field.length}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px" }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>No tournament currently in progress.</div>
        </div>
      );
    })()}

    <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
      {/* Header with search and sort */}
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 18, background: BILLS_RED, borderRadius: 2 }} />
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: BILLS_WHITE }}>This Week's Field</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569" }}>{field.length} players</div>
        </div>
        <input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)}
          placeholder="Search golfers..."
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", color: BILLS_WHITE, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: 10, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { id: "owgr", label: "World Ranking" },
            { id: "name", label: "Name" },
            { id: "status", label: "Status" },
            { id: "picked", label: "Picked By" },
          ].map(s => (
            <button key={s.id} onClick={() => setFieldSort(s.id)}
              style={{ background: fieldSort === s.id ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${fieldSort === s.id ? "rgba(198,12,48,0.4)" : BORDER}`, borderRadius: 8, padding: "5px 12px", color: fieldSort === s.id ? BILLS_RED : "#64748b", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: fieldSort === s.id ? 600 : 400 }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: m ? "50px 1fr 70px" : "60px 1fr 80px 100px", gap: m ? 8 : 16, padding: "10px 16px", borderBottom: `1px solid rgba(0,51,141,0.15)` }}>
        {(m ? ["OWGR", "PLAYER", "STATUS"] : ["OWGR", "PLAYER", "STATUS", "PICKED BY"]).map(h => (
          <div key={h} style={{ fontSize: 10, color: "#475569", letterSpacing: "0.08em", fontWeight: 600 }}>{h}</div>
        ))}
      </div>

      {/* Player rows */}
      <div style={{ maxHeight: m ? 500 : 600, overflowY: "auto" }}>
        {(() => {
          const currentWeek = tournaments.find(t => {
            const s = new Date(t.start_date), e = new Date(t.end_date);
            return s <= today && e >= today;
          });

          let displayField = field.filter(p =>
            p.player_name.toLowerCase().includes(fieldSearch.toLowerCase())
          ).map(player => {
            const pickedBy = currentWeek ? picks
              .filter(p => p.tournaments?.week_number === currentWeek.week_number &&
                p.golfer_name?.toLowerCase() === player.player_name?.toLowerCase())
              .map(p => p.baggers?.name).join(", ") : "";
            return { ...player, pickedBy };
          });

          if (fieldSort === "name") {
            displayField.sort((a, b) => a.player_name.localeCompare(b.player_name));
          } else if (fieldSort === "status") {
            displayField.sort((a, b) => (a.owgr_rank || 999) - (b.owgr_rank || 999));
          } else if (fieldSort === "picked") {
            displayField.sort((a, b) => {
              if (a.pickedBy && !b.pickedBy) return -1;
              if (!a.pickedBy && b.pickedBy) return 1;
              return 0;
            });
          }

          if (displayField.length === 0) return (
            <div style={{ padding: 40, textAlign: "center", color: "#475569", fontSize: 14 }}>No golfers found</div>
          );

          return displayField.map((player, i) => (
            <div key={player.id} style={{ display: "grid", gridTemplateColumns: m ? "50px 1fr 70px" : "60px 1fr 80px 100px", gap: m ? 8 : 16, padding: m ? "8px 16px" : "10px 24px", borderBottom: `1px solid rgba(0,51,141,0.06)`, background: player.pickedBy ? "rgba(198,12,48,0.05)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", alignItems: "center" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: m ? 11 : 12, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>
                {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
              </div>
              <div style={{ fontSize: m ? 12 : 13, color: player.pickedBy ? BILLS_WHITE : "#94a3b8", fontWeight: player.pickedBy ? 600 : 400 }}>
                {player.player_name}{player.amateur && <span style={{ fontSize: 10, color: "#475569", marginLeft: 4 }}>(A)</span>}
              </div>
              <div style={{ fontSize: 10 }}>
                {!player.owgr_rank ? <span style={{ color: "#334155" }}>Field</span>
                : player.owgr_rank <= 10 ? <span style={{ color: BILLS_RED, fontWeight: 600 }}>Top 10</span>
                : player.owgr_rank <= 50 ? <span style={{ color: "#4a90d9" }}>Top 50</span>
                : player.owgr_rank <= 100 ? <span style={{ color: "#64748b" }}>Top 100</span>
                : <span style={{ color: "#334155" }}>Field</span>}
              </div>
              {!m && <div style={{ fontSize: 12, color: BILLS_RED, fontWeight: 600 }}>{player.pickedBy || ""}</div>}
            </div>
          ));
        })()}
      </div>
    </div>
  </div>
)}{/* ── MY PICK ── */}
{page === "mypick" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {(() => {
      const currentTournament = tournaments.find(t => {
        const s = new Date(t.start_date), e = new Date(t.end_date);
        return s <= today && e >= today;
      }) || tournaments.find(t => new Date(t.start_date) > today && !t.picks_locked);

      if (!currentTournament) return (
        <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⛳</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: BILLS_WHITE }}>No upcoming tournament</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>Check back soon!</div>
        </div>
      );

      const deadline = currentTournament.pick_deadline ? new Date(currentTournament.pick_deadline) : null;
      const isLocked = currentTournament.picks_locked || (deadline && new Date() > deadline);
      const myPicks = picks.filter(p => p.baggers?.name === loggedInBagger?.name);
      const myCurrentPick = myPicks.find(p => p.tournaments?.week_number === currentTournament.week_number);
      const myUsedGolfers = myPicks.map(p => p.golfer_name?.toLowerCase());
      const filteredField = field
        .filter(p => p.player_name.toLowerCase().includes(searchPick.toLowerCase()))
        .filter(p => !myUsedGolfers.includes(p.player_name.toLowerCase()) || 
          p.player_name.toLowerCase() === myCurrentPick?.golfer_name?.toLowerCase());
      const myPriorPicks = myPicks
        .filter(p => p.tournaments?.week_number !== currentTournament.week_number)
        .sort((a, b) => b.tournaments?.week_number - a.tournaments?.week_number);

      return (
        <>
          {/* Header banner */}
          <div style={{ background: isLocked ? "rgba(255,255,255,0.04)" : "rgba(198,12,48,0.08)", border: `1px solid ${isLocked ? BORDER : "rgba(198,12,48,0.25)"}`, borderRadius: 14, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {loggedInBagger && <Avatar bagger={loggedInBagger} size={36} i={baggers.findIndex(b => b.name === loggedInBagger.name)} />}
              <div>
                <div style={{ fontSize: 11, color: isLocked ? "#475569" : BILLS_RED, letterSpacing: "0.1em", fontWeight: 700 }}>{isLocked ? "🔒 PICKS LOCKED" : `🎯 WEEK ${currentTournament.week_number} — MAKE YOUR PICK`}</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: BILLS_WHITE }}>{currentTournament.name}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              {deadline && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>DEADLINE</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: isLocked ? "#475569" : BILLS_RED }}>
                    {deadline.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              )}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>PURSE</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#4a90d9", fontWeight: 700 }}>${(currentTournament.purse/1000000).toFixed(1)}M</div>
              </div>
            </div>
          </div>

          {/* Main two-column layout */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: m ? "wrap" : "nowrap" }}>

            {/* LEFT — Golfer list */}
            <div style={{ flex: m ? "1 1 100%" : "1 1 0", background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", minWidth: 0 }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 4, height: 16, background: BILLS_RED, borderRadius: 2 }} />
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, color: BILLS_WHITE }}>Golfers Available This Week</span>
                  <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>{filteredField.length} available</span>
                </div>
                <input value={searchPick} onChange={e => setSearchPick(e.target.value)}
                  placeholder="Search golfers..."
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", color: BILLS_WHITE, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ maxHeight: m ? 300 : 480, overflowY: "auto" }}>
                {filteredField.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: "#475569", fontSize: 13 }}>No golfers found</div>
                ) : (
                  filteredField.map((player, i) => {
                    const isSelected = selectedPick === player.player_name;
                    return (
                      <div key={player.id}
                        style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid rgba(0,51,141,0.08)`, background: isSelected ? "rgba(198,12,48,0.12)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", borderLeft: isSelected ? `3px solid ${BILLS_RED}` : "3px solid transparent", cursor: isLocked ? "default" : "pointer" }}
                        onClick={() => !isLocked && setSelectedPick(isSelected ? "" : player.player_name)}>
                        <div style={{ width: 44, fontFamily: "'DM Mono', monospace", fontSize: 11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>
                          {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
                        </div>
                        <div style={{ flex: 1, fontSize: 13, color: isSelected ? BILLS_WHITE : "#94a3b8", fontWeight: isSelected ? 600 : 400 }}>
                          {player.player_name}
                        </div>
                        {isSelected && (
                          <div style={{ fontSize: 13, color: BILLS_RED, fontWeight: 700 }}>✓</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ARROW — desktop only */}
            {!m && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 180, flexShrink: 0 }}>
                <div style={{ width: 0, height: 0, borderTop: "16px solid transparent", borderBottom: "16px solid transparent", borderLeft: `24px solid ${selectedPick ? BILLS_RED : BORDER}`, transition: "border-left-color 0.2s" }} />
              </div>
            )}

            {/* RIGHT column */}
            <div style={{ flex: m ? "1 1 100%" : "1 1 0", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

              {/* This week's pick */}
              <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 4, height: 16, background: BILLS_RED, borderRadius: 2 }} />
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, color: BILLS_WHITE }}>This Week's Pick</span>
                </div>
                <div style={{ padding: 16 }}>
                  {selectedPick ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(198,12,48,0.1)", border: "1px solid rgba(198,12,48,0.25)", borderRadius: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: BILLS_RED, marginBottom: 2 }}>SELECTED</div>
                        <div style={{ fontSize: 18, color: BILLS_WHITE, fontWeight: 700 }}>{selectedPick}</div>
                      </div>
                      {!isLocked && (
                        <button onClick={() => setSelectedPick("")}
                          style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }}>✕</button>
                      )}
                    </div>
                  ) : myCurrentPick ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "#22c55e", marginBottom: 2 }}>CURRENT PICK</div>
                        <div style={{ fontSize: 18, color: BILLS_WHITE, fontWeight: 700 }}>{myCurrentPick.golfer_name}</div>
                        {!isLocked && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Click a golfer to change</div>}
                      </div>
                      <div style={{ fontSize: 22 }}>✅</div>
                    </div>
                  ) : (
                    <div style={{ padding: "20px 0", textAlign: "center", color: "#475569", fontSize: 13 }}>
                      {isLocked ? "No pick submitted" : "← Click a golfer to select"}
                    </div>
                  )}
                </div>
              </div>

              {/* Prior picks */}
              <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 4, height: 16, background: "#334155", borderRadius: 2 }} />
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, color: "#64748b" }}>Prior Picks</span>
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {myPriorPicks.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#334155", fontSize: 13 }}>No prior picks yet</div>
                  ) : (
                    myPriorPicks.map(pick => {
                      const t = tournaments.find(t => t.week_number === pick.tournaments?.week_number);
                      return (
                        <div key={pick.id} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid rgba(0,51,141,0.06)`, opacity: 0.5 }}>
                          <div style={{ width: 40, fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#475569" }}>W{pick.tournaments?.week_number}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{pick.golfer_name}</div>
                            <div style={{ fontSize: 11, color: "#334155" }}>{t?.name || pick.tournaments?.name}</div>
                          </div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: Number(pick.earnings||0) > 0 ? "#22c55e" : "#334155" }}>
                            {Number(pick.earnings||0) > 0 ? `$${(Number(pick.earnings)/1000).toFixed(0)}K` : "—"}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Submit button */}
          {!isLocked && (
            <button onClick={async () => {
              if (!selectedPick || !loggedInBagger || !currentTournament) return;
              const { error } = await supabase.from("picks").upsert({
                bagger_id: loggedInBagger.id,
                tournament_id: currentTournament.id,
                golfer_name: selectedPick,
                earnings: 0,
              }, { onConflict: "bagger_id,tournament_id" });
              if (!error) {
                await fetchData();
                setSelectedPick("");
              } else {
                alert("Something went wrong. Please try again.");
              }
            }}
              disabled={!selectedPick}
              style={{ width: "100%", background: selectedPick ? BILLS_RED : "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, padding: "16px", color: selectedPick ? BILLS_WHITE : "#475569", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: selectedPick ? "pointer" : "default", letterSpacing: "0.04em", transition: "background 0.2s" }}>
              {selectedPick ? `⛳ Submit ${selectedPick} as My Week ${currentTournament.week_number} Pick →` : "Select a golfer from the list"}
            </button>
          )}
        </>
      );
    })()}
  </div>
)}
        {/* ── PICKS ── */}
        {page === "picks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {tournaments
              .filter(t => picks.some(p => p.tournaments?.week_number === t.week_number))
              .sort((a, b) => b.week_number - a.week_number)
              .map(t => (
                <div key={t.id} style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: m ? "12px 16px" : "14px 24px", borderBottom: `1px solid ${BORDER}`, background: "rgba(0,51,141,0.1)" }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: m ? 14 : 15, color: BILLS_WHITE }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Week {t.week_number} · {fmt(t.purse || 0)}</div>
                  </div>
                  <div style={{ padding: 8 }}>
                    {picks.filter(p => p.tournaments?.week_number === t.week_number)
                      .sort((a,b) => Number(b.earnings||0) - Number(a.earnings||0))
                      .map((pick, i) => {
                        const bagger = baggers.find(b => b.name === pick.baggers?.name);
                        const bi = baggers.findIndex(b => b.name === pick.baggers?.name);
                        return (
                          <div key={pick.id} style={{ display: "flex", alignItems: "center", padding: m ? "8px 12px" : "10px 16px", borderRadius: 8, gap: 10, background: i === 0 ? "rgba(198,12,48,0.05)" : "transparent" }}>
                            <div style={{ width: 20, fontFamily: "'DM Mono', monospace", fontSize: 11, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                            {bagger && <Avatar bagger={bagger} size={26} i={bi} />}
                            <div style={{ width: m ? 50 : 60, fontSize: 13, color: BILLS_WHITE, fontWeight: 500 }}>{pick.baggers?.name}</div>
                            <div style={{ flex: 1, fontSize: m ? 12 : 13, color: "#64748b" }}>{pick.golfer_name}</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: m ? 11 : 13, color: Number(pick.earnings||0) > 500000 ? BILLS_RED : "#64748b" }}>
                              {m ? fmt(Number(pick.earnings||0)) : fmtFull(Number(pick.earnings||0))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* ── BULLETIN BOARD ── */}
        {page === "board" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, padding: m ? 16 : 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 4, height: 18, background: BILLS_RED, borderRadius: 2 }} />
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: BILLS_WHITE }}>Post to the Board</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, background: "rgba(0,51,141,0.12)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 16px" }}>
                {loggedInBagger && <Avatar bagger={loggedInBagger} size={32} i={baggers.findIndex(b => b.name === loggedInBagger.name)} />}
                <div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Posting as</div>
                  <div style={{ fontSize: 15, color: BILLS_WHITE, fontWeight: 600 }}>{loggedInBagger?.name || "Unknown"}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[{ id: "banter", label: "🗣️ Trash Talk" }, { id: "pick", label: "⛳ Pick Alert" }, { id: "announcement", label: "📢 News" }].map(c => (
                  <button key={c.id} onClick={() => setPostCategory(c.id)}
                    style={{ background: postCategory === c.id ? "rgba(0,51,141,0.3)" : "rgba(255,255,255,0.03)", border: `1px solid ${postCategory === c.id ? "rgba(0,51,141,0.5)" : BORDER}`, borderRadius: 8, padding: "5px 12px", color: postCategory === c.id ? "#93c5fd" : "#475569", fontSize: 12, cursor: "pointer" }}>
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea value={newPost} onChange={e => setNewPost(e.target.value)}
                placeholder="Trash talk welcome... 🏌️" rows={3}
                style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 14px", color: BILLS_WHITE, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "#475569" }}>{currentBagger ? `As ${currentBagger}` : "Pick your name"}</div>
                <button onClick={async () => {
                  if (!newPost.trim() || !currentBagger) return;
                  const { data } = await supabase.from("posts").insert({ bagger_name: currentBagger, content: newPost.trim(), category: postCategory, reactions: {} }).select();
                  if (data) { setPosts(prev => [data[0], ...prev]); setNewPost(""); }
                }}
                  style={{ background: currentBagger && newPost.trim() ? BILLS_RED : "rgba(255,255,255,0.06)", border: "none", borderRadius: 10, padding: "9px 20px", color: currentBagger && newPost.trim() ? BILLS_WHITE : "#475569", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Post 📌
                </button>
              </div>
            </div>

            {posts.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#475569", fontSize: 14 }}>No posts yet — be the first! 🏌️</div>}
            {posts.map(post => {
              const cats = {
                banter: { bg: "rgba(198,12,48,0.06)", border: "rgba(198,12,48,0.2)", label: "🗣️ Trash Talk", color: BILLS_RED },
                pick: { bg: "rgba(0,51,141,0.08)", border: "rgba(0,51,141,0.25)", label: "⛳ Pick Alert", color: "#4a90d9" },
                announcement: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", label: "📢 News", color: "#f59e0b" },
              };
              const cat = cats[post.category] || cats.banter;
              const bagger = baggers.find(bg => bg.name === post.bagger_name);
              const bi = baggers.findIndex(bg => bg.name === post.bagger_name);
              return (
                <div key={post.id} style={{ background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 14, padding: m ? 14 : 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {bagger && <Avatar bagger={bagger} size={34} i={bi} />}
                      <div>
                        <div style={{ fontSize: 13, color: BILLS_WHITE, fontWeight: 600 }}>{post.bagger_name}</div>
                        <div style={{ fontSize: 10, color: "#475569" }}>{new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <span style={{ fontSize: 10, background: `${cat.color}22`, color: cat.color, borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>{cat.label}</span>
                    </div>
                    <button onClick={async () => { await supabase.from("posts").delete().eq("id", post.id); setPosts(prev => prev.filter(p => p.id !== post.id)); }}
                      style={{ background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                  <p style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.6, margin: "0 0 12px" }}>{post.content}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["🔥","😂","💀","👏","🏌️","⛳"].map(emoji => {
                      const count = post.reactions?.[emoji] || 0;
                      return (
                        <button key={emoji} onClick={async () => {
                          const updated = { ...post.reactions, [emoji]: (post.reactions?.[emoji] || 0) + 1 };
                          await supabase.from("posts").update({ reactions: updated }).eq("id", post.id);
                          setPosts(prev => prev.map(p => p.id === post.id ? { ...p, reactions: updated } : p));
                        }}
                          style={{ background: count > 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${count > 0 ? "rgba(255,255,255,0.15)" : BORDER}`, borderRadius: 20, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 3 }}>
                          {emoji}{count > 0 && <span style={{ fontSize: 10 }}>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {page === "schedule" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!m && (
              <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 120px 90px 150px 100px", gap: 16, padding: "8px 20px", marginBottom: 4 }}>
                {["WK", "TOURNAMENT / COURSE", "DATES", "PURSE", "PREV. WINNER", "STATUS"].map(h => (
                  <div key={h} style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", fontWeight: 600 }}>{h}</div>
                ))}
              </div>
            )}
            {tournaments.map(t => {
              const startDate = t.start_date ? new Date(t.start_date) : null;
              const endDate = t.end_date ? new Date(t.end_date) : null;
              const isCompleted = endDate && endDate < today;
              const isCurrent = startDate && endDate && startDate <= today && endDate >= today;
              const isUpcoming = startDate && startDate > today;
              const hasPicks = picks.some(p => p.tournaments?.week_number === t.week_number);
              const prevWinner = PREVIOUS_WINNERS[t.name] || "—";
              return m ? (
                <div key={t.id} style={{ background: isCurrent ? "rgba(198,12,48,0.06)" : "rgba(0,51,141,0.05)", border: `1px solid ${isCurrent ? "rgba(198,12,48,0.25)" : BORDER}`, borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: isCurrent ? BILLS_RED : "#475569", background: "rgba(0,51,141,0.15)", padding: "2px 6px", borderRadius: 4 }}>W{t.week_number}</span>
                        {isCurrent && <span style={{ fontSize: 10, background: "rgba(198,12,48,0.15)", color: BILLS_RED, borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>🔴 LIVE</span>}
                        {isCompleted && hasPicks && <span style={{ fontSize: 10, background: "rgba(0,51,141,0.2)", color: "#4a90d9", borderRadius: 20, padding: "2px 8px" }}>✓ Done</span>}
                        {isCompleted && !hasPicks && <span style={{ fontSize: 10, color: "#334155" }}>Skipped</span>}
                        {isUpcoming && <span style={{ fontSize: 10, color: "#475569" }}>Upcoming</span>}
                      </div>
                      <div style={{ fontSize: 13, color: BILLS_WHITE, fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{startDate ? startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"} – {endDate ? endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#4a90d9", fontWeight: 600 }}>{fmt(t.purse || 0)}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{prevWinner}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr 120px 90px 150px 100px", gap: 16, padding: "14px 20px", background: isCurrent ? "rgba(198,12,48,0.06)" : "rgba(0,51,141,0.05)", border: `1px solid ${isCurrent ? "rgba(198,12,48,0.25)" : BORDER}`, borderRadius: 12, alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: isCompleted && hasPicks ? "rgba(198,12,48,0.15)" : isCurrent ? "rgba(198,12,48,0.2)" : "rgba(0,51,141,0.15)", border: `1px solid ${isCompleted && hasPicks || isCurrent ? "rgba(198,12,48,0.3)" : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color: isCompleted && hasPicks || isCurrent ? BILLS_RED : "#475569" }}>{t.week_number}</div>
                  <div>
                    <div style={{ fontSize: 13, color: BILLS_WHITE, fontWeight: 500, marginBottom: 2 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{t.course}</div>
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#64748b" }}>
                    {startDate ? startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"} – {endDate ? endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#4a90d9", fontWeight: 600 }}>{fmt(t.purse || 0)}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{prevWinner}</div>
                  <div>
                    {isCurrent && <span style={{ fontSize: 10, background: "rgba(198,12,48,0.15)", color: BILLS_RED, borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>🔴 LIVE</span>}
                    {isCompleted && hasPicks && <span style={{ fontSize: 10, background: "rgba(0,51,141,0.2)", color: "#4a90d9", borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>✓ DONE</span>}
                    {isCompleted && !hasPicks && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.04)", color: "#334155", borderRadius: 20, padding: "3px 10px" }}>SKIPPED</span>}
                    {isUpcoming && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.04)", color: "#475569", borderRadius: 20, padding: "3px 10px" }}>UPCOMING</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MEMBERS ── */}
        {page === "members" && (
          <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {sorted.map(([name, total], i) => {
              const bagger = baggers.find(b => b.name === name);
              if (!bagger) return null;
              return (
                <div key={bagger.id} style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${i === 0 ? "rgba(198,12,48,0.3)" : BORDER}`, borderRadius: 16, padding: m ? 16 : 20, borderTop: `3px solid ${COLORS[i % COLORS.length]}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={{ position: "relative" }}>
                      <Avatar bagger={bagger} size={44} i={i} />
                      <button onClick={() => setShowAvatarPicker(showAvatarPicker === bagger.id ? null : bagger.id)}
                        style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: BILLS_RED, border: "none", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                        ✏️
                      </button>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, color: BILLS_WHITE, fontWeight: 600 }}>{bagger.name}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{bagger.email}</div>
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: i === 0 ? BILLS_RED : "#475569", fontWeight: 700 }}>#{i+1}</div>
                  </div>

                  {showAvatarPicker === bagger.id && (
                    <div style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>PICK AN AVATAR</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {PRESET_AVATARS.map(emoji => (
                          <button key={emoji} onClick={() => setEmojiAvatar(bagger.id, emoji)}
                            style={{ width: 34, height: 34, borderRadius: 8, background: bagger.avatar_url === emoji ? "rgba(198,12,48,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${bagger.avatar_url === emoji ? "rgba(198,12,48,0.4)" : BORDER}`, cursor: "pointer", fontSize: 16 }}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>OR UPLOAD A PHOTO</div>
                        <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) await uploadAvatar(bagger.id, file); }}
                          style={{ fontSize: 11, color: "#64748b", width: "100%" }} />
                        {uploadingAvatar && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>Uploading...</div>}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Season Total</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: BILLS_WHITE, fontWeight: 600 }}>{m ? fmt(total) : fmtFull(total)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Weeks Played</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#94a3b8" }}>{picks.filter(p => p.baggers?.name === name).length}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}