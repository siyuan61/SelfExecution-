const candidateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["progress", "commitment", "blocker", "decision", "observation"] },
          title: { type: "string", maxLength: 120 },
          quote: { type: "string", maxLength: 280 },
          projectId: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["type", "title", "quote", "projectId", "confidence"],
      },
    },
  },
  required: ["candidates"],
} as const;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ needsSetup: true, candidates: [] }, { status: 503 });

  const body = await request.json() as { text?: string; source?: string; selectedProjectId?: string; projects?: Array<{ id: string; name: string; outcome: string }> };
  if (!body.text?.trim() || body.text.length > 12_000) return Response.json({ error: "Evidence text is missing or too long." }, { status: 400 });
  const projects = body.projects ?? [];
  const selected = projects.find((project) => project.id === body.selectedProjectId);
  const projectContext = projects.map((project) => `- ${project.id}: ${project.name} — ${project.outcome}`).join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      store: false,
      instructions: "You extract candidate project evidence. Separate observations from interpretation. Return only material, actionable items explicitly supported by the source text. Do not infer life goals or psychological states. A progress item is a completed output, not effort. A commitment is a future promise. A blocker prevents the next meaningful step. A decision changes scope, approach, or priority. Quote the smallest supporting excerpt. Link to the most likely project; prefer the selected project when plausible. Confidence reflects linking and classification certainty.",
      input: `Projects:\n${projectContext}\n\nLikely project: ${selected?.id ?? "unknown"}\nSource type: ${body.source ?? "note"}\n\nEvidence text:\n${body.text}`,
      text: { format: { type: "json_schema", name: "evidence_candidates", strict: true, schema: candidateSchema } },
      max_output_tokens: 1200,
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI extraction failed", response.status, error.slice(0, 500));
    return Response.json({ error: "AI extraction is temporarily unavailable." }, { status: 502 });
  }
  const result = await response.json() as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  const outputText = result.output?.flatMap((item) => item.content ?? []).find((content) => content.type === "output_text")?.text;
  if (!outputText) return Response.json({ error: "AI returned no extractable evidence." }, { status: 502 });
  try { return Response.json(JSON.parse(outputText)); } catch { return Response.json({ error: "AI returned an invalid evidence format." }, { status: 502 }); }
}
