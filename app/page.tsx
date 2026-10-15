"use client";

import { FormEvent, useEffect, useState } from "react";

type View = "today" | "calendar" | "inbox" | "projects" | "sources";
type SourceId = "github" | "drive" | "outlook" | "note";
type CandidateType = "progress" | "commitment" | "blocker" | "decision" | "observation";

type Milestone = { id: string; title: string; done: boolean; weight: number };
type Project = {
  id: string;
  name: string;
  outcome: string;
  deadline: string;
  priority: number;
  color: string;
  milestones: Milestone[];
};
type Candidate = {
  id: string;
  type: CandidateType;
  title: string;
  quote: string;
  source: SourceId;
  sourceUrl?: string;
  projectId: string;
  confidence: number | null;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
};
type SourceState = { connected: boolean; detail: string; lastSync?: string };
type PlanBlock = {
  id: string;
  projectId: string;
  title: string;
  date: string;
  start: string;
  duration: number;
  selected: boolean;
};
type AppState = {
  projects: Project[];
  candidates: Candidate[];
  sources: Record<Exclude<SourceId, "note">, SourceState>;
  plan: PlanBlock[];
};

const STORAGE_KEY = "self-execution-v2";
const DAY = 86_400_000;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isoDate = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const seedState: AppState = {
  projects: [
    {
      id: "self-execution",
      name: "Self Execution",
      outcome: "Use an evidence-driven execution system every week for four consecutive weeks.",
      deadline: isoDate(42),
      priority: 1,
      color: "#c9e34c",
      milestones: [
        { id: "se-1", title: "Define the core evidence → decision loop", done: true, weight: 20 },
        { id: "se-2", title: "Use the AI evidence inbox on real work", done: false, weight: 30 },
        { id: "se-3", title: "Protect focus time for the next week", done: false, weight: 20 },
        { id: "se-4", title: "Complete four weekly reviews", done: false, weight: 30 },
      ],
    },
    {
      id: "fall-2027",
      name: "Fall 2027 Applications",
      outcome: "Submit a focused set of strong applications backed by credible project evidence.",
      deadline: isoDate(150),
      priority: 2,
      color: "#f09a61",
      milestones: [
        { id: "fa-1", title: "Build program shortlist and selection criteria", done: false, weight: 25 },
        { id: "fa-2", title: "Complete portfolio case study", done: false, weight: 35 },
        { id: "fa-3", title: "Draft statement narrative", done: false, weight: 25 },
        { id: "fa-4", title: "Submit selected applications", done: false, weight: 15 },
      ],
    },
  ],
  candidates: [
    {
      id: "candidate-seed",
      type: "decision",
      title: "The MVP should reduce input, not expose the data model",
      quote: "I don’t know what to click or what to do, and it feels like I have to enter too much.",
      source: "note",
      projectId: "self-execution",
      confidence: 0.98,
      createdAt: new Date().toISOString(),
      status: "pending",
    },
  ],
  sources: {
    github: { connected: false, detail: "Commits, pull requests, and issues" },
    drive: { connected: false, detail: "Only files you explicitly choose" },
    outlook: { connected: false, detail: "A dedicated mail folder" },
  },
  plan: [],
};

const sourceMeta: Record<SourceId, { label: string; mark: string }> = {
  github: { label: "GitHub", mark: "GH" },
  drive: { label: "Google Drive", mark: "GD" },
  outlook: { label: "Outlook", mark: "OL" },
  note: { label: "Quick note", mark: "N" },
};

