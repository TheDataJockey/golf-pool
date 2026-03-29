import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl!, supabaseKey!);

  // Get the next unlocked tournament
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("is_locked", false)
    .order("week_number")
    .limit(1)
    .single();

  if (!tournament) {
    return new Response("No upcoming tournament found", { status: 404 });
  }

  // Get all baggers
  const { data: baggers } = await supabase
    .from("baggers")
    .select("name, email");

  if (!baggers || baggers.length === 0) {
    return new Response("No baggers found", { status: 404 });
  }

  // Send email to each bagger
  const results = await Promise.all(
    baggers.map(async (bagger) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "picks@baggersgolf.com",
          to: bagger.email,
          subject: `⛳ Week ${tournament.week_number} Pick Request — ${tournament.name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #080f1a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
              <h1 style="color: #22c55e; font-size: 28px;">⛳ Golf Pool</h1>
              <h2 style="color: #f1f5f9;">Week ${tournament.week_number} Pick Request</h2>
              <p style="color: #94a3b8;">Hey ${bagger.name}, time to make your pick!</p>
              
              <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin: 20px 0;">
                <p style="margin: 8px 0; color: #f1f5f9;">🏆 <strong>${tournament.name}</strong></p>
                <p style="margin: 8px 0; color: #94a3b8;">📍 ${tournament.course || "TBD"}</p>
                <p style="margin: 8px 0; color: #94a3b8;">💰 Purse: $${Number(tournament.purse).toLocaleString()}</p>
                <p style="margin: 8px 0; color: #94a3b8;">📅 ${tournament.start_date || "TBD"} – ${tournament.end_date || "TBD"}</p>
              </div>

              <a href="https://baggersgolf.com" style="display: inline-block; background: #22c55e; color: #080f1a; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; margin: 10px 0;">
                Submit My Pick →
              </a>

              <p style="color: #475569; font-size: 12px; margin-top: 30px;">
                Replies to this email are not monitored. Log in at baggersgolf.com to submit your pick.
              </p>
            </div>
          `,
        }),
      });
      return { bagger: bagger.name, status: res.status };
    })
  );

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});