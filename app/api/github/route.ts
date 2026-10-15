type GitHubCommit = { html_url: string; commit: { message: string; author: { date: string; name: string } }; author?: { login?: string } };
type GitHubPull = { html_url: string; title: string; updated_at: string; user?: { login?: string } };

export async function POST(request: Request) {
  const body = await request.json() as { repo?: string };
  const raw = body.repo?.trim().replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, "").replace(/\.git$/, "") ?? "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) return Response.json({ error: "Use owner/repository or a GitHub repository URL." }, { status: 400 });
  const headers: HeadersInit = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Self-Execution" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const [commitsResponse, pullsResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${raw}/commits?per_page=8`, { headers }),
    fetch(`https://api.github.com/repos/${raw}/pulls?state=all&sort=updated&direction=desc&per_page=5`, { headers }),
  ]);
  if (!commitsResponse.ok) return Response.json({ error: commitsResponse.status === 404 ? "Repository not found or it is private." : "GitHub could not read that repository." }, { status: commitsResponse.status });
  const commits = await commitsResponse.json() as GitHubCommit[];
  const pulls = pullsResponse.ok ? await pullsResponse.json() as GitHubPull[] : [];
  const items = [
    ...commits.map((item) => ({ type: "commit" as const, title: item.commit.message.split("\n")[0].slice(0, 140), url: item.html_url, date: item.commit.author.date, author: item.author?.login ?? item.commit.author.name })),
    ...pulls.map((item) => ({ type: "pull_request" as const, title: item.title.slice(0, 140), url: item.html_url, date: item.updated_at, author: item.user?.login ?? "unknown" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  return Response.json({ repo: raw, items });
}
