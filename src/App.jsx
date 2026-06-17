// ============================================================
// App.jsx — Baggers Golf Pool
// Main application component. Handles auth, data fetching,
// navigation, and renders all tab pages.
//
// Tech stack: React + Vite, Supabase (DB + Auth + Storage),
// Recharts (charts), Resend (email via Edge Functions),
// Datagolf API (golf data via Edge Functions)
//
// Pages: Dashboard, This Week, My Pick, Picks by Week,
//        Bulletin Board, Schedule, Members, Mookie's Pool
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from "recharts";

// ── Brand colors (Buffalo Bills palette) ──────────────────
const BILLS_BLUE  = "#00338D";
const BILLS_RED   = "#C60C30";
const BILLS_WHITE = "#FFFFFF";
const BG          = "#040d1f";   // page background
const BG2         = "#071128";   // sidebar / card background
const BORDER      = "rgba(0,51,141,0.25)";

// Per-bagger color rotation used in charts and avatars
const COLORS = ["#C60C30","#00338D","#E8193C","#1A4FAD","#FF6B81","#4A7FD4","#FFFFFF"];

// ── Static map: tournament name → 2025 previous winner ────
// Used in the Schedule tab. "TBD" for tournaments not yet played.
const PREVIOUS_WINNERS = {
  'WM Phoenix Open': 'Chris Gotterup',
  'AT&T Pebble Beach Pro-Am': 'Collin Morikawa',
  'Cognizant Classic': 'Nico Echavarria',
  'Arnold Palmer Invitational pres. by Mastercard': 'Akshay Bhatia',
  'THE PLAYERS Championship': 'Cameron Young',
  'Valspar Championship': 'Matt Fitzpatrick',
  "Texas Children's Houston Open": 'Gary Woodland',
  'Valero Texas Open': 'J.J. Spaun',
  'Masters Tournament': 'TBD',
  'RBC Heritage': 'TBD',
  'Zurich Classic of New Orleans': 'TBD',
  'Cadillac Championship': 'TBD',
  'Truist Championship': 'TBD',
  'ONEflight Myrtle Beach Classic': 'TBD',
  'PGA Championship': 'TBD',
  'THE CJ CUP Byron Nelson': 'TBD',
  'Charles Schwab Challenge': 'TBD',
  'the Memorial Tournament pres. by Workday': 'TBD',
  'RBC Canadian Open': 'TBD',
  'U.S. Open': 'TBD',
  'Travelers Championship': 'TBD',
  'John Deere Classic': 'TBD',
  'Genesis Scottish Open': 'TBD',
  'ISCO Championship': 'TBD',
  'The Open': 'TBD',
  'Corales Puntacana Championship': 'TBD',
  '3M Open': 'TBD',
  'Rocket Classic': 'TBD',
  'Wyndham Championship': 'TBD',
  'FedEx St. Jude Championship': 'TBD',
  'BMW Championship': 'TBD',
  'TOUR Championship': 'TBD',
};

// Emoji options shown in the avatar picker (Members tab + Profile modal)
const PRESET_AVATARS = [
  "🏌️","🦬","⛳","🏆","🦅","💪","🎯","🔥","😎","🤠",
  "👑","💰","🎱","🦁","🐯","🦊","🐻","🤑","😤","🏅"
];

// ── Formatting helpers ─────────────────────────────────────
// fmt: compact dollar display  e.g. $1.23M or $456K or $789
const fmt = (n) =>
  n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M`
  : n >= 1000  ? `$${(n / 1000).toFixed(0)}K`
  : `$${n.toLocaleString()}`;

// fmtFull: full dollar display  e.g. $1,234,567.00
const fmtFull = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

// ── Navigation items ───────────────────────────────────────
// pools: which pool types can see this tab
//   "main"    = Baggers golf pool members
//   "contest" = Mookie's Pool (contest_members) only
const NAV = [
  { id: "dashboard", label: "Dashboard",     icon: "📊", pools: ["main"] },
  { id: "thisweek",  label: "This Week",      icon: "⛳", pools: ["main"] },
  { id: "mypick",    label: "My Pick",        icon: "🎯", pools: ["main"] },
  { id: "picks",     label: "Picks by Week",  icon: "🏌️", pools: ["main"] },
  { id: "board",     label: "Board",          icon: "📌", pools: ["main","contest"] },
  { id: "schedule",  label: "Schedule",       icon: "📅", pools: ["main","contest"] },
  { id: "members",   label: "Members",        icon: "👥", pools: ["main"] },
  { id: "contest",   label: "Mookie's Pool",  icon: "🏆", pools: ["main","contest"] },
  { id: "admin",     label: "Admin Picks",    icon: "🔧", pools: ["main"], adminOnly: true },
];

// Kyle's email — used to gate the Admin Picks page
const ADMIN_EMAIL = "kjbialek@gmail.com";

// ── Avatar component ───────────────────────────────────────
// Renders a circular avatar that can be:
//   - A photo URL (uploaded image)
//   - An emoji (from PRESET_AVATARS)
//   - A fallback initial (first letter of name)
function Avatar({ bagger, size = 40, i = 0 }) {
  const isEmoji = bagger?.avatar_url && !bagger.avatar_url.startsWith("http");
  const isPhoto = bagger?.avatar_url && bagger.avatar_url.startsWith("http");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${COLORS[i % COLORS.length]}22`,
      border: `2px solid ${COLORS[i % COLORS.length]}66`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0
    }}>
      {isPhoto
        ? <img src={bagger.avatar_url} alt={bagger.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : isEmoji
          ? <span style={{ fontSize: size * 0.5 }}>{bagger.avatar_url}</span>
          : <span style={{ fontFamily: "'Playfair Display', serif", fontSize: size * 0.45, color: COLORS[i % COLORS.length], fontWeight: 700 }}>{bagger?.name?.[0]}</span>
      }
    </div>
  );
}

// ── Date helper ───────────────────────────────────────────
// Compares now against end_datetime (timestamptz stored as 23:59:59 ET).
// Falls back to end_date + 1 day if end_datetime not yet populated.
function tournamentEnd(t) {
  if (t.end_datetime) return new Date(t.end_datetime);
  const d = new Date(t.end_date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d;
}

// ── Mookie's Pool scoring helper ───────────────────────────
// Given a player's OWGR rank, returns the point weighting
// applied to their finish position:
//   Top 15 OWGR  → +5 pts (harder pick, penalized more)
//   Rank 16-30   → +3 pts
//   Rank 31-45   →  0 pts (neutral)
//   Rank 46-60   → -3 pts (easier pick, rewarded)
//   Rank 61+     → -5 pts
//   No rank      →  0 pts (amateur / unranked)
// Net Points = finish_position + weighting
// Lower net points = better score (this is a "golf scoring" style pool)
function getContestWeighting(owgrRank) {
  if (!owgrRank) return 0;
  if (owgrRank <= 15) return 5;
  if (owgrRank <= 30) return 3;
  if (owgrRank <= 45) return 0;
  if (owgrRank <= 60) return -3;
  return -5;
}

// ── enrichContestPicks helper ──────────────────────────────
// Given a member's contest picks and the live weekly_field data,
// returns each pick annotated with:
//   owgr        — world ranking from the live field
//   weighting   — point adjustment (see getContestWeighting)
//   position    — current leaderboard position (0 = not yet posted)
//   netPoints   — position + weighting (only when position > 0)
// Uses `field` (weekly_field table via get-field Edge Function)
// as the single source of truth for live scoring data.
function enrichContestPicks(picks, field) {
  return picks.map(pick => {
    // Match by datagolf_name first (normalized "Last, First"), then display name
    const livePlayer = field.find(f =>
      f.datagolf_name === pick.datagolf_name ||
      f.player_name   === pick.golfer_name
    );
    const owgr      = livePlayer?.owgr_rank || null;
    const weighting = getContestWeighting(owgr);
    // current_position is updated every ~60s by the get-live-positions Edge Function
    const position  = livePlayer?.current_position || 0;
    const netPoints = position > 0 ? position + weighting : 0;
    return { ...pick, owgr, weighting, position, netPoints };
  });
}

// ── computeMemberStandings helper ─────────────────────────
// For a given tournament, computes each contest member's standings:
//   enrichedPicks — all 5 picks with live scoring data
//   best4         — the 4 picks with the lowest net points (that
//                   have a position > 0), sorted ascending
//   total         — sum of the best 4 net points (lower = better)
// Returns array sorted lowest→highest total (best score first).
// Members with scores (total > 0) always sort before those
// still pending (total === 0).
function computeMemberStandings(contestMembers, contestPicks, field, tournamentId) {
  const standings = contestMembers.map(member => {
    const memberPicks = contestPicks.filter(
      p => p.member_id === member.id && p.tournament_id === tournamentId
    );
    const enrichedPicks = enrichContestPicks(memberPicks, field);

    // Best 4: only picks with an active position, sorted by net points ascending
    const best4 = enrichedPicks
      .filter(p => p.position > 0)
      .sort((a, b) => a.netPoints - b.netPoints)
      .slice(0, 4);

    const total = best4.reduce((sum, p) => sum + p.netPoints, 0);
    return { member, enrichedPicks, best4, total };
  })
  // Only include members who have submitted picks for this tournament
  .filter(s => s.enrichedPicks.length > 0);

  // Sort: members with real scores (total > 0) first, lowest→highest
  // Members still pending (total === 0) appear after scored members
  standings.sort((a, b) => {
    if (a.total > 0 && b.total > 0) return a.total - b.total;
    if (a.total > 0) return -1;
    if (b.total > 0) return 1;
    return 0;
  });

  return standings;
}

// ============================================================
// App.jsx — Baggers Golf Pool
// Main application component. Handles auth, data fetching,
// navigation, and renders all tab pages.
//
// Tech stack: React + Vite, Supabase (DB + Auth + Storage),
// Recharts (charts), Resend (email via Edge Functions),
// Datagolf API (golf data via Edge Functions)
//
// Pages: Dashboard, This Week, My Pick, Picks by Week,
//        Bulletin Board, Schedule, Members, Mookie's Pool
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from "recharts";

// ── Brand colors (Buffalo Bills palette) ──────────────────
const BILLS_BLUE  = "#00338D";
const BILLS_RED   = "#C60C30";
const BILLS_WHITE = "#FFFFFF";
const BG          = "#040d1f";   // page background
const BG2         = "#071128";   // sidebar / card background
const BORDER      = "rgba(0,51,141,0.25)";

// Per-bagger color rotation used in charts and avatars
const COLORS = ["#C60C30","#00338D","#E8193C","#1A4FAD","#FF6B81","#4A7FD4","#FFFFFF"];

// ── Static map: tournament name → 2025 previous winner ────
// Used in the Schedule tab. "TBD" for tournaments not yet played.
const PREVIOUS_WINNERS = {
  'WM Phoenix Open': 'Chris Gotterup',
  'AT&T Pebble Beach Pro-Am': 'Collin Morikawa',
  'Cognizant Classic': 'Nico Echavarria',
  'Arnold Palmer Invitational pres. by Mastercard': 'Akshay Bhatia',
  'THE PLAYERS Championship': 'Cameron Young',
  'Valspar Championship': 'Matt Fitzpatrick',
  "Texas Children's Houston Open": 'Gary Woodland',
  'Valero Texas Open': 'J.J. Spaun',
  'Masters Tournament': 'TBD',
  'RBC Heritage': 'TBD',
  'Zurich Classic of New Orleans': 'TBD',
  'Cadillac Championship': 'TBD',
  'Truist Championship': 'TBD',
  'ONEflight Myrtle Beach Classic': 'TBD',
  'PGA Championship': 'TBD',
  'THE CJ CUP Byron Nelson': 'TBD',
  'Charles Schwab Challenge': 'TBD',
  'the Memorial Tournament pres. by Workday': 'TBD',
  'RBC Canadian Open': 'TBD',
  'U.S. Open': 'TBD',
  'Travelers Championship': 'TBD',
  'John Deere Classic': 'TBD',
  'Genesis Scottish Open': 'TBD',
  'ISCO Championship': 'TBD',
  'The Open': 'TBD',
  'Corales Puntacana Championship': 'TBD',
  '3M Open': 'TBD',
  'Rocket Classic': 'TBD',
  'Wyndham Championship': 'TBD',
  'FedEx St. Jude Championship': 'TBD',
  'BMW Championship': 'TBD',
  'TOUR Championship': 'TBD',
};

// Emoji options shown in the avatar picker (Members tab + Profile modal)
const PRESET_AVATARS = [
  "🏌️","🦬","⛳","🏆","🦅","💪","🎯","🔥","😎","🤠",
  "👑","💰","🎱","🦁","🐯","🦊","🐻","🤑","😤","🏅"
];

// ── Formatting helpers ─────────────────────────────────────
// fmt: compact dollar display  e.g. $1.23M or $456K or $789
const fmt = (n) =>
  n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M`
  : n >= 1000  ? `$${(n / 1000).toFixed(0)}K`
  : `$${n.toLocaleString()}`;

// fmtFull: full dollar display  e.g. $1,234,567.00
const fmtFull = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

// ── Navigation items ───────────────────────────────────────
// pools: which pool types can see this tab
//   "main"    = Baggers golf pool members
//   "contest" = Mookie's Pool (contest_members) only
const NAV = [
  { id: "dashboard", label: "Dashboard",     icon: "📊", pools: ["main"] },
  { id: "thisweek",  label: "This Week",      icon: "⛳", pools: ["main"] },
  { id: "mypick",    label: "My Pick",        icon: "🎯", pools: ["main"] },
  { id: "picks",     label: "Picks by Week",  icon: "🏌️", pools: ["main"] },
  { id: "board",     label: "Board",          icon: "📌", pools: ["main","contest"] },
  { id: "schedule",  label: "Schedule",       icon: "📅", pools: ["main","contest"] },
  { id: "members",   label: "Members",        icon: "👥", pools: ["main"] },
  { id: "contest",   label: "Mookie's Pool",  icon: "🏆", pools: ["main","contest"] },
  { id: "admin",        label: "Admin Picks",    icon: "🔧", pools: ["main"], adminOnly: true },
  { id: "admincontest", label: "Admin Contest",  icon: "🎲", pools: ["main"], adminOnly: true },
];

// Kyle's email — used to gate the Admin Picks page
const ADMIN_EMAIL = "kjbialek@gmail.com";

// ── Avatar component ───────────────────────────────────────
// Renders a circular avatar that can be:
//   - A photo URL (uploaded image)
//   - An emoji (from PRESET_AVATARS)
//   - A fallback initial (first letter of name)
function Avatar({ bagger, size = 40, i = 0 }) {
  const isEmoji = bagger?.avatar_url && !bagger.avatar_url.startsWith("http");
  const isPhoto = bagger?.avatar_url && bagger.avatar_url.startsWith("http");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${COLORS[i % COLORS.length]}22`,
      border: `2px solid ${COLORS[i % COLORS.length]}66`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0
    }}>
      {isPhoto
        ? <img src={bagger.avatar_url} alt={bagger.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : isEmoji
          ? <span style={{ fontSize: size * 0.5 }}>{bagger.avatar_url}</span>
          : <span style={{ fontFamily: "'Playfair Display', serif", fontSize: size * 0.45, color: COLORS[i % COLORS.length], fontWeight: 700 }}>{bagger?.name?.[0]}</span>
      }
    </div>
  );
}

