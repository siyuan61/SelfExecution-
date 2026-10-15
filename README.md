# Self Execution

A local-first personal execution intelligence MVP. It turns evidence from work
into reviewable candidates, tracks milestone progress, and proposes time blocks
that remain under the user's control.

## MVP boundaries

- The user owns goals, priorities, success criteria, and project status.
- Evidence is extracted into progress, commitment, blocker, decision, and
  observation candidates; each candidate requires confirmation.
- Progress is derived from weighted milestones, never raw activity counts.
- Data remains in browser storage and can be exported or restored as JSON.
- GitHub public-repository evidence and Apple Calendar `.ics` export work now.
- Google Drive Picker, Outlook folder OAuth, and the native Apple Calendar
  bridge remain connector follow-ups.
- No external connector or model can write to project intent or milestones.

## Optional runtime configuration

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` to enable AI
evidence extraction. `OPENAI_MODEL` defaults to `gpt-5-mini`. A `GITHUB_TOKEN`
is optional for higher rate limits or private-repository access.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal. Use `npm test` to build and verify the
server-rendered application shell.