function projectProgress(project: Project) {
  const total = project.milestones.reduce((sum, item) => sum + item.weight, 0);
  const done = project.milestones.filter((item) => item.done).reduce((sum, item) => sum + item.weight, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

function daysUntil(date: string) {
  return Math.max(0, Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / DAY));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function nextMilestone(project: Project) {
  return project.milestones.find((item) => !item.done);
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [state, setState] = useState<AppState>(seedState);
  const [ready, setReady] = useState(false);
  const [aiStatus, setAiStatus] = useState<"checking" | "ready" | "missing">("checking");
  const [view, setView] = useState<View>("today");
  const [capture, setCapture] = useState("");
  const [captureSource, setCaptureSource] = useState<SourceId>("note");
  const [captureProject, setCaptureProject] = useState(seedState.projects[0].id);
  const [extracting, setExtracting] = useState(false);
  const [notice, setNotice] = useState("");
  const [showPlanner, setShowPlanner] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [sourceDialog, setSourceDialog] = useState<Exclude<SourceId, "note"> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<AppState>;
          const savedSources = parsed.sources as Partial<AppState["sources"]> | undefined;
          setState({
            ...seedState,
            ...parsed,
            sources: {
              github: savedSources?.github ?? seedState.sources.github,
              drive: savedSources?.drive ?? seedState.sources.drive,
              outlook: savedSources?.outlook ?? seedState.sources.outlook,
            },
          });
        } catch { setState(seedState); }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((result: { aiReady?: boolean }) => setAiStatus(result.aiReady ? "ready" : "missing"))
      .catch(() => setAiStatus("missing"));
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pending = state.candidates.filter((item) => item.status === "pending");
  const primaryProject = [...state.projects].sort((a, b) => a.priority - b.priority).find((project) => nextMilestone(project));
  const primaryMilestone = primaryProject ? nextMilestone(primaryProject) : undefined;
  const acceptedThisWeek = state.candidates.filter((item) => item.status === "accepted").length;

  async function extractEvidence(event: FormEvent) {
    event.preventDefault();
    if (aiStatus !== "ready") {
      setNotice("AI evidence extraction needs an API key before it can run");
      return;
    }
    const text = capture.trim();
    if (!text) return;
    setExtracting(true);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: captureSource, selectedProjectId: captureProject, projects: state.projects.map(({ id, name, outcome }) => ({ id, name, outcome })) }),
      });
      const result = await response.json() as { candidates?: Array<Omit<Candidate, "id" | "createdAt" | "status" | "source">>; needsSetup?: boolean; error?: string };
      const incoming: Candidate[] = result.candidates?.map((item) => ({ ...item, id: uid(), source: captureSource, createdAt: new Date().toISOString(), status: "pending" })) ?? [];
      if (incoming.length) {
        setState((current) => ({ ...current, candidates: [...incoming, ...current.candidates] }));
        setCapture("");
        setView("inbox");
        setNotice(`${incoming.length} candidate${incoming.length === 1 ? "" : "s"} extracted for review`);
      } else if (result.needsSetup) {
        const queued: Candidate = { id: uid(), type: "observation", title: "Saved for AI extraction", quote: text, source: captureSource, projectId: captureProject, confidence: null, createdAt: new Date().toISOString(), status: "pending" };
        setState((current) => ({ ...current, candidates: [queued, ...current.candidates] }));
        setCapture("");
        setView("inbox");
        setNotice("Saved safely — AI connection is waiting for its API key");
      } else {
        setNotice(result.error ?? "No project evidence found in that note");
      }
    } catch {
      setNotice("Could not analyze that note yet. Your text is still in the box.");
    } finally {
      setExtracting(false);
    }
  }

  function decideCandidate(id: string, decision: "accepted" | "rejected") {
    setState((current) => ({ ...current, candidates: current.candidates.map((item) => item.id === id ? { ...item, status: decision } : item) }));
    setNotice(decision === "accepted" ? "Evidence confirmed and linked to the project" : "Candidate dismissed — no project state changed");
  }

  function toggleMilestone(projectId: string, milestoneId: string) {
    setState((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId ? { ...project, milestones: project.milestones.map((item) => item.id === milestoneId ? { ...item, done: !item.done } : item) } : project),
    }));
  }

  function createProject(name: string, outcome: string, deadline: string) {
    const id = uid();
    const project: Project = {
      id, name, outcome, deadline, priority: state.projects.length + 1, color: ["#77a8e8", "#b68be4", "#ec8291"][state.projects.length % 3],
      milestones: [
        { id: uid(), title: "Define the first meaningful deliverable", done: false, weight: 20 },
        { id: uid(), title: `Produce evidence toward: ${outcome}`, done: false, weight: 50 },
        { id: uid(), title: "Review the outcome and decide what follows", done: false, weight: 30 },
      ],
    };
    setState((current) => ({ ...current, projects: [...current.projects, project] }));
    setCaptureProject(id);
    setShowNewProject(false);
    setView("projects");
    setNotice("Project created with a starting milestone path");
  }

  function updateProject(updated: Project) {
    setState((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === updated.id ? updated : project),
    }));
    setEditingProject(null);
    setNotice("Project changes saved");
  }

  function buildPlan() {
    const projects = [...state.projects].sort((a, b) => a.priority - b.priority).filter((project) => nextMilestone(project)).slice(0, 3);
    const occupied: Array<{ start: Date; end: Date }> = [];
    const candidateHours = [9, 10.5, 13.5, 15, 16.5];
    const blocks: PlanBlock[] = [];
    for (const project of projects) {
      let chosen: Date | null = null;
      for (let offset = 1; offset <= 7 && !chosen; offset += 1) {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        for (const hour of candidateHours) {
          const start = new Date(date);
          start.setHours(Math.floor(hour), hour % 1 ? 30 : 0, 0, 0);
          const end = new Date(start.getTime() + 60 * 60_000);
          const conflicts = occupied.some((event) => start < event.end && end > event.start);
          if (!conflicts) { chosen = start; occupied.push({ start, end }); break; }
        }
      }
      const start = chosen ?? new Date(`${isoDate(1)}T10:00:00`);
      blocks.push({
        id: uid(),
        projectId: project.id,
        title: nextMilestone(project)?.title ?? project.name,
        date: localDateKey(start),
        start: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
        duration: 60,
        selected: true,
      });
    }
    setState((current) => ({ ...current, plan: blocks }));
    setShowPlanner(true);
  }

  function updateBlock(id: string, patch: Partial<PlanBlock>) {
    setState((current) => ({ ...current, plan: current.plan.map((block) => block.id === id ? { ...block, ...patch } : block) }));
  }

  function addGithubCandidates(items: Array<{ type: "commit" | "pull_request"; title: string; url: string; date: string; author: string }>, repo: string) {
    const projectId = state.projects[0]?.id ?? "";
    const candidates: Candidate[] = items.map((item) => ({ id: uid(), type: "progress", title: item.title, quote: `${item.type === "commit" ? "Commit" : "Pull request"} by ${item.author} in ${repo}`, source: "github", sourceUrl: item.url, projectId, confidence: 1, createdAt: item.date, status: "pending" }));
    setState((current) => ({ ...current, candidates: [...candidates, ...current.candidates], sources: { ...current.sources, github: { connected: true, detail: repo, lastSync: new Date().toISOString() } } }));
    setSourceDialog(null);
    setView("inbox");
    setNotice(`${candidates.length} GitHub events ready for confirmation`);
  }

  if (!ready) return <main className="boot-screen"><span className="brand-signal" />Loading your execution state…</main>;

  return (
    <main className="workspace">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("today")}><span className="brand-signal" /><b>Self Execution</b></button>
        <nav aria-label="Main navigation">
          <NavButton label="Today" mark="T" active={view === "today"} onClick={() => setView("today")} />
          <NavButton label="Calendar" mark="C" active={view === "calendar"} onClick={() => setView("calendar")} />
          <NavButton label="Evidence inbox" mark="I" count={pending.length} active={view === "inbox"} onClick={() => setView("inbox")} />
          <NavButton label="Projects" mark="P" active={view === "projects"} onClick={() => setView("projects")} />
          <NavButton label="Sources" mark="S" active={view === "sources"} onClick={() => setView("sources")} />
        </nav>
        <div className="sidebar-bottom"><div className="privacy-dot" /><div><b>Private workspace</b><span>Intent changes require you</span></div></div>
      </aside>

      <section className="main-panel">
        <header className="mobile-head"><button className="brand" onClick={() => setView("today")}><span className="brand-signal" /><b>Self Execution</b></button><button className="add-project" onClick={() => setShowNewProject(true)}>＋</button></header>
        {view === "today" && (
          <TodayView
            project={primaryProject}
            milestone={primaryMilestone}
            acceptedThisWeek={acceptedThisWeek}
            pendingCount={pending.length}
            connectedCount={Object.values(state.sources).filter((source) => source.connected).length}
            capture={capture}
            source={captureSource}
            projectId={captureProject}
            projects={state.projects}
            extracting={extracting}
            aiStatus={aiStatus}
            onCapture={setCapture}
            onSource={setCaptureSource}
            onProject={setCaptureProject}
            onSubmit={extractEvidence}
            onInbox={() => setView("inbox")}
            onCalendar={() => setView("calendar")}
            onProjects={() => setView("projects")}
          />
        )}
        {view === "calendar" && <CalendarView plan={state.plan} projects={state.projects} onPlan={buildPlan} />}
        {view === "inbox" && <InboxView candidates={state.candidates} projects={state.projects} onDecision={decideCandidate} onCapture={() => setView("today")} />}
        {view === "projects" && <ProjectsView projects={state.projects} candidates={state.candidates} onToggle={toggleMilestone} onEdit={setEditingProject} onNew={() => setShowNewProject(true)} />}
        {view === "sources" && <SourcesView sources={state.sources} onConnect={setSourceDialog} />}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavButton label="Today" mark="T" active={view === "today"} onClick={() => setView("today")} />
        <NavButton label="Calendar" mark="C" active={view === "calendar"} onClick={() => setView("calendar")} />
        <NavButton label="Inbox" mark="I" count={pending.length} active={view === "inbox"} onClick={() => setView("inbox")} />
        <NavButton label="Projects" mark="P" active={view === "projects"} onClick={() => setView("projects")} />
        <NavButton label="Sources" mark="S" active={view === "sources"} onClick={() => setView("sources")} />
      </nav>

      {showPlanner && <Planner plan={state.plan} projects={state.projects} onClose={() => setShowPlanner(false)} onUpdate={updateBlock} />}
      {showNewProject && <NewProject onClose={() => setShowNewProject(false)} onCreate={createProject} />}
      {editingProject && <EditProject project={editingProject} onClose={() => setEditingProject(null)} onSave={updateProject} />}
      {sourceDialog && <SourceDialog source={sourceDialog} state={state.sources[sourceDialog]} onClose={() => setSourceDialog(null)} onGithub={addGithubCandidates} />}
      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </main>
  );
}

