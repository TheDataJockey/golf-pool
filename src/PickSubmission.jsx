import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";


const BILLS_RED = "#C60C30";
const BILLS_WHITE = "#FFFFFF";
const BG = "#040d1f";
const BORDER = "rgba(0,51,141,0.25)";

export default function PickSubmission() {
  const [bagger, setBagger] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [field, setField] = useState([]);
  const [selectedGolfer, setSelectedGolfer] = useState("");
  const [existingPicks, setExistingPicks] = useState([]);
  const [currentPick, setCurrentPick] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const baggerId = params.get("bagger");
    const weekNum = params.get("week");
    console.log("baggerId:", baggerId, "weekNum:", weekNum);
    if (baggerId && weekNum) loadData(baggerId, weekNum);
    else setStatus("error");
  }, []);

  async function loadData(baggerId, weekNum) {
    try {
      const { data: t, error: tErr } = await supabase
        .from("tournaments")
        .select("*")
        .eq("week_number", weekNum)
        .single();

      if (tErr || !t) { setStatus("error"); return; }
      setTournament(t);

      const { data: b, error: bErr } = await supabase
        .from("baggers")
        .select("*")
        .eq("id", baggerId)
        .single();

      if (bErr || !b) { setStatus("error"); return; }
      setBagger(b);

      const [{ data: f }, { data: p }, { data: cp }] = await Promise.all([
        supabase.from("weekly_field").select("*").order("owgr_rank", { ascending: true, nullsFirst: false }),
        supabase.from("picks").select("golfer_name").eq("bagger_id", baggerId),
        supabase.from("picks").select("*").eq("bagger_id", baggerId).eq("tournament_id", t.id),
      ]);

      setField(f || []);
      setExistingPicks(p?.map(pick => pick.golfer_name.toLowerCase()) || []);
      if (cp?.[0]) setCurrentPick(cp[0]);

      if (t.picks_locked) {
        setStatus("locked");
        return;
      }

      if (t.pick_deadline) {
        const deadline = new Date(t.pick_deadline);
        const now = new Date();
        console.log("Deadline UTC:", deadline.toISOString());
        console.log("Now UTC:", now.toISOString());
        if (now.toISOString() > deadline.toISOString()) {
          setStatus("locked");
          return;
        }
      }

      setStatus("open");

    } catch (err) {
      console.error("loadData error:", err);
      setStatus("error");
    }
  }

  async function submitPick() {
    if (!selectedGolfer || !bagger || !tournament) return;
    setStatus("submitting");

    const { error } = await supabase.from("picks").upsert({
      bagger_id: bagger.id,
      tournament_id: tournament.id,
      golfer_name: selectedGolfer,
      earnings: 0,
    }, { onConflict: "bagger_id,tournament_id" });

    if (error) {
      setMessage("Something went wrong. Please try again.");
      setStatus("open");
    } else {
      setStatus("submitted");
      setMessage(`Your pick of ${selectedGolfer} has been saved! Good luck! 🏌️`);
    }
  }

  const filteredField = field.filter(p =>
    p.player_name.toLowerCase().includes(search.toLowerCase()) &&
    !existingPicks.includes(p.player_name.toLowerCase())
  );

  const deadline = tournament?.pick_deadline ? new Date(tournament.pick_deadline) : null;
  const timeLeft = deadline ? deadline - new Date() : null;
  const hoursLeft = timeLeft ? Math.floor(timeLeft / (1000 * 60 * 60)) : null;

  if (status === "loading") return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>
      Loading...
    </div>
  );

  if (status === "error") return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width: 140 }} />
      <div style={{ color: "#f87171", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Invalid link. Please use the link from your email.</div>
    </div>
  );
  return (
    <div style={{ minHeight: "100vh", background: BG, color: BILLS_WHITE, fontFamily: "'DM Sans', sans-serif", padding: "32px 20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 520, margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width: 120, marginBottom: 16 }} />
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: BILLS_WHITE, marginBottom: 4 }}>Week {tournament?.week_number} Pick</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>{tournament?.name}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{tournament?.course}</div>
        </div>

        <div style={{ background: "rgba(0,51,141,0.12)", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Submitting as</div>
            <div style={{ fontSize: 18, color: BILLS_WHITE, fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>{bagger?.name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Deadline</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: hoursLeft && hoursLeft < 24 ? BILLS_RED : "#94a3b8" }}>
              {deadline ? deadline.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD"}
            </div>
            {hoursLeft && hoursLeft > 0 && hoursLeft < 48 && (
              <div style={{ fontSize: 11, color: BILLS_RED, marginTop: 2 }}>{hoursLeft}h remaining</div>
            )}
          </div>
        </div>

        {existingPicks.length > 0 && (
          <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, letterSpacing: "0.08em" }}>ALREADY USED THIS SEASON</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {existingPicks.map(pick => (
                <span key={pick} style={{ fontSize: 12, color: "#475569", background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "3px 10px", textDecoration: "line-through" }}>{pick}</span>
              ))}
            </div>
          </div>
        )}

        {currentPick && status !== "submitted" && (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#22c55e", marginBottom: 4 }}>YOUR CURRENT PICK</div>
            <div style={{ fontSize: 15, color: BILLS_WHITE, fontWeight: 600 }}>{currentPick.golfer_name}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>You can change this until the deadline</div>
          </div>
        )}

        {status === "locked" && (
          <div style={{ background: "rgba(198,12,48,0.08)", border: "1px solid rgba(198,12,48,0.25)", borderRadius: 14, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: BILLS_WHITE, marginBottom: 8 }}>Picks are locked</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>The deadline has passed for Week {tournament?.week_number}.</div>
            {currentPick && <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 12 }}>Your pick: <strong style={{ color: BILLS_WHITE }}>{currentPick.golfer_name}</strong></div>}
          </div>
        )}

        {status === "submitted" && (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 14, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: BILLS_WHITE, marginBottom: 8 }}>Pick Submitted!</div>
            <div style={{ fontSize: 14, color: "#94a3b8" }}>{message}</div>
            <a href="https://baggersgolf.com" style={{ display: "inline-block", marginTop: 20, background: BILLS_RED, color: BILLS_WHITE, padding: "10px 24px", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>View Leaderboard →</a>
          </div>
        )}

        {status === "open" && (
          <div style={{ background: "rgba(0,51,141,0.08)", border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: BILLS_WHITE, marginBottom: 16 }}>Select Your Golfer</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search golfers..."
              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 14px", color: BILLS_WHITE, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>💰 Purse: <span style={{ color: "#4a90d9" }}>${(tournament?.purse/1000000).toFixed(1)}M</span></div>
              <div style={{ fontSize: 12, color: "#64748b" }}>👥 Field: <span style={{ color: "#94a3b8" }}>{field.length} players</span></div>
              <div style={{ fontSize: 12, color: "#64748b" }}>🚫 Used: <span style={{ color: "#94a3b8" }}>{existingPicks.length} golfers</span></div>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 16 }}>
              {filteredField.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#475569", fontSize: 13 }}>No golfers found</div>
              ) : (
                filteredField.map((player, i) => (
                  <div key={player.id} onClick={() => setSelectedGolfer(player.player_name)}
                    style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid rgba(0,51,141,0.1)`, cursor: "pointer", background: selectedGolfer === player.player_name ? "rgba(198,12,48,0.15)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", borderLeft: selectedGolfer === player.player_name ? `3px solid ${BILLS_RED}` : "3px solid transparent" }}>
                    <div style={{ width: 40, fontFamily: "'DM Mono', monospace", fontSize: 11, color: player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>
                      {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: selectedGolfer === player.player_name ? BILLS_WHITE : "#94a3b8", fontWeight: selectedGolfer === player.player_name ? 600 : 400 }}>
                      {player.player_name}
                    </div>
                    {selectedGolfer === player.player_name && <div style={{ fontSize: 16 }}>✅</div>}
                  </div>
                ))
              )}
            </div>
            {selectedGolfer && (
              <div style={{ background: "rgba(198,12,48,0.08)", border: "1px solid rgba(198,12,48,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: BILLS_RED, marginBottom: 2 }}>YOUR PICK</div>
                  <div style={{ fontSize: 16, color: BILLS_WHITE, fontWeight: 700 }}>{selectedGolfer}</div>
                </div>
                <button onClick={() => setSelectedGolfer("")} style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>
            )}
            <button onClick={submitPick} disabled={!selectedGolfer}
              style={{ width: "100%", background: selectedGolfer ? BILLS_RED : "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, padding: "14px", color: selectedGolfer ? BILLS_WHITE : "#475569", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: selectedGolfer ? "pointer" : "default", letterSpacing: "0.04em" }}>
              {selectedGolfer ? `Submit ${selectedGolfer} →` : "Select a golfer first"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}