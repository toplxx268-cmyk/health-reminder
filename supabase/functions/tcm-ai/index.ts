// Supabase Edge Function: TCM AI Proxy
// Proxies requests to Groq/OpenAI API to bypass mobile Safari CORS restrictions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { symptom, apiKey, endpoint, model: userModel } = body;

    if (!symptom || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing symptom or apiKey" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiEndpoint = endpoint || "https://api.groq.com/openai/v1/chat/completions";
    const model = userModel || (apiEndpoint.includes("groq") ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

    const prompt = `你是中医养生专家。请针对以下症状给出中医分析及推荐。严格按JSON格式输出，不要markdown代码块：
{
  "analysis": "中医辨证分析（150字内，说明症状所属证型、病位、病机，给出调理原则）",
  "foods": [{"food":"食物名","nature":"性味","action":"功效","note":"用法"}],
  "teas": [{"key":"拼音","name":"茶名","nature":"性味","effects":["功效"],"caution":"注意"}],
  "medications":[{"name":"中成药名/单味药名","type":"中成药/单味药","action":"功效主治","note":"用法用量与注意事项"}],
  "points": [{"point":"穴位名","meridian":"经络","loc":"位置","tech":"手法"}]
}
症状：${symptom}`;

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `API error ${response.status}: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