function NavButton({ label, mark, count, active, onClick }: { label: string; mark: string; count?: number; active: boolean; onClick: () => void }) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}><span>{mark}</span><b>{label}</b>{count ? <i>{count}</i> : null}</button>;
}

function TodayView({ project, milestone, acceptedThisWeek, pendingCount, connectedCount, capture, source, projectId, projects, extracting, aiStatus, onCapture, onSource, onProject, onSubmit, onInbox, onCalendar, onProjects }: {
  project?: Project; milestone?: Milestone; acceptedThisWeek: number; pendingCount: number; connectedCount: number; capture: string; source: SourceId; projectId: string; projects: Project[]; extracting: boolean; aiStatus: "checking" | "ready" | "missing";
  onCapture: (value: string) => void; onSource: (value: SourceId) => void; onProject: (value: string) => void; onSubmit: (event: FormEvent) => void; onInbox: () => void; onCalendar: () => void; onProjects: () => void;
}) {
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  return <div className="page today-page">
    <div className="page-top"><div><p className="eyebrow">{date}</p><h1>One clear next step.</h1><p className="subhead">Evidence comes in. You confirm what matters. The plan stays yours.</p></div><div className="today-stats"><div><b>{pendingCount}</b><span>to review</span></div><div><b>{acceptedThisWeek}</b><span>confirmed</span></div><div><b>{connectedCount}/3</b><span>sources ready</span></div></div></div>

    {project && milestone ? <article className="next-action">
      <div className="action-context"><span className="status-light" style={{ background: project.color }} /><p>{project.name}</p><span>{projectProgress(project)}% milestone progress</span></div>
      <div className="action-main"><div><p className="eyebrow light">Recommended next action</p><h2>{milestone.title}</h2><p>This is the first unfinished milestone on your highest-priority project.</p></div><button onClick={onProjects}>Open milestone <span>→</span></button></div>
      <div className="action-evidence"><span>Why this?</span><p>Priority {project.priority} · {daysUntil(project.deadline)} days to target · next milestone still open</p></div>
    </article> : <article className="next-action complete"><h2>Everything declared is complete.</h2><button onClick={onProjects}>Review projects →</button></article>}

    <section className="capture-section">
      <div className="section-title"><div><p className="eyebrow">AI evidence capture</p><h2>{aiStatus === "ready" ? "What happened?" : "Connect AI before using evidence"}</h2></div><p>Evidence means a verifiable update—a finished output, decision, commitment, or blocker—that can support a project without changing it automatically.</p></div>
      {aiStatus === "ready" ? <form className="capture-box" onSubmit={onSubmit}>
          <textarea value={capture} onChange={(event) => onCapture(event.target.value)} placeholder="Paste anything messy. For example: ‘Finished the first dashboard, but Outlook OAuth is blocking the evidence sync. I’ll resolve it by Friday.’" rows={5} />
          <div className="capture-controls">
            <div><select value={source} onChange={(event) => onSource(event.target.value as SourceId)} aria-label="Evidence source"><option value="note">Quick note</option><option value="github">GitHub</option><option value="drive">Google Drive</option><option value="outlook">Outlook</option></select><select value={projectId} onChange={(event) => onProject(event.target.value)} aria-label="Likely project">{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <button className="primary-button" disabled={!capture.trim() || extracting}>{extracting ? "Extracting…" : "Extract evidence"}<span>↗</span></button>
          </div>
        </form> : <div className="ai-setup-card"><div className="ai-setup-icon">AI</div><div><b>{aiStatus === "checking" ? "Checking AI connection…" : "AI extraction is not connected"}</b><p>{aiStatus === "checking" ? "This will only take a moment." : "Add an OpenAI API key in the site settings to turn rough notes into reviewable evidence. Until then, Projects and Calendar still work normally."}</p></div><span>{aiStatus === "checking" ? "Checking" : "API key required"}</span></div>}
    </section>

    <section className="today-grid">
      <button className="workflow-card inbox-preview" onClick={onInbox}><div className="workflow-icon">I</div><div><span>Evidence inbox</span><h3>{pendingCount ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} need your confirmation` : "Inbox is clear"}</h3><p>Nothing changes project state until you accept it.</p></div><b>→</b></button>
      <button className="workflow-card plan-preview" onClick={onCalendar}><div className="workflow-icon">C</div><div><span>AI Calendar</span><h3>Plan the next seven days</h3><p>Turn open milestones into editable focus blocks.</p></div><b>→</b></button>
    </section>
  </div>;
}

function CalendarView({ plan, projects, onPlan }: { plan: PlanBlock[]; projects: Project[]; onPlan: () => void }) {
  const firstDay = new Date();
  firstDay.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(date.getDate() + index);
    return date;
  });
  const formatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const selectedPlan = plan.filter((block) => block.selected);
  const activeProjects = projects.filter((project) => nextMilestone(project)).length;

  return <div className="page calendar-page">
    <div className="page-heading calendar-heading"><div><p className="eyebrow">Project time map</p><h1>Your next seven days</h1><p className="subhead">Turn the next open milestone on each priority project into time you can inspect and edit.</p></div><div className="calendar-actions"><button className="primary-button" onClick={onPlan}>✦ Plan my week</button></div></div>
    <div className="calendar-summary"><div><b>Workspace calendar</b><p>This plan lives inside Self Execution. No external calendar is connected.</p></div><div><b>{activeProjects}</b><span>active projects</span></div><div><b>{selectedPlan.length}</b><span>focus blocks</span></div></div>
    <section className="week-grid" aria-label="Seven day calendar">
      {days.map((day, index) => {
        const key = localDateKey(day);
        const focusBlocks = selectedPlan.filter((block) => block.date === key);
        return <article className={index === 0 ? "day-column today" : "day-column"} key={key}>
          <header><span>{index === 0 ? "Today" : formatter.format(day)}</span><b>{day.getDate()}</b></header>
          <div className="day-events">
            {focusBlocks.map((block) => { const project = projects.find((item) => item.id === block.projectId); return <div className="calendar-event focus-event" style={{ borderColor: project?.color }} key={block.id}><span>{block.start} · {block.duration}m</span><b>{block.title}</b><i>{project?.name ?? "Focus"}</i></div>; })}
            {!focusBlocks.length && <div className="open-time"><span>Unplanned</span><p>No focus block yet</p></div>}
          </div>
        </article>;
      })}
    </section>
    <div className="calendar-footer"><div><span>Planning boundary</span><p>This is an editable project plan, not a synced external calendar. Real-time calendar connections will return only when they are genuinely live.</p></div></div>
  </div>;
}

function InboxView({ candidates, projects, onDecision, onCapture }: { candidates: Candidate[]; projects: Project[]; onDecision: (id: string, decision: "accepted" | "rejected") => void; onCapture: () => void }) {
  const pending = candidates.filter((item) => item.status === "pending");
  const history = candidates.filter((item) => item.status !== "pending").slice(0, 8);
  return <div className="page inbox-page">
    <div className="page-heading"><div><p className="eyebrow">Human confirmation layer</p><h1>Evidence inbox</h1><p className="subhead">Facts are collected automatically. Meaning still requires your approval.</p></div><button className="secondary-button" onClick={onCapture}>＋ Add evidence</button></div>
    <div className="inbox-summary"><b>{pending.length}</b><p>candidate{pending.length === 1 ? "" : "s"} waiting</p><span>Accepting links evidence to a project. It never completes a milestone by itself.</span></div>
    <section className="candidate-list">
      {pending.map((item) => <article className="candidate" key={item.id}>
        <div className={`candidate-type ${item.type}`}>{item.type.slice(0, 1).toUpperCase()}</div>
        <div className="candidate-copy"><div className="candidate-meta"><span>{item.type}</span><i>from {sourceMeta[item.source].label}</i>{item.confidence !== null && <i>{Math.round(item.confidence * 100)}% confidence</i>}</div><h2>{item.title}</h2><blockquote>“{item.quote}”</blockquote><div className="candidate-project"><span className="status-light" style={{ background: projects.find((project) => project.id === item.projectId)?.color }} />{projects.find((project) => project.id === item.projectId)?.name ?? "Unlinked"}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}</div></div>
        <div className="candidate-actions"><button className="accept" onClick={() => onDecision(item.id, "accepted")}>Accept</button><button onClick={() => onDecision(item.id, "rejected")}>Reject</button></div>
      </article>)}
      {!pending.length && <div className="empty-inbox"><span>✓</span><h2>You’re caught up.</h2><p>New evidence candidates from connected sources will appear here.</p><button className="secondary-button" onClick={onCapture}>Capture an update</button></div>}
    </section>
    {history.length > 0 && <section className="history"><p className="eyebrow">Recent decisions</p>{history.map((item) => <div key={item.id}><span className={item.status}>{item.status === "accepted" ? "✓" : "×"}</span><p>{item.title}</p><i>{sourceMeta[item.source].label}</i></div>)}</section>}
  </div>;
}

function ProjectsView({ projects, candidates, onToggle, onEdit, onNew }: { projects: Project[]; candidates: Candidate[]; onToggle: (projectId: string, milestoneId: string) => void; onEdit: (project: Project) => void; onNew: () => void }) {
  return <div className="page projects-page">
    <div className="page-heading"><div><p className="eyebrow">Evidence-backed progress</p><h1>Projects</h1><p className="subhead">Progress comes from completed milestones. Activity is supporting evidence, not the score.</p></div><button className="primary-button" onClick={onNew}>＋ New project</button></div>
    <div className="project-stack">{projects.map((project) => {
      const progress = projectProgress(project); const accepted = candidates.filter((item) => item.projectId === project.id && item.status === "accepted"); const open = nextMilestone(project);
      return <article className="project-row" key={project.id}>
        <div className="progress-ring" style={{ background: `conic-gradient(${project.color} ${progress}%, #e7e9e4 0)` }}><div><b>{progress}%</b><span>milestones</span></div></div>
        <div className="project-content"><div className="project-head"><div><span>Priority {project.priority} · target {formatDate(project.deadline)}</span><h2>{project.name}</h2><p>{project.outcome}</p></div><div className="project-aside"><div className="evidence-count"><b>{accepted.length}</b><span>confirmed<br />evidence</span></div><button className="edit-project-button" onClick={() => onEdit(project)}>Edit project</button></div></div>
          <div className="milestone-list">{project.milestones.map((item) => <button key={item.id} onClick={() => onToggle(project.id, item.id)} className={item.done ? "done" : ""}><i>{item.done ? "✓" : ""}</i><span>{item.title}</span><b>{item.weight}%</b></button>)}</div>
          <div className="project-signal"><span className={open ? "watch" : "clear"}>{open ? "Current" : "Complete"}</span><p>{open?.title ?? "All milestones complete"}</p><i>{daysUntil(project.deadline)} days left</i></div>
        </div>
      </article>;
    })}</div>
  </div>;
}

