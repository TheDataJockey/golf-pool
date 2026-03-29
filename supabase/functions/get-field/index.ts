import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const datagolfKey = Deno.env.get("DATAGOLF_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl!, supabaseKey!);

  // Fetch field from Datagolf
  const [fieldRes, rankingsRes] = await Promise.all([
    fetch(`https://feeds.datagolf.com/field-updates?tour=pga&file_format=json&key=${datagolfKey}`),
    fetch(`https://feeds.datagolf.com/preds/get-dg-rankings?file_format=json&key=${datagolfKey}`),
  ]);

  const fieldData = await fieldRes.json();
  const rankingsData = await rankingsRes.json();

  // Build rankings lookup
  const rankings: Record<string, number> = {};
  rankingsData.rankings?.forEach((p: any) => {
    rankings[p.player_name] = p.owgr_rank;
  });

  // Build field list with rankings
  const field = fieldData.field?.map((p: any) => ({
    name: p.player_name,
    dg_id: p.dg_id,
    owgr_rank: rankings[p.player_name] || null,
    amateur: p.am || false,
  })) || [];

  // Sort by world ranking
  field.sort((a: any, b: any) => {
    if (!a.owgr_rank) return 1;
    if (!b.owgr_rank) return -1;
    return a.owgr_rank - b.owgr_rank;
  });

  // Store in Supabase for the app to read
  await supabase.from("weekly_field").upsert(
    field.map((p: any) => ({
      player_name: p.name,
      dg_id: p.dg_id,
      owgr_rank: p.owgr_rank,
      amateur: p.amateur,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "dg_id" }
  );

  return new Response(JSON.stringify({ success: true, players: field.length }), {
    headers: { "Content-Type": "application/json" },
  });
});