// ── Date helper ───────────────────────────────────────────
// Compares now against end_datetime (timestamptz stored as 23:59:59 ET).
// Falls back to end_date + 1 day if end_datetime not yet populated.
function tournamentEnd(t) {
  if (t.end_datetime) return new Date(t.end_datetime);
  const d = new Date(t.end_date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d;
}

// ── Mookie's Pool scoring helper ───────────────────────────
// Given a player's OWGR rank, returns the point weighting
// applied to their finish position:
//   Top 15 OWGR  → +5 pts (harder pick, penalized more)
//   Rank 16-30   → +3 pts
//   Rank 31-45   →  0 pts (neutral)
//   Rank 46-60   → -3 pts (easier pick, rewarded)
//   Rank 61+     → -5 pts
//   No rank      →  0 pts (amateur / unranked)
// Net Points = finish_position + weighting
// Lower net points = better score (this is a "golf scoring" style pool)
function getContestWeighting(owgrRank) {
  if (!owgrRank) return 0;
  if (owgrRank <= 15) return 5;
  if (owgrRank <= 30) return 3;
  if (owgrRank <= 45) return 0;
  if (owgrRank <= 60) return -3;
  return -5;
}

// ── enrichContestPicks helper ──────────────────────────────
// Given a member's contest picks and the live weekly_field data,
// returns each pick annotated with:
//   owgr        — world ranking from the live field
//   weighting   — point adjustment (see getContestWeighting)
//   position    — current leaderboard position (0 = not yet posted)
//   netPoints   — position + weighting (only when position > 0)
// Uses `field` (weekly_field table via get-field Edge Function)
// as the single source of truth for live scoring data.
function enrichContestPicks(picks, field) {
  return picks.map(pick => {
    // Match by datagolf_name first (normalized "Last, First"), then display name
    const livePlayer = field.find(f =>
      f.datagolf_name === pick.datagolf_name ||
      f.player_name   === pick.golfer_name
    );
    const owgr      = livePlayer?.owgr_rank || null;
    const weighting = getContestWeighting(owgr);
    // current_position is updated every ~60s by the get-live-positions Edge Function
    const position  = livePlayer?.current_position || 0;
    const netPoints = position > 0 ? position + weighting : 0;
    return { ...pick, owgr, weighting, position, netPoints };
  });
}

// ── computeMemberStandings helper ─────────────────────────
// For a given tournament, computes each contest member's standings:
//   enrichedPicks — all 5 picks with live scoring data
//   best4         — the 4 picks with the lowest net points (that
//                   have a position > 0), sorted ascending
//   total         — sum of the best 4 net points (lower = better)
// Returns array sorted lowest→highest total (best score first).
// Members with scores (total > 0) always sort before those
// still pending (total === 0).
function computeMemberStandings(contestMembers, contestPicks, field, tournamentId) {
  const standings = contestMembers.map(member => {
    const memberPicks = contestPicks.filter(
      p => p.member_id === member.id && p.tournament_id === tournamentId
    );
    const enrichedPicks = enrichContestPicks(memberPicks, field);

    // Best 4: only picks with an active position, sorted by net points ascending
    const best4 = enrichedPicks
      .filter(p => p.position > 0)
      .sort((a, b) => a.netPoints - b.netPoints)
      .slice(0, 4);

    const total = best4.reduce((sum, p) => sum + p.netPoints, 0);
    return { member, enrichedPicks, best4, total };
  })
  // Only include members who have submitted picks for this tournament
  .filter(s => s.enrichedPicks.length > 0);

  // Sort: members with real scores (total > 0) first, lowest→highest
  // Members still pending (total === 0) appear after scored members
  standings.sort((a, b) => {
    if (a.total > 0 && b.total > 0) return a.total - b.total;
    if (a.total > 0) return -1;
    if (b.total > 0) return 1;
    return 0;
  });

  return standings;
}

// ══════════════════════════════════════════════════════════
// AdminContestPanel component
// Used on the Admin Contest page (Kyle only).
// Lets Kyle select a contest member, stage up to 5 golfer
// picks, enter a tiebreaker, and submit on their behalf.
// Also shows a summary of all members' pick status for the
// current tournament.
// ══════════════════════════════════════════════════════════
function AdminContestPanel({ tournament, contestMembers, contestPicks, field, supabase, onSaved, m }) {
  const [selectedMember,  setSelectedMember]  = useState(null);
  const [search,          setSearch]          = useState("");
  const [staged,          setStaged]          = useState([]);
  const [tiebreaker,      setTiebreaker]      = useState("");
  const [saving,          setSaving]          = useState(false);
  const [savedMsg,        setSavedMsg]        = useState("");
  const [deletingId,      setDeletingId]      = useState(null);

  // Already submitted picks for the selected member this tournament
  const existingPicks = selectedMember
    ? contestPicks.filter(p => p.member_id === selectedMember.id && p.tournament_id === tournament.id)
    : [];

  const totalStaged = existingPicks.length + staged.length;

  // Extract tiebreaker from existing picks (stored on each row)
  const existingTiebreaker = existingPicks[0]?.tiebreaker;

  function resetForm() {
    setStaged([]);
    setTiebreaker("");
    setSearch("");
    setSavedMsg("");
  }

  async function handleDeletePick(pickId) {
    setDeletingId(pickId);
    const { error } = await supabase.from("contest_picks").delete().eq("id", pickId);
    if (!error) await onSaved();
    setDeletingId(null);
  }

  async function handleSubmit() {
    if (staged.length === 0 || tiebreaker === "" || !selectedMember) return;
    setSaving(true);
    setSavedMsg("");
    for (const pick of staged) {
      await supabase.from("contest_picks").insert({
        member_id:     selectedMember.id,
        tournament_id: tournament.id,
        golfer_name:   pick.golfer_name,
        datagolf_name: pick.datagolf_name,
        tiebreaker:    Number(tiebreaker),
      });
    }
    await onSaved();
    setSavedMsg(`✅ ${staged.length} picks saved for ${selectedMember.name} with TB: ${tiebreaker}`);
    setStaged([]);
    setTiebreaker("");
    setSaving(false);
  }

  async function handleUpdateTiebreaker() {
    if (tiebreaker === "" || existingPicks.length === 0) return;
    setSaving(true);
    for (const pick of existingPicks) {
      await supabase.from("contest_picks")
        .update({ tiebreaker: Number(tiebreaker) })
        .eq("id", pick.id);
    }
    await onSaved();
    setSavedMsg(`✅ Tiebreaker updated to ${tiebreaker} for ${selectedMember.name}`);
    setSaving(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Tournament banner */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:11, color:BILLS_RED, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>WEEK {tournament.week_number}</div>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE }}>{tournament.name}</div>
        </div>
        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, color:"#4a90d9", fontWeight:700 }}>
          ${(tournament.purse / 1000000).toFixed(1)}M purse
        </div>
      </div>

      {/* Step 1: Select a contest member */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Step 1 — Select a Member</span>
        </div>
        <div style={{ padding:12, display:"flex", flexWrap:"wrap", gap:8 }}>
          {contestMembers.map(member => {
            const memberPicks  = contestPicks.filter(p => p.member_id === member.id && p.tournament_id === tournament.id);
            const isSelected   = selectedMember?.id === member.id;
            const hasAllPicks  = memberPicks.length >= 5;
            return (
              <button key={member.id}
                onClick={() => { setSelectedMember(member); resetForm(); }}
                style={{ background: isSelected ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${isSelected ? "rgba(198,12,48,0.5)" : BORDER}`, borderRadius:10, padding:"8px 14px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"flex-start", gap:3 }}>
                <div style={{ fontSize:13, color: isSelected ? BILLS_WHITE : "#94a3b8", fontWeight: isSelected ? 600 : 400 }}>{member.name}</div>
                {hasAllPicks
                  ? <div style={{ fontSize:10, color:"#22c55e" }}>✓ {memberPicks.length}/5 picks</div>
                  : memberPicks.length > 0
                    ? <div style={{ fontSize:10, color:"#f59e0b" }}>{memberPicks.length}/5 picks</div>
                    : <div style={{ fontSize:10, color:"#475569" }}>No picks yet</div>
                }
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Manage picks for selected member */}
      {selectedMember && (
        <>
          {/* Already submitted picks */}
          {existingPicks.length > 0 && (
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
              <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:4, height:16, background:"#22c55e", borderRadius:2 }} />
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>
                    {selectedMember.name}'s Submitted Picks ({existingPicks.length}/5)
                  </span>
                </div>
                {existingTiebreaker !== undefined && existingTiebreaker !== null && (
                  <div style={{ fontSize:11, color:"#64748b" }}>
                    TB: <span style={{ color:BILLS_WHITE, fontFamily:"'DM Mono', monospace", fontWeight:600 }}>
                      {existingTiebreaker > 0 ? `+${existingTiebreaker}` : existingTiebreaker}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ padding:"10px 18px", display:"flex", flexWrap:"wrap", gap:8 }}>
                {existingPicks.map(pick => (
                  <div key={pick.id} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:20, padding:"4px 12px" }}>
                    <span style={{ fontSize:13, color:BILLS_WHITE }}>{pick.golfer_name}</span>
                    <button
                      onClick={() => handleDeletePick(pick.id)}
                      disabled={deletingId === pick.id}
                      style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:14, padding:0 }}>
                      {deletingId === pick.id ? "..." : "✕"}
                    </button>
                  </div>
                ))}
              </div>
              {/* Update tiebreaker on existing picks */}
              <div style={{ padding:"10px 18px", borderTop:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <div style={{ fontSize:12, color:"#64748b" }}>Update tiebreaker:</div>
                <input
                  type="number"
                  value={tiebreaker}
                  onChange={e => setTiebreaker(e.target.value)}
                  placeholder={existingTiebreaker !== null ? String(existingTiebreaker) : "e.g. -18"}
                  style={{ width:80, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"6px 10px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Mono', monospace", outline:"none", textAlign:"center" }} />
                <button
                  onClick={handleUpdateTiebreaker}
                  disabled={tiebreaker === "" || saving}
                  style={{ background: tiebreaker !== "" ? "rgba(0,51,141,0.3)" : "rgba(255,255,255,0.04)", border:`1px solid ${tiebreaker !== "" ? "rgba(0,51,141,0.5)" : BORDER}`, borderRadius:8, padding:"6px 14px", color: tiebreaker !== "" ? BILLS_WHITE : "#475569", fontSize:12, cursor: tiebreaker !== "" ? "pointer" : "default", fontFamily:"'DM Sans', sans-serif", fontWeight:600 }}>
                  Update TB
                </button>
              </div>
            </div>
          )}

          {/* Add more picks if under 5 */}
          {existingPicks.length < 5 && (
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
              <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>
                    Step 2 — Add Picks for {selectedMember.name}
                  </span>
                </div>
                <div style={{ fontSize:11, color: totalStaged >= 5 ? "#22c55e" : BILLS_RED }}>{totalStaged}/5 picks</div>
              </div>

              {/* Staged picks */}
              {staged.length > 0 && (
                <div style={{ padding:"10px 18px", borderBottom:`1px solid ${BORDER}` }}>
                  <div style={{ fontSize:11, color:"#f59e0b", marginBottom:8 }}>⏳ STAGED — NOT YET SUBMITTED</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {staged.map(p => (
                      <div key={p.golfer_name} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:20, padding:"4px 12px" }}>
                        <span style={{ fontSize:13, color:BILLS_WHITE }}>{p.golfer_name}</span>
                        <button onClick={() => setStaged(prev => prev.filter(s => s.golfer_name !== p.golfer_name))} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:14, padding:0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Field search */}
              {totalStaged < 5 && (
                <div style={{ padding:"10px 18px", borderBottom:`1px solid ${BORDER}` }}>
                  <div style={{ fontSize:11, color:"#64748b", marginBottom:8 }}>SELECT {5 - totalStaged} MORE GOLFER{5 - totalStaged !== 1 ? "S" : ""}</div>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search golfers..."
                    style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", marginBottom:10, boxSizing:"border-box" }} />
                  <div style={{ maxHeight:280, overflowY:"auto", border:`1px solid ${BORDER}`, borderRadius:10 }}>
                    {field
                      .filter(p => p.player_name.toLowerCase().includes(search.toLowerCase()))
                      .filter(p => !existingPicks.some(ep => ep.golfer_name === p.player_name))
                      .filter(p => !staged.some(s => s.golfer_name === p.player_name))
                      .map((player, i) => (
                        <div key={player.id}
                          onClick={() => {
                            if (totalStaged >= 5) return;
                            setStaged(prev => [...prev, { golfer_name: player.player_name, datagolf_name: player.datagolf_name }]);
                            setSearch("");
                          }}
                          style={{ display:"flex", alignItems:"center", padding:"9px 14px", borderBottom:`1px solid rgba(0,51,141,0.06)`, cursor:"pointer", background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(198,12,48,0.08)"}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent"}>
                          <div style={{ width:44, fontFamily:"'DM Mono', monospace", fontSize:11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 15 ? BILLS_RED : player.owgr_rank <= 30 ? "#f97316" : player.owgr_rank <= 45 ? "#64748b" : player.owgr_rank <= 60 ? "#22c55e" : "#4a90d9" }}>
                            {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
                          </div>
                          <div style={{ flex:1, fontSize:13, color:"#94a3b8" }}>{player.player_name}</div>
                          <div style={{ fontSize:11, fontFamily:"'DM Mono', monospace", color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 15 ? BILLS_RED : player.owgr_rank <= 30 ? "#f97316" : player.owgr_rank <= 45 ? "#64748b" : player.owgr_rank <= 60 ? "#22c55e" : "#4a90d9" }}>
                            {!player.owgr_rank ? "—" : player.owgr_rank <= 15 ? "+5" : player.owgr_rank <= 30 ? "+3" : player.owgr_rank <= 45 ? "0" : player.owgr_rank <= 60 ? "-3" : "-5"}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Tiebreaker + submit */}
              {totalStaged >= 5 && (
                <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <div style={{ fontSize:12, color:BILLS_WHITE, fontWeight:600, marginBottom:6 }}>Tiebreaker — Winning Score (Relative to Par)</div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <button onClick={() => setTiebreaker(prev => prev === "" ? "-1" : String(Number(prev) - 1))}
                        style={{ width:36, height:36, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE, fontSize:18, cursor:"pointer" }}>−</button>
                      <input type="number" value={tiebreaker} onChange={e => setTiebreaker(e.target.value)} placeholder="e.g. -18"
                        style={{ width:90, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:16, fontFamily:"'DM Mono', monospace", outline:"none", textAlign:"center" }} />
                      <button onClick={() => setTiebreaker(prev => prev === "" ? "1" : String(Number(prev) + 1))}
                        style={{ width:36, height:36, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE, fontSize:18, cursor:"pointer" }}>+</button>
                      <div style={{ fontSize:12, color:"#64748b" }}>
                        {tiebreaker !== "" ? (Number(tiebreaker) < 0 ? `${tiebreaker} under par` : Number(tiebreaker) === 0 ? "Even par" : `+${tiebreaker} over par`) : ""}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={tiebreaker === "" || saving}
                    onClick={handleSubmit}
                    style={{ background: tiebreaker !== "" && !saving ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:12, padding:"13px", color: tiebreaker !== "" && !saving ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:14, fontWeight:700, cursor: tiebreaker !== "" && !saving ? "pointer" : "default", letterSpacing:"0.04em" }}>
                    {saving ? "Saving..." : `⛳ Submit ${staged.length} Picks for ${selectedMember.name} →`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Success / error message */}
          {savedMsg && (
            <div style={{ background: savedMsg.startsWith("✅") ? "rgba(34,197,94,0.1)" : "rgba(198,12,48,0.1)", border:`1px solid ${savedMsg.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(198,12,48,0.3)"}`, borderRadius:10, padding:"10px 16px", fontSize:13, color: savedMsg.startsWith("✅") ? "#22c55e" : "#f87171" }}>
              {savedMsg}
            </div>
          )}
        </>
      )}

      {/* All members pick status summary */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Week {tournament.week_number} — All Contest Picks</span>
          <span style={{ fontSize:11, color:"#475569", marginLeft:"auto" }}>
            {contestMembers.filter(m => contestPicks.filter(p => p.member_id === m.id && p.tournament_id === tournament.id).length >= 5).length}/{contestMembers.length} complete
          </span>
        </div>
        {contestMembers.map((member, i) => {
          const memberPicks = contestPicks.filter(p => p.member_id === member.id && p.tournament_id === tournament.id);
          const tb          = memberPicks[0]?.tiebreaker;
          const hasAll      = memberPicks.length >= 5;
          return (
            <div key={member.id} style={{ display:"flex", alignItems:"flex-start", padding:"10px 18px", borderBottom:`1px solid rgba(0,51,141,0.06)`, background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", gap:10 }}>
              <div style={{ width:90, fontSize:13, color:BILLS_WHITE, fontWeight:500, flexShrink:0 }}>{member.name}</div>
              <div style={{ flex:1 }}>
                {memberPicks.length > 0 ? (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {memberPicks.map(p => (
                      <span key={p.id} style={{ fontSize:11, background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:20, padding:"2px 8px", color:"#94a3b8" }}>{p.golfer_name}</span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize:12, color:"#334155" }}>—</span>
                )}
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                {tb !== undefined && tb !== null && (
                  <div style={{ fontSize:10, color:"#64748b", fontFamily:"'DM Mono', monospace" }}>TB: {tb > 0 ? `+${tb}` : tb}</div>
                )}
                {hasAll
                  ? <div style={{ fontSize:11, color:"#22c55e" }}>✓ Complete</div>
                  : <button onClick={() => { setSelectedMember(member); resetForm(); window.scrollTo({ top:0, behavior:"smooth" }); }}
                      style={{ background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.3)", borderRadius:8, padding:"3px 10px", color:BILLS_RED, fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>
                      {memberPicks.length > 0 ? `Add ${5 - memberPicks.length} more` : "Enter Picks"}
                    </button>
                }
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════
// AdminPicksPanel component
// Used exclusively on the Admin Picks page.
// Lets Kyle select a bagger, search the field, and submit
// or update that bagger's pick for the current tournament.
// ══════════════════════════════════════════════════════════
function AdminPicksPanel({ tournament, baggers, picks, field, supabase, onPickSaved, m }) {
  const [selectedBagger,  setSelectedBagger]  = useState(null);
  const [adminPickSearch, setAdminPickSearch] = useState("");
  const [adminSelected,   setAdminSelected]   = useState("");
  const [saving,          setSaving]          = useState(false);
  const [savedMsg,        setSavedMsg]        = useState("");

  // Current pick for the selected bagger this tournament
  const existingPick = selectedBagger
    ? picks.find(p => p.baggers?.name === selectedBagger.name && p.tournaments?.week_number === tournament.week_number)
    : null;

  // Golfers already used by the selected bagger in prior weeks (once-per-season rule)
  const normalizeForCompare = (str) =>
    (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const priorUsed = selectedBagger
    ? picks
        .filter(p => p.baggers?.name === selectedBagger.name && p.tournaments?.week_number !== tournament.week_number)
        .map(p => normalizeForCompare(p.golfer_name))
    : [];

  async function handleSavePick() {
    if (!adminSelected || !selectedBagger) return;
    setSaving(true);
    setSavedMsg("");
    const fieldPlayer = field.find(p => p.player_name === adminSelected);
    const { error } = await supabase.from("picks").upsert({
      bagger_id:     selectedBagger.id,
      tournament_id: tournament.id,
      golfer_name:   adminSelected,
      datagolf_name: fieldPlayer?.datagolf_name || null,
      earnings:      0,
    }, { onConflict: "bagger_id,tournament_id" });
    if (!error) {
      await onPickSaved();
      setSavedMsg(`✅ ${selectedBagger.name}'s pick saved: ${adminSelected}`);
      setAdminSelected("");
    } else {
      setSavedMsg(`❌ Error: ${error.message}`);
    }
    setSaving(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Tournament info */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:11, color:BILLS_RED, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>WEEK {tournament.week_number}</div>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE }}>{tournament.name}</div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{tournament.course}</div>
        </div>
        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, color:"#4a90d9", fontWeight:700 }}>
          ${(tournament.purse / 1000000).toFixed(1)}M purse
        </div>
      </div>

      {/* Step 1: Select a bagger */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Step 1 — Select a Bagger</span>
        </div>
        <div style={{ padding:12, display:"flex", flexWrap:"wrap", gap:8 }}>
          {baggers.map((b, i) => {
            const theirPick = picks.find(p => p.baggers?.name === b.name && p.tournaments?.week_number === tournament.week_number);
            const isSelected = selectedBagger?.id === b.id;
            return (
              <button key={b.id}
                onClick={() => { setSelectedBagger(b); setAdminSelected(""); setAdminPickSearch(""); setSavedMsg(""); }}
                style={{ background: isSelected ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${isSelected ? "rgba(198,12,48,0.5)" : BORDER}`, borderRadius:10, padding:"8px 14px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"flex-start", gap:3 }}>
                <div style={{ fontSize:13, color: isSelected ? BILLS_WHITE : "#94a3b8", fontWeight: isSelected ? 600 : 400 }}>{b.name}</div>
                {theirPick ? (
                  <div style={{ fontSize:10, color:"#22c55e" }}>✓ {theirPick.golfer_name}</div>
                ) : (
                  <div style={{ fontSize:10, color:"#475569" }}>No pick yet</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Select a golfer (only shown after bagger is selected) */}
      {selectedBagger && (
        <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
              <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>
                Step 2 — Pick for {selectedBagger.name}
              </span>
            </div>
            {existingPick && (
              <div style={{ fontSize:11, color:"#22c55e" }}>Current: {existingPick.golfer_name}</div>
            )}
          </div>

          {/* Legend */}
          <div style={{ padding:"10px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", gap:16, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)" }} /> Available
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:"rgba(198,12,48,0.2)", border:"1px solid rgba(198,12,48,0.5)" }} /> Selected
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:"rgba(100,116,139,0.15)", border:"1px solid rgba(100,116,139,0.3)" }} /> Already used this season
            </div>
          </div>

          {/* Search */}
          <div style={{ padding:"10px 18px", borderBottom:`1px solid ${BORDER}` }}>
            <input value={adminPickSearch} onChange={e => setAdminPickSearch(e.target.value)} placeholder="Search golfers..."
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
          </div>

          {/* Field list */}
          <div style={{ maxHeight: m ? 280 : 400, overflowY:"auto" }}>
            {field
              .filter(p => p.player_name.toLowerCase().includes(adminPickSearch.toLowerCase()))
              .map((player, i) => {
                const isSelected   = adminSelected === player.player_name;
                const alreadyUsed  = priorUsed.includes(normalizeForCompare(player.player_name));
                const isCurrentPick = normalizeForCompare(player.player_name) === normalizeForCompare(existingPick?.golfer_name);
                const rowBg = isSelected
                  ? "rgba(198,12,48,0.12)"
                  : alreadyUsed && !isCurrentPick
                    ? "rgba(100,116,139,0.08)"
                    : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
                return (
                  <div key={player.id}
                    onClick={() => { if (!alreadyUsed || isCurrentPick) setAdminSelected(isSelected ? "" : player.player_name); }}
                    style={{ display:"flex", alignItems:"center", padding:"9px 18px", borderBottom:`1px solid rgba(0,51,141,0.06)`, background:rowBg, borderLeft: isSelected ? `3px solid ${BILLS_RED}` : alreadyUsed && !isCurrentPick ? "3px solid rgba(100,116,139,0.3)" : "3px solid transparent", cursor: alreadyUsed && !isCurrentPick ? "default" : "pointer", opacity: alreadyUsed && !isCurrentPick ? 0.4 : 1 }}>
                    <div style={{ width:44, fontFamily:"'DM Mono', monospace", fontSize:11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>
                      {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
                    </div>
                    <div style={{ flex:1, fontSize:13, color: isSelected ? BILLS_WHITE : alreadyUsed && !isCurrentPick ? "#334155" : "#94a3b8", fontWeight: isSelected ? 600 : 400 }}>
                      {player.player_name}
                      {alreadyUsed && !isCurrentPick && <span style={{ fontSize:10, color:"#334155", marginLeft:6 }}>already used</span>}
                    </div>
                    {isSelected && <div style={{ fontSize:13, color:BILLS_RED, fontWeight:700 }}>✓</div>}
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* Step 3: Confirm and save */}
      {selectedBagger && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {/* Summary of what will be saved */}
          <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:12, padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
            <div style={{ fontSize:13, color:"#64748b" }}>
              {adminSelected
                ? <span>Saving <span style={{ color:BILLS_WHITE, fontWeight:600 }}>{adminSelected}</span> for <span style={{ color:BILLS_WHITE, fontWeight:600 }}>{selectedBagger.name}</span></span>
                : <span style={{ color:"#475569" }}>← Select a golfer above</span>}
            </div>
            {existingPick && adminSelected && adminSelected !== existingPick.golfer_name && (
              <div style={{ fontSize:11, color:"#f59e0b" }}>⚠️ Will replace {existingPick.golfer_name}</div>
            )}
          </div>

          {savedMsg && (
            <div style={{ background: savedMsg.startsWith("✅") ? "rgba(34,197,94,0.1)" : "rgba(198,12,48,0.1)", border:`1px solid ${savedMsg.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(198,12,48,0.3)"}`, borderRadius:10, padding:"10px 16px", fontSize:13, color: savedMsg.startsWith("✅") ? "#22c55e" : "#f87171" }}>
              {savedMsg}
            </div>
          )}

          <button
            disabled={!adminSelected || saving}
            onClick={handleSavePick}
            style={{ background: adminSelected && !saving ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:12, padding:"14px", color: adminSelected && !saving ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor: adminSelected && !saving ? "pointer" : "default", letterSpacing:"0.04em" }}>
            {saving ? "Saving..." : adminSelected ? `⛳ Save ${selectedBagger.name}'s Pick →` : "Select a golfer to continue"}
          </button>
        </div>
      )}

      {/* Current week picks summary — shows all baggers and their picks at a glance */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Week {tournament.week_number} — All Picks</span>
          <span style={{ fontSize:11, color:"#475569", marginLeft:"auto" }}>
            {picks.filter(p => p.tournaments?.week_number === tournament.week_number).length}/{baggers.length} submitted
          </span>
        </div>
        {baggers.map((b, i) => {
          const theirPick = picks.find(p => p.baggers?.name === b.name && p.tournaments?.week_number === tournament.week_number);
          return (
            <div key={b.id} style={{ display:"flex", alignItems:"center", padding:"10px 18px", borderBottom:`1px solid rgba(0,51,141,0.06)`, background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", gap:10 }}>
              <Avatar bagger={b} size={26} i={i} />
              <div style={{ width:60, fontSize:13, color:BILLS_WHITE, fontWeight:500 }}>{b.name}</div>
              <div style={{ flex:1, fontSize:13, color: theirPick ? "#94a3b8" : "#334155" }}>
                {theirPick ? theirPick.golfer_name : "—"}
              </div>
              {theirPick ? (
                <div style={{ fontSize:11, color:"#22c55e" }}>✓</div>
              ) : (
                <button onClick={() => { setSelectedBagger(b); setAdminSelected(""); setAdminPickSearch(""); setSavedMsg(""); window.scrollTo({ top:0, behavior:"smooth" }); }}
                  style={{ background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.3)", borderRadius:8, padding:"3px 10px", color:BILLS_RED, fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>
                  Enter Pick
                </button>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Main App component
// ══════════════════════════════════════════════════════════
export default function App() {

  // ── Auth state ─────────────────────────────────────────
  const [session,     setSession]     = useState(null);   // Supabase auth session
  const [isResetting, setIsResetting] = useState(false);  // true during password-reset flow
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authError,   setAuthError]   = useState("");
  const [showPassword,setShowPassword]= useState(false);
  const [resetMessage,setResetMessage]= useState("");
  const [loading,     setLoading]     = useState(true);

  // ── Navigation / layout ────────────────────────────────
  const [page,    setPage]    = useState("dashboard");
  const [isMobile,setIsMobile]= useState(window.innerWidth <= 768);

  // ── Core data from Supabase ────────────────────────────
  // baggers       — pool members (baggers table)
  // picks         — weekly golfer picks (picks table, joined)
  // tournaments   — full 2026 PGA Tour schedule (tournaments table)
  // field         — this week's field with live scoring (weekly_field table)
  // posts         — bulletin board posts (posts table)
  const [baggers,     setBaggers]     = useState([]);
  const [picks,       setPicks]       = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [field,       setField]       = useState([]);
  const [posts,       setPosts]       = useState([]);

  // ── User identity ──────────────────────────────────────
  // loggedInBagger  — baggers row for main pool members
  // loggedInMember  — could be baggers OR contest_members row
  // currentBagger   — display name string for the active user
  const [currentBagger,  setCurrentBagger]  = useState(null);
  const [loggedInBagger, setLoggedInBagger] = useState(null);
  const [loggedInMember, setLoggedInMember] = useState(null);

  // ── Profile modal state ────────────────────────────────
  const [showProfile,   setShowProfile]   = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileData,   setProfileData]   = useState({});

  // ── Avatar upload state ────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAvatarPicker,setShowAvatarPicker]= useState(null); // bagger.id or null

  // ── Bulletin Board state ───────────────────────────────
  const [newPost,           setNewPost]           = useState("");
  const [postImage,         setPostImage]         = useState(null);
  const [postImagePreview,  setPostImagePreview]  = useState(null);
  const [uploadingPost,     setUploadingPost]     = useState(false);
  const [expandedImage,     setExpandedImage]     = useState(null);
  const [postCategory,      setPostCategory]      = useState("banter");
  // @mention autocomplete
  const [mentionQuery,         setMentionQuery]         = useState("");
  const [mentionMatches,       setMentionMatches]       = useState([]);
  const [showMentionDropdown,  setShowMentionDropdown]  = useState(false);

  // ── This Week / My Pick search+sort ───────────────────
  const [fieldSearch,  setFieldSearch]  = useState("");
  const [fieldSort,    setFieldSort]    = useState("position");
  const [searchPick,   setSearchPick]   = useState("");
  const [selectedPick, setSelectedPick] = useState("");

  // ── Mookie's Pool (contest) state ─────────────────────
  // contestMembers    — rows from contest_members table
  // contestPicks      — rows from contest_picks table (joined)
  // contestScores     — rows from contest_scores table (historical, not used for live)
  // contestPickStaging — golfers selected but not yet submitted this session
  const [contestMembers,     setContestMembers]     = useState([]);
  const [contestPicks,       setContestPicks]       = useState([]);
  const [contestScores,      setContestScores]      = useState([]);
  const [contestPickStaging, setContestPickStaging] = useState([]);

  // Tiebreaker modal (shown after staging 5 picks, before final submit)
  const [showTiebreakerModal, setShowTiebreakerModal] = useState(false);
  const [tiebreakerValue,     setTiebreakerValue]     = useState("");
  const [pendingContestPicks, setPendingContestPicks] = useState([]);
  const [tiebreakerTournament,setTiebreakerTournament]= useState(null);

  // ── Responsive listener ────────────────────────────────
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Auth initialization ────────────────────────────────
  // Handles three scenarios:
  //   1. Password-reset link (URL contains #recovery + access_token)
  //   2. Normal session restore on page load
  //   3. Auth state changes (login, logout, password update)
  // Also signs out the user when the browser tab is closed.
  useEffect(() => {
    const rawHash   = window.location.hash;
    const cleanHash = rawHash.replace("#recovery#", "#").replace("recovery#", "");
    const hashParams   = new URLSearchParams(cleanHash.substring(1));
    const accessToken  = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type         = hashParams.get("type");

    // Scenario 1: password-reset deep link
    if (type === "recovery" && accessToken) {
      supabase.auth.setSession({
        access_token:  accessToken,
        refresh_token: refreshToken || "",
      }).then(({ error }) => {
        if (!error) { setIsResetting(true); setSession(null); }
        setLoading(false);
      });
      return;
    }

    // Scenario 2: restore existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Scenario 3: listen for future auth events
    supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") {
        setIsResetting(true); setSession(null); setLoading(false);
        return;
      }
      if (_event === "USER_UPDATED") {
        setIsResetting(false); setSession(session);
        return;
      }
      if (!isResetting) setSession(session);
    });

    // Sign out on tab/window close to prevent stale sessions
    const handleUnload = () => { try { supabase.auth.signOut(); } catch(e) {} };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Fetch all data once a session is established
  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  // ── Contest tab: auto-refresh live positions ───────────
  // When the user navigates to the contest tab:
  //   - Immediately refresh live positions + data
  //   - Then poll every 60 seconds while the tab is open
  //   - Clear any staged (un-submitted) picks on tab entry
  useEffect(() => {
    if (!session || page !== "contest") return;
    setContestPickStaging([]);
    refreshLivePositions();
    fetchData();
    const interval = setInterval(() => {
      refreshLivePositions();
      fetchData();
    }, 60000);
    return () => clearInterval(interval);
  }, [session, page]);

  // ── fetchData ──────────────────────────────────────────
  // Fetches all tables in parallel. After loading, identifies
  // the logged-in user by email and sets:
  //   - loggedInBagger if they're in the main pool (baggers table)
  //   - loggedInMember if they're only in the contest (contest_members)
  //     In the contest-only case, redirects to the contest page.
  async function fetchData() {
    const [
      { data: b },  // baggers
      { data: p },  // picks (joined with baggers + tournaments)
      { data: t },  // tournaments (ordered by week_number)
      { data: f },  // weekly_field (ordered by OWGR rank)
      { data: po }, // posts (newest first)
      { data: cm }, // contest_members
      { data: cp }, // contest_picks (joined with contest_members + tournaments)
      { data: cs }, // contest_scores (historical, newest first)
    ] = await Promise.all([
      supabase.from("baggers").select("*"),
      supabase.from("picks").select("*, baggers(name, avatar_url), tournaments(week_number, name)"),
      supabase.from("tournaments").select("*").order("week_number"),
      supabase.from("weekly_field").select("*").order("owgr_rank", { ascending: true, nullsFirst: false }),
      supabase.from("posts").select("*").order("created_at", { ascending: false }),
      supabase.from("contest_members").select("*"),
      supabase.from("contest_picks").select("*, contest_members(name), tournaments(week_number, name)"),
      supabase.from("contest_scores").select("*").order("round_date", { ascending: false }),
    ]);

    if (b)  setBaggers(b);
    if (p)  setPicks(p);
    if (t)  setTournaments(t);
    if (f)  setField(f);
    if (po) setPosts(po);
    if (cm) setContestMembers(cm);
    if (cp) setContestPicks(cp);
    if (cs) setContestScores(cs);

    // Identify the logged-in user
    const userEmail = session?.user?.email;
    if (userEmail && b) {
      const match = b.find(bagger =>
        bagger.email.toLowerCase() === userEmail.toLowerCase()
      );
      if (match) {
        // Main pool member
        setLoggedInBagger(match);
        setCurrentBagger(match.name);
        setLoggedInMember(match);
      } else {
        // Check if they're a contest-only member
        const { data: cm2 } = await supabase
          .from("contest_members")
          .select("*")
          .eq("email", userEmail.toLowerCase())
          .single();
        if (cm2) {
          setLoggedInMember(cm2);
          setCurrentBagger(cm2.name);
          setPage("contest");
        }
      }
    }
  }

  // ── refreshLivePositions ───────────────────────────────
  // Calls the get-live-positions Supabase Edge Function,
  // which fetches current leaderboard data from Datagolf
  // and updates the weekly_field table. Only fires when a
  // tournament is currently in progress (between start and
  // end dates). After updating, re-fetches all data.
  async function refreshLivePositions() {
    const now     = new Date();
    const current = tournaments.find(t => {
      if (!t.start_date || !t.end_date) return false;
      const s = new Date(t.start_date + 'T00:00:00');
      const e = tournamentEnd(t);
      return now >= s && now <= e;
    });
    if (current) {
      await fetch("https://iijfldracspwgezcwhtg.supabase.co/functions/v1/get-live-positions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      });
      await fetchData();
    }
  }

  // ── handleLogin ────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  // ── handleLogout ───────────────────────────────────────
  // Signs out and clears all client-side state
  async function handleLogout() {
    try { await supabase.auth.signOut(); } catch (e) { console.log("Logout error:", e); }
    setSession(null);
    setLoggedInBagger(null);
    setLoggedInMember(null);
    setContestPickStaging([]);
    setPicks([]);
    setContestPicks([]);
  }

  // ── uploadAvatar ───────────────────────────────────────
  // Uploads a photo to the "avatars" storage bucket at
  // public/{baggerId}.{ext}, then updates the baggers row.
  async function uploadAvatar(baggerId, file) {
    setUploadingAvatar(true);
    const ext  = file.name.split(".").pop();
    const path = `public/${baggerId}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { console.error("Upload error:", error); setUploadingAvatar(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("baggers").update({ avatar_url: publicUrl }).eq("id", baggerId);
    setBaggers(prev => prev.map(b => b.id === baggerId ? { ...b, avatar_url: publicUrl } : b));
    setUploadingAvatar(false);
    setShowAvatarPicker(null);
  }

  // ── setEmojiAvatar ─────────────────────────────────────
  // Stores a single emoji string as the avatar_url for a bagger
  async function setEmojiAvatar(baggerId, emoji) {
    await supabase.from("baggers").update({ avatar_url: emoji }).eq("id", baggerId);
    setBaggers(prev => prev.map(b => b.id === baggerId ? { ...b, avatar_url: emoji } : b));
    setShowAvatarPicker(null);
  }

  // ── uploadPostImage ────────────────────────────────────
  // Uploads a bulletin board image to the "Post Images" bucket.
  // Returns the public URL on success, null on failure.
  async function uploadPostImage(file) {
    setUploadingPost(true);
    const ext  = file.name.split(".").pop();
    const path = `public/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from("Post Images").upload(path, file, { upsert: false });
    if (error) { console.error("Post image upload error:", error); setUploadingPost(false); return null; }
    const { data: { publicUrl } } = supabase.storage.from("Post Images").getPublicUrl(path);
    setUploadingPost(false);
    return publicUrl;
  }

  // ── Loading / auth screens ─────────────────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", color:"#64748b", fontFamily:"'DM Sans', sans-serif" }}>
      Loading...
    </div>
  );

  // Password-reset screen (shown after clicking email link)
  if (isResetting) return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:24, padding:20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width:140 }} />
      <div style={{ width:"100%", maxWidth:360, background:"rgba(0,51,141,0.15)", border:`1px solid ${BORDER}`, borderRadius:20, padding:40 }}>
        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, color:BILLS_WHITE, marginBottom:4, textAlign:"center" }}>Set New Password</div>
        <div style={{ fontSize:13, color:"#64748b", marginBottom:28, textAlign:"center" }}>Enter your new password below</div>
        {resetMessage && (
          <div style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:8, padding:"10px 14px", color:"#22c55e", fontSize:13, marginBottom:16 }}>{resetMessage}</div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ position:"relative" }}>
            <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 6 characters)" type={showPassword ? "text" : "password"}
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", paddingRight:44, color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
            <button onClick={() => setShowPassword(!showPassword)} type="button"
              style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"#64748b", cursor:"pointer", fontSize:16 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button onClick={async () => {
            if (!newPassword || newPassword.length < 6) { alert("Password must be at least 6 characters."); return; }
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
              if (error.message.includes("different from the old password")) { alert("Please choose a different password than your current one."); }
              else { alert("Error updating password: " + error.message); }
            } else {
              setResetMessage("Password updated successfully! Redirecting...");
              setTimeout(() => { setIsResetting(false); setNewPassword(""); window.location.href = "https://baggersgolf.com"; }, 2000);
            }
          }}
            style={{ background:BILLS_RED, border:"none", borderRadius:10, padding:"12px", color:BILLS_WHITE, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>
            UPDATE PASSWORD
          </button>
        </div>
      </div>
    </div>
  );

  // Login screen (unauthenticated)
  if (!session) return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:24, padding:20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width: isMobile ? 140 : 180 }} />
      <div style={{ width:"100%", maxWidth:360, background:"rgba(0,51,141,0.15)", border:`1px solid ${BORDER}`, borderRadius:20, padding: isMobile ? 24 : 40 }}>
        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, color:BILLS_WHITE, marginBottom:4, textAlign:"center" }}>Welcome Back</div>
        <div style={{ fontSize:13, color:"#64748b", marginBottom:28, textAlign:"center" }}>Sign in to access the pool</div>
        {authError && <div style={{ background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.3)", borderRadius:8, padding:"10px 14px", color:"#f87171", fontSize:13, marginBottom:16 }}>{authError}</div>}
        <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required
            style={{ background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none" }} />
          <div style={{ position:"relative" }}>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type={showPassword ? "text" : "password"} required
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", paddingRight:44, color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
            <button onClick={() => setShowPassword(!showPassword)} type="button"
              style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"#64748b", cursor:"pointer", fontSize:16 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button type="submit" style={{ background:BILLS_RED, border:"none", borderRadius:10, padding:"12px", color:BILLS_WHITE, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", marginTop:4 }}>SIGN IN</button>
        </form>
        <div style={{ textAlign:"center", marginTop:12, fontSize:12, color:"#475569" }}>
          First time logging in? Enter your email above and click Forgot Password to set your password.
        </div>
        <div style={{ textAlign:"center", marginTop:8 }}>
          <button onClick={async () => {
            if (!email) { alert("Enter your email address first then click Forgot Password."); return; }
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://baggersgolf.com/#recovery" });
            if (error) { alert("Error sending reset email: " + error.message); }
            else { alert(`Password reset email sent to ${email}! Check your inbox and click the link within 10 minutes.`); }
          }}
            style={{ background:"transparent", border:"none", color:"#64748b", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", textDecoration:"underline" }}>
            Forgot Password?
          </button>
        </div>
      </div>
    </div>
  );

  // ── Derived data for Dashboard ─────────────────────────
  // totals: { baggerName → total earnings } across all weeks
  const totals = {};
  baggers.forEach(b => { totals[b.name] = 0; });
  picks.forEach(p => {
    if (p.baggers?.name) totals[p.baggers.name] = (totals[p.baggers.name] || 0) + Number(p.earnings || 0);
  });

  // sorted: [ [name, total], ... ] highest→lowest (Dashboard leaderboard order)
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  // weekNums: sorted list of week numbers that have any picks
  const weekNums = [...new Set(picks.map(p => p.tournaments?.week_number))]
    .filter(Boolean)
    .sort((a, b) => a - b);

  // trendData: one row per week, one key per bagger — used in the line chart
  const trendData = weekNums.map(w => {
    const row = { week: `W${w}` };
    baggers.forEach(b => {
      const pick = picks.find(p => p.tournaments?.week_number === w && p.baggers?.name === b.name);
      row[b.name] = pick ? Number(pick.earnings || 0) : 0;
    });
    return row;
  });

  // barData: sorted array for the bar chart
  const barData = sorted.map(([name, total]) => ({ name, total }));

  const today = new Date();
  const m     = isMobile; // shorthand used throughout JSX

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:"100vh", background:BG, color:BILLS_WHITE, fontFamily:"'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />

      {/* ── MOBILE HEADER ── */}
      {m && (
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, background:BG2, borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px" }}>
            <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ height:40 }} />
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:11, color:"#64748b" }}>{weekNums.length}/32 wks</div>
              {(loggedInBagger || loggedInMember) && (
                <button onClick={() => { setProfileData({ ...(loggedInBagger || loggedInMember) }); setShowProfile(true); }}
                  style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:20, padding:"4px 10px 4px 4px", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                  <Avatar bagger={loggedInBagger || loggedInMember} size={24} i={baggers.findIndex(b => b.name === (loggedInBagger || loggedInMember)?.name)} />
                  <span style={{ fontSize:12, color:BILLS_WHITE, fontWeight:600 }}>{(loggedInBagger || loggedInMember)?.username || (loggedInBagger || loggedInMember)?.name}</span>
                </button>
              )}
              <button onClick={handleLogout} style={{ background:"rgba(198,12,48,0.15)", border:`1px solid rgba(198,12,48,0.3)`, borderRadius:8, padding:"6px 12px", color:BILLS_RED, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600 }}>Out</button>
            </div>
          </div>
          {/* Mobile tab bar — filters nav items by pool membership */}
          <div style={{ display:"flex", overflowX:"auto", borderTop:`1px solid ${BORDER}` }}>
            {NAV.filter(item => {
              const userPools = loggedInBagger?.pools || loggedInMember?.pools || ["contest"];
              if (!item.pools.some(p => userPools.includes(p))) return false;
              // Admin-only pages are only visible to Kyle
              if (item.adminOnly && loggedInBagger?.email?.toLowerCase() !== ADMIN_EMAIL) return false;
              return true;
            }).map(item => (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ flex:"0 0 auto", background:"transparent", border:"none", borderBottom: page === item.id ? `2px solid ${BILLS_RED}` : "2px solid transparent", padding:"8px 14px", color: page === item.id ? BILLS_RED : "#64748b", fontFamily:"'DM Sans', sans-serif", fontSize:10, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, minWidth:56, fontWeight: page === item.id ? 600 : 400 }}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                <span style={{ whiteSpace:"nowrap" }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      {!m && (
        <div style={{ position:"fixed", left:0, top:0, bottom:0, width:210, background:BG2, borderRight:`1px solid ${BORDER}`, display:"flex", flexDirection:"column", padding:"24px 14px", zIndex:10 }}>
          <div style={{ marginBottom:24, paddingBottom:20, borderBottom:`1px solid ${BORDER}` }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
              <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width:120 }} />
            </div>
            {(loggedInBagger || loggedInMember) && (
              <button onClick={() => { setProfileData({ ...(loggedInBagger || loggedInMember) }); setShowProfile(true); }}
                style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:12, padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                <Avatar bagger={loggedInBagger || loggedInMember} size={32} i={baggers.findIndex(b => b.name === (loggedInBagger || loggedInMember)?.name)} />
                <div style={{ textAlign:"left", flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(loggedInBagger || loggedInMember)?.username || (loggedInBagger || loggedInMember)?.name}</div>
                  <div style={{ fontSize:10, color:"#475569" }}>Edit Profile</div>
                </div>
                <div style={{ fontSize:12, color:"#475569" }}>⚙️</div>
              </button>
            )}
          </div>
          {/* Desktop nav — same pool filter as mobile */}
          <nav style={{ display:"flex", flexDirection:"column", gap:4, flex:1 }}>
            {NAV.filter(item => {
              const userPools = loggedInBagger?.pools || loggedInMember?.pools || ["contest"];
              if (!item.pools.some(p => userPools.includes(p))) return false;
              if (item.adminOnly && loggedInBagger?.email?.toLowerCase() !== ADMIN_EMAIL) return false;
              return true;
            }).map(item => (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ background: page === item.id ? "rgba(198,12,48,0.15)" : "transparent", border: page === item.id ? "1px solid rgba(198,12,48,0.4)" : "1px solid transparent", borderRadius:10, padding:"10px 14px", color: page === item.id ? "#ff6b6b" : "#64748b", fontFamily:"'DM Sans', sans-serif", fontSize:14, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:10 }}>
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
          <div style={{ background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600, marginBottom:4 }}>2026 SEASON</div>
            <div style={{ fontSize:12, color:"#94a3b8" }}>{weekNums.length} of 32 weeks complete</div>
          </div>
          <button onClick={handleLogout} style={{ background:"transparent", border:`1px solid ${BORDER}`, borderRadius:10, padding:"9px 14px", color:"#475569", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>Sign Out</button>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div style={{ marginLeft: m ? 0 : 210, padding: m ? "100px 16px 24px" : "32px 36px" }}>

        {/* Page heading (desktop only) */}
        {!m && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28, paddingBottom:20, borderBottom:`1px solid ${BORDER}` }}>
            <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:26, color:BILLS_WHITE, margin:0 }}>
              {NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}
            </h1>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:BILLS_RED }} />
              <span style={{ fontSize:12, color:"#64748b" }}>Season Active</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            DASHBOARD PAGE
            Shows: stat cards, season leaderboard, bar
            chart, weekly trend line chart, and the full
            weekly breakdown table.
            All sorted highest→lowest earnings.
        ══════════════════════════════════════════════ */}
        {page === "dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap: m ? 16 : 24 }}>

            {/* Stat cards: Leader, Weeks, Baggers, Total */}
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              {[
                { label:"Leader", value: sorted[0]?.[0] || "—", sub: fmtFull(sorted[0]?.[1] || 0), color: BILLS_RED },
                { label:"Weeks",  value: weekNums.length, sub:"of 32" },
                { label:"Baggers",value: baggers.length,  sub:"In pool" },
                { label:"Total",  value: fmt(sorted.reduce((a,b) => a + b[1], 0)), sub:"Earnings", color:"#4a90d9" },
              ].map(c => (
                <div key={c.label} style={{ flex:1, minWidth: m ? "calc(50% - 6px)" : 140, background:"rgba(0,51,141,0.12)", border:`1px solid ${BORDER}`, borderRadius:14, padding: m ? "14px 16px" : "20px 24px", borderTop:`3px solid ${c.color || BILLS_BLUE}` }}>
                  <div style={{ fontSize:10, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>{c.label}</div>
                  <div style={{ fontSize: m ? 20 : 26, fontFamily:"'Playfair Display', serif", color: c.color || BILLS_WHITE }}>{c.value}</div>
                  {c.sub && <div style={{ fontSize:11, color:"#475569", marginTop:3 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Season Leaderboard — highest earnings first */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Season Leaderboard</span>
              </div>
              {sorted.map(([name, total], i) => {
                const bagger = baggers.find(b => b.name === name);
                return (
                  <div key={name} style={{ display:"flex", alignItems:"center", padding: m ? "10px 16px" : "10px 24px", background: i === 0 ? "rgba(198,12,48,0.08)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", borderLeft: i === 0 ? `3px solid ${BILLS_RED}` : "3px solid transparent", gap:10 }}>
                    <div style={{ width:24, fontFamily:"'DM Mono', monospace", fontSize:12, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                    {bagger && <Avatar bagger={bagger} size={28} i={i} />}
                    <div style={{ flex:1, fontSize:14, color: i === 0 ? BILLS_WHITE : "#94a3b8", fontWeight: i === 0 ? 600 : 400 }}>{name}</div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color: i === 0 ? BILLS_RED : "#64748b" }}>{m ? fmt(total) : fmtFull(total)}</div>
                  </div>
                );
              })}
            </div>

            {/* Bar chart: earnings per bagger */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding: m ? 16 : 20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Earnings by Bagger</span>
              </div>
              <ResponsiveContainer width="100%" height={m ? 180 : 220}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" tick={{ fill:"#64748b", fontSize: m ? 10 : 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fill:"#64748b", fontSize:10 }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip formatter={v => fmtFull(v)} contentStyle={{ background:BG2, border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE }} />
                  <Bar dataKey="total" radius={[6,6,0,0]}>
                    {barData.map((entry, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly trend line chart */}
            {trendData.length > 0 && (
              <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding: m ? 16 : 20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Weekly Earnings Trend</span>
                </div>
                <ResponsiveContainer width="100%" height={m ? 180 : 220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,51,141,0.2)" />
                    <XAxis dataKey="week" tick={{ fill:"#64748b", fontSize: m ? 10 : 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fill:"#64748b", fontSize:10 }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        // Only show when hovering over a data point
                        if (!active || !payload || !payload.length) return null;

                        // Extract the week number from the label (e.g. "W14" → 14)
                        const weekNum = parseInt(label?.replace("W", "")) || 0;

                        // Find the tournament for this week
                        const tourney = tournaments.find(t => t.week_number === weekNum);

                        return (
                          <div style={{ background:BG2, border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", minWidth:200, maxWidth:280 }}>
                            {/* Week + tournament name header */}
                            <div style={{ fontSize:11, color:BILLS_RED, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>{label}</div>
                            {tourney && (
                              <div style={{ fontSize:11, color:"#64748b", marginBottom:10, borderBottom:`1px solid ${BORDER}`, paddingBottom:8 }}>
                                {tourney.name}
                              </div>
                            )}
                            {/* One row per bagger — sorted highest earnings first */}
                            {[...payload]
                              .sort((a, b) => (b.value || 0) - (a.value || 0))
                              .map((entry) => {
                                // Find this bagger's pick for this week
                                const pick = picks.find(p =>
                                  p.baggers?.name === entry.name &&
                                  p.tournaments?.week_number === weekNum
                                );
                                return (
                                  <div key={entry.name} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8, paddingBottom:8, borderBottom:`1px solid rgba(0,51,141,0.1)` }}>
                                    {/* Color dot matching the line color */}
                                    <div style={{ width:8, height:8, borderRadius:"50%", background:entry.color, flexShrink:0, marginTop:4 }} />
                                    <div style={{ flex:1, minWidth:0 }}>
                                      {/* Bagger name + earnings */}
                                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                                        <span style={{ fontSize:12, color:BILLS_WHITE, fontWeight:600 }}>{entry.name}</span>
                                        <span style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color: (entry.value || 0) > 0 ? "#22c55e" : "#475569", fontWeight:700, flexShrink:0 }}>
                                          {entry.value ? fmt(entry.value) : "—"}
                                        </span>
                                      </div>
                                      {/* Golfer pick + finish position */}
                                      {pick ? (
                                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:2 }}>
                                          <span style={{ fontSize:11, color:"#64748b" }}>{pick.golfer_name}</span>
                                          {pick.finish_position ? (
                                            <span style={{ fontSize:10, color: pick.finish_position === 80 ? BILLS_RED : pick.finish_position <= 10 ? "#22c55e" : "#475569", fontFamily:"'DM Mono', monospace" }}>
                                              {pick.finish_position === 80 ? "CUT" : pick.finish_position === 1 ? "🏆 1st" : `T${pick.finish_position}`}
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>No pick</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            }
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ color:"#94a3b8", fontSize: m ? 10 : 12 }} />
                    {baggers.map((b, i) => (
                      <Line key={b.name} type="monotone" dataKey={b.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weekly breakdown table — one row per bagger, one column per week */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Weekly Breakdown</span>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize: m ? 11 : 13 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
                      <th style={{ padding: m ? "8px 12px" : "10px 24px", textAlign:"left", color:"#64748b", fontWeight:500, whiteSpace:"nowrap" }}>Bagger</th>
                      {weekNums.map(w => (
                        <th key={w} style={{ padding: m ? "8px 8px" : "10px 16px", textAlign:"right", color:"#64748b", fontWeight:500 }}>W{w}</th>
                      ))}
                      <th style={{ padding: m ? "8px 12px" : "10px 24px", textAlign:"right", color:BILLS_WHITE, fontWeight:600 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(([name, total], ri) => (
                      <tr key={name} style={{ borderBottom:`1px solid rgba(0,51,141,0.1)`, background: ri % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                        <td style={{ padding: m ? "8px 12px" : "10px 24px", color:"#e2e8f0", fontWeight:500, whiteSpace:"nowrap" }}>{name}</td>
                        {weekNums.map(w => {
                          const pick = picks.find(p => p.tournaments?.week_number === w && p.baggers?.name === name);
                          const amt  = pick ? Number(pick.earnings || 0) : 0;
                          return (
                            <td key={w} style={{ padding: m ? "8px 8px" : "10px 16px", textAlign:"right", color: amt > 500000 ? BILLS_RED : "#64748b", fontFamily:"'DM Mono', monospace", whiteSpace:"nowrap" }}>
                              {m ? fmt(amt) : fmtFull(amt)}
                            </td>
                          );
                        })}
                        <td style={{ padding: m ? "8px 12px" : "10px 24px", textAlign:"right", color:BILLS_WHITE, fontWeight:700, fontFamily:"'DM Mono', monospace", whiteSpace:"nowrap" }}>
                          {m ? fmt(total) : fmtFull(total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            THIS WEEK PAGE
            Shows the active tournament header and the
            full tournament field with live scoring.
            Field can be searched and sorted.
        ══════════════════════════════════════════════ */}
        {page === "thisweek" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Tournament banner — shows for active OR upcoming tournament, pool events only */}
            {(() => {
              // Find active pool tournament first, fall back to any active tournament
              const current =
                tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                  return s <= today && e >= today && t.is_pool_event !== false;
                }) ||
                tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                  return s <= today && e >= today;
                });
              const upcoming = !current && tournaments.find(t => {
                if (!t.start_date) return false;
                const s = new Date(t.start_date + 'T00:00:00');
                return s > today && t.is_pool_event !== false;
              });
              const display = current || upcoming;
              if (!display) return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding:"20px" }}>
                  <div style={{ fontSize:13, color:"#64748b" }}>No tournament currently in progress.</div>
                </div>
              );
              const isLive = !!current;
              const startDate = display.start_date ? new Date(display.start_date).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : null;
              const endDate   = display.end_date   ? new Date(display.end_date).toLocaleDateString("en-US",   { month:"short", day:"numeric" }) : null;
              return (
                <div style={{ background: isLive ? "rgba(198,12,48,0.08)" : "rgba(0,51,141,0.08)", border: isLive ? "1px solid rgba(198,12,48,0.25)" : `1px solid ${BORDER}`, borderRadius:16, padding: m ? "16px" : "20px 28px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontSize:11, color: isLive ? BILLS_RED : "#4a90d9", letterSpacing:"0.1em", fontWeight:700, marginBottom:6 }}>
                        {isLive ? "🔴 LIVE THIS WEEK" : `📅 COMING UP — WEEK ${display.week_number}`}
                      </div>
                      <div style={{ fontFamily:"'Playfair Display', serif", fontSize: m ? 18 : 22, color:BILLS_WHITE, marginBottom:4 }}>{display.name}</div>
                      <div style={{ fontSize:12, color:"#64748b" }}>
                        {display.course}{startDate && endDate ? ` · ${startDate} – ${endDate}` : ""}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:20 }}>
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>PURSE</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:15, color:"#4a90d9", fontWeight:700 }}>${(display.purse/1000000).toFixed(1)}M</div>
                      </div>
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>FIELD</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:15, color:BILLS_WHITE, fontWeight:700 }}>{field.length}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Field table with search + sort */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                    <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>This Week's Field</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ fontSize:11, color:"#475569" }}>{field.length} players</div>
                    {/* Export to Excel button — builds a CSV with all field data and triggers download */}
                    <button onClick={() => {
                      // Define the columns to export
                      const headers = [
                        "Player Name", "Datagolf Name", "OWGR Rank", "Amateur",
                        "Position", "Total To Par", "Thru", "R1", "R2", "R3", "R4",
                        "Event Name", "Picked By"
                      ];
                      // Find the current tournament to look up picks
                      const currentWeek = tournaments.find(t => {
                        const s = new Date(t.start_date + 'T00:00:00');
                        const e = tournamentEnd(t);
                        return s <= today && e >= today && t.is_pool_event !== false;
                      });
                      // Build one row per player with all available data
                      const rows = field.map(player => {
                        const pickedBy = currentWeek
                          ? picks
                              .filter(p => p.tournaments?.week_number === currentWeek.week_number && p.golfer_name?.toLowerCase() === player.player_name?.toLowerCase())
                              .map(p => p.baggers?.name)
                              .join(", ")
                          : "";
                        // Format score columns — blank if null, "E" if even par
                        const fmtScore = (v) => v === null || v === undefined ? "" : v === 0 ? "E" : v > 0 ? `+${v}` : String(v);
                        const fmtPos   = (v) => v === null || v === undefined || v === 0 ? "" : v === 80 ? "CUT" : `T${v}`;
                        return [
                          player.player_name,
                          player.datagolf_name,
                          player.owgr_rank || "",
                          player.amateur ? "Yes" : "No",
                          fmtPos(player.current_position),
                          fmtScore(player.total_to_par),
                          player.thru === 18 ? "F" : player.thru || "",
                          fmtScore(player.r1),
                          fmtScore(player.r2),
                          fmtScore(player.r3),
                          fmtScore(player.r4),
                          player.event_name || "",
                          pickedBy,
                        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
                      });
                      // Combine headers + rows into CSV string
                      const csv      = [headers.join(","), ...rows].join("\n");
                      const blob     = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const url      = URL.createObjectURL(blob);
                      const link     = document.createElement("a");
                      const filename = `${currentWeek?.name || "field"}_field_${new Date().toISOString().split("T")[0]}.csv`;
                      link.setAttribute("href", url);
                      link.setAttribute("download", filename);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"5px 12px", color:"#94a3b8", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                      📥 Export
                    </button>
                  </div>
                </div>
                <input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder="Search golfers..."
                  style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", marginBottom:10, boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {[
                    { id:"position", label:"Leaderboard" },
                    { id:"owgr",     label:"World Ranking" },
                    { id:"name",     label:"Name" },
                    { id:"picked",   label:"Picked By" },
                  ].map(s => (
                    <button key={s.id} onClick={() => setFieldSort(s.id)}
                      style={{ background: fieldSort === s.id ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${fieldSort === s.id ? "rgba(198,12,48,0.4)" : BORDER}`, borderRadius:8, padding:"5px 12px", color: fieldSort === s.id ? BILLS_RED : "#64748b", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight: fieldSort === s.id ? 600 : 400 }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column headers */}
              <div style={{ display:"grid", gridTemplateColumns: m ? "50px 1fr 60px 50px" : "60px 1fr 60px 55px 55px 55px 55px 55px 55px 120px", gap: m ? 6 : 10, padding:"10px 24px", borderBottom:`1px solid rgba(0,51,141,0.15)`, alignItems:"center" }}>
                {(m ? ["OWGR","PLAYER","POS","TOT"] : ["OWGR","PLAYER","POS","TOT","THRU","R1","R2","R3","R4","PICKED BY"]).map(h => (
                  <div key={h} style={{ fontSize:10, color:"#475569", letterSpacing:"0.08em", fontWeight:600, textAlign: h === "OWGR" || h === "PLAYER" ? "left" : "center" }}>{h}</div>
                ))}
              </div>

              {/* Field rows */}
              <div style={{ maxHeight: m ? 500 : 600, overflowY:"auto" }}>
                {(() => {
                  // Match the current pool tournament — exclude companion events (is_pool_event = false)
                  // Falls back to any active tournament if is_pool_event column not yet set
                  const currentWeek = tournaments.find(t => {
                    const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                    return s <= today && e >= today && t.is_pool_event !== false;
                  }) || tournaments.find(t => {
                    const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                    return s <= today && e >= today;
                  });
                  // Annotate each field player with who (if anyone) picked them this week
                  let displayField = field
                    .filter(p => p.player_name.toLowerCase().includes(fieldSearch.toLowerCase()))
                    .map(player => {
                      const pickedBy = currentWeek
                        ? picks
                            .filter(p => p.tournaments?.week_number === currentWeek.week_number && p.golfer_name?.toLowerCase() === player.player_name?.toLowerCase())
                            .map(p => p.baggers?.name)
                            .join(", ")
                        : "";
                      return { ...player, pickedBy };
                    });

                  // Apply sort
                  if (fieldSort === "name")     displayField.sort((a,b) => a.player_name.localeCompare(b.player_name));
                  else if (fieldSort === "position") displayField.sort((a,b) => {
                    // Sort by current leaderboard position ascending.
                    // Players with no position yet (0 or null) go to the bottom.
                    // If neither player has a position yet, fall back to OWGR rank
                    // so the list isn't random during pre-tournament or between rounds.
                    const posA = a.current_position && a.current_position > 0 ? a.current_position : null;
                    const posB = b.current_position && b.current_position > 0 ? b.current_position : null;
                    if (posA !== null && posB !== null) return posA - posB;
                    if (posA !== null) return -1;  // A has position, B doesn't → A first
                    if (posB !== null) return 1;   // B has position, A doesn't → B first
                    // Neither has a position — fall back to OWGR rank
                    return (a.owgr_rank || 9999) - (b.owgr_rank || 9999);
                  });
                  else if (fieldSort === "picked") displayField.sort((a,b) => {
                    if (a.pickedBy && !b.pickedBy) return -1;
                    if (!a.pickedBy && b.pickedBy) return 1;
                    return 0;
                  });

                  if (displayField.length === 0)
                    return <div style={{ padding:40, textAlign:"center", color:"#475569", fontSize:14 }}>No golfers found</div>;

                  return displayField.map((player, i) => (
                    <div key={player.id} style={{ display:"grid", gridTemplateColumns: m ? "50px 1fr 60px 50px" : "60px 1fr 60px 55px 55px 55px 55px 55px 55px 100px", gap: m ? 6 : 10, padding: m ? "8px 16px" : "10px 24px", borderBottom:`1px solid rgba(0,51,141,0.06)`, background: player.pickedBy ? "rgba(198,12,48,0.05)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", alignItems:"center" }}>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize: m ? 11 : 12, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>{player.owgr_rank ? `#${player.owgr_rank}` : "—"}</div>
                      <div style={{ fontSize: m ? 12 : 13, color: player.pickedBy ? BILLS_WHITE : "#94a3b8", fontWeight: player.pickedBy ? 600 : 400 }}>
                        {player.player_name}
                        {player.amateur && <span style={{ fontSize:10, color:"#475569", marginLeft:4 }}>(A)</span>}
                      </div>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: player.current_position && player.current_position <= 10 ? BILLS_RED : "#64748b", textAlign:"center" }}>
                        {player.current_position ? `T${player.current_position}` : "—"}
                      </div>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: player.total_to_par < 0 ? "#22c55e" : player.total_to_par > 0 ? "#ef4444" : player.total_to_par === 0 ? "#64748b" : "#475569", textAlign:"center" }}>
                        {player.total_to_par !== null && player.total_to_par !== undefined
                          ? player.total_to_par > 0 ? `+${player.total_to_par}` : player.total_to_par === 0 ? "E" : player.total_to_par
                          : "—"}
                      </div>
                      {!m && <>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color:"#64748b", textAlign:"center" }}>
                          {player.thru !== null && player.thru !== undefined ? (player.thru === 18 ? "F" : `${player.thru}`) : "—"}
                        </div>
                        {[player.r1, player.r2, player.r3, player.r4].map((r, ri) => (
                          <div key={ri} style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: r !== null && r < 0 ? "#22c55e" : r > 0 ? "#ef4444" : "#64748b", textAlign:"center" }}>
                            {r !== null && r !== undefined ? r > 0 ? `+${r}` : r === 0 ? "E" : r : "—"}
                          </div>
                        ))}
                        <div style={{ fontSize:12, color:BILLS_RED, fontWeight:600, textAlign:"center" }}>{player.pickedBy || ""}</div>
                      </>}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            MY PICK PAGE
            Lets the logged-in bagger select their golfer
            for the current (or upcoming) tournament.
            Pick availability enforced by:
              - Picks open Monday 6am ET (3 days before start)
              - Deadline: tournament pick_deadline (Thu 8am ET)
              - Golfers already picked in prior weeks are hidden
        ══════════════════════════════════════════════ */}
        {page === "mypick" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {(() => {
              const now = new Date();

              // Find active (in-progress) tournament
              const activeTournament = tournaments.find(t => {
                if (!t.start_date || !t.end_date) return false;
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return now >= s && now <= e;
              });

              // Find next tournament where picks are open (Mon→Thu window)
              const nextPickableTournament = tournaments.find(t => {
                if (!t.start_date || !t.pick_deadline) return false;
                const s        = new Date(t.start_date + 'T00:00:00');
                const deadline = new Date(t.pick_deadline);
                const monday   = new Date(s);
                monday.setDate(s.getDate() - 3);
                monday.setHours(11, 0, 0, 0);
                monday.setMinutes(0, 0, 0);
                return now >= monday && now < deadline;
              });

              const currentTournament = activeTournament || nextPickableTournament;

              if (!currentTournament) return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding:40, textAlign:"center" }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>⛳</div>
                  <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, color:BILLS_WHITE }}>No upcoming tournament</div>
                  <div style={{ fontSize:13, color:"#64748b", marginTop:8 }}>Check back soon!</div>
                </div>
              );

              const deadline       = currentTournament.pick_deadline ? new Date(currentTournament.pick_deadline) : null;
              const isLocked       = currentTournament.picks_locked || (deadline && new Date() > deadline);
              const myPicks        = picks.filter(p => p.baggers?.name === loggedInBagger?.name);
              const myCurrentPick  = myPicks.find(p => p.tournaments?.week_number === currentTournament.week_number);
              // Golfers used in prior weeks (not current) — blocked from re-selection
              // We normalize special characters (e.g. Å→A, é→e) before comparing
              // so that name variations between our picks table and the Datagolf
              // field data don't cause already-used golfers to appear available.
              const normalizeForCompare = (str) =>
                (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
              const myPriorUsed    = myPicks
                .filter(p => p.tournaments?.week_number !== currentTournament.week_number)
                .map(p => normalizeForCompare(p.golfer_name));
              // Show ALL field players — used ones are color-coded, not hidden
              const myPriorPicks   = myPicks
                .filter(p => p.tournaments?.week_number !== currentTournament.week_number)
                .sort((a,b) => b.tournaments?.week_number - a.tournaments?.week_number);

              return (
                <>
                  {/* Tournament banner */}
                  <div style={{ background: isLocked ? "rgba(255,255,255,0.04)" : "rgba(198,12,48,0.08)", border:`1px solid ${isLocked ? BORDER : "rgba(198,12,48,0.25)"}`, borderRadius:14, padding:"16px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      {loggedInBagger && <Avatar bagger={loggedInBagger} size={36} i={baggers.findIndex(b => b.name === loggedInBagger.name)} />}
                      <div>
                        <div style={{ fontSize:11, color: isLocked ? "#475569" : BILLS_RED, letterSpacing:"0.1em", fontWeight:700 }}>{isLocked ? "🔒 PICKS LOCKED" : `🎯 WEEK ${currentTournament.week_number} — MAKE YOUR PICK`}</div>
                        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE }}>{currentTournament.name}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:20, alignItems:"center" }}>
                      {deadline && (
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:10, color:"#475569", marginBottom:2 }}>DEADLINE</div>
                          <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color: isLocked ? "#475569" : BILLS_RED }}>
                            {deadline.toLocaleDateString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                          </div>
                        </div>
                      )}
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:10, color:"#475569", marginBottom:2 }}>PURSE</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:"#4a90d9", fontWeight:700 }}>${(currentTournament.purse/1000000).toFixed(1)}M</div>
                      </div>
                    </div>
                  </div>

                  {/* Two-column layout: available golfers | current pick + prior picks */}
                  <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap: m ? "wrap" : "nowrap" }}>

                    {/* Left: available golfers list */}
                    <div style={{ flex: m ? "1 1 100%" : "1 1 0", background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden", minWidth:0 }}>
                      <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
                          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Week {currentTournament.week_number} — {currentTournament.name}</span>
                          <span style={{ fontSize:11, color:"#475569", marginLeft:"auto" }}>{field.filter(p => !myPriorUsed.includes(normalizeForCompare(p.player_name))).length} available</span>
                        </div>
                        <input value={searchPick} onChange={e => setSearchPick(e.target.value)} placeholder="Search golfers..."
                          style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
                        {/* Legend — fixed at top of list */}
                        <div style={{ display:"flex", gap:12, marginTop:10, flexWrap:"wrap" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)" }} />
                            Available
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:"rgba(198,12,48,0.2)", border:"1px solid rgba(198,12,48,0.5)" }} />
                            Selected
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:"rgba(100,116,139,0.15)", border:"1px solid rgba(100,116,139,0.3)" }} />
                            Already used this season — cannot re-pick
                          </div>
                        </div>
                      </div>
                      <div style={{ maxHeight: m ? 300 : 480, overflowY:"auto" }}>
                        {field.filter(p => p.player_name.toLowerCase().includes(searchPick.toLowerCase())).length === 0
                          ? <div style={{ padding:20, textAlign:"center", color:"#475569", fontSize:13 }}>No golfers found</div>
                          : field
                              .filter(p => p.player_name.toLowerCase().includes(searchPick.toLowerCase()))
                              .map((player, i) => {
                                const isSelected  = selectedPick === player.player_name;
                                const alreadyUsed = myPriorUsed.includes(normalizeForCompare(player.player_name));
                                const isCurrentPick = normalizeForCompare(player.player_name) === normalizeForCompare(myCurrentPick?.golfer_name);
                                // Color scheme:
                                //   red bg     = currently selected this session
                                //   grey/muted = already used in a prior week (blocked)
                                //   normal     = available to pick
                                const rowBg = isSelected
                                  ? "rgba(198,12,48,0.12)"
                                  : alreadyUsed && !isCurrentPick
                                    ? "rgba(100,116,139,0.08)"
                                    : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
                                const nameColor = isSelected
                                  ? BILLS_WHITE
                                  : alreadyUsed && !isCurrentPick
                                    ? "#334155"
                                    : "#94a3b8";
                                return (
                                  <div key={player.id}
                                    style={{ display:"flex", alignItems:"center", padding:"10px 16px", borderBottom:`1px solid rgba(0,51,141,0.08)`, background: rowBg, borderLeft: isSelected ? `3px solid ${BILLS_RED}` : alreadyUsed && !isCurrentPick ? "3px solid rgba(100,116,139,0.3)" : "3px solid transparent", cursor: isLocked || (alreadyUsed && !isCurrentPick) ? "default" : "pointer", opacity: alreadyUsed && !isCurrentPick ? 0.45 : 1 }}
                                    onClick={() => {
                                      if (isLocked) return;
                                      if (alreadyUsed && !isCurrentPick) return; // block re-pick
                                      setSelectedPick(isSelected ? "" : player.player_name);
                                    }}>
                                    <div style={{ width:44, fontFamily:"'DM Mono', monospace", fontSize:11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>{player.owgr_rank ? `#${player.owgr_rank}` : "—"}</div>
                                    <div style={{ flex:1, fontSize:13, color: nameColor, fontWeight: isSelected ? 600 : 400 }}>
                                      {player.player_name}
                                      {alreadyUsed && !isCurrentPick && <span style={{ fontSize:10, color:"#334155", marginLeft:6 }}>already used</span>}
                                    </div>
                                    {isSelected && <div style={{ fontSize:13, color:BILLS_RED, fontWeight:700 }}>✓</div>}
                                  </div>
                                );
                              })
                        }
                      </div>
                    </div>

                    {/* Arrow divider (desktop only) */}
                    {!m && (
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", paddingTop:180, flexShrink:0 }}>
                        <div style={{ width:0, height:0, borderTop:"16px solid transparent", borderBottom:"16px solid transparent", borderLeft:`24px solid ${selectedPick ? BILLS_RED : BORDER}`, transition:"border-left-color 0.2s" }} />
                      </div>
                    )}

                    {/* Right: current pick + prior picks */}
                    <div style={{ flex: m ? "1 1 100%" : "1 1 0", display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>

                      {/* This week's pick card */}
                      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
                          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>This Week's Pick</span>
                        </div>
                        <div style={{ padding:16 }}>
                          {selectedPick ? (
                            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:12 }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:11, color:BILLS_RED, marginBottom:2 }}>SELECTED</div>
                                <div style={{ fontSize:18, color:BILLS_WHITE, fontWeight:700 }}>{selectedPick}</div>
                              </div>
                              {!isLocked && <button onClick={() => setSelectedPick("")} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:18 }}>✕</button>}
                            </div>
                          ) : myCurrentPick ? (
                            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:12 }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:11, color:"#22c55e", marginBottom:2 }}>CURRENT PICK</div>
                                <div style={{ fontSize:18, color:BILLS_WHITE, fontWeight:700 }}>{myCurrentPick.golfer_name}</div>
                                {!isLocked && <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Click a golfer to change</div>}
                              </div>
                              <div style={{ fontSize:22 }}>✅</div>
                            </div>
                          ) : (
                            <div style={{ padding:"20px 0", textAlign:"center", color:"#475569", fontSize:13 }}>
                              {isLocked ? "No pick submitted" : "← Click a golfer to select"}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prior picks list */}
                      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:4, height:16, background:"#334155", borderRadius:2 }} />
                          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:"#64748b" }}>Prior Picks</span>
                        </div>
                        <div style={{ maxHeight:280, overflowY:"auto" }}>
                          {myPriorPicks.length === 0
                            ? <div style={{ padding:20, textAlign:"center", color:"#334155", fontSize:13 }}>No prior picks yet</div>
                            : myPriorPicks.map(pick => {
                                const t = tournaments.find(t => t.week_number === pick.tournaments?.week_number);
                                return (
                                  <div key={pick.id} style={{ display:"flex", alignItems:"center", padding:"10px 16px", borderBottom:`1px solid rgba(0,51,141,0.06)`, opacity:0.5 }}>
                                    <div style={{ width:40, fontFamily:"'DM Mono', monospace", fontSize:11, color:"#475569" }}>W{pick.tournaments?.week_number}</div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, color:"#64748b", fontWeight:500 }}>{pick.golfer_name}</div>
                                      <div style={{ fontSize:11, color:"#334155" }}>{t?.name || pick.tournaments?.name}</div>
                                    </div>
                                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color: Number(pick.earnings || 0) > 0 ? "#22c55e" : "#334155" }}>
                                      {Number(pick.earnings || 0) > 0 ? `$${(Number(pick.earnings)/1000).toFixed(0)}K` : "—"}
                                    </div>
                                  </div>
                                );
                              })
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submit pick button */}
                  {!isLocked && (
                    <button onClick={async () => {
                      if (!selectedPick || !loggedInBagger || !currentTournament) return;
                      const fieldPlayer = field.find(p => p.player_name === selectedPick);
                      const { error } = await supabase.from("picks").upsert({
                        bagger_id:     loggedInBagger.id,
                        tournament_id: currentTournament.id,
                        golfer_name:   selectedPick,
                        // datagolf_name stored for reliable API matching during live scoring
                        datagolf_name: fieldPlayer?.datagolf_name || null,
                        earnings:      0,
                      }, { onConflict: "bagger_id,tournament_id" });
                      if (!error) { await fetchData(); setSelectedPick(""); }
                      else { alert("Something went wrong. Please try again."); }
                    }}
                      disabled={!selectedPick}
                      style={{ width:"100%", background: selectedPick ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:12, padding:"16px", color: selectedPick ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor: selectedPick ? "pointer" : "default", letterSpacing:"0.04em", transition:"background 0.2s" }}>
                      {selectedPick ? `⛳ Submit ${selectedPick} as My Week ${currentTournament.week_number} Pick →` : "Select a golfer from the list"}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            PICKS BY WEEK PAGE
            Shows each completed tournament as a card
            with all picks sorted by earnings (best first).
            Weeks shown newest first (sorted desc).
        ══════════════════════════════════════════════ */}
        {page === "picks" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {tournaments
              .filter(t => picks.some(p => p.tournaments?.week_number === t.week_number))
              .sort((a,b) => b.week_number - a.week_number)
              .map(t => (
                <div key={t.id} style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                  <div style={{ padding: m ? "12px 16px" : "14px 24px", borderBottom:`1px solid ${BORDER}`, background:"rgba(0,51,141,0.1)" }}>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize: m ? 14 : 15, color:BILLS_WHITE }}>{t.name}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Week {t.week_number} · {fmt(t.purse || 0)}</div>
                  </div>
                  <div style={{ padding:8 }}>
                    {picks
                      .filter(p => p.tournaments?.week_number === t.week_number)
                      .sort((a,b) => Number(b.earnings || 0) - Number(a.earnings || 0))
                      .map((pick, i) => {
                        const bagger = baggers.find(b => b.name === pick.baggers?.name);
                        const bi     = baggers.findIndex(b => b.name === pick.baggers?.name);
                        return (
                          <div key={pick.id} style={{ display:"flex", alignItems:"center", padding: m ? "8px 12px" : "10px 16px", borderRadius:8, gap:10, background: i === 0 ? "rgba(198,12,48,0.05)" : "transparent" }}>
                            <div style={{ width:20, fontFamily:"'DM Mono', monospace", fontSize:11, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                            {bagger && <Avatar bagger={bagger} size={26} i={bi} />}
                            <div style={{ width: m ? 50 : 60, fontSize:13, color:BILLS_WHITE, fontWeight:500 }}>{pick.baggers?.name}</div>
                            <div style={{ flex:1, fontSize: m ? 12 : 13, color:"#64748b" }}>{pick.golfer_name}</div>
                            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                              <div style={{ fontFamily:"'DM Mono', monospace", fontSize: m ? 11 : 13, color: Number(pick.earnings || 0) > 500000 ? BILLS_RED : "#64748b" }}>
                                {m ? fmt(Number(pick.earnings || 0)) : fmtFull(Number(pick.earnings || 0))}
                              </div>
                              {pick.finish_position && (
                                <div style={{ fontSize:10, color: pick.finish_position <= 10 ? "#22c55e" : "#475569", fontFamily:"'DM Mono', monospace" }}>
                                  {pick.finish_position === 1 ? "🏆 1st" : `T${pick.finish_position}`}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ══════════════════════════════════════════════
            BULLETIN BOARD PAGE
            Members can post trash talk, pick alerts,
            or news. Supports @mentions (sends email
            notification via send-tag-notification Edge
            Function), image uploads, and emoji reactions.
        ══════════════════════════════════════════════ */}
        {page === "board" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Post composer */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding: m ? 16 : 24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Post to the Board</span>
              </div>
              {/* Who's posting */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, background:"rgba(0,51,141,0.12)", border:`1px solid ${BORDER}`, borderRadius:12, padding:"10px 16px" }}>
                {loggedInBagger && <Avatar bagger={loggedInBagger} size={32} i={baggers.findIndex(b => b.name === loggedInBagger.name)} />}
                <div>
                  <div style={{ fontSize:11, color:"#64748b" }}>Posting as</div>
                  <div style={{ fontSize:15, color:BILLS_WHITE, fontWeight:600 }}>{loggedInBagger?.name || "Unknown"}</div>
                </div>
              </div>
              {/* Category selector */}
              <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                {[
                  { id:"banter",       label:"🗣️ Trash Talk" },
                  { id:"pick",         label:"⛳ Pick Alert" },
                  { id:"announcement", label:"📢 News" },
                ].map(c => (
                  <button key={c.id} onClick={() => setPostCategory(c.id)}
                    style={{ background: postCategory === c.id ? "rgba(0,51,141,0.3)" : "rgba(255,255,255,0.03)", border:`1px solid ${postCategory === c.id ? "rgba(0,51,141,0.5)" : BORDER}`, borderRadius:8, padding:"5px 12px", color: postCategory === c.id ? "#93c5fd" : "#475569", fontSize:12, cursor:"pointer" }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {/* Text area with @mention autocomplete */}
              <div style={{ position:"relative" }}>
                <textarea value={newPost} onChange={e => {
                  const val = e.target.value;
                  setNewPost(val);
                  // Detect @ character and show autocomplete dropdown
                  const lastAtIndex = val.lastIndexOf("@");
                  if (lastAtIndex !== -1) {
                    const query  = val.slice(lastAtIndex + 1).toLowerCase();
                    const matches = baggers.filter(b => b.name.toLowerCase().startsWith(query) && b.name !== currentBagger);
                    setMentionQuery(query);
                    setMentionMatches(matches);
                    setShowMentionDropdown(matches.length > 0);
                  } else {
                    setShowMentionDropdown(false);
                  }
                }} placeholder="Trash talk welcome... type @ to tag someone 🏌️" rows={3}
                  style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none", resize:"vertical", boxSizing:"border-box" }} />

                {/* @mention dropdown */}
                {showMentionDropdown && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, background:BG2, border:`1px solid ${BORDER}`, borderRadius:10, zIndex:100, overflow:"hidden", marginTop:4 }}>
                    {mentionMatches.map(b => (
                      <div key={b.name} onClick={async () => {
                        // Replace the partial @query with @FullName in text
                        const lastAtIndex = newPost.lastIndexOf("@");
                        const newText = newPost.slice(0, lastAtIndex) + `@${b.name} `;
                        setNewPost(newText);
                        setShowMentionDropdown(false);
                        // Fire tag notification email via Edge Function
                        await fetch("https://iijfldracspwgezcwhtg.supabase.co/functions/v1/send-tag-notification", {
                          method: "POST",
                          headers: {
                            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            tagged_name: b.name,
                            posted_by:   currentBagger,
                            content:     newText,
                          }),
                        });
                      }}
                        style={{ padding:"10px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${BORDER}` }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(198,12,48,0.1)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <Avatar bagger={b} size={24} i={baggers.findIndex(x => x.name === b.name)} />
                        <span style={{ fontSize:13, color:BILLS_WHITE }}>{b.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Photo attachment */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8 }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, color:"#64748b" }}>
                  📷 Add Photo
                  <input type="file" accept="image/*" capture="environment" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) { setPostImage(file); setPostImagePreview(URL.createObjectURL(file)); }
                  }} style={{ display:"none" }} />
                </label>
                {uploadingPost && <span style={{ fontSize:12, color:"#f59e0b" }}>Uploading...</span>}
              </div>
              {postImagePreview && (
                <div style={{ marginTop:10, position:"relative", display:"inline-block" }}>
                  <img src={postImagePreview} alt="Preview" style={{ maxWidth:"100%", maxHeight:200, borderRadius:10, border:`1px solid ${BORDER}` }} />
                  <button onClick={() => { setPostImage(null); setPostImagePreview(null); }}
                    style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.6)", border:"none", borderRadius:"50%", width:24, height:24, color:"white", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              )}

              {/* Submit post */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
                <div style={{ fontSize:11, color:"#475569" }}>{currentBagger ? `As ${currentBagger}` : "Pick your name"}</div>
                <button onClick={async () => {
                  if (!newPost.trim() || !currentBagger) return;
                  let imageUrl = null;
                  if (postImage) { imageUrl = await uploadPostImage(postImage); }
                  const { data } = await supabase.from("posts")
                    .insert({ bagger_name: currentBagger, content: newPost.trim(), category: postCategory, reactions: {}, image_url: imageUrl })
                    .select();
                  if (data) { setPosts(prev => [data[0], ...prev]); setNewPost(""); setPostImage(null); setPostImagePreview(null); }
                }}
                  style={{ background: currentBagger && newPost.trim() ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:10, padding:"9px 20px", color: currentBagger && newPost.trim() ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  Post 📌
                </button>
              </div>
            </div>

            {posts.length === 0 && (
              <div style={{ padding:40, textAlign:"center", color:"#475569", fontSize:14 }}>No posts yet — be the first! 🏌️</div>
            )}

            {/* Post feed */}
            {posts.map(post => {
              const cats = {
                banter:       { bg:"rgba(198,12,48,0.06)",   border:"rgba(198,12,48,0.2)",   label:"🗣️ Trash Talk", color:BILLS_RED },
                pick:         { bg:"rgba(0,51,141,0.08)",    border:"rgba(0,51,141,0.25)",   label:"⛳ Pick Alert",  color:"#4a90d9" },
                announcement: { bg:"rgba(255,255,255,0.04)", border:"rgba(255,255,255,0.1)", label:"📢 News",        color:"#f59e0b" },
              };
              const cat    = cats[post.category] || cats.banter;
              const bagger = baggers.find(bg => bg.name === post.bagger_name);
              const bi     = baggers.findIndex(bg => bg.name === post.bagger_name);
              return (
                <div key={post.id} style={{ background:cat.bg, border:`1px solid ${cat.border}`, borderRadius:14, padding: m ? 14 : 20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      {bagger && <Avatar bagger={bagger} size={34} i={bi} />}
                      <div>
                        <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600 }}>{post.bagger_name}</div>
                        <div style={{ fontSize:10, color:"#475569" }}>{new Date(post.created_at).toLocaleDateString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
                      </div>
                      <span style={{ fontSize:10, background:`${cat.color}22`, color:cat.color, borderRadius:20, padding:"2px 8px", fontWeight:600 }}>{cat.label}</span>
                    </div>
                    <button onClick={async () => {
                      await supabase.from("posts").delete().eq("id", post.id);
                      setPosts(prev => prev.filter(p => p.id !== post.id));
                    }} style={{ background:"transparent", border:"none", color:"#334155", cursor:"pointer", fontSize:14 }}>✕</button>
                  </div>
                  <p style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.6, margin:"0 0 12px" }}>{post.content}</p>
                  {post.image_url && (
                    <div style={{ marginBottom:12 }}>
                      <img src={post.image_url} alt="Post image" onClick={() => setExpandedImage(post.image_url)}
                        style={{ maxWidth:"100%", maxHeight:300, borderRadius:10, border:`1px solid ${BORDER}`, cursor:"pointer", objectFit:"cover" }} />
                      <div style={{ fontSize:10, color:"#475569", marginTop:4 }}>Click to expand</div>
                    </div>
                  )}
                  {/* Emoji reactions */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {["🔥","😂","💀","👏","🏌️","⛳"].map(emoji => {
                      const count = post.reactions?.[emoji] || 0;
                      return (
                        <button key={emoji} onClick={async () => {
                          const updated = { ...post.reactions, [emoji]: (post.reactions?.[emoji] || 0) + 1 };
                          await supabase.from("posts").update({ reactions: updated }).eq("id", post.id);
                          setPosts(prev => prev.map(p => p.id === post.id ? { ...p, reactions: updated } : p));
                        }}
                          style={{ background: count > 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", border:`1px solid ${count > 0 ? "rgba(255,255,255,0.15)" : BORDER}`, borderRadius:20, padding:"3px 8px", cursor:"pointer", fontSize:12, color:"#94a3b8", display:"flex", alignItems:"center", gap:3 }}>
                          {emoji}{count > 0 && <span style={{ fontSize:10 }}>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            SCHEDULE PAGE
            Lists all 32 pool tournaments for the 2026
            season. Shows status: LIVE, DONE, SKIPPED,
            UPCOMING. Uses the PREVIOUS_WINNERS map for
            the "Prev. Winner" column.
        ══════════════════════════════════════════════ */}
        {page === "schedule" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {!m && (
              <div style={{ display:"grid", gridTemplateColumns:"48px 1fr 120px 90px 150px 100px", gap:16, padding:"8px 20px", marginBottom:4 }}>
                {["WK","TOURNAMENT / COURSE","DATES","PURSE","PREV. WINNER","STATUS"].map(h => (
                  <div key={h} style={{ fontSize:10, color:"#475569", letterSpacing:"0.1em", fontWeight:600 }}>{h}</div>
                ))}
              </div>
            )}
            {tournaments.map(t => {
              const startDate  = t.start_date ? new Date(t.start_date + 'T00:00:00') : null;
              const endDate    = t.end_date   ? tournamentEnd(t) : null;
              const isCompleted= endDate && endDate < today;
              const isCurrent  = startDate && endDate && startDate <= today && endDate >= today;
              const isUpcoming = startDate && startDate > today;
              const hasPicks   = picks.some(p => p.tournaments?.week_number === t.week_number);
              const prevWinner = PREVIOUS_WINNERS[t.name] || "—";

              return m ? (
                // Mobile: compact card
                <div key={t.id} style={{ background: isCurrent ? "rgba(198,12,48,0.06)" : "rgba(0,51,141,0.05)", border:`1px solid ${isCurrent ? "rgba(198,12,48,0.25)" : BORDER}`, borderRadius:12, padding:"12px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: isCurrent ? BILLS_RED : "#475569", background:"rgba(0,51,141,0.15)", padding:"2px 6px", borderRadius:4 }}>W{t.week_number}</span>
                        {isCurrent  && <span style={{ fontSize:10, background:"rgba(198,12,48,0.15)", color:BILLS_RED,   borderRadius:20, padding:"2px 8px", fontWeight:700 }}>🔴 LIVE</span>}
                        {isCompleted && hasPicks  && <span style={{ fontSize:10, background:"rgba(0,51,141,0.2)", color:"#4a90d9", borderRadius:20, padding:"2px 8px" }}>✓ Done</span>}
                        {isCompleted && !hasPicks && <span style={{ fontSize:10, color:"#334155" }}>Skipped</span>}
                        {isUpcoming  && <span style={{ fontSize:10, color:"#475569" }}>Upcoming</span>}
                      </div>
                      <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:500 }}>{t.name}</div>
                      <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>
                        {startDate ? startDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"} – {endDate ? endDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"}
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color:"#4a90d9", fontWeight:600 }}>{fmt(t.purse || 0)}</div>
                      <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{prevWinner}</div>
                    </div>
                  </div>
                </div>
              ) : (
                // Desktop: full grid row
                <div key={t.id} style={{ display:"grid", gridTemplateColumns:"48px 1fr 120px 90px 150px 100px", gap:16, padding:"14px 20px", background: isCurrent ? "rgba(198,12,48,0.06)" : "rgba(0,51,141,0.05)", border:`1px solid ${isCurrent ? "rgba(198,12,48,0.25)" : BORDER}`, borderRadius:12, alignItems:"center" }}>
                  <div style={{ width:36, height:36, borderRadius:8, background: isCompleted && hasPicks ? "rgba(198,12,48,0.15)" : isCurrent ? "rgba(198,12,48,0.2)" : "rgba(0,51,141,0.15)", border:`1px solid ${(isCompleted && hasPicks) || isCurrent ? "rgba(198,12,48,0.3)" : BORDER}`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono', monospace", fontSize:13, fontWeight:600, color:(isCompleted && hasPicks) || isCurrent ? BILLS_RED : "#475569" }}>{t.week_number}</div>
                  <div>
                    <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:500, marginBottom:2 }}>{t.name}</div>
                    <div style={{ fontSize:11, color:"#475569" }}>{t.course}</div>
                  </div>
                  <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color:"#64748b" }}>
                    {startDate ? startDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"} – {endDate ? endDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"}
                  </div>
                  <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color:"#4a90d9", fontWeight:600 }}>{fmt(t.purse || 0)}</div>
                  <div style={{ fontSize:12, color:"#64748b" }}>{prevWinner}</div>
                  <div>
                    {isCurrent   && <span style={{ fontSize:10, background:"rgba(198,12,48,0.15)", color:BILLS_RED,   borderRadius:20, padding:"3px 10px", fontWeight:700 }}>🔴 LIVE</span>}
                    {isCompleted && hasPicks  && <span style={{ fontSize:10, background:"rgba(0,51,141,0.2)", color:"#4a90d9", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>✓ DONE</span>}
                    {isCompleted && !hasPicks && <span style={{ fontSize:10, background:"rgba(255,255,255,0.04)", color:"#334155", borderRadius:20, padding:"3px 10px" }}>SKIPPED</span>}
                    {isUpcoming  && <span style={{ fontSize:10, background:"rgba(255,255,255,0.04)", color:"#475569", borderRadius:20, padding:"3px 10px" }}>UPCOMING</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            MEMBERS PAGE
            Shows profile cards for each main-pool bagger,
            sorted by season earnings (highest first).
            Includes avatar picker and season stats.
        ══════════════════════════════════════════════ */}
        {page === "members" && (
          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap:16 }}>
            {sorted.map(([name, total], i) => {
              const bagger = baggers.find(b => b.name === name);
              if (!bagger) return null;
              return (
                <div key={bagger.id} style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${i === 0 ? "rgba(198,12,48,0.3)" : BORDER}`, borderRadius:16, padding: m ? 16 : 20, borderTop:`3px solid ${COLORS[i % COLORS.length]}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                    <div style={{ position:"relative" }}>
                      <Avatar bagger={bagger} size={44} i={i} />
                      <button onClick={() => setShowAvatarPicker(showAvatarPicker === bagger.id ? null : bagger.id)}
                        style={{ position:"absolute", bottom:-2, right:-2, width:18, height:18, borderRadius:"50%", background:BILLS_RED, border:"none", cursor:"pointer", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", color:"white" }}>
                        ✏️
                      </button>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, color:BILLS_WHITE, fontWeight:600 }}>{bagger.name}</div>
                      <div style={{ fontSize:11, color:"#475569" }}>{bagger.email}</div>
                    </div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, color: i === 0 ? BILLS_RED : "#475569", fontWeight:700 }}>#{i+1}</div>
                  </div>

                  {/* Inline avatar picker */}
                  {showAvatarPicker === bagger.id && (
                    <div style={{ background:"rgba(0,0,0,0.3)", border:`1px solid ${BORDER}`, borderRadius:12, padding:12, marginBottom:14 }}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:8 }}>PICK AN AVATAR</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                        {PRESET_AVATARS.map(emoji => (
                          <button key={emoji} onClick={() => setEmojiAvatar(bagger.id, emoji)}
                            style={{ width:34, height:34, borderRadius:8, background: bagger.avatar_url === emoji ? "rgba(198,12,48,0.2)" : "rgba(255,255,255,0.05)", border:`1px solid ${bagger.avatar_url === emoji ? "rgba(198,12,48,0.4)" : BORDER}`, cursor:"pointer", fontSize:16 }}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div style={{ borderTop:`1px solid ${BORDER}`, paddingTop:10 }}>
                        <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>OR UPLOAD A PHOTO</div>
                        <input type="file" accept="image/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) await uploadAvatar(bagger.id, file);
                        }} style={{ fontSize:11, color:"#64748b", width:"100%" }} />
                        {uploadingAvatar && <div style={{ fontSize:11, color:"#f59e0b", marginTop:4 }}>Uploading...</div>}
                      </div>
                    </div>
                  )}

                  <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderTop:`1px solid ${BORDER}` }}>
                    <div style={{ fontSize:12, color:"#64748b" }}>Season Total</div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:BILLS_WHITE, fontWeight:600 }}>{m ? fmt(total) : fmtFull(total)}</div>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0" }}>
                    <div style={{ fontSize:12, color:"#64748b" }}>Weeks Played</div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:"#94a3b8" }}>{picks.filter(p => p.baggers?.name === name).length}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            MOOKIE'S POOL PAGE
            Scoring: pick 5 golfers, best 4 net scores
            count. Net score = finish position + OWGR
            weighting. Lower total = better (golf style).

            Sections:
              1. Pool header + weighting reference card
              2. Current Standings  ← sorted lowest→highest
              3. Detailed Tracker   ← sorted lowest→highest
              4. My Picks (pick/manage your 5 golfers)
              5. Tiebreaker modal (shown after staging 5)

            Both standings sections use the same
            enrichContestPicks() + computeMemberStandings()
            helpers, reading from the weekly_field table
            (live data) rather than contest_scores (stale).
        ══════════════════════════════════════════════ */}
        {page === "contest" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Pool header */}
            <div style={{ background:"rgba(198,12,48,0.08)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:16, padding: m ? "16px" : "20px 28px" }}>
              <div style={{ fontFamily:"'Playfair Display', serif", fontSize: m ? 18 : 24, color:BILLS_WHITE, marginBottom:4 }}>🏆 Mookie's Pool</div>
              <div style={{ fontSize:13, color:"#64748b" }}>Pick 5 golfers — best 4 scores count. Lowest net points wins.</div>
            </div>

            {/* Weighting reference */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 20px" }}>
              <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600, marginBottom:10 }}>WEIGHTING SYSTEM</div>
              <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                {[
                  { label:"Top 15",    value:"+5 pts",      color:"#ef4444" },
                  { label:"Rank 16-30",value:"+3 pts",      color:"#f97316" },
                  { label:"Rank 31-45",value:"0 pts",       color:"#64748b" },
                  { label:"Rank 46-60",value:"-3 pts",      color:"#22c55e" },
                  { label:"Rank 60+",  value:"-5 pts",      color:"#4a90d9" },
                  { label:"Missed Cut",value:"80 + weight", color:BILLS_RED },
                ].map(w => (
                  <div key={w.label} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"6px 12px", display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>{w.label}</span>
                    <span style={{ fontSize:12, color:w.color, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>{w.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── CURRENT STANDINGS ── */}
            {/* Uses computeMemberStandings() which reads live field data.
                Gated: hidden until the logged-in member has submitted 5 picks.
                Sorted: lowest net total first (best score = #1). */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Current Standings</span>
                </div>
                {/* Export button — builds a CSV with all contestants, their picks,
                    OWGR weighting, net points, and current ranking */}
                <button onClick={() => {
                  // Find the active tournament the same way the standings do
                  const activeTournament =
                    tournaments.find(t => {
                      const s = new Date(t.start_date + 'T00:00:00');
                      const e = tournamentEnd(t);
                      return new Date() >= s && new Date() <= e;
                    }) ||
                    tournaments.find(t => {
                      if (!t.start_date || !t.pick_deadline) return false;
                      const s        = new Date(t.start_date + 'T00:00:00');
                      const deadline = new Date(t.pick_deadline);
                      const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11,0,0,0);
                      return new Date() >= monday && new Date() < deadline;
                    });
                  if (!activeTournament) return;

                  // Compute standings using the same shared helper as the UI
                  const standings = computeMemberStandings(contestMembers, contestPicks, field, activeTournament.id);

                  // Build CSV rows — one row per golfer pick per contestant
                  const headers = [
                    "Rank", "Contestant", "Tiebreaker",
                    "Golfer", "OWGR Rank", "Weighting", "Position", "Net Points", "Counts Toward Best 4"
                  ];

                  const rows = [];
                  standings.forEach((s, i) => {
                    // Sort picks same way as the detailed tracker — best net points first
                    const sortedPicks = [...s.enrichedPicks].sort((a, b) => {
                      if (a.netPoints && b.netPoints) return a.netPoints - b.netPoints;
                      return (a.owgr || 999) - (b.owgr || 999);
                    });
                    sortedPicks.forEach(g => {
                      const counts   = s.best4.some(b => b.golfer_name === g.golfer_name);
                      const position = g.position === 80 ? "CUT" : g.position > 0 ? g.position : "—";
                      const tiebreaker = s.enrichedPicks[0]?.tiebreaker !== undefined && s.enrichedPicks[0]?.tiebreaker !== null
                        ? (s.enrichedPicks[0].tiebreaker > 0 ? `+${s.enrichedPicks[0].tiebreaker}` : String(s.enrichedPicks[0].tiebreaker))
                        : "";
                      rows.push([
                        i + 1,
                        s.member.name,
                        tiebreaker,
                        g.golfer_name,
                        g.owgr ? `#${g.owgr}` : "—",
                        g.weighting > 0 ? `+${g.weighting}` : g.weighting,
                        position,
                        g.position > 0 ? g.netPoints : "—",
                        counts ? "Yes" : "No",
                      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
                    });
                    // Blank separator row between contestants for readability in Excel
                    rows.push("");
                  });

                  const csv      = [headers.join(","), ...rows].join("\n");
                  const blob     = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url      = URL.createObjectURL(blob);
                  const link     = document.createElement("a");
                  const filename = `${activeTournament.name}_contest_standings_${new Date().toISOString().split("T")[0]}.csv`;
                  link.setAttribute("href", url);
                  link.setAttribute("download", filename);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
                  style={{ background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"5px 12px", color:"#94a3b8", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                  📥 Export
                </button>
              </div>
              {(() => {
                // Determine the active or upcoming tournament
                const activeTournament = tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00');
                  const e = tournamentEnd(t);
                  return new Date() >= s && new Date() <= e;
                }) || tournaments.find(t => {
                  if (!t.start_date || !t.pick_deadline) return false;
                  const s        = new Date(t.start_date + 'T00:00:00');
                  const deadline = new Date(t.pick_deadline);
                  const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11, 0, 0, 0);
                  return new Date() >= monday && new Date() < deadline;
                });

                if (!activeTournament)
                  return <div style={{ padding:32, textAlign:"center", color:"#475569", fontSize:14 }}>No active tournament</div>;

                // Gate: require current user to have submitted 5 picks first
                const myMember = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
                const myPicks  = contestPicks.filter(p => p.member_id === myMember?.id && p.tournament_id === activeTournament.id);
                if (myPicks.length < 5) return (
                  <div style={{ padding:32, textAlign:"center" }}>
                    <div style={{ fontSize:24, marginBottom:12 }}>🔒</div>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE, marginBottom:8 }}>Submit your 5 picks to see standings</div>
                    <div style={{ fontSize:13, color:"#475569" }}>Standings are hidden until you lock in your picks</div>
                  </div>
                );

                // Compute standings using shared helper (live field data, lowest→highest)
                const memberStandings = computeMemberStandings(contestMembers, contestPicks, field, activeTournament.id);

                if (memberStandings.length === 0)
                  return <div style={{ padding:32, textAlign:"center", color:"#475569", fontSize:14 }}>No picks submitted yet</div>;

                return memberStandings.map((s, i) => (
                  <div key={s.member.id} style={{ borderBottom:`1px solid rgba(0,51,141,0.08)` }}>
                    <div style={{ display:"flex", alignItems:"center", padding: m ? "10px 16px" : "12px 24px", background: i === 0 && s.total > 0 ? "rgba(198,12,48,0.06)" : "transparent", gap:12 }}>
                      <div style={{ width:24, fontFamily:"'DM Mono', monospace", fontSize:12, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ fontSize:14, color:BILLS_WHITE, fontWeight: i === 0 ? 600 : 400 }}>{s.member.name}</div>
                          {/* Show tiebreaker value if present */}
                          {s.enrichedPicks[0]?.tiebreaker !== undefined && s.enrichedPicks[0]?.tiebreaker !== null && (
                            <span style={{ fontSize:10, background:"rgba(0,51,141,0.3)", border:`1px solid ${BORDER}`, borderRadius:20, padding:"2px 8px", color:"#64748b" }}>
                              TB: {s.enrichedPicks[0].tiebreaker > 0 ? `+${s.enrichedPicks[0].tiebreaker}` : s.enrichedPicks[0].tiebreaker}
                            </span>
                          )}
                        </div>
                        {/* Golfer chips with weighting badges */}
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
                          {s.enrichedPicks.map(g => (
                            <span key={g.golfer_name} style={{ fontSize:10, background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:20, padding:"2px 8px", color:"#94a3b8" }}>
                              {g.golfer_name}
                              <span style={{ color: g.weighting > 0 ? "#ef4444" : g.weighting < 0 ? "#22c55e" : "#64748b", marginLeft:4 }}>
                                ({g.weighting > 0 ? `+${g.weighting}` : g.weighting})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Total score — only show when scoring has started (total > 0) */}
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:15, color: i === 0 && s.total > 0 ? BILLS_RED : "#64748b", fontWeight:700 }}>
                        {s.total > 0 ? s.total : "—"}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* ── DETAILED TRACKER ── */}
            {/* Same data source as Current Standings.
                Members sorted lowest→highest total.
                Each member block shows all 5 golfers in a
                table with position, weighting, net pts,
                and whether the pick counts toward best-4. */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Detailed Tracker</span>
              </div>
              {(() => {
                const activeTournament = tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00');
                  const e = tournamentEnd(t);
                  return new Date() >= s && new Date() <= e;
                }) || tournaments.find(t => {
                  if (!t.start_date || !t.pick_deadline) return false;
                  const s        = new Date(t.start_date + 'T00:00:00');
                  const deadline = new Date(t.pick_deadline);
                  const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11, 0, 0, 0);
                  return new Date() >= monday && new Date() < deadline;
                });
                if (!activeTournament)
                  return <div style={{ padding:32, textAlign:"center", color:"#475569", fontSize:14 }}>No active tournament</div>;

                // Gate: same pick submission requirement as standings
                const myMember = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
                const myPicks  = contestPicks.filter(p => p.member_id === myMember?.id && p.tournament_id === activeTournament.id);
                if (myPicks.length < 5) return (
                  <div style={{ padding:32, textAlign:"center" }}>
                    <div style={{ fontSize:24, marginBottom:12 }}>🔒</div>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE, marginBottom:8 }}>Submit your 5 picks to see standings</div>
                    <div style={{ fontSize:13, color:"#475569" }}>Standings are hidden until you lock in your picks</div>
                  </div>
                );

                // Use the same shared computation as Current Standings
                // so both sections are always in sync and sorted identically.
                const memberStandings = computeMemberStandings(contestMembers, contestPicks, field, activeTournament.id);

                return memberStandings.map((s) => {
                  if (s.enrichedPicks.length === 0) return null;

                  // Within each member's picks, sort by net points ascending
                  // (best scoring pick first), fall back to OWGR for unscored picks
                  const sortedPicks = [...s.enrichedPicks].sort((a, b) => {
                    if (a.netPoints && b.netPoints) return a.netPoints - b.netPoints;
                    return (a.owgr || 999) - (b.owgr || 999);
                  });

                  return (
                    <div key={s.member.id} style={{ borderBottom:`1px solid ${BORDER}` }}>
                      {/* Member header with running total */}
                      <div style={{ padding:"12px 20px", background:"rgba(0,51,141,0.1)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>{s.member.name}</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:BILLS_RED, fontWeight:700 }}>
                          {s.total > 0 ? `Total: ${s.total} pts` : "Pending"}
                        </div>
                      </div>
                      {/* Picks table */}
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead>
                            <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
                              {["GOLFER","OWGR","POSITION","WEIGHTING","NET PTS","COUNTS"].map(h => (
                                <th key={h} style={{ padding:"8px 16px", textAlign: h === "GOLFER" ? "left" : "center", color:"#475569", fontWeight:600, fontSize:10, letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedPicks.map(g => {
                              const counts = s.best4.some(b => b.golfer_name === g.golfer_name);
                              return (
                                <tr key={g.id || g.golfer_name} style={{ borderBottom:`1px solid rgba(0,51,141,0.06)`, background: counts ? "rgba(34,197,94,0.04)" : "transparent" }}>
                                  <td style={{ padding:"10px 16px", color: counts ? BILLS_WHITE : "#64748b", fontWeight: counts ? 600 : 400 }}>{g.golfer_name}</td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", color: !g.owgr ? "#334155" : g.owgr <= 15 ? BILLS_RED : g.owgr <= 30 ? "#f97316" : "#64748b", fontFamily:"'DM Mono', monospace" }}>
                                    {g.owgr ? `#${g.owgr}` : "—"}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", fontFamily:"'DM Mono', monospace", color:BILLS_WHITE }}>
                                    {g.position === 80
                                      ? <span style={{ fontSize:10, background:"rgba(198,12,48,0.15)", color:BILLS_RED, borderRadius:20, padding:"2px 8px", fontWeight:700 }}>CUT</span>
                                      : g.position > 0 ? g.position : "—"}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", fontFamily:"'DM Mono', monospace", color: g.weighting > 0 ? "#ef4444" : g.weighting < 0 ? "#22c55e" : "#64748b" }}>
                                    {g.weighting > 0 ? `+${g.weighting}` : g.weighting}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", fontFamily:"'DM Mono', monospace", color: g.position === 80 ? BILLS_RED : BILLS_WHITE, fontWeight:700 }}>
                                    {g.position > 0 ? g.netPoints : "—"}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center" }}>
                                    {counts
                                      ? <span style={{ fontSize:10, background:"rgba(34,197,94,0.15)", color:"#22c55e", borderRadius:20, padding:"2px 8px" }}>✓</span>
                                      : <span style={{ fontSize:10, color:"#334155" }}>—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* ── MY PICKS ── */}
            {/* Lets the logged-in contest member manage their 5 picks.
                Flow: browse field → stage picks → confirm → tiebreaker modal → submit.
                Submitted picks can be deleted (until deadline).
                Shows 5/5 completion indicator. */}
            {(() => {
              const activeTournament = tournaments.find(t => {
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return new Date() >= s && new Date() <= e;
              }) || tournaments.find(t => {
                if (!t.start_date || !t.pick_deadline) return false;
                const s        = new Date(t.start_date + 'T00:00:00');
                const deadline = new Date(t.pick_deadline);
                const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11, 0, 0, 0);
                return new Date() >= monday && new Date() < deadline;
              });
              if (!activeTournament) return null;

              const myMember       = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
              if (!myMember) return null;

              const myContestPicks = contestPicks.filter(p => p.member_id === myMember.id && p.tournament_id === activeTournament.id);
              const deadline       = activeTournament.pick_deadline ? new Date(activeTournament.pick_deadline) : null;
              const isLocked       = deadline && new Date() > deadline;
              const totalStaged    = myContestPicks.length + contestPickStaging.length;

              return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                      <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>My Picks — {activeTournament.name}</span>
                    </div>
                    <div style={{ fontSize:11, color: totalStaged >= 5 ? "#22c55e" : BILLS_RED }}>{totalStaged}/5 picks</div>
                  </div>

                  {/* Already-submitted picks */}
                  {myContestPicks.length > 0 && (
                    <div style={{ padding:"12px 20px", borderBottom:`1px solid ${BORDER}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div style={{ fontSize:11, color:"#64748b" }}>✅ SUBMITTED</div>
                        {myContestPicks[0]?.tiebreaker !== undefined && myContestPicks[0]?.tiebreaker !== null && (
                          <div style={{ fontSize:11, color:"#64748b" }}>
                            Tiebreaker: <span style={{ color:BILLS_WHITE, fontFamily:"'DM Mono', monospace", fontWeight:600 }}>
                              {myContestPicks[0].tiebreaker > 0 ? `+${myContestPicks[0].tiebreaker}` : myContestPicks[0].tiebreaker}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {myContestPicks.map(pick => (
                          <div key={pick.id} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:20, padding:"4px 12px" }}>
                            <span style={{ fontSize:13, color:BILLS_WHITE }}>{pick.golfer_name}</span>
                            {!isLocked && (
                              <button onClick={async () => {
                                const { error } = await supabase.from("contest_picks").delete().eq("id", pick.id);
                                if (!error) setContestPicks(prev => prev.filter(p => p.id !== pick.id));
                              }} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:14, padding:0 }}>✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Staged (not yet submitted) picks */}
                  {contestPickStaging.length > 0 && (
                    <div style={{ padding:"12px 20px", borderBottom:`1px solid ${BORDER}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div style={{ fontSize:11, color:"#f59e0b" }}>⏳ STAGED — NOT YET SUBMITTED</div>
                        <button onClick={() => setContestPickStaging([])} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:11, textDecoration:"underline" }}>Clear All</button>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {contestPickStaging.map(pick => (
                          <div key={pick.golfer_name} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:20, padding:"4px 12px" }}>
                            <span style={{ fontSize:13, color:BILLS_WHITE }}>{pick.golfer_name}</span>
                            <button onClick={() => setContestPickStaging(prev => prev.filter(p => p.golfer_name !== pick.golfer_name))} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:14, padding:0 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Golfer search / pick selector */}
                  {!isLocked && totalStaged < 5 && (
                    <div style={{ padding:"12px 20px", borderBottom:`1px solid ${BORDER}` }}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:8 }}>SELECT {5 - totalStaged} MORE GOLFER{5 - totalStaged !== 1 ? "S" : ""}</div>
                      <input placeholder="Search golfers..." onChange={e => setSearchPick(e.target.value)} value={searchPick}
                        style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", marginBottom:10, boxSizing:"border-box" }} />
                      <div style={{ maxHeight:280, overflowY:"auto", border:`1px solid ${BORDER}`, borderRadius:10 }}>
                        {field
                          .filter(p => p.player_name.toLowerCase().includes(searchPick.toLowerCase()))
                          .filter(p => !myContestPicks.some(cp  => cp.golfer_name === p.player_name))
                          .filter(p => !contestPickStaging.some(sp => sp.golfer_name === p.player_name))
                          .map((player, i) => (
                            <div key={player.id}
                              onClick={() => {
                                if (totalStaged >= 5) return;
                                setContestPickStaging(prev => [...prev, { golfer_name: player.player_name, datagolf_name: player.datagolf_name }]);
                                setSearchPick("");
                              }}
                              style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom:`1px solid rgba(0,51,141,0.06)`, cursor:"pointer", background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(198,12,48,0.08)"}
                              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent"}>
                              {/* OWGR rank with color coding matching the weighting tiers */}
                              <div style={{ width:44, fontFamily:"'DM Mono', monospace", fontSize:11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 15 ? BILLS_RED : player.owgr_rank <= 30 ? "#f97316" : player.owgr_rank <= 45 ? "#64748b" : player.owgr_rank <= 60 ? "#22c55e" : "#4a90d9" }}>
                                {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
                              </div>
                              <div style={{ flex:1, fontSize:13, color:"#94a3b8" }}>{player.player_name}</div>
                              {/* Weighting label for this pick */}
                              <div style={{ fontSize:11, fontFamily:"'DM Mono', monospace", color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 15 ? BILLS_RED : player.owgr_rank <= 30 ? "#f97316" : player.owgr_rank <= 45 ? "#64748b" : player.owgr_rank <= 60 ? "#22c55e" : "#4a90d9" }}>
                                {!player.owgr_rank ? "—" : player.owgr_rank <= 15 ? "+5" : player.owgr_rank <= 30 ? "+3" : player.owgr_rank <= 45 ? "0" : player.owgr_rank <= 60 ? "-3" : "-5"}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}

                  {/* Submit all 5 picks button */}
                  {!isLocked && myContestPicks.length < 5 && (
                    <div style={{ padding:16 }}>
                      <button
                        disabled={totalStaged < 5}
                        onClick={() => {
                          if (totalStaged < 5) return;
                          const golferList = contestPickStaging.map(p => p.golfer_name).join(", ");
                          const confirmed  = window.confirm(`Confirm your 5 picks:\n\n${golferList}\n\nClick OK to enter your tiebreaker score.`);
                          if (!confirmed) return;
                          // Open tiebreaker modal before final DB insert
                          setPendingContestPicks(contestPickStaging);
                          setTiebreakerTournament(activeTournament);
                          setTiebreakerValue("");
                          setShowTiebreakerModal(true);
                        }}
                        style={{ width:"100%", background: totalStaged >= 5 ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:12, padding:"14px", color: totalStaged >= 5 ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor: totalStaged >= 5 ? "pointer" : "default", letterSpacing:"0.04em" }}>
                        {totalStaged < 5 ? `Select ${5 - totalStaged} more to submit` : "⛳ Submit All 5 Picks →"}
                      </button>
                    </div>
                  )}

                  {isLocked && (
                    <div style={{ padding:24, textAlign:"center", color:"#475569", fontSize:13 }}>🔒 Picks are locked for this tournament</div>
                  )}

                  {!isLocked && myContestPicks.length >= 5 && contestPickStaging.length === 0 && (
                    <div style={{ padding:16, textAlign:"center", background:"rgba(34,197,94,0.06)", borderTop:`1px solid rgba(34,197,94,0.2)` }}>
                      <span style={{ fontSize:13, color:"#22c55e" }}>✅ All 5 picks submitted!</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TIEBREAKER MODAL ── */}
        {/* Shown after staging 5 contest picks and clicking "Submit All 5".
            User enters their prediction for the winning score (relative to par).
            On confirm, all 5 picks are inserted into contest_picks with
            the tiebreaker value attached to each row. */}
        {showTiebreakerModal && tiebreakerTournament && (
          <div
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowTiebreakerModal(false); }}>
            <div style={{ background:"#071128", border:`1px solid ${BORDER}`, borderRadius:20, width:"100%", maxWidth:420, overflow:"hidden" }}>

              {/* Tournament logo / name header */}
              <div style={{ background:"rgba(0,51,141,0.2)", padding:"28px 24px", textAlign:"center", borderBottom:`1px solid ${BORDER}` }}>
                {tiebreakerTournament.logo_url
                  ? <img src={tiebreakerTournament.logo_url} alt={tiebreakerTournament.name} style={{ maxHeight:80, maxWidth:200, objectFit:"contain", marginBottom:16 }} />
                  : <div style={{ fontSize:40, marginBottom:12 }}>🏆</div>
                }
                <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, color:BILLS_WHITE, marginBottom:4 }}>{tiebreakerTournament.name}</div>
                <div style={{ fontSize:12, color:"#64748b" }}>Tiebreaker Entry</div>
              </div>

              <div style={{ padding:28 }}>
                {/* Summary of staged picks */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, color:"#64748b", letterSpacing:"0.08em", marginBottom:10 }}>YOUR 5 PICKS</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {pendingContestPicks.map(pick => (
                      <span key={pick.golfer_name} style={{ fontSize:12, background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:20, padding:"4px 12px", color:BILLS_WHITE }}>
                        {pick.golfer_name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tiebreaker score input (stepper + number field) */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600, marginBottom:6 }}>Winning Score (Relative to Par)</div>
                  <div style={{ fontSize:12, color:"#64748b", marginBottom:12 }}>
                    Enter your prediction for the winning score (e.g. -18 for 18 under par). Used as tiebreaker only.
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => setTiebreakerValue(prev => prev === "" ? "-1" : String(Number(prev) - 1))}
                        style={{ width:40, height:40, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE, fontSize:20, cursor:"pointer" }}>−</button>
                      <input type="number" value={tiebreakerValue} onChange={e => setTiebreakerValue(e.target.value)} placeholder="e.g. -18"
                        style={{ width:100, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 14px", color:BILLS_WHITE, fontSize:18, fontFamily:"'DM Mono', monospace", outline:"none", textAlign:"center" }} />
                      <button onClick={() => setTiebreakerValue(prev => prev === "" ? "1" : String(Number(prev) + 1))}
                        style={{ width:40, height:40, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE, fontSize:20, cursor:"pointer" }}>+</button>
                    </div>
                    <div style={{ fontSize:13, color:"#64748b" }}>
                      {tiebreakerValue !== ""
                        ? Number(tiebreakerValue) < 0 ? `${tiebreakerValue} under par`
                          : Number(tiebreakerValue) === 0 ? "Even par"
                          : `+${tiebreakerValue} over par`
                        : ""}
                    </div>
                  </div>
                </div>

                {/* Cancel / Submit */}
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setShowTiebreakerModal(false)}
                    style={{ flex:1, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px", color:"#64748b", fontFamily:"'DM Sans', sans-serif", fontSize:14, cursor:"pointer" }}>
                    Cancel
                  </button>
                  <button
                    disabled={tiebreakerValue === ""}
                    onClick={async () => {
                      const myMember = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
                      if (!myMember) return;
                      // Insert all 5 picks with the tiebreaker value
                      for (const pick of pendingContestPicks) {
                        await supabase.from("contest_picks").insert({
                          member_id:     myMember.id,
                          tournament_id: tiebreakerTournament.id,
                          golfer_name:   pick.golfer_name,
                          datagolf_name: pick.datagolf_name,
                          tiebreaker:    Number(tiebreakerValue),
                        });
                      }
                      setContestPickStaging([]);
                      setShowTiebreakerModal(false);
                      setTiebreakerValue("");
                      setPendingContestPicks([]);
                      await fetchData();
                    }}
                    style={{ flex:2, background: tiebreakerValue !== "" ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:10, padding:"12px", color: tiebreakerValue !== "" ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:14, fontWeight:700, cursor: tiebreakerValue !== "" ? "pointer" : "default" }}>
                    ⛳ Submit Picks & Tiebreaker →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PROFILE MODAL ── */}
        {/* Accessible from the sidebar/header user button.
            Lets the logged-in user update display name, email,
            date of birth, GHIN number, equipment, and apparel
            preferences. Also handles avatar selection and
            password reset. Works for both baggers and
            contest_members rows. */}
        {showProfile && (
          <div
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowProfile(false); }}>
            <div style={{ background:"#071128", border:`1px solid ${BORDER}`, borderRadius:20, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto" }}>
              <div style={{ padding:"20px 24px", borderBottom:`1px solid ${BORDER}`, display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#071128", zIndex:1 }}>
                <div style={{ fontFamily:"'Playfair Display', serif", fontSize:20, color:BILLS_WHITE }}>My Profile</div>
                <button onClick={() => setShowProfile(false)} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:20 }}>✕</button>
              </div>
              <div style={{ padding:24, display:"flex", flexDirection:"column", gap:20 }}>

                {/* Avatar section */}
                <div style={{ display:"flex", alignItems:"center", gap:16, background:"rgba(0,51,141,0.1)", border:`1px solid ${BORDER}`, borderRadius:14, padding:16 }}>
                  <div style={{ position:"relative" }}>
                    <Avatar bagger={loggedInBagger} size={64} i={baggers.findIndex(b => b.name === loggedInBagger?.name)} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, color:BILLS_WHITE, fontWeight:700, marginBottom:4 }}>{(loggedInBagger || loggedInMember)?.name}</div>
                    <div style={{ fontSize:12, color:"#64748b", marginBottom:10 }}>{(loggedInBagger || loggedInMember)?.email}</div>
                    {/* Emoji avatar quick-picker */}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {["🏌️","🦬","⛳","🏆","🦅","💪","🎯","🔥","😎","🤠","👑","💰"].map(emoji => (
                        <button key={emoji} onClick={async () => {
                          await setEmojiAvatar(loggedInBagger.id, emoji);
                          setProfileData(prev => ({ ...prev, avatar_url: emoji }));
                        }}
                          style={{ width:32, height:32, borderRadius:8, background: loggedInBagger?.avatar_url === emoji ? "rgba(198,12,48,0.2)" : "rgba(255,255,255,0.05)", border:`1px solid ${loggedInBagger?.avatar_url === emoji ? "rgba(198,12,48,0.4)" : BORDER}`, cursor:"pointer", fontSize:16 }}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {/* Photo upload */}
                    <div style={{ marginTop:10 }}>
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (loggedInBagger) {
                          await uploadAvatar(loggedInBagger.id, file);
                        } else if (loggedInMember) {
                          // Contest-only member: upload to avatars bucket under contest- prefix
                          setUploadingAvatar(true);
                          const ext  = file.name.split(".").pop();
                          const path = `public/contest-${loggedInMember.id}.${ext}`;
                          const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
                          if (!error) {
                            const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
                            await supabase.from("contest_members").update({ avatar_url: publicUrl }).eq("id", loggedInMember.id);
                            setLoggedInMember(prev => ({ ...prev, avatar_url: publicUrl }));
                            setContestMembers(prev => prev.map(m => m.id === loggedInMember.id ? { ...m, avatar_url: publicUrl } : m));
                          }
                          setUploadingAvatar(false);
                        }
                      }} style={{ fontSize:11, color:"#64748b" }} />
                      {uploadingAvatar && <div style={{ fontSize:11, color:"#f59e0b", marginTop:4 }}>Uploading...</div>}
                    </div>
                  </div>
                </div>

                {/* Basic info fields */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>BASIC INFO</div>
                  {[
                    { label:"Display Name", key:"username",    placeholder:"How you appear in the app" },
                    { label:"Email Address", key:"email",       placeholder:"your@email.com" },
                    { label:"Date of Birth", key:"dob",         placeholder:"YYYY-MM-DD", type:"date" },
                    { label:"GHIN Number",   key:"ghin_number", placeholder:"Your handicap index number" },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>{f.label}</div>
                      <input type={f.type || "text"} value={profileData[f.key] || ""} onChange={e => setProfileData(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder}
                        style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 14px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
                    </div>
                  ))}
                </div>

                {/* Equipment fields */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>⛳ EQUIPMENT</div>
                  {[
                    { label:"Driver",      key:"driver" },
                    { label:"Fairway Wood",key:"fairway_wood" },
                    { label:"Irons",       key:"irons" },
                    { label:"Putter",      key:"putter" },
                    { label:"Golf Ball",   key:"golf_ball" },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>{f.label}</div>
                      <select value={profileData[f.key] || ""} onChange={e => setProfileData(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={{ width:"100%", background:"#071128", border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 14px", color: profileData[f.key] ? BILLS_WHITE : "#475569", fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }}>
                        <option value="">Select brand...</option>
                        {["Titleist","TaylorMade","Callaway","Ping","Cobra","Cleveland","Mizuno","Srixon","Wilson","PXG","Honma","Ben Hogan","Tour Edge","Adams","Bridgestone","Acushnet","Other"].map(brand => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Apparel preferences (multi-select chips) */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>👕 APPAREL PREFERENCES</div>
                  {[
                    { label:"Shirt Brands",   key:"shirt_brands",        customKey:"custom_shirt" },
                    { label:"Pant Brands",    key:"pant_brands",         customKey:"custom_pant" },
                    { label:"Shoe Brands",    key:"shoe_brands",         customKey:"custom_shoe" },
                    { label:"Weather Gear",   key:"weather_gear_brands", customKey:"custom_weather" },
                  ].map(f => {
                    const apparelBrands = ["Nike","Adidas","Under Armour","Puma","FootJoy","G/FORE","Malbon","Polo Ralph Lauren","Lacoste","Peter Millar","Lululemon","Patagonia","Galvin Green","Sun Ice","Oakley","Travis Mathew","Johnnie-O","Criquet","Greyson","Other"];
                    const selected = profileData[f.key] || [];
                    return (
                      <div key={f.key}>
                        <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>{f.label}</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: selected.includes("Other") ? 8 : 0 }}>
                          {apparelBrands.map(brand => {
                            const isSelected = selected.includes(brand);
                            return (
                              <button key={brand}
                                onClick={() => {
                                  const next = isSelected ? selected.filter(b => b !== brand) : [...selected, brand];
                                  setProfileData(prev => ({ ...prev, [f.key]: next }));
                                }}
                                style={{ background: isSelected ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${isSelected ? "rgba(198,12,48,0.4)" : BORDER}`, borderRadius:20, padding:"4px 12px", color: isSelected ? BILLS_RED : "#64748b", fontSize:11, cursor:"pointer", fontWeight: isSelected ? 600 : 400 }}>
                                {brand}
                              </button>
                            );
                          })}
                        </div>
                        {/* Custom brand text input for "Other" */}
                        {selected.includes("Other") && (
                          <input value={profileData[f.customKey] || ""} onChange={e => setProfileData(prev => ({ ...prev, [f.customKey]: e.target.value }))} placeholder="Enter brand name..."
                            style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:12, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Password reset section */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>🔐 CHANGE PASSWORD</div>
                  <button onClick={async () => {
                    const { error } = await supabase.auth.resetPasswordForEmail(loggedInBagger?.email, { redirectTo: "https://baggersgolf.com/#recovery" });
                    if (!error) alert(`Password reset email sent to ${loggedInBagger?.email}!`);
                  }}
                    style={{ background:"rgba(0,51,141,0.15)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 16px", color:"#94a3b8", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", textAlign:"left" }}>
                    📧 Send Password Reset Email
                  </button>
                </div>

                {/* Save profile button — updates either baggers or contest_members */}
                <button onClick={async () => {
                  setProfileSaving(true);
                  if (loggedInBagger) {
                    const { error } = await supabase.from("baggers").update({
                      username:            profileData.username,
                      email:               profileData.email,
                      dob:                 profileData.dob || null,
                      ghin_number:         profileData.ghin_number,
                      driver:              profileData.driver,
                      fairway_wood:        profileData.fairway_wood,
                      irons:               profileData.irons,
                      putter:              profileData.putter,
                      golf_ball:           profileData.golf_ball,
                      shirt_brands:        profileData.shirt_brands        || [],
                      pant_brands:         profileData.pant_brands         || [],
                      shoe_brands:         profileData.shoe_brands         || [],
                      weather_gear_brands: profileData.weather_gear_brands || [],
                      custom_shirt:        profileData.custom_shirt,
                      custom_pant:         profileData.custom_pant,
                      custom_shoe:         profileData.custom_shoe,
                      custom_weather:      profileData.custom_weather,
                    }).eq("id", loggedInBagger?.id);
                    if (!error) { await fetchData(); setProfileSaving(false); setShowProfile(false); }
                    else { alert("Error saving profile: " + error.message); setProfileSaving(false); }
                  } else if (loggedInMember) {
                    const { error } = await supabase.from("contest_members").update({
                      name:                profileData.name,
                      username:            profileData.username,
                      email:               profileData.email,
                      avatar_url:          profileData.avatar_url,
                      dob:                 profileData.dob || null,
                      ghin_number:         profileData.ghin_number,
                      driver:              profileData.driver,
                      fairway_wood:        profileData.fairway_wood,
                      irons:               profileData.irons,
                      putter:              profileData.putter,
                      golf_ball:           profileData.golf_ball,
                      shirt_brands:        profileData.shirt_brands        || [],
                      pant_brands:         profileData.pant_brands         || [],
                      shoe_brands:         profileData.shoe_brands         || [],
                      weather_gear_brands: profileData.weather_gear_brands || [],
                      custom_shirt:        profileData.custom_shirt,
                      custom_pant:         profileData.custom_pant,
                      custom_shoe:         profileData.custom_shoe,
                      custom_weather:      profileData.custom_weather,
                    }).eq("id", loggedInMember.id);
                    if (!error) { await fetchData(); setProfileSaving(false); setShowProfile(false); }
                    else { alert("Error saving profile: " + error.message); setProfileSaving(false); }
                  }
                }}
                  style={{ width:"100%", background:BILLS_RED, border:"none", borderRadius:12, padding:"14px", color:BILLS_WHITE, fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor:"pointer", letterSpacing:"0.04em" }}>
                  {profileSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ADMIN PICKS PAGE (Kyle only)
            Lets Kyle enter picks on behalf of any bagger
            for the current or upcoming tournament.
            Only visible when logged in as kjbialek@gmail.com.
            Supports selecting a bagger, searching the field,
            and submitting or updating their pick.
        ══════════════════════════════════════════════ */}
        {page === "admin" && loggedInBagger?.email?.toLowerCase() === ADMIN_EMAIL && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Security banner */}
            <div style={{ background:"rgba(198,12,48,0.08)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:14, padding:"14px 20px", display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontSize:20 }}>🔧</div>
              <div>
                <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600 }}>Admin Picks Entry</div>
                <div style={{ fontSize:11, color:"#64748b" }}>Enter or update picks on behalf of baggers. Only visible to you.</div>
              </div>
            </div>

            {(() => {
              // Find the active or upcoming tournament — same logic as My Pick page
              const now = new Date();
              const activeTournament = tournaments.find(t => {
                if (!t.start_date || !t.end_date) return false;
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return now >= s && now <= e;
              });
              const nextPickableTournament = tournaments.find(t => {
                if (!t.start_date || !t.pick_deadline) return false;
                const s        = new Date(t.start_date + 'T00:00:00');
                const deadline = new Date(t.pick_deadline);
                const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11,0,0,0);
                return now >= monday && now < deadline;
              });
              const currentTournament = activeTournament || nextPickableTournament || tournaments.find(t => {
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return now >= s && now <= e && t.is_pool_event !== false;
              });

              if (!currentTournament) return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:32, textAlign:"center", color:"#64748b" }}>
                  No active or upcoming tournament found.
                </div>
              );

              return (
                <AdminPicksPanel
                  tournament={currentTournament}
                  baggers={baggers}
                  picks={picks}
                  field={field}
                  supabase={supabase}
                  onPickSaved={fetchData}
                  m={m}
                />
              );
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ADMIN CONTEST PAGE (Kyle only)
            Lets Kyle enter Mookie's Pool picks and
            tiebreakers on behalf of any contest member.
        ══════════════════════════════════════════════ */}
        {page === "admincontest" && loggedInBagger?.email?.toLowerCase() === ADMIN_EMAIL && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            <div style={{ background:"rgba(198,12,48,0.08)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:14, padding:"14px 20px", display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontSize:20 }}>🎲</div>
              <div>
                <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600 }}>Admin — Mookie's Pool Entry</div>
                <div style={{ fontSize:11, color:"#64748b" }}>Enter picks and tiebreakers on behalf of contest members.</div>
              </div>
            </div>

            {(() => {
              const now = new Date();
              const activeTournament =
                tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00');
                  const e = tournamentEnd(t);
                  return now >= s && now <= e;
                }) ||
                tournaments.find(t => {
                  if (!t.start_date || !t.pick_deadline) return false;
                  const s        = new Date(t.start_date + 'T00:00:00');
                  const deadline = new Date(t.pick_deadline);
                  const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11,0,0,0);
                  return now >= monday && now < deadline;
                });

              if (!activeTournament) return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:32, textAlign:"center", color:"#64748b" }}>
                  No active or upcoming tournament found.
                </div>
              );

              return (
                <AdminContestPanel
                  tournament={activeTournament}
                  contestMembers={contestMembers}
                  contestPicks={contestPicks}
                  field={field}
                  supabase={supabase}
                  onSaved={fetchData}
                  m={m}
                />
              );
            })()}
          </div>
        )}

        {/* ── IMAGE LIGHTBOX ── */}
        {expandedImage && (
          <div
            onClick={() => setExpandedImage(null)}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, cursor:"pointer" }}>
            <img src={expandedImage} alt="Expanded" style={{ maxWidth:"100%", maxHeight:"90vh", borderRadius:12, objectFit:"contain" }} />
            <button onClick={() => setExpandedImage(null)}
              style={{ position:"absolute", top:20, right:20, background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:40, height:40, color:"white", cursor:"pointer", fontSize:20 }}>
              ✕
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// AdminPicksPanel component
// Used exclusively on the Admin Picks page.
// Lets Kyle select a bagger, search the field, and submit
// or update that bagger's pick for the current tournament.
// ══════════════════════════════════════════════════════════
function AdminPicksPanel({ tournament, baggers, picks, field, supabase, onPickSaved, m }) {
  const [selectedBagger,  setSelectedBagger]  = useState(null);
  const [adminPickSearch, setAdminPickSearch] = useState("");
  const [adminSelected,   setAdminSelected]   = useState("");
  const [saving,          setSaving]          = useState(false);
  const [savedMsg,        setSavedMsg]        = useState("");

  // Current pick for the selected bagger this tournament
  const existingPick = selectedBagger
    ? picks.find(p => p.baggers?.name === selectedBagger.name && p.tournaments?.week_number === tournament.week_number)
    : null;

  // Golfers already used by the selected bagger in prior weeks (once-per-season rule)
  const normalizeForCompare = (str) =>
    (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const priorUsed = selectedBagger
    ? picks
        .filter(p => p.baggers?.name === selectedBagger.name && p.tournaments?.week_number !== tournament.week_number)
        .map(p => normalizeForCompare(p.golfer_name))
    : [];

  async function handleSavePick() {
    if (!adminSelected || !selectedBagger) return;
    setSaving(true);
    setSavedMsg("");
    const fieldPlayer = field.find(p => p.player_name === adminSelected);
    const { error } = await supabase.from("picks").upsert({
      bagger_id:     selectedBagger.id,
      tournament_id: tournament.id,
      golfer_name:   adminSelected,
      datagolf_name: fieldPlayer?.datagolf_name || null,
      earnings:      0,
    }, { onConflict: "bagger_id,tournament_id" });
    if (!error) {
      await onPickSaved();
      setSavedMsg(`✅ ${selectedBagger.name}'s pick saved: ${adminSelected}`);
      setAdminSelected("");
    } else {
      setSavedMsg(`❌ Error: ${error.message}`);
    }
    setSaving(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Tournament info */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:11, color:BILLS_RED, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>WEEK {tournament.week_number}</div>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE }}>{tournament.name}</div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{tournament.course}</div>
        </div>
        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, color:"#4a90d9", fontWeight:700 }}>
          ${(tournament.purse / 1000000).toFixed(1)}M purse
        </div>
      </div>

      {/* Step 1: Select a bagger */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Step 1 — Select a Bagger</span>
        </div>
        <div style={{ padding:12, display:"flex", flexWrap:"wrap", gap:8 }}>
          {baggers.map((b, i) => {
            const theirPick = picks.find(p => p.baggers?.name === b.name && p.tournaments?.week_number === tournament.week_number);
            const isSelected = selectedBagger?.id === b.id;
            return (
              <button key={b.id}
                onClick={() => { setSelectedBagger(b); setAdminSelected(""); setAdminPickSearch(""); setSavedMsg(""); }}
                style={{ background: isSelected ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${isSelected ? "rgba(198,12,48,0.5)" : BORDER}`, borderRadius:10, padding:"8px 14px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"flex-start", gap:3 }}>
                <div style={{ fontSize:13, color: isSelected ? BILLS_WHITE : "#94a3b8", fontWeight: isSelected ? 600 : 400 }}>{b.name}</div>
                {theirPick ? (
                  <div style={{ fontSize:10, color:"#22c55e" }}>✓ {theirPick.golfer_name}</div>
                ) : (
                  <div style={{ fontSize:10, color:"#475569" }}>No pick yet</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Select a golfer (only shown after bagger is selected) */}
      {selectedBagger && (
        <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
              <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>
                Step 2 — Pick for {selectedBagger.name}
              </span>
            </div>
            {existingPick && (
              <div style={{ fontSize:11, color:"#22c55e" }}>Current: {existingPick.golfer_name}</div>
            )}
          </div>

          {/* Legend */}
          <div style={{ padding:"10px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", gap:16, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)" }} /> Available
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:"rgba(198,12,48,0.2)", border:"1px solid rgba(198,12,48,0.5)" }} /> Selected
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:"rgba(100,116,139,0.15)", border:"1px solid rgba(100,116,139,0.3)" }} /> Already used this season
            </div>
          </div>

          {/* Search */}
          <div style={{ padding:"10px 18px", borderBottom:`1px solid ${BORDER}` }}>
            <input value={adminPickSearch} onChange={e => setAdminPickSearch(e.target.value)} placeholder="Search golfers..."
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
          </div>

          {/* Field list */}
          <div style={{ maxHeight: m ? 280 : 400, overflowY:"auto" }}>
            {field
              .filter(p => p.player_name.toLowerCase().includes(adminPickSearch.toLowerCase()))
              .map((player, i) => {
                const isSelected   = adminSelected === player.player_name;
                const alreadyUsed  = priorUsed.includes(normalizeForCompare(player.player_name));
                const isCurrentPick = normalizeForCompare(player.player_name) === normalizeForCompare(existingPick?.golfer_name);
                const rowBg = isSelected
                  ? "rgba(198,12,48,0.12)"
                  : alreadyUsed && !isCurrentPick
                    ? "rgba(100,116,139,0.08)"
                    : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
                return (
                  <div key={player.id}
                    onClick={() => { if (!alreadyUsed || isCurrentPick) setAdminSelected(isSelected ? "" : player.player_name); }}
                    style={{ display:"flex", alignItems:"center", padding:"9px 18px", borderBottom:`1px solid rgba(0,51,141,0.06)`, background:rowBg, borderLeft: isSelected ? `3px solid ${BILLS_RED}` : alreadyUsed && !isCurrentPick ? "3px solid rgba(100,116,139,0.3)" : "3px solid transparent", cursor: alreadyUsed && !isCurrentPick ? "default" : "pointer", opacity: alreadyUsed && !isCurrentPick ? 0.4 : 1 }}>
                    <div style={{ width:44, fontFamily:"'DM Mono', monospace", fontSize:11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>
                      {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
                    </div>
                    <div style={{ flex:1, fontSize:13, color: isSelected ? BILLS_WHITE : alreadyUsed && !isCurrentPick ? "#334155" : "#94a3b8", fontWeight: isSelected ? 600 : 400 }}>
                      {player.player_name}
                      {alreadyUsed && !isCurrentPick && <span style={{ fontSize:10, color:"#334155", marginLeft:6 }}>already used</span>}
                    </div>
                    {isSelected && <div style={{ fontSize:13, color:BILLS_RED, fontWeight:700 }}>✓</div>}
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* Step 3: Confirm and save */}
      {selectedBagger && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {/* Summary of what will be saved */}
          <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:12, padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
            <div style={{ fontSize:13, color:"#64748b" }}>
              {adminSelected
                ? <span>Saving <span style={{ color:BILLS_WHITE, fontWeight:600 }}>{adminSelected}</span> for <span style={{ color:BILLS_WHITE, fontWeight:600 }}>{selectedBagger.name}</span></span>
                : <span style={{ color:"#475569" }}>← Select a golfer above</span>}
            </div>
            {existingPick && adminSelected && adminSelected !== existingPick.golfer_name && (
              <div style={{ fontSize:11, color:"#f59e0b" }}>⚠️ Will replace {existingPick.golfer_name}</div>
            )}
          </div>

          {savedMsg && (
            <div style={{ background: savedMsg.startsWith("✅") ? "rgba(34,197,94,0.1)" : "rgba(198,12,48,0.1)", border:`1px solid ${savedMsg.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(198,12,48,0.3)"}`, borderRadius:10, padding:"10px 16px", fontSize:13, color: savedMsg.startsWith("✅") ? "#22c55e" : "#f87171" }}>
              {savedMsg}
            </div>
          )}

          <button
            disabled={!adminSelected || saving}
            onClick={handleSavePick}
            style={{ background: adminSelected && !saving ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:12, padding:"14px", color: adminSelected && !saving ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor: adminSelected && !saving ? "pointer" : "default", letterSpacing:"0.04em" }}>
            {saving ? "Saving..." : adminSelected ? `⛳ Save ${selectedBagger.name}'s Pick →` : "Select a golfer to continue"}
          </button>
        </div>
      )}

      {/* Current week picks summary — shows all baggers and their picks at a glance */}
      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden" }}>
        <div style={{ padding:"12px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Week {tournament.week_number} — All Picks</span>
          <span style={{ fontSize:11, color:"#475569", marginLeft:"auto" }}>
            {picks.filter(p => p.tournaments?.week_number === tournament.week_number).length}/{baggers.length} submitted
          </span>
        </div>
        {baggers.map((b, i) => {
          const theirPick = picks.find(p => p.baggers?.name === b.name && p.tournaments?.week_number === tournament.week_number);
          return (
            <div key={b.id} style={{ display:"flex", alignItems:"center", padding:"10px 18px", borderBottom:`1px solid rgba(0,51,141,0.06)`, background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", gap:10 }}>
              <Avatar bagger={b} size={26} i={i} />
              <div style={{ width:60, fontSize:13, color:BILLS_WHITE, fontWeight:500 }}>{b.name}</div>
              <div style={{ flex:1, fontSize:13, color: theirPick ? "#94a3b8" : "#334155" }}>
                {theirPick ? theirPick.golfer_name : "—"}
              </div>
              {theirPick ? (
                <div style={{ fontSize:11, color:"#22c55e" }}>✓</div>
              ) : (
                <button onClick={() => { setSelectedBagger(b); setAdminSelected(""); setAdminPickSearch(""); setSavedMsg(""); window.scrollTo({ top:0, behavior:"smooth" }); }}
                  style={{ background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.3)", borderRadius:8, padding:"3px 10px", color:BILLS_RED, fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>
                  Enter Pick
                </button>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Main App component
// ══════════════════════════════════════════════════════════
export default function App() {

  // ── Auth state ─────────────────────────────────────────
  const [session,     setSession]     = useState(null);   // Supabase auth session
  const [isResetting, setIsResetting] = useState(false);  // true during password-reset flow
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authError,   setAuthError]   = useState("");
  const [showPassword,setShowPassword]= useState(false);
  const [resetMessage,setResetMessage]= useState("");
  const [loading,     setLoading]     = useState(true);

  // ── Navigation / layout ────────────────────────────────
  const [page,    setPage]    = useState("dashboard");
  const [isMobile,setIsMobile]= useState(window.innerWidth <= 768);

  // ── Core data from Supabase ────────────────────────────
  // baggers       — pool members (baggers table)
  // picks         — weekly golfer picks (picks table, joined)
  // tournaments   — full 2026 PGA Tour schedule (tournaments table)
  // field         — this week's field with live scoring (weekly_field table)
  // posts         — bulletin board posts (posts table)
  const [baggers,     setBaggers]     = useState([]);
  const [picks,       setPicks]       = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [field,       setField]       = useState([]);
  const [posts,       setPosts]       = useState([]);

  // ── User identity ──────────────────────────────────────
  // loggedInBagger  — baggers row for main pool members
  // loggedInMember  — could be baggers OR contest_members row
  // currentBagger   — display name string for the active user
  const [currentBagger,  setCurrentBagger]  = useState(null);
  const [loggedInBagger, setLoggedInBagger] = useState(null);
  const [loggedInMember, setLoggedInMember] = useState(null);

  // ── Profile modal state ────────────────────────────────
  const [showProfile,   setShowProfile]   = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileData,   setProfileData]   = useState({});

  // ── Avatar upload state ────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAvatarPicker,setShowAvatarPicker]= useState(null); // bagger.id or null

  // ── Bulletin Board state ───────────────────────────────
  const [newPost,           setNewPost]           = useState("");
  const [postImage,         setPostImage]         = useState(null);
  const [postImagePreview,  setPostImagePreview]  = useState(null);
  const [uploadingPost,     setUploadingPost]     = useState(false);
  const [expandedImage,     setExpandedImage]     = useState(null);
  const [postCategory,      setPostCategory]      = useState("banter");
  // @mention autocomplete
  const [mentionQuery,         setMentionQuery]         = useState("");
  const [mentionMatches,       setMentionMatches]       = useState([]);
  const [showMentionDropdown,  setShowMentionDropdown]  = useState(false);

  // ── This Week / My Pick search+sort ───────────────────
  const [fieldSearch,  setFieldSearch]  = useState("");
  const [fieldSort,    setFieldSort]    = useState("position");
  const [searchPick,   setSearchPick]   = useState("");
  const [selectedPick, setSelectedPick] = useState("");

  // ── Mookie's Pool (contest) state ─────────────────────
  // contestMembers    — rows from contest_members table
  // contestPicks      — rows from contest_picks table (joined)
  // contestScores     — rows from contest_scores table (historical, not used for live)
  // contestPickStaging — golfers selected but not yet submitted this session
  const [contestMembers,     setContestMembers]     = useState([]);
  const [contestPicks,       setContestPicks]       = useState([]);
  const [contestScores,      setContestScores]      = useState([]);
  const [contestPickStaging, setContestPickStaging] = useState([]);

  // Tiebreaker modal (shown after staging 5 picks, before final submit)
  const [showTiebreakerModal, setShowTiebreakerModal] = useState(false);
  const [tiebreakerValue,     setTiebreakerValue]     = useState("");
  const [pendingContestPicks, setPendingContestPicks] = useState([]);
  const [tiebreakerTournament,setTiebreakerTournament]= useState(null);

  // ── Responsive listener ────────────────────────────────
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Auth initialization ────────────────────────────────
  // Handles three scenarios:
  //   1. Password-reset link (URL contains #recovery + access_token)
  //   2. Normal session restore on page load
  //   3. Auth state changes (login, logout, password update)
  // Also signs out the user when the browser tab is closed.
  useEffect(() => {
    const rawHash   = window.location.hash;
    const cleanHash = rawHash.replace("#recovery#", "#").replace("recovery#", "");
    const hashParams   = new URLSearchParams(cleanHash.substring(1));
    const accessToken  = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type         = hashParams.get("type");

    // Scenario 1: password-reset deep link
    if (type === "recovery" && accessToken) {
      supabase.auth.setSession({
        access_token:  accessToken,
        refresh_token: refreshToken || "",
      }).then(({ error }) => {
        if (!error) { setIsResetting(true); setSession(null); }
        setLoading(false);
      });
      return;
    }

    // Scenario 2: restore existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Scenario 3: listen for future auth events
    supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") {
        setIsResetting(true); setSession(null); setLoading(false);
        return;
      }
      if (_event === "USER_UPDATED") {
        setIsResetting(false); setSession(session);
        return;
      }
      if (!isResetting) setSession(session);
    });

    // Sign out on tab/window close to prevent stale sessions
    const handleUnload = () => { try { supabase.auth.signOut(); } catch(e) {} };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Fetch all data once a session is established
  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  // ── Contest tab: auto-refresh live positions ───────────
  // When the user navigates to the contest tab:
  //   - Immediately refresh live positions + data
  //   - Then poll every 60 seconds while the tab is open
  //   - Clear any staged (un-submitted) picks on tab entry
  useEffect(() => {
    if (!session || page !== "contest") return;
    setContestPickStaging([]);
    refreshLivePositions();
    fetchData();
    const interval = setInterval(() => {
      refreshLivePositions();
      fetchData();
    }, 60000);
    return () => clearInterval(interval);
  }, [session, page]);

  // ── fetchData ──────────────────────────────────────────
  // Fetches all tables in parallel. After loading, identifies
  // the logged-in user by email and sets:
  //   - loggedInBagger if they're in the main pool (baggers table)
  //   - loggedInMember if they're only in the contest (contest_members)
  //     In the contest-only case, redirects to the contest page.
  async function fetchData() {
    const [
      { data: b },  // baggers
      { data: p },  // picks (joined with baggers + tournaments)
      { data: t },  // tournaments (ordered by week_number)
      { data: f },  // weekly_field (ordered by OWGR rank)
      { data: po }, // posts (newest first)
      { data: cm }, // contest_members
      { data: cp }, // contest_picks (joined with contest_members + tournaments)
      { data: cs }, // contest_scores (historical, newest first)
    ] = await Promise.all([
      supabase.from("baggers").select("*"),
      supabase.from("picks").select("*, baggers(name, avatar_url), tournaments(week_number, name)"),
      supabase.from("tournaments").select("*").order("week_number"),
      supabase.from("weekly_field").select("*").order("owgr_rank", { ascending: true, nullsFirst: false }),
      supabase.from("posts").select("*").order("created_at", { ascending: false }),
      supabase.from("contest_members").select("*"),
      supabase.from("contest_picks").select("*, contest_members(name), tournaments(week_number, name)"),
      supabase.from("contest_scores").select("*").order("round_date", { ascending: false }),
    ]);

    if (b)  setBaggers(b);
    if (p)  setPicks(p);
    if (t)  setTournaments(t);
    if (f)  setField(f);
    if (po) setPosts(po);
    if (cm) setContestMembers(cm);
    if (cp) setContestPicks(cp);
    if (cs) setContestScores(cs);

    // Identify the logged-in user
    const userEmail = session?.user?.email;
    if (userEmail && b) {
      const match = b.find(bagger =>
        bagger.email.toLowerCase() === userEmail.toLowerCase()
      );
      if (match) {
        // Main pool member
        setLoggedInBagger(match);
        setCurrentBagger(match.name);
        setLoggedInMember(match);
      } else {
        // Check if they're a contest-only member
        const { data: cm2 } = await supabase
          .from("contest_members")
          .select("*")
          .eq("email", userEmail.toLowerCase())
          .single();
        if (cm2) {
          setLoggedInMember(cm2);
          setCurrentBagger(cm2.name);
          setPage("contest");
        }
      }
    }
  }

  // ── refreshLivePositions ───────────────────────────────
  // Calls the get-live-positions Supabase Edge Function,
  // which fetches current leaderboard data from Datagolf
  // and updates the weekly_field table. Only fires when a
  // tournament is currently in progress (between start and
  // end dates). After updating, re-fetches all data.
  async function refreshLivePositions() {
    const now     = new Date();
    const current = tournaments.find(t => {
      if (!t.start_date || !t.end_date) return false;
      const s = new Date(t.start_date + 'T00:00:00');
      const e = tournamentEnd(t);
      return now >= s && now <= e;
    });
    if (current) {
      await fetch("https://iijfldracspwgezcwhtg.supabase.co/functions/v1/get-live-positions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      });
      await fetchData();
    }
  }

  // ── handleLogin ────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  // ── handleLogout ───────────────────────────────────────
  // Signs out and clears all client-side state
  async function handleLogout() {
    try { await supabase.auth.signOut(); } catch (e) { console.log("Logout error:", e); }
    setSession(null);
    setLoggedInBagger(null);
    setLoggedInMember(null);
    setContestPickStaging([]);
    setPicks([]);
    setContestPicks([]);
  }

  // ── uploadAvatar ───────────────────────────────────────
  // Uploads a photo to the "avatars" storage bucket at
  // public/{baggerId}.{ext}, then updates the baggers row.
  async function uploadAvatar(baggerId, file) {
    setUploadingAvatar(true);
    const ext  = file.name.split(".").pop();
    const path = `public/${baggerId}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { console.error("Upload error:", error); setUploadingAvatar(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("baggers").update({ avatar_url: publicUrl }).eq("id", baggerId);
    setBaggers(prev => prev.map(b => b.id === baggerId ? { ...b, avatar_url: publicUrl } : b));
    setUploadingAvatar(false);
    setShowAvatarPicker(null);
  }

  // ── setEmojiAvatar ─────────────────────────────────────
  // Stores a single emoji string as the avatar_url for a bagger
  async function setEmojiAvatar(baggerId, emoji) {
    await supabase.from("baggers").update({ avatar_url: emoji }).eq("id", baggerId);
    setBaggers(prev => prev.map(b => b.id === baggerId ? { ...b, avatar_url: emoji } : b));
    setShowAvatarPicker(null);
  }

  // ── uploadPostImage ────────────────────────────────────
  // Uploads a bulletin board image to the "Post Images" bucket.
  // Returns the public URL on success, null on failure.
  async function uploadPostImage(file) {
    setUploadingPost(true);
    const ext  = file.name.split(".").pop();
    const path = `public/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from("Post Images").upload(path, file, { upsert: false });
    if (error) { console.error("Post image upload error:", error); setUploadingPost(false); return null; }
    const { data: { publicUrl } } = supabase.storage.from("Post Images").getPublicUrl(path);
    setUploadingPost(false);
    return publicUrl;
  }

  // ── Loading / auth screens ─────────────────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", color:"#64748b", fontFamily:"'DM Sans', sans-serif" }}>
      Loading...
    </div>
  );

  // Password-reset screen (shown after clicking email link)
  if (isResetting) return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:24, padding:20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width:140 }} />
      <div style={{ width:"100%", maxWidth:360, background:"rgba(0,51,141,0.15)", border:`1px solid ${BORDER}`, borderRadius:20, padding:40 }}>
        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, color:BILLS_WHITE, marginBottom:4, textAlign:"center" }}>Set New Password</div>
        <div style={{ fontSize:13, color:"#64748b", marginBottom:28, textAlign:"center" }}>Enter your new password below</div>
        {resetMessage && (
          <div style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:8, padding:"10px 14px", color:"#22c55e", fontSize:13, marginBottom:16 }}>{resetMessage}</div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ position:"relative" }}>
            <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 6 characters)" type={showPassword ? "text" : "password"}
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", paddingRight:44, color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
            <button onClick={() => setShowPassword(!showPassword)} type="button"
              style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"#64748b", cursor:"pointer", fontSize:16 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button onClick={async () => {
            if (!newPassword || newPassword.length < 6) { alert("Password must be at least 6 characters."); return; }
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
              if (error.message.includes("different from the old password")) { alert("Please choose a different password than your current one."); }
              else { alert("Error updating password: " + error.message); }
            } else {
              setResetMessage("Password updated successfully! Redirecting...");
              setTimeout(() => { setIsResetting(false); setNewPassword(""); window.location.href = "https://baggersgolf.com"; }, 2000);
            }
          }}
            style={{ background:BILLS_RED, border:"none", borderRadius:10, padding:"12px", color:BILLS_WHITE, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>
            UPDATE PASSWORD
          </button>
        </div>
      </div>
    </div>
  );

  // Login screen (unauthenticated)
  if (!session) return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:24, padding:20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width: isMobile ? 140 : 180 }} />
      <div style={{ width:"100%", maxWidth:360, background:"rgba(0,51,141,0.15)", border:`1px solid ${BORDER}`, borderRadius:20, padding: isMobile ? 24 : 40 }}>
        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, color:BILLS_WHITE, marginBottom:4, textAlign:"center" }}>Welcome Back</div>
        <div style={{ fontSize:13, color:"#64748b", marginBottom:28, textAlign:"center" }}>Sign in to access the pool</div>
        {authError && <div style={{ background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.3)", borderRadius:8, padding:"10px 14px", color:"#f87171", fontSize:13, marginBottom:16 }}>{authError}</div>}
        <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required
            style={{ background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none" }} />
          <div style={{ position:"relative" }}>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type={showPassword ? "text" : "password"} required
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", paddingRight:44, color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
            <button onClick={() => setShowPassword(!showPassword)} type="button"
              style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"#64748b", cursor:"pointer", fontSize:16 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button type="submit" style={{ background:BILLS_RED, border:"none", borderRadius:10, padding:"12px", color:BILLS_WHITE, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", marginTop:4 }}>SIGN IN</button>
        </form>
        <div style={{ textAlign:"center", marginTop:12, fontSize:12, color:"#475569" }}>
          First time logging in? Enter your email above and click Forgot Password to set your password.
        </div>
        <div style={{ textAlign:"center", marginTop:8 }}>
          <button onClick={async () => {
            if (!email) { alert("Enter your email address first then click Forgot Password."); return; }
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://baggersgolf.com/#recovery" });
            if (error) { alert("Error sending reset email: " + error.message); }
            else { alert(`Password reset email sent to ${email}! Check your inbox and click the link within 10 minutes.`); }
          }}
            style={{ background:"transparent", border:"none", color:"#64748b", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", textDecoration:"underline" }}>
            Forgot Password?
          </button>
        </div>
      </div>
    </div>
  );

  // ── Derived data for Dashboard ─────────────────────────
  // totals: { baggerName → total earnings } across all weeks
  const totals = {};
  baggers.forEach(b => { totals[b.name] = 0; });
  picks.forEach(p => {
    if (p.baggers?.name) totals[p.baggers.name] = (totals[p.baggers.name] || 0) + Number(p.earnings || 0);
  });

  // sorted: [ [name, total], ... ] highest→lowest (Dashboard leaderboard order)
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  // weekNums: sorted list of week numbers that have any picks
  const weekNums = [...new Set(picks.map(p => p.tournaments?.week_number))]
    .filter(Boolean)
    .sort((a, b) => a - b);

  // trendData: one row per week, one key per bagger — used in the line chart
  const trendData = weekNums.map(w => {
    const row = { week: `W${w}` };
    baggers.forEach(b => {
      const pick = picks.find(p => p.tournaments?.week_number === w && p.baggers?.name === b.name);
      row[b.name] = pick ? Number(pick.earnings || 0) : 0;
    });
    return row;
  });

  // barData: sorted array for the bar chart
  const barData = sorted.map(([name, total]) => ({ name, total }));

  const today = new Date();
  const m     = isMobile; // shorthand used throughout JSX

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:"100vh", background:BG, color:BILLS_WHITE, fontFamily:"'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />

      {/* ── MOBILE HEADER ── */}
      {m && (
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, background:BG2, borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px" }}>
            <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ height:40 }} />
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:11, color:"#64748b" }}>{weekNums.length}/32 wks</div>
              {(loggedInBagger || loggedInMember) && (
                <button onClick={() => { setProfileData({ ...(loggedInBagger || loggedInMember) }); setShowProfile(true); }}
                  style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:20, padding:"4px 10px 4px 4px", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                  <Avatar bagger={loggedInBagger || loggedInMember} size={24} i={baggers.findIndex(b => b.name === (loggedInBagger || loggedInMember)?.name)} />
                  <span style={{ fontSize:12, color:BILLS_WHITE, fontWeight:600 }}>{(loggedInBagger || loggedInMember)?.username || (loggedInBagger || loggedInMember)?.name}</span>
                </button>
              )}
              <button onClick={handleLogout} style={{ background:"rgba(198,12,48,0.15)", border:`1px solid rgba(198,12,48,0.3)`, borderRadius:8, padding:"6px 12px", color:BILLS_RED, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600 }}>Out</button>
            </div>
          </div>
          {/* Mobile tab bar — filters nav items by pool membership */}
          <div style={{ display:"flex", overflowX:"auto", borderTop:`1px solid ${BORDER}` }}>
            {NAV.filter(item => {
              const userPools = loggedInBagger?.pools || loggedInMember?.pools || ["contest"];
              if (!item.pools.some(p => userPools.includes(p))) return false;
              // Admin-only pages are only visible to Kyle
              if (item.adminOnly && loggedInBagger?.email?.toLowerCase() !== ADMIN_EMAIL) return false;
              return true;
            }).map(item => (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ flex:"0 0 auto", background:"transparent", border:"none", borderBottom: page === item.id ? `2px solid ${BILLS_RED}` : "2px solid transparent", padding:"8px 14px", color: page === item.id ? BILLS_RED : "#64748b", fontFamily:"'DM Sans', sans-serif", fontSize:10, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, minWidth:56, fontWeight: page === item.id ? 600 : 400 }}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                <span style={{ whiteSpace:"nowrap" }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      {!m && (
        <div style={{ position:"fixed", left:0, top:0, bottom:0, width:210, background:BG2, borderRight:`1px solid ${BORDER}`, display:"flex", flexDirection:"column", padding:"24px 14px", zIndex:10 }}>
          <div style={{ marginBottom:24, paddingBottom:20, borderBottom:`1px solid ${BORDER}` }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
              <img src="/Baggers_Logo.png" alt="Baggers Golf Pool" style={{ width:120 }} />
            </div>
            {(loggedInBagger || loggedInMember) && (
              <button onClick={() => { setProfileData({ ...(loggedInBagger || loggedInMember) }); setShowProfile(true); }}
                style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:12, padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                <Avatar bagger={loggedInBagger || loggedInMember} size={32} i={baggers.findIndex(b => b.name === (loggedInBagger || loggedInMember)?.name)} />
                <div style={{ textAlign:"left", flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(loggedInBagger || loggedInMember)?.username || (loggedInBagger || loggedInMember)?.name}</div>
                  <div style={{ fontSize:10, color:"#475569" }}>Edit Profile</div>
                </div>
                <div style={{ fontSize:12, color:"#475569" }}>⚙️</div>
              </button>
            )}
          </div>
          {/* Desktop nav — same pool filter as mobile */}
          <nav style={{ display:"flex", flexDirection:"column", gap:4, flex:1 }}>
            {NAV.filter(item => {
              const userPools = loggedInBagger?.pools || loggedInMember?.pools || ["contest"];
              if (!item.pools.some(p => userPools.includes(p))) return false;
              if (item.adminOnly && loggedInBagger?.email?.toLowerCase() !== ADMIN_EMAIL) return false;
              return true;
            }).map(item => (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ background: page === item.id ? "rgba(198,12,48,0.15)" : "transparent", border: page === item.id ? "1px solid rgba(198,12,48,0.4)" : "1px solid transparent", borderRadius:10, padding:"10px 14px", color: page === item.id ? "#ff6b6b" : "#64748b", fontFamily:"'DM Sans', sans-serif", fontSize:14, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:10 }}>
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
          <div style={{ background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600, marginBottom:4 }}>2026 SEASON</div>
            <div style={{ fontSize:12, color:"#94a3b8" }}>{weekNums.length} of 32 weeks complete</div>
          </div>
          <button onClick={handleLogout} style={{ background:"transparent", border:`1px solid ${BORDER}`, borderRadius:10, padding:"9px 14px", color:"#475569", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>Sign Out</button>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div style={{ marginLeft: m ? 0 : 210, padding: m ? "100px 16px 24px" : "32px 36px" }}>

        {/* Page heading (desktop only) */}
        {!m && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28, paddingBottom:20, borderBottom:`1px solid ${BORDER}` }}>
            <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:26, color:BILLS_WHITE, margin:0 }}>
              {NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}
            </h1>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:BILLS_RED }} />
              <span style={{ fontSize:12, color:"#64748b" }}>Season Active</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            DASHBOARD PAGE
            Shows: stat cards, season leaderboard, bar
            chart, weekly trend line chart, and the full
            weekly breakdown table.
            All sorted highest→lowest earnings.
        ══════════════════════════════════════════════ */}
        {page === "dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap: m ? 16 : 24 }}>

            {/* Stat cards: Leader, Weeks, Baggers, Total */}
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              {[
                { label:"Leader", value: sorted[0]?.[0] || "—", sub: fmtFull(sorted[0]?.[1] || 0), color: BILLS_RED },
                { label:"Weeks",  value: weekNums.length, sub:"of 32" },
                { label:"Baggers",value: baggers.length,  sub:"In pool" },
                { label:"Total",  value: fmt(sorted.reduce((a,b) => a + b[1], 0)), sub:"Earnings", color:"#4a90d9" },
              ].map(c => (
                <div key={c.label} style={{ flex:1, minWidth: m ? "calc(50% - 6px)" : 140, background:"rgba(0,51,141,0.12)", border:`1px solid ${BORDER}`, borderRadius:14, padding: m ? "14px 16px" : "20px 24px", borderTop:`3px solid ${c.color || BILLS_BLUE}` }}>
                  <div style={{ fontSize:10, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>{c.label}</div>
                  <div style={{ fontSize: m ? 20 : 26, fontFamily:"'Playfair Display', serif", color: c.color || BILLS_WHITE }}>{c.value}</div>
                  {c.sub && <div style={{ fontSize:11, color:"#475569", marginTop:3 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Season Leaderboard — highest earnings first */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Season Leaderboard</span>
              </div>
              {sorted.map(([name, total], i) => {
                const bagger = baggers.find(b => b.name === name);
                return (
                  <div key={name} style={{ display:"flex", alignItems:"center", padding: m ? "10px 16px" : "10px 24px", background: i === 0 ? "rgba(198,12,48,0.08)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", borderLeft: i === 0 ? `3px solid ${BILLS_RED}` : "3px solid transparent", gap:10 }}>
                    <div style={{ width:24, fontFamily:"'DM Mono', monospace", fontSize:12, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                    {bagger && <Avatar bagger={bagger} size={28} i={i} />}
                    <div style={{ flex:1, fontSize:14, color: i === 0 ? BILLS_WHITE : "#94a3b8", fontWeight: i === 0 ? 600 : 400 }}>{name}</div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color: i === 0 ? BILLS_RED : "#64748b" }}>{m ? fmt(total) : fmtFull(total)}</div>
                  </div>
                );
              })}
            </div>

            {/* Bar chart: earnings per bagger */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding: m ? 16 : 20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Earnings by Bagger</span>
              </div>
              <ResponsiveContainer width="100%" height={m ? 180 : 220}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" tick={{ fill:"#64748b", fontSize: m ? 10 : 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fill:"#64748b", fontSize:10 }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip formatter={v => fmtFull(v)} contentStyle={{ background:BG2, border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE }} />
                  <Bar dataKey="total" radius={[6,6,0,0]}>
                    {barData.map((entry, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly trend line chart */}
            {trendData.length > 0 && (
              <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding: m ? 16 : 20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Weekly Earnings Trend</span>
                </div>
                <ResponsiveContainer width="100%" height={m ? 180 : 220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,51,141,0.2)" />
                    <XAxis dataKey="week" tick={{ fill:"#64748b", fontSize: m ? 10 : 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fill:"#64748b", fontSize:10 }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        // Only show when hovering over a data point
                        if (!active || !payload || !payload.length) return null;

                        // Extract the week number from the label (e.g. "W14" → 14)
                        const weekNum = parseInt(label?.replace("W", "")) || 0;

                        // Find the tournament for this week
                        const tourney = tournaments.find(t => t.week_number === weekNum);

                        return (
                          <div style={{ background:BG2, border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px 16px", minWidth:200, maxWidth:280 }}>
                            {/* Week + tournament name header */}
                            <div style={{ fontSize:11, color:BILLS_RED, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>{label}</div>
                            {tourney && (
                              <div style={{ fontSize:11, color:"#64748b", marginBottom:10, borderBottom:`1px solid ${BORDER}`, paddingBottom:8 }}>
                                {tourney.name}
                              </div>
                            )}
                            {/* One row per bagger — sorted highest earnings first */}
                            {[...payload]
                              .sort((a, b) => (b.value || 0) - (a.value || 0))
                              .map((entry) => {
                                // Find this bagger's pick for this week
                                const pick = picks.find(p =>
                                  p.baggers?.name === entry.name &&
                                  p.tournaments?.week_number === weekNum
                                );
                                return (
                                  <div key={entry.name} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8, paddingBottom:8, borderBottom:`1px solid rgba(0,51,141,0.1)` }}>
                                    {/* Color dot matching the line color */}
                                    <div style={{ width:8, height:8, borderRadius:"50%", background:entry.color, flexShrink:0, marginTop:4 }} />
                                    <div style={{ flex:1, minWidth:0 }}>
                                      {/* Bagger name + earnings */}
                                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                                        <span style={{ fontSize:12, color:BILLS_WHITE, fontWeight:600 }}>{entry.name}</span>
                                        <span style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color: (entry.value || 0) > 0 ? "#22c55e" : "#475569", fontWeight:700, flexShrink:0 }}>
                                          {entry.value ? fmt(entry.value) : "—"}
                                        </span>
                                      </div>
                                      {/* Golfer pick + finish position */}
                                      {pick ? (
                                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:2 }}>
                                          <span style={{ fontSize:11, color:"#64748b" }}>{pick.golfer_name}</span>
                                          {pick.finish_position ? (
                                            <span style={{ fontSize:10, color: pick.finish_position === 80 ? BILLS_RED : pick.finish_position <= 10 ? "#22c55e" : "#475569", fontFamily:"'DM Mono', monospace" }}>
                                              {pick.finish_position === 80 ? "CUT" : pick.finish_position === 1 ? "🏆 1st" : `T${pick.finish_position}`}
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>No pick</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            }
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ color:"#94a3b8", fontSize: m ? 10 : 12 }} />
                    {baggers.map((b, i) => (
                      <Line key={b.name} type="monotone" dataKey={b.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weekly breakdown table — one row per bagger, one column per week */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Weekly Breakdown</span>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize: m ? 11 : 13 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
                      <th style={{ padding: m ? "8px 12px" : "10px 24px", textAlign:"left", color:"#64748b", fontWeight:500, whiteSpace:"nowrap" }}>Bagger</th>
                      {weekNums.map(w => (
                        <th key={w} style={{ padding: m ? "8px 8px" : "10px 16px", textAlign:"right", color:"#64748b", fontWeight:500 }}>W{w}</th>
                      ))}
                      <th style={{ padding: m ? "8px 12px" : "10px 24px", textAlign:"right", color:BILLS_WHITE, fontWeight:600 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(([name, total], ri) => (
                      <tr key={name} style={{ borderBottom:`1px solid rgba(0,51,141,0.1)`, background: ri % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                        <td style={{ padding: m ? "8px 12px" : "10px 24px", color:"#e2e8f0", fontWeight:500, whiteSpace:"nowrap" }}>{name}</td>
                        {weekNums.map(w => {
                          const pick = picks.find(p => p.tournaments?.week_number === w && p.baggers?.name === name);
                          const amt  = pick ? Number(pick.earnings || 0) : 0;
                          return (
                            <td key={w} style={{ padding: m ? "8px 8px" : "10px 16px", textAlign:"right", color: amt > 500000 ? BILLS_RED : "#64748b", fontFamily:"'DM Mono', monospace", whiteSpace:"nowrap" }}>
                              {m ? fmt(amt) : fmtFull(amt)}
                            </td>
                          );
                        })}
                        <td style={{ padding: m ? "8px 12px" : "10px 24px", textAlign:"right", color:BILLS_WHITE, fontWeight:700, fontFamily:"'DM Mono', monospace", whiteSpace:"nowrap" }}>
                          {m ? fmt(total) : fmtFull(total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            THIS WEEK PAGE
            Shows the active tournament header and the
            full tournament field with live scoring.
            Field can be searched and sorted.
        ══════════════════════════════════════════════ */}
        {page === "thisweek" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Tournament banner — shows for active OR upcoming tournament, pool events only */}
            {(() => {
              // Find active pool tournament first, fall back to any active tournament
              const current =
                tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                  return s <= today && e >= today && t.is_pool_event !== false;
                }) ||
                tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                  return s <= today && e >= today;
                });
              const upcoming = !current && tournaments.find(t => {
                if (!t.start_date) return false;
                const s = new Date(t.start_date + 'T00:00:00');
                return s > today && t.is_pool_event !== false;
              });
              const display = current || upcoming;
              if (!display) return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding:"20px" }}>
                  <div style={{ fontSize:13, color:"#64748b" }}>No tournament currently in progress.</div>
                </div>
              );
              const isLive = !!current;
              const startDate = display.start_date ? new Date(display.start_date).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : null;
              const endDate   = display.end_date   ? new Date(display.end_date).toLocaleDateString("en-US",   { month:"short", day:"numeric" }) : null;
              return (
                <div style={{ background: isLive ? "rgba(198,12,48,0.08)" : "rgba(0,51,141,0.08)", border: isLive ? "1px solid rgba(198,12,48,0.25)" : `1px solid ${BORDER}`, borderRadius:16, padding: m ? "16px" : "20px 28px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontSize:11, color: isLive ? BILLS_RED : "#4a90d9", letterSpacing:"0.1em", fontWeight:700, marginBottom:6 }}>
                        {isLive ? "🔴 LIVE THIS WEEK" : `📅 COMING UP — WEEK ${display.week_number}`}
                      </div>
                      <div style={{ fontFamily:"'Playfair Display', serif", fontSize: m ? 18 : 22, color:BILLS_WHITE, marginBottom:4 }}>{display.name}</div>
                      <div style={{ fontSize:12, color:"#64748b" }}>
                        {display.course}{startDate && endDate ? ` · ${startDate} – ${endDate}` : ""}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:20 }}>
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>PURSE</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:15, color:"#4a90d9", fontWeight:700 }}>${(display.purse/1000000).toFixed(1)}M</div>
                      </div>
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:4 }}>FIELD</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:15, color:BILLS_WHITE, fontWeight:700 }}>{field.length}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Field table with search + sort */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                    <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>This Week's Field</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ fontSize:11, color:"#475569" }}>{field.length} players</div>
                    {/* Export to Excel button — builds a CSV with all field data and triggers download */}
                    <button onClick={() => {
                      // Define the columns to export
                      const headers = [
                        "Player Name", "Datagolf Name", "OWGR Rank", "Amateur",
                        "Position", "Total To Par", "Thru", "R1", "R2", "R3", "R4",
                        "Event Name", "Picked By"
                      ];
                      // Find the current tournament to look up picks
                      const currentWeek = tournaments.find(t => {
                        const s = new Date(t.start_date + 'T00:00:00');
                        const e = tournamentEnd(t);
                        return s <= today && e >= today && t.is_pool_event !== false;
                      });
                      // Build one row per player with all available data
                      const rows = field.map(player => {
                        const pickedBy = currentWeek
                          ? picks
                              .filter(p => p.tournaments?.week_number === currentWeek.week_number && p.golfer_name?.toLowerCase() === player.player_name?.toLowerCase())
                              .map(p => p.baggers?.name)
                              .join(", ")
                          : "";
                        // Format score columns — blank if null, "E" if even par
                        const fmtScore = (v) => v === null || v === undefined ? "" : v === 0 ? "E" : v > 0 ? `+${v}` : String(v);
                        const fmtPos   = (v) => v === null || v === undefined || v === 0 ? "" : v === 80 ? "CUT" : `T${v}`;
                        return [
                          player.player_name,
                          player.datagolf_name,
                          player.owgr_rank || "",
                          player.amateur ? "Yes" : "No",
                          fmtPos(player.current_position),
                          fmtScore(player.total_to_par),
                          player.thru === 18 ? "F" : player.thru || "",
                          fmtScore(player.r1),
                          fmtScore(player.r2),
                          fmtScore(player.r3),
                          fmtScore(player.r4),
                          player.event_name || "",
                          pickedBy,
                        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
                      });
                      // Combine headers + rows into CSV string
                      const csv      = [headers.join(","), ...rows].join("\n");
                      const blob     = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const url      = URL.createObjectURL(blob);
                      const link     = document.createElement("a");
                      const filename = `${currentWeek?.name || "field"}_field_${new Date().toISOString().split("T")[0]}.csv`;
                      link.setAttribute("href", url);
                      link.setAttribute("download", filename);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"5px 12px", color:"#94a3b8", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                      📥 Export
                    </button>
                  </div>
                </div>
                <input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder="Search golfers..."
                  style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", marginBottom:10, boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {[
                    { id:"position", label:"Leaderboard" },
                    { id:"owgr",     label:"World Ranking" },
                    { id:"name",     label:"Name" },
                    { id:"picked",   label:"Picked By" },
                  ].map(s => (
                    <button key={s.id} onClick={() => setFieldSort(s.id)}
                      style={{ background: fieldSort === s.id ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${fieldSort === s.id ? "rgba(198,12,48,0.4)" : BORDER}`, borderRadius:8, padding:"5px 12px", color: fieldSort === s.id ? BILLS_RED : "#64748b", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight: fieldSort === s.id ? 600 : 400 }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column headers */}
              <div style={{ display:"grid", gridTemplateColumns: m ? "50px 1fr 60px 50px" : "60px 1fr 60px 55px 55px 55px 55px 55px 55px 120px", gap: m ? 6 : 10, padding:"10px 24px", borderBottom:`1px solid rgba(0,51,141,0.15)`, alignItems:"center" }}>
                {(m ? ["OWGR","PLAYER","POS","TOT"] : ["OWGR","PLAYER","POS","TOT","THRU","R1","R2","R3","R4","PICKED BY"]).map(h => (
                  <div key={h} style={{ fontSize:10, color:"#475569", letterSpacing:"0.08em", fontWeight:600, textAlign: h === "OWGR" || h === "PLAYER" ? "left" : "center" }}>{h}</div>
                ))}
              </div>

              {/* Field rows */}
              <div style={{ maxHeight: m ? 500 : 600, overflowY:"auto" }}>
                {(() => {
                  // Match the current pool tournament — exclude companion events (is_pool_event = false)
                  // Falls back to any active tournament if is_pool_event column not yet set
                  const currentWeek = tournaments.find(t => {
                    const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                    return s <= today && e >= today && t.is_pool_event !== false;
                  }) || tournaments.find(t => {
                    const s = new Date(t.start_date + 'T00:00:00'), e = tournamentEnd(t);
                    return s <= today && e >= today;
                  });
                  // Annotate each field player with who (if anyone) picked them this week
                  let displayField = field
                    .filter(p => p.player_name.toLowerCase().includes(fieldSearch.toLowerCase()))
                    .map(player => {
                      const pickedBy = currentWeek
                        ? picks
                            .filter(p => p.tournaments?.week_number === currentWeek.week_number && p.golfer_name?.toLowerCase() === player.player_name?.toLowerCase())
                            .map(p => p.baggers?.name)
                            .join(", ")
                        : "";
                      return { ...player, pickedBy };
                    });

                  // Apply sort
                  if (fieldSort === "name")     displayField.sort((a,b) => a.player_name.localeCompare(b.player_name));
                  else if (fieldSort === "position") displayField.sort((a,b) => {
                    // Sort by current leaderboard position ascending.
                    // Players with no position yet (0 or null) go to the bottom.
                    // If neither player has a position yet, fall back to OWGR rank
                    // so the list isn't random during pre-tournament or between rounds.
                    const posA = a.current_position && a.current_position > 0 ? a.current_position : null;
                    const posB = b.current_position && b.current_position > 0 ? b.current_position : null;
                    if (posA !== null && posB !== null) return posA - posB;
                    if (posA !== null) return -1;  // A has position, B doesn't → A first
                    if (posB !== null) return 1;   // B has position, A doesn't → B first
                    // Neither has a position — fall back to OWGR rank
                    return (a.owgr_rank || 9999) - (b.owgr_rank || 9999);
                  });
                  else if (fieldSort === "picked") displayField.sort((a,b) => {
                    if (a.pickedBy && !b.pickedBy) return -1;
                    if (!a.pickedBy && b.pickedBy) return 1;
                    return 0;
                  });

                  if (displayField.length === 0)
                    return <div style={{ padding:40, textAlign:"center", color:"#475569", fontSize:14 }}>No golfers found</div>;

                  return displayField.map((player, i) => (
                    <div key={player.id} style={{ display:"grid", gridTemplateColumns: m ? "50px 1fr 60px 50px" : "60px 1fr 60px 55px 55px 55px 55px 55px 55px 100px", gap: m ? 6 : 10, padding: m ? "8px 16px" : "10px 24px", borderBottom:`1px solid rgba(0,51,141,0.06)`, background: player.pickedBy ? "rgba(198,12,48,0.05)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", alignItems:"center" }}>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize: m ? 11 : 12, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>{player.owgr_rank ? `#${player.owgr_rank}` : "—"}</div>
                      <div style={{ fontSize: m ? 12 : 13, color: player.pickedBy ? BILLS_WHITE : "#94a3b8", fontWeight: player.pickedBy ? 600 : 400 }}>
                        {player.player_name}
                        {player.amateur && <span style={{ fontSize:10, color:"#475569", marginLeft:4 }}>(A)</span>}
                      </div>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: player.current_position && player.current_position <= 10 ? BILLS_RED : "#64748b", textAlign:"center" }}>
                        {player.current_position ? `T${player.current_position}` : "—"}
                      </div>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: player.total_to_par < 0 ? "#22c55e" : player.total_to_par > 0 ? "#ef4444" : player.total_to_par === 0 ? "#64748b" : "#475569", textAlign:"center" }}>
                        {player.total_to_par !== null && player.total_to_par !== undefined
                          ? player.total_to_par > 0 ? `+${player.total_to_par}` : player.total_to_par === 0 ? "E" : player.total_to_par
                          : "—"}
                      </div>
                      {!m && <>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color:"#64748b", textAlign:"center" }}>
                          {player.thru !== null && player.thru !== undefined ? (player.thru === 18 ? "F" : `${player.thru}`) : "—"}
                        </div>
                        {[player.r1, player.r2, player.r3, player.r4].map((r, ri) => (
                          <div key={ri} style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: r !== null && r < 0 ? "#22c55e" : r > 0 ? "#ef4444" : "#64748b", textAlign:"center" }}>
                            {r !== null && r !== undefined ? r > 0 ? `+${r}` : r === 0 ? "E" : r : "—"}
                          </div>
                        ))}
                        <div style={{ fontSize:12, color:BILLS_RED, fontWeight:600, textAlign:"center" }}>{player.pickedBy || ""}</div>
                      </>}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            MY PICK PAGE
            Lets the logged-in bagger select their golfer
            for the current (or upcoming) tournament.
            Pick availability enforced by:
              - Picks open Monday 6am ET (3 days before start)
              - Deadline: tournament pick_deadline (Thu 8am ET)
              - Golfers already picked in prior weeks are hidden
        ══════════════════════════════════════════════ */}
        {page === "mypick" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {(() => {
              const now = new Date();

              // Find active (in-progress) tournament
              const activeTournament = tournaments.find(t => {
                if (!t.start_date || !t.end_date) return false;
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return now >= s && now <= e;
              });

              // Find next tournament where picks are open (Mon→Thu window)
              const nextPickableTournament = tournaments.find(t => {
                if (!t.start_date || !t.pick_deadline) return false;
                const s        = new Date(t.start_date + 'T00:00:00');
                const deadline = new Date(t.pick_deadline);
                const monday   = new Date(s);
                monday.setDate(s.getDate() - 3);
                monday.setHours(11, 0, 0, 0);
                monday.setMinutes(0, 0, 0);
                return now >= monday && now < deadline;
              });

              const currentTournament = activeTournament || nextPickableTournament;

              if (!currentTournament) return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding:40, textAlign:"center" }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>⛳</div>
                  <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, color:BILLS_WHITE }}>No upcoming tournament</div>
                  <div style={{ fontSize:13, color:"#64748b", marginTop:8 }}>Check back soon!</div>
                </div>
              );

              const deadline       = currentTournament.pick_deadline ? new Date(currentTournament.pick_deadline) : null;
              const isLocked       = currentTournament.picks_locked || (deadline && new Date() > deadline);
              const myPicks        = picks.filter(p => p.baggers?.name === loggedInBagger?.name);
              const myCurrentPick  = myPicks.find(p => p.tournaments?.week_number === currentTournament.week_number);
              // Golfers used in prior weeks (not current) — blocked from re-selection
              // We normalize special characters (e.g. Å→A, é→e) before comparing
              // so that name variations between our picks table and the Datagolf
              // field data don't cause already-used golfers to appear available.
              const normalizeForCompare = (str) =>
                (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
              const myPriorUsed    = myPicks
                .filter(p => p.tournaments?.week_number !== currentTournament.week_number)
                .map(p => normalizeForCompare(p.golfer_name));
              // Show ALL field players — used ones are color-coded, not hidden
              const myPriorPicks   = myPicks
                .filter(p => p.tournaments?.week_number !== currentTournament.week_number)
                .sort((a,b) => b.tournaments?.week_number - a.tournaments?.week_number);

              return (
                <>
                  {/* Tournament banner */}
                  <div style={{ background: isLocked ? "rgba(255,255,255,0.04)" : "rgba(198,12,48,0.08)", border:`1px solid ${isLocked ? BORDER : "rgba(198,12,48,0.25)"}`, borderRadius:14, padding:"16px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      {loggedInBagger && <Avatar bagger={loggedInBagger} size={36} i={baggers.findIndex(b => b.name === loggedInBagger.name)} />}
                      <div>
                        <div style={{ fontSize:11, color: isLocked ? "#475569" : BILLS_RED, letterSpacing:"0.1em", fontWeight:700 }}>{isLocked ? "🔒 PICKS LOCKED" : `🎯 WEEK ${currentTournament.week_number} — MAKE YOUR PICK`}</div>
                        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE }}>{currentTournament.name}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:20, alignItems:"center" }}>
                      {deadline && (
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:10, color:"#475569", marginBottom:2 }}>DEADLINE</div>
                          <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color: isLocked ? "#475569" : BILLS_RED }}>
                            {deadline.toLocaleDateString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                          </div>
                        </div>
                      )}
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:10, color:"#475569", marginBottom:2 }}>PURSE</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:"#4a90d9", fontWeight:700 }}>${(currentTournament.purse/1000000).toFixed(1)}M</div>
                      </div>
                    </div>
                  </div>

                  {/* Two-column layout: available golfers | current pick + prior picks */}
                  <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap: m ? "wrap" : "nowrap" }}>

                    {/* Left: available golfers list */}
                    <div style={{ flex: m ? "1 1 100%" : "1 1 0", background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden", minWidth:0 }}>
                      <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
                          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>Week {currentTournament.week_number} — {currentTournament.name}</span>
                          <span style={{ fontSize:11, color:"#475569", marginLeft:"auto" }}>{field.filter(p => !myPriorUsed.includes(normalizeForCompare(p.player_name))).length} available</span>
                        </div>
                        <input value={searchPick} onChange={e => setSearchPick(e.target.value)} placeholder="Search golfers..."
                          style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
                        {/* Legend — fixed at top of list */}
                        <div style={{ display:"flex", gap:12, marginTop:10, flexWrap:"wrap" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)" }} />
                            Available
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:"rgba(198,12,48,0.2)", border:"1px solid rgba(198,12,48,0.5)" }} />
                            Selected
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:"rgba(100,116,139,0.15)", border:"1px solid rgba(100,116,139,0.3)" }} />
                            Already used this season — cannot re-pick
                          </div>
                        </div>
                      </div>
                      <div style={{ maxHeight: m ? 300 : 480, overflowY:"auto" }}>
                        {field.filter(p => p.player_name.toLowerCase().includes(searchPick.toLowerCase())).length === 0
                          ? <div style={{ padding:20, textAlign:"center", color:"#475569", fontSize:13 }}>No golfers found</div>
                          : field
                              .filter(p => p.player_name.toLowerCase().includes(searchPick.toLowerCase()))
                              .map((player, i) => {
                                const isSelected  = selectedPick === player.player_name;
                                const alreadyUsed = myPriorUsed.includes(normalizeForCompare(player.player_name));
                                const isCurrentPick = normalizeForCompare(player.player_name) === normalizeForCompare(myCurrentPick?.golfer_name);
                                // Color scheme:
                                //   red bg     = currently selected this session
                                //   grey/muted = already used in a prior week (blocked)
                                //   normal     = available to pick
                                const rowBg = isSelected
                                  ? "rgba(198,12,48,0.12)"
                                  : alreadyUsed && !isCurrentPick
                                    ? "rgba(100,116,139,0.08)"
                                    : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
                                const nameColor = isSelected
                                  ? BILLS_WHITE
                                  : alreadyUsed && !isCurrentPick
                                    ? "#334155"
                                    : "#94a3b8";
                                return (
                                  <div key={player.id}
                                    style={{ display:"flex", alignItems:"center", padding:"10px 16px", borderBottom:`1px solid rgba(0,51,141,0.08)`, background: rowBg, borderLeft: isSelected ? `3px solid ${BILLS_RED}` : alreadyUsed && !isCurrentPick ? "3px solid rgba(100,116,139,0.3)" : "3px solid transparent", cursor: isLocked || (alreadyUsed && !isCurrentPick) ? "default" : "pointer", opacity: alreadyUsed && !isCurrentPick ? 0.45 : 1 }}
                                    onClick={() => {
                                      if (isLocked) return;
                                      if (alreadyUsed && !isCurrentPick) return; // block re-pick
                                      setSelectedPick(isSelected ? "" : player.player_name);
                                    }}>
                                    <div style={{ width:44, fontFamily:"'DM Mono', monospace", fontSize:11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 10 ? BILLS_RED : player.owgr_rank <= 50 ? "#4a90d9" : "#475569" }}>{player.owgr_rank ? `#${player.owgr_rank}` : "—"}</div>
                                    <div style={{ flex:1, fontSize:13, color: nameColor, fontWeight: isSelected ? 600 : 400 }}>
                                      {player.player_name}
                                      {alreadyUsed && !isCurrentPick && <span style={{ fontSize:10, color:"#334155", marginLeft:6 }}>already used</span>}
                                    </div>
                                    {isSelected && <div style={{ fontSize:13, color:BILLS_RED, fontWeight:700 }}>✓</div>}
                                  </div>
                                );
                              })
                        }
                      </div>
                    </div>

                    {/* Arrow divider (desktop only) */}
                    {!m && (
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", paddingTop:180, flexShrink:0 }}>
                        <div style={{ width:0, height:0, borderTop:"16px solid transparent", borderBottom:"16px solid transparent", borderLeft:`24px solid ${selectedPick ? BILLS_RED : BORDER}`, transition:"border-left-color 0.2s" }} />
                      </div>
                    )}

                    {/* Right: current pick + prior picks */}
                    <div style={{ flex: m ? "1 1 100%" : "1 1 0", display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>

                      {/* This week's pick card */}
                      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:4, height:16, background:BILLS_RED, borderRadius:2 }} />
                          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>This Week's Pick</span>
                        </div>
                        <div style={{ padding:16 }}>
                          {selectedPick ? (
                            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:12 }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:11, color:BILLS_RED, marginBottom:2 }}>SELECTED</div>
                                <div style={{ fontSize:18, color:BILLS_WHITE, fontWeight:700 }}>{selectedPick}</div>
                              </div>
                              {!isLocked && <button onClick={() => setSelectedPick("")} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:18 }}>✕</button>}
                            </div>
                          ) : myCurrentPick ? (
                            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:12 }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:11, color:"#22c55e", marginBottom:2 }}>CURRENT PICK</div>
                                <div style={{ fontSize:18, color:BILLS_WHITE, fontWeight:700 }}>{myCurrentPick.golfer_name}</div>
                                {!isLocked && <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Click a golfer to change</div>}
                              </div>
                              <div style={{ fontSize:22 }}>✅</div>
                            </div>
                          ) : (
                            <div style={{ padding:"20px 0", textAlign:"center", color:"#475569", fontSize:13 }}>
                              {isLocked ? "No pick submitted" : "← Click a golfer to select"}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prior picks list */}
                      <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:4, height:16, background:"#334155", borderRadius:2 }} />
                          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:"#64748b" }}>Prior Picks</span>
                        </div>
                        <div style={{ maxHeight:280, overflowY:"auto" }}>
                          {myPriorPicks.length === 0
                            ? <div style={{ padding:20, textAlign:"center", color:"#334155", fontSize:13 }}>No prior picks yet</div>
                            : myPriorPicks.map(pick => {
                                const t = tournaments.find(t => t.week_number === pick.tournaments?.week_number);
                                return (
                                  <div key={pick.id} style={{ display:"flex", alignItems:"center", padding:"10px 16px", borderBottom:`1px solid rgba(0,51,141,0.06)`, opacity:0.5 }}>
                                    <div style={{ width:40, fontFamily:"'DM Mono', monospace", fontSize:11, color:"#475569" }}>W{pick.tournaments?.week_number}</div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, color:"#64748b", fontWeight:500 }}>{pick.golfer_name}</div>
                                      <div style={{ fontSize:11, color:"#334155" }}>{t?.name || pick.tournaments?.name}</div>
                                    </div>
                                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color: Number(pick.earnings || 0) > 0 ? "#22c55e" : "#334155" }}>
                                      {Number(pick.earnings || 0) > 0 ? `$${(Number(pick.earnings)/1000).toFixed(0)}K` : "—"}
                                    </div>
                                  </div>
                                );
                              })
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submit pick button */}
                  {!isLocked && (
                    <button onClick={async () => {
                      if (!selectedPick || !loggedInBagger || !currentTournament) return;
                      const fieldPlayer = field.find(p => p.player_name === selectedPick);
                      const { error } = await supabase.from("picks").upsert({
                        bagger_id:     loggedInBagger.id,
                        tournament_id: currentTournament.id,
                        golfer_name:   selectedPick,
                        // datagolf_name stored for reliable API matching during live scoring
                        datagolf_name: fieldPlayer?.datagolf_name || null,
                        earnings:      0,
                      }, { onConflict: "bagger_id,tournament_id" });
                      if (!error) { await fetchData(); setSelectedPick(""); }
                      else { alert("Something went wrong. Please try again."); }
                    }}
                      disabled={!selectedPick}
                      style={{ width:"100%", background: selectedPick ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:12, padding:"16px", color: selectedPick ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor: selectedPick ? "pointer" : "default", letterSpacing:"0.04em", transition:"background 0.2s" }}>
                      {selectedPick ? `⛳ Submit ${selectedPick} as My Week ${currentTournament.week_number} Pick →` : "Select a golfer from the list"}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            PICKS BY WEEK PAGE
            Shows each completed tournament as a card
            with all picks sorted by earnings (best first).
            Weeks shown newest first (sorted desc).
        ══════════════════════════════════════════════ */}
        {page === "picks" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {tournaments
              .filter(t => picks.some(p => p.tournaments?.week_number === t.week_number))
              .sort((a,b) => b.week_number - a.week_number)
              .map(t => (
                <div key={t.id} style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                  <div style={{ padding: m ? "12px 16px" : "14px 24px", borderBottom:`1px solid ${BORDER}`, background:"rgba(0,51,141,0.1)" }}>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize: m ? 14 : 15, color:BILLS_WHITE }}>{t.name}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Week {t.week_number} · {fmt(t.purse || 0)}</div>
                  </div>
                  <div style={{ padding:8 }}>
                    {picks
                      .filter(p => p.tournaments?.week_number === t.week_number)
                      .sort((a,b) => Number(b.earnings || 0) - Number(a.earnings || 0))
                      .map((pick, i) => {
                        const bagger = baggers.find(b => b.name === pick.baggers?.name);
                        const bi     = baggers.findIndex(b => b.name === pick.baggers?.name);
                        return (
                          <div key={pick.id} style={{ display:"flex", alignItems:"center", padding: m ? "8px 12px" : "10px 16px", borderRadius:8, gap:10, background: i === 0 ? "rgba(198,12,48,0.05)" : "transparent" }}>
                            <div style={{ width:20, fontFamily:"'DM Mono', monospace", fontSize:11, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                            {bagger && <Avatar bagger={bagger} size={26} i={bi} />}
                            <div style={{ width: m ? 50 : 60, fontSize:13, color:BILLS_WHITE, fontWeight:500 }}>{pick.baggers?.name}</div>
                            <div style={{ flex:1, fontSize: m ? 12 : 13, color:"#64748b" }}>{pick.golfer_name}</div>
                            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                              <div style={{ fontFamily:"'DM Mono', monospace", fontSize: m ? 11 : 13, color: Number(pick.earnings || 0) > 500000 ? BILLS_RED : "#64748b" }}>
                                {m ? fmt(Number(pick.earnings || 0)) : fmtFull(Number(pick.earnings || 0))}
                              </div>
                              {pick.finish_position && (
                                <div style={{ fontSize:10, color: pick.finish_position <= 10 ? "#22c55e" : "#475569", fontFamily:"'DM Mono', monospace" }}>
                                  {pick.finish_position === 1 ? "🏆 1st" : `T${pick.finish_position}`}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ══════════════════════════════════════════════
            BULLETIN BOARD PAGE
            Members can post trash talk, pick alerts,
            or news. Supports @mentions (sends email
            notification via send-tag-notification Edge
            Function), image uploads, and emoji reactions.
        ══════════════════════════════════════════════ */}
        {page === "board" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Post composer */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, padding: m ? 16 : 24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Post to the Board</span>
              </div>
              {/* Who's posting */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, background:"rgba(0,51,141,0.12)", border:`1px solid ${BORDER}`, borderRadius:12, padding:"10px 16px" }}>
                {loggedInBagger && <Avatar bagger={loggedInBagger} size={32} i={baggers.findIndex(b => b.name === loggedInBagger.name)} />}
                <div>
                  <div style={{ fontSize:11, color:"#64748b" }}>Posting as</div>
                  <div style={{ fontSize:15, color:BILLS_WHITE, fontWeight:600 }}>{loggedInBagger?.name || "Unknown"}</div>
                </div>
              </div>
              {/* Category selector */}
              <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                {[
                  { id:"banter",       label:"🗣️ Trash Talk" },
                  { id:"pick",         label:"⛳ Pick Alert" },
                  { id:"announcement", label:"📢 News" },
                ].map(c => (
                  <button key={c.id} onClick={() => setPostCategory(c.id)}
                    style={{ background: postCategory === c.id ? "rgba(0,51,141,0.3)" : "rgba(255,255,255,0.03)", border:`1px solid ${postCategory === c.id ? "rgba(0,51,141,0.5)" : BORDER}`, borderRadius:8, padding:"5px 12px", color: postCategory === c.id ? "#93c5fd" : "#475569", fontSize:12, cursor:"pointer" }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {/* Text area with @mention autocomplete */}
              <div style={{ position:"relative" }}>
                <textarea value={newPost} onChange={e => {
                  const val = e.target.value;
                  setNewPost(val);
                  // Detect @ character and show autocomplete dropdown
                  const lastAtIndex = val.lastIndexOf("@");
                  if (lastAtIndex !== -1) {
                    const query  = val.slice(lastAtIndex + 1).toLowerCase();
                    const matches = baggers.filter(b => b.name.toLowerCase().startsWith(query) && b.name !== currentBagger);
                    setMentionQuery(query);
                    setMentionMatches(matches);
                    setShowMentionDropdown(matches.length > 0);
                  } else {
                    setShowMentionDropdown(false);
                  }
                }} placeholder="Trash talk welcome... type @ to tag someone 🏌️" rows={3}
                  style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:BILLS_WHITE, fontSize:14, fontFamily:"'DM Sans', sans-serif", outline:"none", resize:"vertical", boxSizing:"border-box" }} />

                {/* @mention dropdown */}
                {showMentionDropdown && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, background:BG2, border:`1px solid ${BORDER}`, borderRadius:10, zIndex:100, overflow:"hidden", marginTop:4 }}>
                    {mentionMatches.map(b => (
                      <div key={b.name} onClick={async () => {
                        // Replace the partial @query with @FullName in text
                        const lastAtIndex = newPost.lastIndexOf("@");
                        const newText = newPost.slice(0, lastAtIndex) + `@${b.name} `;
                        setNewPost(newText);
                        setShowMentionDropdown(false);
                        // Fire tag notification email via Edge Function
                        await fetch("https://iijfldracspwgezcwhtg.supabase.co/functions/v1/send-tag-notification", {
                          method: "POST",
                          headers: {
                            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            tagged_name: b.name,
                            posted_by:   currentBagger,
                            content:     newText,
                          }),
                        });
                      }}
                        style={{ padding:"10px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${BORDER}` }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(198,12,48,0.1)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <Avatar bagger={b} size={24} i={baggers.findIndex(x => x.name === b.name)} />
                        <span style={{ fontSize:13, color:BILLS_WHITE }}>{b.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Photo attachment */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8 }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, color:"#64748b" }}>
                  📷 Add Photo
                  <input type="file" accept="image/*" capture="environment" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) { setPostImage(file); setPostImagePreview(URL.createObjectURL(file)); }
                  }} style={{ display:"none" }} />
                </label>
                {uploadingPost && <span style={{ fontSize:12, color:"#f59e0b" }}>Uploading...</span>}
              </div>
              {postImagePreview && (
                <div style={{ marginTop:10, position:"relative", display:"inline-block" }}>
                  <img src={postImagePreview} alt="Preview" style={{ maxWidth:"100%", maxHeight:200, borderRadius:10, border:`1px solid ${BORDER}` }} />
                  <button onClick={() => { setPostImage(null); setPostImagePreview(null); }}
                    style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.6)", border:"none", borderRadius:"50%", width:24, height:24, color:"white", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              )}

              {/* Submit post */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
                <div style={{ fontSize:11, color:"#475569" }}>{currentBagger ? `As ${currentBagger}` : "Pick your name"}</div>
                <button onClick={async () => {
                  if (!newPost.trim() || !currentBagger) return;
                  let imageUrl = null;
                  if (postImage) { imageUrl = await uploadPostImage(postImage); }
                  const { data } = await supabase.from("posts")
                    .insert({ bagger_name: currentBagger, content: newPost.trim(), category: postCategory, reactions: {}, image_url: imageUrl })
                    .select();
                  if (data) { setPosts(prev => [data[0], ...prev]); setNewPost(""); setPostImage(null); setPostImagePreview(null); }
                }}
                  style={{ background: currentBagger && newPost.trim() ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:10, padding:"9px 20px", color: currentBagger && newPost.trim() ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  Post 📌
                </button>
              </div>
            </div>

            {posts.length === 0 && (
              <div style={{ padding:40, textAlign:"center", color:"#475569", fontSize:14 }}>No posts yet — be the first! 🏌️</div>
            )}

            {/* Post feed */}
            {posts.map(post => {
              const cats = {
                banter:       { bg:"rgba(198,12,48,0.06)",   border:"rgba(198,12,48,0.2)",   label:"🗣️ Trash Talk", color:BILLS_RED },
                pick:         { bg:"rgba(0,51,141,0.08)",    border:"rgba(0,51,141,0.25)",   label:"⛳ Pick Alert",  color:"#4a90d9" },
                announcement: { bg:"rgba(255,255,255,0.04)", border:"rgba(255,255,255,0.1)", label:"📢 News",        color:"#f59e0b" },
              };
              const cat    = cats[post.category] || cats.banter;
              const bagger = baggers.find(bg => bg.name === post.bagger_name);
              const bi     = baggers.findIndex(bg => bg.name === post.bagger_name);
              return (
                <div key={post.id} style={{ background:cat.bg, border:`1px solid ${cat.border}`, borderRadius:14, padding: m ? 14 : 20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      {bagger && <Avatar bagger={bagger} size={34} i={bi} />}
                      <div>
                        <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600 }}>{post.bagger_name}</div>
                        <div style={{ fontSize:10, color:"#475569" }}>{new Date(post.created_at).toLocaleDateString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
                      </div>
                      <span style={{ fontSize:10, background:`${cat.color}22`, color:cat.color, borderRadius:20, padding:"2px 8px", fontWeight:600 }}>{cat.label}</span>
                    </div>
                    <button onClick={async () => {
                      await supabase.from("posts").delete().eq("id", post.id);
                      setPosts(prev => prev.filter(p => p.id !== post.id));
                    }} style={{ background:"transparent", border:"none", color:"#334155", cursor:"pointer", fontSize:14 }}>✕</button>
                  </div>
                  <p style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.6, margin:"0 0 12px" }}>{post.content}</p>
                  {post.image_url && (
                    <div style={{ marginBottom:12 }}>
                      <img src={post.image_url} alt="Post image" onClick={() => setExpandedImage(post.image_url)}
                        style={{ maxWidth:"100%", maxHeight:300, borderRadius:10, border:`1px solid ${BORDER}`, cursor:"pointer", objectFit:"cover" }} />
                      <div style={{ fontSize:10, color:"#475569", marginTop:4 }}>Click to expand</div>
                    </div>
                  )}
                  {/* Emoji reactions */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {["🔥","😂","💀","👏","🏌️","⛳"].map(emoji => {
                      const count = post.reactions?.[emoji] || 0;
                      return (
                        <button key={emoji} onClick={async () => {
                          const updated = { ...post.reactions, [emoji]: (post.reactions?.[emoji] || 0) + 1 };
                          await supabase.from("posts").update({ reactions: updated }).eq("id", post.id);
                          setPosts(prev => prev.map(p => p.id === post.id ? { ...p, reactions: updated } : p));
                        }}
                          style={{ background: count > 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", border:`1px solid ${count > 0 ? "rgba(255,255,255,0.15)" : BORDER}`, borderRadius:20, padding:"3px 8px", cursor:"pointer", fontSize:12, color:"#94a3b8", display:"flex", alignItems:"center", gap:3 }}>
                          {emoji}{count > 0 && <span style={{ fontSize:10 }}>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            SCHEDULE PAGE
            Lists all 32 pool tournaments for the 2026
            season. Shows status: LIVE, DONE, SKIPPED,
            UPCOMING. Uses the PREVIOUS_WINNERS map for
            the "Prev. Winner" column.
        ══════════════════════════════════════════════ */}
        {page === "schedule" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {!m && (
              <div style={{ display:"grid", gridTemplateColumns:"48px 1fr 120px 90px 150px 100px", gap:16, padding:"8px 20px", marginBottom:4 }}>
                {["WK","TOURNAMENT / COURSE","DATES","PURSE","PREV. WINNER","STATUS"].map(h => (
                  <div key={h} style={{ fontSize:10, color:"#475569", letterSpacing:"0.1em", fontWeight:600 }}>{h}</div>
                ))}
              </div>
            )}
            {tournaments.map(t => {
              const startDate  = t.start_date ? new Date(t.start_date + 'T00:00:00') : null;
              const endDate    = t.end_date   ? tournamentEnd(t) : null;
              const isCompleted= endDate && endDate < today;
              const isCurrent  = startDate && endDate && startDate <= today && endDate >= today;
              const isUpcoming = startDate && startDate > today;
              const hasPicks   = picks.some(p => p.tournaments?.week_number === t.week_number);
              const prevWinner = PREVIOUS_WINNERS[t.name] || "—";

              return m ? (
                // Mobile: compact card
                <div key={t.id} style={{ background: isCurrent ? "rgba(198,12,48,0.06)" : "rgba(0,51,141,0.05)", border:`1px solid ${isCurrent ? "rgba(198,12,48,0.25)" : BORDER}`, borderRadius:12, padding:"12px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color: isCurrent ? BILLS_RED : "#475569", background:"rgba(0,51,141,0.15)", padding:"2px 6px", borderRadius:4 }}>W{t.week_number}</span>
                        {isCurrent  && <span style={{ fontSize:10, background:"rgba(198,12,48,0.15)", color:BILLS_RED,   borderRadius:20, padding:"2px 8px", fontWeight:700 }}>🔴 LIVE</span>}
                        {isCompleted && hasPicks  && <span style={{ fontSize:10, background:"rgba(0,51,141,0.2)", color:"#4a90d9", borderRadius:20, padding:"2px 8px" }}>✓ Done</span>}
                        {isCompleted && !hasPicks && <span style={{ fontSize:10, color:"#334155" }}>Skipped</span>}
                        {isUpcoming  && <span style={{ fontSize:10, color:"#475569" }}>Upcoming</span>}
                      </div>
                      <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:500 }}>{t.name}</div>
                      <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>
                        {startDate ? startDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"} – {endDate ? endDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"}
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color:"#4a90d9", fontWeight:600 }}>{fmt(t.purse || 0)}</div>
                      <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{prevWinner}</div>
                    </div>
                  </div>
                </div>
              ) : (
                // Desktop: full grid row
                <div key={t.id} style={{ display:"grid", gridTemplateColumns:"48px 1fr 120px 90px 150px 100px", gap:16, padding:"14px 20px", background: isCurrent ? "rgba(198,12,48,0.06)" : "rgba(0,51,141,0.05)", border:`1px solid ${isCurrent ? "rgba(198,12,48,0.25)" : BORDER}`, borderRadius:12, alignItems:"center" }}>
                  <div style={{ width:36, height:36, borderRadius:8, background: isCompleted && hasPicks ? "rgba(198,12,48,0.15)" : isCurrent ? "rgba(198,12,48,0.2)" : "rgba(0,51,141,0.15)", border:`1px solid ${(isCompleted && hasPicks) || isCurrent ? "rgba(198,12,48,0.3)" : BORDER}`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono', monospace", fontSize:13, fontWeight:600, color:(isCompleted && hasPicks) || isCurrent ? BILLS_RED : "#475569" }}>{t.week_number}</div>
                  <div>
                    <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:500, marginBottom:2 }}>{t.name}</div>
                    <div style={{ fontSize:11, color:"#475569" }}>{t.course}</div>
                  </div>
                  <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color:"#64748b" }}>
                    {startDate ? startDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"} – {endDate ? endDate.toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"}
                  </div>
                  <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color:"#4a90d9", fontWeight:600 }}>{fmt(t.purse || 0)}</div>
                  <div style={{ fontSize:12, color:"#64748b" }}>{prevWinner}</div>
                  <div>
                    {isCurrent   && <span style={{ fontSize:10, background:"rgba(198,12,48,0.15)", color:BILLS_RED,   borderRadius:20, padding:"3px 10px", fontWeight:700 }}>🔴 LIVE</span>}
                    {isCompleted && hasPicks  && <span style={{ fontSize:10, background:"rgba(0,51,141,0.2)", color:"#4a90d9", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>✓ DONE</span>}
                    {isCompleted && !hasPicks && <span style={{ fontSize:10, background:"rgba(255,255,255,0.04)", color:"#334155", borderRadius:20, padding:"3px 10px" }}>SKIPPED</span>}
                    {isUpcoming  && <span style={{ fontSize:10, background:"rgba(255,255,255,0.04)", color:"#475569", borderRadius:20, padding:"3px 10px" }}>UPCOMING</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            MEMBERS PAGE
            Shows profile cards for each main-pool bagger,
            sorted by season earnings (highest first).
            Includes avatar picker and season stats.
        ══════════════════════════════════════════════ */}
        {page === "members" && (
          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap:16 }}>
            {sorted.map(([name, total], i) => {
              const bagger = baggers.find(b => b.name === name);
              if (!bagger) return null;
              return (
                <div key={bagger.id} style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${i === 0 ? "rgba(198,12,48,0.3)" : BORDER}`, borderRadius:16, padding: m ? 16 : 20, borderTop:`3px solid ${COLORS[i % COLORS.length]}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                    <div style={{ position:"relative" }}>
                      <Avatar bagger={bagger} size={44} i={i} />
                      <button onClick={() => setShowAvatarPicker(showAvatarPicker === bagger.id ? null : bagger.id)}
                        style={{ position:"absolute", bottom:-2, right:-2, width:18, height:18, borderRadius:"50%", background:BILLS_RED, border:"none", cursor:"pointer", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", color:"white" }}>
                        ✏️
                      </button>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, color:BILLS_WHITE, fontWeight:600 }}>{bagger.name}</div>
                      <div style={{ fontSize:11, color:"#475569" }}>{bagger.email}</div>
                    </div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, color: i === 0 ? BILLS_RED : "#475569", fontWeight:700 }}>#{i+1}</div>
                  </div>

                  {/* Inline avatar picker */}
                  {showAvatarPicker === bagger.id && (
                    <div style={{ background:"rgba(0,0,0,0.3)", border:`1px solid ${BORDER}`, borderRadius:12, padding:12, marginBottom:14 }}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:8 }}>PICK AN AVATAR</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                        {PRESET_AVATARS.map(emoji => (
                          <button key={emoji} onClick={() => setEmojiAvatar(bagger.id, emoji)}
                            style={{ width:34, height:34, borderRadius:8, background: bagger.avatar_url === emoji ? "rgba(198,12,48,0.2)" : "rgba(255,255,255,0.05)", border:`1px solid ${bagger.avatar_url === emoji ? "rgba(198,12,48,0.4)" : BORDER}`, cursor:"pointer", fontSize:16 }}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div style={{ borderTop:`1px solid ${BORDER}`, paddingTop:10 }}>
                        <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>OR UPLOAD A PHOTO</div>
                        <input type="file" accept="image/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) await uploadAvatar(bagger.id, file);
                        }} style={{ fontSize:11, color:"#64748b", width:"100%" }} />
                        {uploadingAvatar && <div style={{ fontSize:11, color:"#f59e0b", marginTop:4 }}>Uploading...</div>}
                      </div>
                    </div>
                  )}

                  <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderTop:`1px solid ${BORDER}` }}>
                    <div style={{ fontSize:12, color:"#64748b" }}>Season Total</div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:BILLS_WHITE, fontWeight:600 }}>{m ? fmt(total) : fmtFull(total)}</div>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0" }}>
                    <div style={{ fontSize:12, color:"#64748b" }}>Weeks Played</div>
                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:"#94a3b8" }}>{picks.filter(p => p.baggers?.name === name).length}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            MOOKIE'S POOL PAGE
            Scoring: pick 5 golfers, best 4 net scores
            count. Net score = finish position + OWGR
            weighting. Lower total = better (golf style).

            Sections:
              1. Pool header + weighting reference card
              2. Current Standings  ← sorted lowest→highest
              3. Detailed Tracker   ← sorted lowest→highest
              4. My Picks (pick/manage your 5 golfers)
              5. Tiebreaker modal (shown after staging 5)

            Both standings sections use the same
            enrichContestPicks() + computeMemberStandings()
            helpers, reading from the weekly_field table
            (live data) rather than contest_scores (stale).
        ══════════════════════════════════════════════ */}
        {page === "contest" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Pool header */}
            <div style={{ background:"rgba(198,12,48,0.08)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:16, padding: m ? "16px" : "20px 28px" }}>
              <div style={{ fontFamily:"'Playfair Display', serif", fontSize: m ? 18 : 24, color:BILLS_WHITE, marginBottom:4 }}>🏆 Mookie's Pool</div>
              <div style={{ fontSize:13, color:"#64748b" }}>Pick 5 golfers — best 4 scores count. Lowest net points wins.</div>
            </div>

            {/* Weighting reference */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 20px" }}>
              <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600, marginBottom:10 }}>WEIGHTING SYSTEM</div>
              <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                {[
                  { label:"Top 15",    value:"+5 pts",      color:"#ef4444" },
                  { label:"Rank 16-30",value:"+3 pts",      color:"#f97316" },
                  { label:"Rank 31-45",value:"0 pts",       color:"#64748b" },
                  { label:"Rank 46-60",value:"-3 pts",      color:"#22c55e" },
                  { label:"Rank 60+",  value:"-5 pts",      color:"#4a90d9" },
                  { label:"Missed Cut",value:"80 + weight", color:BILLS_RED },
                ].map(w => (
                  <div key={w.label} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"6px 12px", display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>{w.label}</span>
                    <span style={{ fontSize:12, color:w.color, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>{w.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── CURRENT STANDINGS ── */}
            {/* Uses computeMemberStandings() which reads live field data.
                Gated: hidden until the logged-in member has submitted 5 picks.
                Sorted: lowest net total first (best score = #1). */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Current Standings</span>
                </div>
                {/* Export button — builds a CSV with all contestants, their picks,
                    OWGR weighting, net points, and current ranking */}
                <button onClick={() => {
                  // Find the active tournament the same way the standings do
                  const activeTournament =
                    tournaments.find(t => {
                      const s = new Date(t.start_date + 'T00:00:00');
                      const e = tournamentEnd(t);
                      return new Date() >= s && new Date() <= e;
                    }) ||
                    tournaments.find(t => {
                      if (!t.start_date || !t.pick_deadline) return false;
                      const s        = new Date(t.start_date + 'T00:00:00');
                      const deadline = new Date(t.pick_deadline);
                      const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11,0,0,0);
                      return new Date() >= monday && new Date() < deadline;
                    });
                  if (!activeTournament) return;

                  // Compute standings using the same shared helper as the UI
                  const standings = computeMemberStandings(contestMembers, contestPicks, field, activeTournament.id);

                  // Build CSV rows — one row per golfer pick per contestant
                  const headers = [
                    "Rank", "Contestant", "Tiebreaker",
                    "Golfer", "OWGR Rank", "Weighting", "Position", "Net Points", "Counts Toward Best 4"
                  ];

                  const rows = [];
                  standings.forEach((s, i) => {
                    // Sort picks same way as the detailed tracker — best net points first
                    const sortedPicks = [...s.enrichedPicks].sort((a, b) => {
                      if (a.netPoints && b.netPoints) return a.netPoints - b.netPoints;
                      return (a.owgr || 999) - (b.owgr || 999);
                    });
                    sortedPicks.forEach(g => {
                      const counts   = s.best4.some(b => b.golfer_name === g.golfer_name);
                      const position = g.position === 80 ? "CUT" : g.position > 0 ? g.position : "—";
                      const tiebreaker = s.enrichedPicks[0]?.tiebreaker !== undefined && s.enrichedPicks[0]?.tiebreaker !== null
                        ? (s.enrichedPicks[0].tiebreaker > 0 ? `+${s.enrichedPicks[0].tiebreaker}` : String(s.enrichedPicks[0].tiebreaker))
                        : "";
                      rows.push([
                        i + 1,
                        s.member.name,
                        tiebreaker,
                        g.golfer_name,
                        g.owgr ? `#${g.owgr}` : "—",
                        g.weighting > 0 ? `+${g.weighting}` : g.weighting,
                        position,
                        g.position > 0 ? g.netPoints : "—",
                        counts ? "Yes" : "No",
                      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
                    });
                    // Blank separator row between contestants for readability in Excel
                    rows.push("");
                  });

                  const csv      = [headers.join(","), ...rows].join("\n");
                  const blob     = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url      = URL.createObjectURL(blob);
                  const link     = document.createElement("a");
                  const filename = `${activeTournament.name}_contest_standings_${new Date().toISOString().split("T")[0]}.csv`;
                  link.setAttribute("href", url);
                  link.setAttribute("download", filename);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
                  style={{ background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"5px 12px", color:"#94a3b8", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                  📥 Export
                </button>
              </div>
              {(() => {
                // Determine the active or upcoming tournament
                const activeTournament = tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00');
                  const e = tournamentEnd(t);
                  return new Date() >= s && new Date() <= e;
                }) || tournaments.find(t => {
                  if (!t.start_date || !t.pick_deadline) return false;
                  const s        = new Date(t.start_date + 'T00:00:00');
                  const deadline = new Date(t.pick_deadline);
                  const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11, 0, 0, 0);
                  return new Date() >= monday && new Date() < deadline;
                });

                if (!activeTournament)
                  return <div style={{ padding:32, textAlign:"center", color:"#475569", fontSize:14 }}>No active tournament</div>;

                // Gate: require current user to have submitted 5 picks first
                const myMember = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
                const myPicks  = contestPicks.filter(p => p.member_id === myMember?.id && p.tournament_id === activeTournament.id);
                if (myPicks.length < 5) return (
                  <div style={{ padding:32, textAlign:"center" }}>
                    <div style={{ fontSize:24, marginBottom:12 }}>🔒</div>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE, marginBottom:8 }}>Submit your 5 picks to see standings</div>
                    <div style={{ fontSize:13, color:"#475569" }}>Standings are hidden until you lock in your picks</div>
                  </div>
                );

                // Compute standings using shared helper (live field data, lowest→highest)
                const memberStandings = computeMemberStandings(contestMembers, contestPicks, field, activeTournament.id);

                if (memberStandings.length === 0)
                  return <div style={{ padding:32, textAlign:"center", color:"#475569", fontSize:14 }}>No picks submitted yet</div>;

                return memberStandings.map((s, i) => (
                  <div key={s.member.id} style={{ borderBottom:`1px solid rgba(0,51,141,0.08)` }}>
                    <div style={{ display:"flex", alignItems:"center", padding: m ? "10px 16px" : "12px 24px", background: i === 0 && s.total > 0 ? "rgba(198,12,48,0.06)" : "transparent", gap:12 }}>
                      <div style={{ width:24, fontFamily:"'DM Mono', monospace", fontSize:12, color: i === 0 ? BILLS_RED : "#475569" }}>#{i+1}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ fontSize:14, color:BILLS_WHITE, fontWeight: i === 0 ? 600 : 400 }}>{s.member.name}</div>
                          {/* Show tiebreaker value if present */}
                          {s.enrichedPicks[0]?.tiebreaker !== undefined && s.enrichedPicks[0]?.tiebreaker !== null && (
                            <span style={{ fontSize:10, background:"rgba(0,51,141,0.3)", border:`1px solid ${BORDER}`, borderRadius:20, padding:"2px 8px", color:"#64748b" }}>
                              TB: {s.enrichedPicks[0].tiebreaker > 0 ? `+${s.enrichedPicks[0].tiebreaker}` : s.enrichedPicks[0].tiebreaker}
                            </span>
                          )}
                        </div>
                        {/* Golfer chips with weighting badges */}
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
                          {s.enrichedPicks.map(g => (
                            <span key={g.golfer_name} style={{ fontSize:10, background:"rgba(0,51,141,0.2)", border:`1px solid ${BORDER}`, borderRadius:20, padding:"2px 8px", color:"#94a3b8" }}>
                              {g.golfer_name}
                              <span style={{ color: g.weighting > 0 ? "#ef4444" : g.weighting < 0 ? "#22c55e" : "#64748b", marginLeft:4 }}>
                                ({g.weighting > 0 ? `+${g.weighting}` : g.weighting})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Total score — only show when scoring has started (total > 0) */}
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:15, color: i === 0 && s.total > 0 ? BILLS_RED : "#64748b", fontWeight:700 }}>
                        {s.total > 0 ? s.total : "—"}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* ── DETAILED TRACKER ── */}
            {/* Same data source as Current Standings.
                Members sorted lowest→highest total.
                Each member block shows all 5 golfers in a
                table with position, weighting, net pts,
                and whether the pick counts toward best-4. */}
            <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>Detailed Tracker</span>
              </div>
              {(() => {
                const activeTournament = tournaments.find(t => {
                  const s = new Date(t.start_date + 'T00:00:00');
                  const e = tournamentEnd(t);
                  return new Date() >= s && new Date() <= e;
                }) || tournaments.find(t => {
                  if (!t.start_date || !t.pick_deadline) return false;
                  const s        = new Date(t.start_date + 'T00:00:00');
                  const deadline = new Date(t.pick_deadline);
                  const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11, 0, 0, 0);
                  return new Date() >= monday && new Date() < deadline;
                });
                if (!activeTournament)
                  return <div style={{ padding:32, textAlign:"center", color:"#475569", fontSize:14 }}>No active tournament</div>;

                // Gate: same pick submission requirement as standings
                const myMember = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
                const myPicks  = contestPicks.filter(p => p.member_id === myMember?.id && p.tournament_id === activeTournament.id);
                if (myPicks.length < 5) return (
                  <div style={{ padding:32, textAlign:"center" }}>
                    <div style={{ fontSize:24, marginBottom:12 }}>🔒</div>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:BILLS_WHITE, marginBottom:8 }}>Submit your 5 picks to see standings</div>
                    <div style={{ fontSize:13, color:"#475569" }}>Standings are hidden until you lock in your picks</div>
                  </div>
                );

                // Use the same shared computation as Current Standings
                // so both sections are always in sync and sorted identically.
                const memberStandings = computeMemberStandings(contestMembers, contestPicks, field, activeTournament.id);

                return memberStandings.map((s) => {
                  if (s.enrichedPicks.length === 0) return null;

                  // Within each member's picks, sort by net points ascending
                  // (best scoring pick first), fall back to OWGR for unscored picks
                  const sortedPicks = [...s.enrichedPicks].sort((a, b) => {
                    if (a.netPoints && b.netPoints) return a.netPoints - b.netPoints;
                    return (a.owgr || 999) - (b.owgr || 999);
                  });

                  return (
                    <div key={s.member.id} style={{ borderBottom:`1px solid ${BORDER}` }}>
                      {/* Member header with running total */}
                      <div style={{ padding:"12px 20px", background:"rgba(0,51,141,0.1)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:14, color:BILLS_WHITE }}>{s.member.name}</div>
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:BILLS_RED, fontWeight:700 }}>
                          {s.total > 0 ? `Total: ${s.total} pts` : "Pending"}
                        </div>
                      </div>
                      {/* Picks table */}
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead>
                            <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
                              {["GOLFER","OWGR","POSITION","WEIGHTING","NET PTS","COUNTS"].map(h => (
                                <th key={h} style={{ padding:"8px 16px", textAlign: h === "GOLFER" ? "left" : "center", color:"#475569", fontWeight:600, fontSize:10, letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedPicks.map(g => {
                              const counts = s.best4.some(b => b.golfer_name === g.golfer_name);
                              return (
                                <tr key={g.id || g.golfer_name} style={{ borderBottom:`1px solid rgba(0,51,141,0.06)`, background: counts ? "rgba(34,197,94,0.04)" : "transparent" }}>
                                  <td style={{ padding:"10px 16px", color: counts ? BILLS_WHITE : "#64748b", fontWeight: counts ? 600 : 400 }}>{g.golfer_name}</td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", color: !g.owgr ? "#334155" : g.owgr <= 15 ? BILLS_RED : g.owgr <= 30 ? "#f97316" : "#64748b", fontFamily:"'DM Mono', monospace" }}>
                                    {g.owgr ? `#${g.owgr}` : "—"}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", fontFamily:"'DM Mono', monospace", color:BILLS_WHITE }}>
                                    {g.position === 80
                                      ? <span style={{ fontSize:10, background:"rgba(198,12,48,0.15)", color:BILLS_RED, borderRadius:20, padding:"2px 8px", fontWeight:700 }}>CUT</span>
                                      : g.position > 0 ? g.position : "—"}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", fontFamily:"'DM Mono', monospace", color: g.weighting > 0 ? "#ef4444" : g.weighting < 0 ? "#22c55e" : "#64748b" }}>
                                    {g.weighting > 0 ? `+${g.weighting}` : g.weighting}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center", fontFamily:"'DM Mono', monospace", color: g.position === 80 ? BILLS_RED : BILLS_WHITE, fontWeight:700 }}>
                                    {g.position > 0 ? g.netPoints : "—"}
                                  </td>
                                  <td style={{ padding:"10px 16px", textAlign:"center" }}>
                                    {counts
                                      ? <span style={{ fontSize:10, background:"rgba(34,197,94,0.15)", color:"#22c55e", borderRadius:20, padding:"2px 8px" }}>✓</span>
                                      : <span style={{ fontSize:10, color:"#334155" }}>—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* ── MY PICKS ── */}
            {/* Lets the logged-in contest member manage their 5 picks.
                Flow: browse field → stage picks → confirm → tiebreaker modal → submit.
                Submitted picks can be deleted (until deadline).
                Shows 5/5 completion indicator. */}
            {(() => {
              const activeTournament = tournaments.find(t => {
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return new Date() >= s && new Date() <= e;
              }) || tournaments.find(t => {
                if (!t.start_date || !t.pick_deadline) return false;
                const s        = new Date(t.start_date + 'T00:00:00');
                const deadline = new Date(t.pick_deadline);
                const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11, 0, 0, 0);
                return new Date() >= monday && new Date() < deadline;
              });
              if (!activeTournament) return null;

              const myMember       = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
              if (!myMember) return null;

              const myContestPicks = contestPicks.filter(p => p.member_id === myMember.id && p.tournament_id === activeTournament.id);
              const deadline       = activeTournament.pick_deadline ? new Date(activeTournament.pick_deadline) : null;
              const isLocked       = deadline && new Date() > deadline;
              const totalStaged    = myContestPicks.length + contestPickStaging.length;

              return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:4, height:18, background:BILLS_RED, borderRadius:2 }} />
                      <span style={{ fontFamily:"'Playfair Display', serif", fontSize:15, color:BILLS_WHITE }}>My Picks — {activeTournament.name}</span>
                    </div>
                    <div style={{ fontSize:11, color: totalStaged >= 5 ? "#22c55e" : BILLS_RED }}>{totalStaged}/5 picks</div>
                  </div>

                  {/* Already-submitted picks */}
                  {myContestPicks.length > 0 && (
                    <div style={{ padding:"12px 20px", borderBottom:`1px solid ${BORDER}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div style={{ fontSize:11, color:"#64748b" }}>✅ SUBMITTED</div>
                        {myContestPicks[0]?.tiebreaker !== undefined && myContestPicks[0]?.tiebreaker !== null && (
                          <div style={{ fontSize:11, color:"#64748b" }}>
                            Tiebreaker: <span style={{ color:BILLS_WHITE, fontFamily:"'DM Mono', monospace", fontWeight:600 }}>
                              {myContestPicks[0].tiebreaker > 0 ? `+${myContestPicks[0].tiebreaker}` : myContestPicks[0].tiebreaker}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {myContestPicks.map(pick => (
                          <div key={pick.id} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:20, padding:"4px 12px" }}>
                            <span style={{ fontSize:13, color:BILLS_WHITE }}>{pick.golfer_name}</span>
                            {!isLocked && (
                              <button onClick={async () => {
                                const { error } = await supabase.from("contest_picks").delete().eq("id", pick.id);
                                if (!error) setContestPicks(prev => prev.filter(p => p.id !== pick.id));
                              }} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:14, padding:0 }}>✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Staged (not yet submitted) picks */}
                  {contestPickStaging.length > 0 && (
                    <div style={{ padding:"12px 20px", borderBottom:`1px solid ${BORDER}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div style={{ fontSize:11, color:"#f59e0b" }}>⏳ STAGED — NOT YET SUBMITTED</div>
                        <button onClick={() => setContestPickStaging([])} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:11, textDecoration:"underline" }}>Clear All</button>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {contestPickStaging.map(pick => (
                          <div key={pick.golfer_name} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:20, padding:"4px 12px" }}>
                            <span style={{ fontSize:13, color:BILLS_WHITE }}>{pick.golfer_name}</span>
                            <button onClick={() => setContestPickStaging(prev => prev.filter(p => p.golfer_name !== pick.golfer_name))} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:14, padding:0 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Golfer search / pick selector */}
                  {!isLocked && totalStaged < 5 && (
                    <div style={{ padding:"12px 20px", borderBottom:`1px solid ${BORDER}` }}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:8 }}>SELECT {5 - totalStaged} MORE GOLFER{5 - totalStaged !== 1 ? "S" : ""}</div>
                      <input placeholder="Search golfers..." onChange={e => setSearchPick(e.target.value)} value={searchPick}
                        style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", marginBottom:10, boxSizing:"border-box" }} />
                      <div style={{ maxHeight:280, overflowY:"auto", border:`1px solid ${BORDER}`, borderRadius:10 }}>
                        {field
                          .filter(p => p.player_name.toLowerCase().includes(searchPick.toLowerCase()))
                          .filter(p => !myContestPicks.some(cp  => cp.golfer_name === p.player_name))
                          .filter(p => !contestPickStaging.some(sp => sp.golfer_name === p.player_name))
                          .map((player, i) => (
                            <div key={player.id}
                              onClick={() => {
                                if (totalStaged >= 5) return;
                                setContestPickStaging(prev => [...prev, { golfer_name: player.player_name, datagolf_name: player.datagolf_name }]);
                                setSearchPick("");
                              }}
                              style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom:`1px solid rgba(0,51,141,0.06)`, cursor:"pointer", background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(198,12,48,0.08)"}
                              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent"}>
                              {/* OWGR rank with color coding matching the weighting tiers */}
                              <div style={{ width:44, fontFamily:"'DM Mono', monospace", fontSize:11, color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 15 ? BILLS_RED : player.owgr_rank <= 30 ? "#f97316" : player.owgr_rank <= 45 ? "#64748b" : player.owgr_rank <= 60 ? "#22c55e" : "#4a90d9" }}>
                                {player.owgr_rank ? `#${player.owgr_rank}` : "—"}
                              </div>
                              <div style={{ flex:1, fontSize:13, color:"#94a3b8" }}>{player.player_name}</div>
                              {/* Weighting label for this pick */}
                              <div style={{ fontSize:11, fontFamily:"'DM Mono', monospace", color: !player.owgr_rank ? "#334155" : player.owgr_rank <= 15 ? BILLS_RED : player.owgr_rank <= 30 ? "#f97316" : player.owgr_rank <= 45 ? "#64748b" : player.owgr_rank <= 60 ? "#22c55e" : "#4a90d9" }}>
                                {!player.owgr_rank ? "—" : player.owgr_rank <= 15 ? "+5" : player.owgr_rank <= 30 ? "+3" : player.owgr_rank <= 45 ? "0" : player.owgr_rank <= 60 ? "-3" : "-5"}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}

                  {/* Submit all 5 picks button */}
                  {!isLocked && myContestPicks.length < 5 && (
                    <div style={{ padding:16 }}>
                      <button
                        disabled={totalStaged < 5}
                        onClick={() => {
                          if (totalStaged < 5) return;
                          const golferList = contestPickStaging.map(p => p.golfer_name).join(", ");
                          const confirmed  = window.confirm(`Confirm your 5 picks:\n\n${golferList}\n\nClick OK to enter your tiebreaker score.`);
                          if (!confirmed) return;
                          // Open tiebreaker modal before final DB insert
                          setPendingContestPicks(contestPickStaging);
                          setTiebreakerTournament(activeTournament);
                          setTiebreakerValue("");
                          setShowTiebreakerModal(true);
                        }}
                        style={{ width:"100%", background: totalStaged >= 5 ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:12, padding:"14px", color: totalStaged >= 5 ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor: totalStaged >= 5 ? "pointer" : "default", letterSpacing:"0.04em" }}>
                        {totalStaged < 5 ? `Select ${5 - totalStaged} more to submit` : "⛳ Submit All 5 Picks →"}
                      </button>
                    </div>
                  )}

                  {isLocked && (
                    <div style={{ padding:24, textAlign:"center", color:"#475569", fontSize:13 }}>🔒 Picks are locked for this tournament</div>
                  )}

                  {!isLocked && myContestPicks.length >= 5 && contestPickStaging.length === 0 && (
                    <div style={{ padding:16, textAlign:"center", background:"rgba(34,197,94,0.06)", borderTop:`1px solid rgba(34,197,94,0.2)` }}>
                      <span style={{ fontSize:13, color:"#22c55e" }}>✅ All 5 picks submitted!</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TIEBREAKER MODAL ── */}
        {/* Shown after staging 5 contest picks and clicking "Submit All 5".
            User enters their prediction for the winning score (relative to par).
            On confirm, all 5 picks are inserted into contest_picks with
            the tiebreaker value attached to each row. */}
        {showTiebreakerModal && tiebreakerTournament && (
          <div
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowTiebreakerModal(false); }}>
            <div style={{ background:"#071128", border:`1px solid ${BORDER}`, borderRadius:20, width:"100%", maxWidth:420, overflow:"hidden" }}>

              {/* Tournament logo / name header */}
              <div style={{ background:"rgba(0,51,141,0.2)", padding:"28px 24px", textAlign:"center", borderBottom:`1px solid ${BORDER}` }}>
                {tiebreakerTournament.logo_url
                  ? <img src={tiebreakerTournament.logo_url} alt={tiebreakerTournament.name} style={{ maxHeight:80, maxWidth:200, objectFit:"contain", marginBottom:16 }} />
                  : <div style={{ fontSize:40, marginBottom:12 }}>🏆</div>
                }
                <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, color:BILLS_WHITE, marginBottom:4 }}>{tiebreakerTournament.name}</div>
                <div style={{ fontSize:12, color:"#64748b" }}>Tiebreaker Entry</div>
              </div>

              <div style={{ padding:28 }}>
                {/* Summary of staged picks */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, color:"#64748b", letterSpacing:"0.08em", marginBottom:10 }}>YOUR 5 PICKS</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {pendingContestPicks.map(pick => (
                      <span key={pick.golfer_name} style={{ fontSize:12, background:"rgba(198,12,48,0.1)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:20, padding:"4px 12px", color:BILLS_WHITE }}>
                        {pick.golfer_name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tiebreaker score input (stepper + number field) */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600, marginBottom:6 }}>Winning Score (Relative to Par)</div>
                  <div style={{ fontSize:12, color:"#64748b", marginBottom:12 }}>
                    Enter your prediction for the winning score (e.g. -18 for 18 under par). Used as tiebreaker only.
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => setTiebreakerValue(prev => prev === "" ? "-1" : String(Number(prev) - 1))}
                        style={{ width:40, height:40, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE, fontSize:20, cursor:"pointer" }}>−</button>
                      <input type="number" value={tiebreakerValue} onChange={e => setTiebreakerValue(e.target.value)} placeholder="e.g. -18"
                        style={{ width:100, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 14px", color:BILLS_WHITE, fontSize:18, fontFamily:"'DM Mono', monospace", outline:"none", textAlign:"center" }} />
                      <button onClick={() => setTiebreakerValue(prev => prev === "" ? "1" : String(Number(prev) + 1))}
                        style={{ width:40, height:40, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, color:BILLS_WHITE, fontSize:20, cursor:"pointer" }}>+</button>
                    </div>
                    <div style={{ fontSize:13, color:"#64748b" }}>
                      {tiebreakerValue !== ""
                        ? Number(tiebreakerValue) < 0 ? `${tiebreakerValue} under par`
                          : Number(tiebreakerValue) === 0 ? "Even par"
                          : `+${tiebreakerValue} over par`
                        : ""}
                    </div>
                  </div>
                </div>

                {/* Cancel / Submit */}
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setShowTiebreakerModal(false)}
                    style={{ flex:1, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"12px", color:"#64748b", fontFamily:"'DM Sans', sans-serif", fontSize:14, cursor:"pointer" }}>
                    Cancel
                  </button>
                  <button
                    disabled={tiebreakerValue === ""}
                    onClick={async () => {
                      const myMember = contestMembers.find(cm => cm.email?.toLowerCase() === session?.user?.email?.toLowerCase());
                      if (!myMember) return;
                      // Insert all 5 picks with the tiebreaker value
                      for (const pick of pendingContestPicks) {
                        await supabase.from("contest_picks").insert({
                          member_id:     myMember.id,
                          tournament_id: tiebreakerTournament.id,
                          golfer_name:   pick.golfer_name,
                          datagolf_name: pick.datagolf_name,
                          tiebreaker:    Number(tiebreakerValue),
                        });
                      }
                      setContestPickStaging([]);
                      setShowTiebreakerModal(false);
                      setTiebreakerValue("");
                      setPendingContestPicks([]);
                      await fetchData();
                    }}
                    style={{ flex:2, background: tiebreakerValue !== "" ? BILLS_RED : "rgba(255,255,255,0.06)", border:"none", borderRadius:10, padding:"12px", color: tiebreakerValue !== "" ? BILLS_WHITE : "#475569", fontFamily:"'DM Sans', sans-serif", fontSize:14, fontWeight:700, cursor: tiebreakerValue !== "" ? "pointer" : "default" }}>
                    ⛳ Submit Picks & Tiebreaker →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PROFILE MODAL ── */}
        {/* Accessible from the sidebar/header user button.
            Lets the logged-in user update display name, email,
            date of birth, GHIN number, equipment, and apparel
            preferences. Also handles avatar selection and
            password reset. Works for both baggers and
            contest_members rows. */}
        {showProfile && (
          <div
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowProfile(false); }}>
            <div style={{ background:"#071128", border:`1px solid ${BORDER}`, borderRadius:20, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto" }}>
              <div style={{ padding:"20px 24px", borderBottom:`1px solid ${BORDER}`, display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#071128", zIndex:1 }}>
                <div style={{ fontFamily:"'Playfair Display', serif", fontSize:20, color:BILLS_WHITE }}>My Profile</div>
                <button onClick={() => setShowProfile(false)} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:20 }}>✕</button>
              </div>
              <div style={{ padding:24, display:"flex", flexDirection:"column", gap:20 }}>

                {/* Avatar section */}
                <div style={{ display:"flex", alignItems:"center", gap:16, background:"rgba(0,51,141,0.1)", border:`1px solid ${BORDER}`, borderRadius:14, padding:16 }}>
                  <div style={{ position:"relative" }}>
                    <Avatar bagger={loggedInBagger} size={64} i={baggers.findIndex(b => b.name === loggedInBagger?.name)} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, color:BILLS_WHITE, fontWeight:700, marginBottom:4 }}>{(loggedInBagger || loggedInMember)?.name}</div>
                    <div style={{ fontSize:12, color:"#64748b", marginBottom:10 }}>{(loggedInBagger || loggedInMember)?.email}</div>
                    {/* Emoji avatar quick-picker */}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {["🏌️","🦬","⛳","🏆","🦅","💪","🎯","🔥","😎","🤠","👑","💰"].map(emoji => (
                        <button key={emoji} onClick={async () => {
                          await setEmojiAvatar(loggedInBagger.id, emoji);
                          setProfileData(prev => ({ ...prev, avatar_url: emoji }));
                        }}
                          style={{ width:32, height:32, borderRadius:8, background: loggedInBagger?.avatar_url === emoji ? "rgba(198,12,48,0.2)" : "rgba(255,255,255,0.05)", border:`1px solid ${loggedInBagger?.avatar_url === emoji ? "rgba(198,12,48,0.4)" : BORDER}`, cursor:"pointer", fontSize:16 }}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {/* Photo upload */}
                    <div style={{ marginTop:10 }}>
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (loggedInBagger) {
                          await uploadAvatar(loggedInBagger.id, file);
                        } else if (loggedInMember) {
                          // Contest-only member: upload to avatars bucket under contest- prefix
                          setUploadingAvatar(true);
                          const ext  = file.name.split(".").pop();
                          const path = `public/contest-${loggedInMember.id}.${ext}`;
                          const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
                          if (!error) {
                            const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
                            await supabase.from("contest_members").update({ avatar_url: publicUrl }).eq("id", loggedInMember.id);
                            setLoggedInMember(prev => ({ ...prev, avatar_url: publicUrl }));
                            setContestMembers(prev => prev.map(m => m.id === loggedInMember.id ? { ...m, avatar_url: publicUrl } : m));
                          }
                          setUploadingAvatar(false);
                        }
                      }} style={{ fontSize:11, color:"#64748b" }} />
                      {uploadingAvatar && <div style={{ fontSize:11, color:"#f59e0b", marginTop:4 }}>Uploading...</div>}
                    </div>
                  </div>
                </div>

                {/* Basic info fields */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>BASIC INFO</div>
                  {[
                    { label:"Display Name", key:"username",    placeholder:"How you appear in the app" },
                    { label:"Email Address", key:"email",       placeholder:"your@email.com" },
                    { label:"Date of Birth", key:"dob",         placeholder:"YYYY-MM-DD", type:"date" },
                    { label:"GHIN Number",   key:"ghin_number", placeholder:"Your handicap index number" },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>{f.label}</div>
                      <input type={f.type || "text"} value={profileData[f.key] || ""} onChange={e => setProfileData(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder}
                        style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 14px", color:BILLS_WHITE, fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
                    </div>
                  ))}
                </div>

                {/* Equipment fields */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>⛳ EQUIPMENT</div>
                  {[
                    { label:"Driver",      key:"driver" },
                    { label:"Fairway Wood",key:"fairway_wood" },
                    { label:"Irons",       key:"irons" },
                    { label:"Putter",      key:"putter" },
                    { label:"Golf Ball",   key:"golf_ball" },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>{f.label}</div>
                      <select value={profileData[f.key] || ""} onChange={e => setProfileData(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={{ width:"100%", background:"#071128", border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 14px", color: profileData[f.key] ? BILLS_WHITE : "#475569", fontSize:13, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }}>
                        <option value="">Select brand...</option>
                        {["Titleist","TaylorMade","Callaway","Ping","Cobra","Cleveland","Mizuno","Srixon","Wilson","PXG","Honma","Ben Hogan","Tour Edge","Adams","Bridgestone","Acushnet","Other"].map(brand => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Apparel preferences (multi-select chips) */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>👕 APPAREL PREFERENCES</div>
                  {[
                    { label:"Shirt Brands",   key:"shirt_brands",        customKey:"custom_shirt" },
                    { label:"Pant Brands",    key:"pant_brands",         customKey:"custom_pant" },
                    { label:"Shoe Brands",    key:"shoe_brands",         customKey:"custom_shoe" },
                    { label:"Weather Gear",   key:"weather_gear_brands", customKey:"custom_weather" },
                  ].map(f => {
                    const apparelBrands = ["Nike","Adidas","Under Armour","Puma","FootJoy","G/FORE","Malbon","Polo Ralph Lauren","Lacoste","Peter Millar","Lululemon","Patagonia","Galvin Green","Sun Ice","Oakley","Travis Mathew","Johnnie-O","Criquet","Greyson","Other"];
                    const selected = profileData[f.key] || [];
                    return (
                      <div key={f.key}>
                        <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>{f.label}</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: selected.includes("Other") ? 8 : 0 }}>
                          {apparelBrands.map(brand => {
                            const isSelected = selected.includes(brand);
                            return (
                              <button key={brand}
                                onClick={() => {
                                  const next = isSelected ? selected.filter(b => b !== brand) : [...selected, brand];
                                  setProfileData(prev => ({ ...prev, [f.key]: next }));
                                }}
                                style={{ background: isSelected ? "rgba(198,12,48,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${isSelected ? "rgba(198,12,48,0.4)" : BORDER}`, borderRadius:20, padding:"4px 12px", color: isSelected ? BILLS_RED : "#64748b", fontSize:11, cursor:"pointer", fontWeight: isSelected ? 600 : 400 }}>
                                {brand}
                              </button>
                            );
                          })}
                        </div>
                        {/* Custom brand text input for "Other" */}
                        {selected.includes("Other") && (
                          <input value={profileData[f.customKey] || ""} onChange={e => setProfileData(prev => ({ ...prev, [f.customKey]: e.target.value }))} placeholder="Enter brand name..."
                            style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 12px", color:BILLS_WHITE, fontSize:12, fontFamily:"'DM Sans', sans-serif", outline:"none", boxSizing:"border-box" }} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Password reset section */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:BILLS_RED, letterSpacing:"0.1em", fontWeight:600 }}>🔐 CHANGE PASSWORD</div>
                  <button onClick={async () => {
                    const { error } = await supabase.auth.resetPasswordForEmail(loggedInBagger?.email, { redirectTo: "https://baggersgolf.com/#recovery" });
                    if (!error) alert(`Password reset email sent to ${loggedInBagger?.email}!`);
                  }}
                    style={{ background:"rgba(0,51,141,0.15)", border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 16px", color:"#94a3b8", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", textAlign:"left" }}>
                    📧 Send Password Reset Email
                  </button>
                </div>

                {/* Save profile button — updates either baggers or contest_members */}
                <button onClick={async () => {
                  setProfileSaving(true);
                  if (loggedInBagger) {
                    const { error } = await supabase.from("baggers").update({
                      username:            profileData.username,
                      email:               profileData.email,
                      dob:                 profileData.dob || null,
                      ghin_number:         profileData.ghin_number,
                      driver:              profileData.driver,
                      fairway_wood:        profileData.fairway_wood,
                      irons:               profileData.irons,
                      putter:              profileData.putter,
                      golf_ball:           profileData.golf_ball,
                      shirt_brands:        profileData.shirt_brands        || [],
                      pant_brands:         profileData.pant_brands         || [],
                      shoe_brands:         profileData.shoe_brands         || [],
                      weather_gear_brands: profileData.weather_gear_brands || [],
                      custom_shirt:        profileData.custom_shirt,
                      custom_pant:         profileData.custom_pant,
                      custom_shoe:         profileData.custom_shoe,
                      custom_weather:      profileData.custom_weather,
                    }).eq("id", loggedInBagger?.id);
                    if (!error) { await fetchData(); setProfileSaving(false); setShowProfile(false); }
                    else { alert("Error saving profile: " + error.message); setProfileSaving(false); }
                  } else if (loggedInMember) {
                    const { error } = await supabase.from("contest_members").update({
                      name:                profileData.name,
                      username:            profileData.username,
                      email:               profileData.email,
                      avatar_url:          profileData.avatar_url,
                      dob:                 profileData.dob || null,
                      ghin_number:         profileData.ghin_number,
                      driver:              profileData.driver,
                      fairway_wood:        profileData.fairway_wood,
                      irons:               profileData.irons,
                      putter:              profileData.putter,
                      golf_ball:           profileData.golf_ball,
                      shirt_brands:        profileData.shirt_brands        || [],
                      pant_brands:         profileData.pant_brands         || [],
                      shoe_brands:         profileData.shoe_brands         || [],
                      weather_gear_brands: profileData.weather_gear_brands || [],
                      custom_shirt:        profileData.custom_shirt,
                      custom_pant:         profileData.custom_pant,
                      custom_shoe:         profileData.custom_shoe,
                      custom_weather:      profileData.custom_weather,
                    }).eq("id", loggedInMember.id);
                    if (!error) { await fetchData(); setProfileSaving(false); setShowProfile(false); }
                    else { alert("Error saving profile: " + error.message); setProfileSaving(false); }
                  }
                }}
                  style={{ width:"100%", background:BILLS_RED, border:"none", borderRadius:12, padding:"14px", color:BILLS_WHITE, fontFamily:"'DM Sans', sans-serif", fontSize:15, fontWeight:700, cursor:"pointer", letterSpacing:"0.04em" }}>
                  {profileSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ADMIN PICKS PAGE (Kyle only)
            Lets Kyle enter picks on behalf of any bagger
            for the current or upcoming tournament.
            Only visible when logged in as kjbialek@gmail.com.
            Supports selecting a bagger, searching the field,
            and submitting or updating their pick.
        ══════════════════════════════════════════════ */}
        {page === "admin" && loggedInBagger?.email?.toLowerCase() === ADMIN_EMAIL && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Security banner */}
            <div style={{ background:"rgba(198,12,48,0.08)", border:"1px solid rgba(198,12,48,0.25)", borderRadius:14, padding:"14px 20px", display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontSize:20 }}>🔧</div>
              <div>
                <div style={{ fontSize:13, color:BILLS_WHITE, fontWeight:600 }}>Admin Picks Entry</div>
                <div style={{ fontSize:11, color:"#64748b" }}>Enter or update picks on behalf of baggers. Only visible to you.</div>
              </div>
            </div>

            {(() => {
              // Find the active or upcoming tournament — same logic as My Pick page
              const now = new Date();
              const activeTournament = tournaments.find(t => {
                if (!t.start_date || !t.end_date) return false;
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return now >= s && now <= e;
              });
              const nextPickableTournament = tournaments.find(t => {
                if (!t.start_date || !t.pick_deadline) return false;
                const s        = new Date(t.start_date + 'T00:00:00');
                const deadline = new Date(t.pick_deadline);
                const monday   = new Date(s); monday.setDate(s.getDate() - 3); monday.setHours(11,0,0,0);
                return now >= monday && now < deadline;
              });
              const currentTournament = activeTournament || nextPickableTournament || tournaments.find(t => {
                const s = new Date(t.start_date + 'T00:00:00');
                const e = tournamentEnd(t);
                return now >= s && now <= e && t.is_pool_event !== false;
              });

              if (!currentTournament) return (
                <div style={{ background:"rgba(0,51,141,0.08)", border:`1px solid ${BORDER}`, borderRadius:14, padding:32, textAlign:"center", color:"#64748b" }}>
                  No active or upcoming tournament found.
                </div>
              );

              return (
                <AdminPicksPanel
                  tournament={currentTournament}
                  baggers={baggers}
                  picks={picks}
                  field={field}
                  supabase={supabase}
                  onPickSaved={fetchData}
                  m={m}
                />
              );
            })()}
          </div>
        )}

        {/* ── IMAGE LIGHTBOX ── */}
        {expandedImage && (
          <div
            onClick={() => setExpandedImage(null)}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, cursor:"pointer" }}>
            <img src={expandedImage} alt="Expanded" style={{ maxWidth:"100%", maxHeight:"90vh", borderRadius:12, objectFit:"contain" }} />
            <button onClick={() => setExpandedImage(null)}
              style={{ position:"absolute", top:20, right:20, background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:40, height:40, color:"white", cursor:"pointer", fontSize:20 }}>
              ✕
            </button>
          </div>
        )}

      </div>
    </div>
  );
}