function SourcesView({ sources, onConnect }: { sources: AppState["sources"]; onConnect: (source: Exclude<SourceId, "note">) => void }) {
  const descriptions: Record<Exclude<SourceId, "note">, string> = { github: "Read commits and pull requests from only the repositories you choose.", drive: "Use Google Picker so the app sees only documents you explicitly select.", outlook: "Read evidence from a dedicated Self Execution mail folder." };
  return <div className="page sources-page"><div className="page-heading"><div><p className="eyebrow">Selective disclosure</p><h1>Evidence sources</h1><p className="subhead">Connect the smallest useful surface. Raw personal data stays out unless you choose it.</p></div></div>
    <div className="source-grid">{(Object.keys(sources) as Array<Exclude<SourceId, "note">>).map((id) => { const source = sources[id]; return <article key={id} className={source.connected ? "source-card connected" : "source-card"}><div className="source-mark">{sourceMeta[id].mark}</div><div className="source-status"><span>{source.connected ? "Ready" : "Not connected"}</span><i /></div><h2>{sourceMeta[id].label}</h2><p>{descriptions[id]}</p><div className="source-detail">{source.detail}</div><button onClick={() => onConnect(id)}>{source.connected ? "Manage" : id === "github" ? "Connect repository" : "Set up connector"}<span>→</span></button></article>; })}</div>
    <div className="privacy-panel"><span>◎</span><div><b>Evidence boundary</b><p>Connectors are read-only. AI receives only the smallest excerpt required for extraction, and every surfaced claim retains a source path.</p></div></div>
  </div>;
}

