export async function GET() {
  return Response.json(
    { aiReady: Boolean(process.env.OPENAI_API_KEY) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
