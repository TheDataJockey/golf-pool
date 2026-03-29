import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n.toLocaleString()}`;
const fmtFull = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const COLORS = ["#22c55e","#3b82f6","#f59e0b","#ef4444","#a855f7","#06b6d4","#f97316"];

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [baggers, setBaggers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  async function fetchData() {
    const [{ data: b }, { data: p }, { data: t }] = await Promise.all([
      supabase.from("baggers").select("*"),
      supabase.from("picks").select("*, baggers(name), tournaments(week_number, name)"),
      supabase.from("tournaments").select("*").order("week_number"),
    ]);
    if (b) setBaggers(b);
    if (p) setPicks(p);
    if (t) setTournaments(t);
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

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#080f1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>
      Loading...
    </div>
  );

  if (!session) return (
    <div style={{ minHeight: "100vh", background: "#080f1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      <div style={{ width: 360, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 40 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#f1f5f9", marginBottom: 6 }}>⛳ Golf Pool</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 28 }}>Sign in to access the pool</div>
        {authError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>{authError}</div>}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#f1f5f9", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" required style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#f1f5f9", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
          <button type="submit" style={{ background: "#22c55e", border: "none", borderRadius: 10, padding: "12px", color: "#0f172a", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>Sign In</button>
        </form>
      </div>
    </div>
  );

  // Build leaderboard data
  const totals = {};
  baggers.forEach(b => { totals[b.name] = 0; });
  picks.forEach(p => { if (p.baggers?.name) totals[p.baggers.name] = (totals[p.baggers.name] || 0) + Number(p.earnings || 0); });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  // Weekly trend data
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

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "picks", label: "Picks", icon: "🏌️" },
    { id: "members", label: "Members", icon: "👥" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080f1a", color: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 200, background: "rgba(255,255,255,0.02)", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", padding: "28px 14px", zIndex: 10 }}>
        <div style={{ marginBottom: 32, paddingLeft: 8 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: "#f1f5f9" }}>⛳ Golf Pool</div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 2, letterSpacing: "0.06em" }}>SEASON 2025</div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{ background: page === item.id ? "rgba(59,130,246,0.12)" : "transparent", border: page === item.id ? "1px solid rgba(59,130,246,0.25)" : "1px solid transparent", borderRadius: 10, padding: "10px 14px", color: page === item.id ? "#93c5fd" : "#64748b", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
              {item.icon} {item.label}
            </button>
          ))}
        </nav>
        <button onClick={handleLogout} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 14px", color: "#475569", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Sign Out
        </button>
      </div>

      {/* Main */}
      <div style={{ marginLeft: 200, padding: "32px 36px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#f1f5f9", margin: 0 }}>
            {NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}
          </h1>
        </div>

        {/* DASHBOARD */}
        {page === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Stat cards */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "Leader", value: sorted[0]?.[0] || "—", sub: fmtFull(sorted[0]?.[1] || 0), color: "#22c55e" },
                { label: "Weeks Played", value: weekNums.length, sub: "Completed" },
                { label: "Total Baggers", value: baggers.length, sub: "In the pool" },
              ].map(c => (
                <div key={c.label} style={{ flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 24px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontFamily: "'Playfair Display', serif", color: c.color || "#f1f5f9" }}>{c.value}</div>
                  {c.sub && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Leaderboard + Bar chart */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 260, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#f1f5f9" }}>Season Leaderboard</div>
                {sorted.map(([name, total], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", padding: "10px 24px", background: i === 0 ? "rgba(34,197,94,0.06)" : "transparent", borderLeft: i === 0 ? "3px solid #22c55e" : "3px solid transparent" }}>
                    <div style={{ width: 28, fontFamily: "'DM Mono', monospace", fontSize: 12, color: i === 0 ? "#22c55e" : "#64748b" }}>#{i+1}</div>
                    <div style={{ flex: 1, fontSize: 14, color: "#e2e8f0", fontWeight: i === 0 ? 600 : 400 }}>{name}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: i === 0 ? "#22c55e" : "#94a3b8" }}>{fmtFull(total)}</div>
                  </div>
                ))}
              </div>
              <div style={{ flex: 2, minWidth: 300, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#f1f5f9", marginBottom: 16 }}>Earnings by Bagger</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData}>
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip formatter={v => fmtFull(v)} contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f1f5f9" }} />
                    <Bar dataKey="total" radius={[6,6,0,0]} fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Trend */}
            {trendData.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#f1f5f9", marginBottom: 16 }}>Weekly Earnings Trend</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip formatter={v => fmtFull(v)} contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f1f5f9" }} />
                    <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                    {baggers.map((b, i) => (
                      <Line key={b.name} type="monotone" dataKey={b.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* PICKS */}
        {page === "picks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {tournaments.map(t => (
              <div key={t.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: "#f1f5f9" }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{t.course} · Week {t.week_number} · Purse: {fmt(t.purse || 0)}</div>
                  </div>
                </div>
                <div style={{ padding: 8 }}>
                  {picks.filter(p => p.tournaments?.week_number === t.week_number)
                    .sort((a,b) => Number(b.earnings||0) - Number(a.earnings||0))
                    .map((pick, i) => (
                      <div key={pick.id} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderRadius: 8, gap: 12 }}>
                        <div style={{ width: 24, fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#475569" }}>#{i+1}</div>
                        <div style={{ width: 70, fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{pick.baggers?.name}</div>
                        <div style={{ flex: 1, fontSize: 13, color: "#64748b" }}>{pick.golfer_name}</div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: Number(pick.earnings||0) > 500000 ? "#22c55e" : "#94a3b8" }}>{fmtFull(Number(pick.earnings||0))}</div>
                      </div>
                    ))}
                  {picks.filter(p => p.tournaments?.week_number === t.week_number).length === 0 && (
                    <div style={{ padding: "16px 24px", fontSize: 13, color: "#475569" }}>No picks submitted yet</div>
                  )}
                </div>
              </div>
            ))}
            {tournaments.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#475569", fontSize: 14 }}>No tournaments added yet</div>
            )}
          </div>
        )}

        {/* MEMBERS */}
        {page === "members" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {baggers.map((b, i) => (
              <div key={b.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${COLORS[i%COLORS.length]}22`, border: `2px solid ${COLORS[i%COLORS.length]}44`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Playfair Display', serif", fontSize: 18, color: COLORS[i%COLORS.length] }}>
                    {b.name[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, color: "#f1f5f9", fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: "#475569" }}>{b.email}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Season Total</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{fmtFull(totals[b.name] || 0)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}