function Planner({ plan, projects, onClose, onUpdate }: { plan: PlanBlock[]; projects: Project[]; onClose: () => void; onUpdate: (id: string, patch: Partial<PlanBlock>) => void }) {
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="planner"><header><div><p className="eyebrow">AI weekly plan</p><h2>Protect time for progress.</h2></div><button onClick={onClose}>×</button></header><p className="planner-intro">Suggested from your first open milestones and placed around imported calendar conflicts. Edit every block before exporting.</p>
    <div className="plan-list">{plan.map((block) => <article key={block.id} className={block.selected ? "selected" : ""}><button className="block-check" onClick={() => onUpdate(block.id, { selected: !block.selected })}>{block.selected ? "✓" : ""}</button><div><span>{projects.find((item) => item.id === block.projectId)?.name}</span><input value={block.title} onChange={(event) => onUpdate(block.id, { title: event.target.value })} /></div><label>Date<input type="date" value={block.date} onChange={(event) => onUpdate(block.id, { date: event.target.value })} /></label><label>Start<input type="time" value={block.start} onChange={(event) => onUpdate(block.id, { start: event.target.value })} /></label><label>Minutes<select value={block.duration} onChange={(event) => onUpdate(block.id, { duration: Number(event.target.value) })}><option value="30">30</option><option value="60">60</option><option value="90">90</option><option value="120">120</option></select></label></article>)}</div>
    <div className="planner-note"><span>You stay in control</span><p>These blocks stay inside Self Execution. Edit the date, time, duration, and title until the week feels realistic.</p></div><footer><button className="primary-button" onClick={onClose}>Save weekly plan</button></footer></aside></div>;
}

function NewProject({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, outcome: string, deadline: string) => void }) {
  const [name, setName] = useState(""); const [outcome, setOutcome] = useState(""); const [deadline, setDeadline] = useState(isoDate(30));
  return <div className="overlay modal-overlay" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><form className="modal" onSubmit={(event) => { event.preventDefault(); if (name.trim() && outcome.trim()) onCreate(name.trim(), outcome.trim(), deadline); }}><header><div><p className="eyebrow">Three fields, then start</p><h2>Declare a project</h2></div><button type="button" onClick={onClose}>×</button></header><p>AI and evidence will fill in the working context later. You only need to own the outcome.</p><label>Project name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Fall 2027 applications" /></label><label>What outcome do you want?<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Describe the real-world result in one sentence." rows={3} /></label><label>Target date<input type="date" min={isoDate()} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim() || !outcome.trim()}>Create and start</button></footer></form></div>;
}

function EditProject({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (project: Project) => void }) {
  const [draft, setDraft] = useState<Project>({ ...project, milestones: project.milestones.map((milestone) => ({ ...milestone })) });
  const updateMilestone = (id: string, patch: Partial<Milestone>) => setDraft((current) => ({ ...current, milestones: current.milestones.map((milestone) => milestone.id === id ? { ...milestone, ...patch } : milestone) }));
  const totalWeight = draft.milestones.reduce((sum, milestone) => sum + milestone.weight, 0);
  return <div className="overlay modal-overlay" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><form className="modal edit-project-modal" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim() && draft.outcome.trim() && draft.milestones.length) onSave({ ...draft, name: draft.name.trim(), outcome: draft.outcome.trim() }); }}><header><div><p className="eyebrow">Everything is editable</p><h2>Edit project</h2></div><button type="button" onClick={onClose}>×</button></header>
    <div className="project-form-grid"><label>Project name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Priority<input type="number" min="1" max="99" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) || 1 }))} /></label></div>
    <label>Outcome<textarea value={draft.outcome} onChange={(event) => setDraft((current) => ({ ...current, outcome: event.target.value }))} rows={3} /></label>
    <label>Target date<input type="date" value={draft.deadline} onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} /></label>
    <div className="milestone-editor"><div><div><p className="eyebrow">Milestones</p><span>{totalWeight}% total</span></div><button type="button" onClick={() => setDraft((current) => ({ ...current, milestones: [...current.milestones, { id: uid(), title: "New milestone", done: false, weight: 10 }] }))}>＋ Add milestone</button></div>{draft.milestones.map((milestone) => <div className="milestone-edit-row" key={milestone.id}><button type="button" className={milestone.done ? "milestone-done" : ""} onClick={() => updateMilestone(milestone.id, { done: !milestone.done })}>{milestone.done ? "✓" : ""}</button><input aria-label="Milestone title" value={milestone.title} onChange={(event) => updateMilestone(milestone.id, { title: event.target.value })} /><label><input aria-label="Milestone weight" type="number" min="0" max="100" value={milestone.weight} onChange={(event) => updateMilestone(milestone.id, { weight: Number(event.target.value) || 0 })} />%</label><button type="button" className="remove-milestone" aria-label={`Remove ${milestone.title}`} onClick={() => setDraft((current) => ({ ...current, milestones: current.milestones.filter((item) => item.id !== milestone.id) }))}>×</button></div>)}</div>
    <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!draft.name.trim() || !draft.outcome.trim() || !draft.milestones.length}>Save project</button></footer>
  </form></div>;
}

function SourceDialog({ source, state, onClose, onGithub }: { source: Exclude<SourceId, "note">; state: SourceState; onClose: () => void; onGithub: (items: Array<{ type: "commit" | "pull_request"; title: string; url: string; date: string; author: string }>, repo: string) => void }) {
  const [repo, setRepo] = useState(state.connected && source === "github" ? state.detail : "siyuan61/SelfExecution-"); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function connectGithub(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); try { const response = await fetch("/api/github", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo }) }); const result = await response.json() as { items?: Array<{ type: "commit" | "pull_request"; title: string; url: string; date: string; author: string }>; repo?: string; error?: string }; if (!response.ok || !result.items) throw new Error(result.error ?? "Could not read that repository"); onGithub(result.items, result.repo ?? repo); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect"); } finally { setLoading(false); } }
  const coming: Record<"drive" | "outlook", { title: string; copy: string; steps: string[] }> = { drive: { title: "Google Drive connector", copy: "This will use Google Picker rather than broad Drive access.", steps: ["Sign in with your Gmail account", "Choose individual Docs or folders", "Confirm which projects they belong to"] }, outlook: { title: "Outlook connector", copy: "This will read only from a folder you dedicate to Self Execution.", steps: ["Sign in with your Microsoft account", "Choose or create the mail folder", "Review extracted commitments before they count"] } };
  return <div className="overlay modal-overlay" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>{source === "github" ? <form className="modal source-modal" onSubmit={connectGithub}><header><div><p className="eyebrow">Read-only evidence</p><h2>Connect GitHub</h2></div><button type="button" onClick={onClose}>×</button></header><p>Enter one public repository. Recent commits and pull requests become candidates in your inbox; they do not change progress automatically.</p><label>Repository<input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="owner/repository or GitHub URL" /></label>{error && <div className="form-error">{error}</div>}<footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!repo.trim() || loading}>{loading ? "Reading repository…" : "Import recent evidence"}</button></footer></form> : <div className="modal source-modal"><header><div><p className="eyebrow">Connector boundary</p><h2>{coming[source].title}</h2></div><button onClick={onClose}>×</button></header><p>{coming[source].copy}</p><ol>{coming[source].steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="connector-status"><span>Next implementation slice</span><p>The interface is ready; OAuth credentials and consent screens are still required.</p></div><footer><button className="primary-button" onClick={onClose}>Got it</button></footer></div>}</div>;
}
