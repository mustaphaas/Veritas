import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  Database,
  FileText,
  Globe2,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  projects,
  summarizePortfolio,
  summarizeProjectsByState,
} from "../lib/dashboard-data";
import { useInspectionWorkflow } from "../lib/inspection-workflow";
import type { VeritasMessage, VeritasSource } from "../../shared/veritas-ai";

type DisplayMessage = VeritasMessage & {
  id: string;
  sources?: VeritasSource[];
};

const welcome: DisplayMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Welcome to Veritas. I can answer questions about REA programmes, projects, contractors, inspections and verification performance, or prepare management reports from the system data.",
};

const quickActions = [
  {
    label: "Insight Report",
    detail: "Performance, risks and actions",
    prompt:
      "Generate a management Insight Report from the current Veritas system data. Highlight performance, risks, verification gaps and recommended actions.",
    icon: BarChart3,
  },
  {
    label: "Monthly Report",
    detail: "Executive monthly reporting",
    prompt:
      "Generate a Monthly Report from the current Veritas system data, using the most recent reporting period represented in the data.",
    icon: FileText,
  },
  {
    label: "Verification Report",
    detail: "QA, pending work and priorities",
    prompt:
      "Generate a Verification Report showing verified, pending, approved, submitted and re-inspection work, priority locations and QA actions.",
    icon: ShieldCheck,
  },
  {
    label: "Ask about REA",
    detail: "Official REA information",
    prompt:
      "Give me a concise overview of REA and its current programmes using the official REA website where appropriate.",
    icon: Globe2,
  },
];

const questionExamples = [
  "Which states have the most pending verification?",
  "Which programme has the strongest verification performance?",
  "Summarise contractor performance and key risks.",
  "What should REA management prioritise next?",
];

function id() {
  return `veritas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function VeritasMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${compact ? "h-11 w-11 rounded-xl" : "h-12 w-12 rounded-2xl"} relative flex shrink-0 items-center justify-center bg-gradient-to-br from-[#064f2d] via-[#08733f] to-[#13a15b] text-white shadow-[0_8px_24px_rgba(8,115,63,0.25)] ring-1 ring-white/40`}
      aria-hidden="true"
    >
      <span className={`${compact ? "text-lg" : "text-xl"} font-black tracking-[-0.06em]`}>
        V
      </span>
      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#f4b83f] text-white shadow-sm">
        <Sparkles className="h-2.5 w-2.5" />
      </span>
    </div>
  );
}

export default function VeritasAssistant() {
  const { assignments } = useInspectionWorkflow();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([welcome]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const databaseContext = useMemo(() => {
    const totals = summarizePortfolio(projects);
    const programmePerformance = [
      ...new Set(projects.map((project) => project.programme)),
    ].map((programme) => {
      const rows = projects.filter((project) => project.programme === programme);
      return {
        programme,
        projects: rows.length,
        installedCapacityKw: rows.reduce((sum, project) => sum + project.kw, 0),
        households: rows.reduce((sum, project) => sum + project.households, 0),
        verified: rows.filter((project) => project.verified).length,
        pending: rows.filter((project) => !project.verified).length,
      };
    });

    const contractorPerformance = [
      ...new Set(projects.map((project) => project.contractor)),
    ].map((contractor) => {
      const rows = projects.filter((project) => project.contractor === contractor);
      return {
        contractor,
        projects: rows.length,
        verified: rows.filter((project) => project.verified).length,
        pending: rows.filter((project) => !project.verified).length,
        installedCapacityKw: rows.reduce((sum, project) => sum + project.kw, 0),
        households: rows.reduce((sum, project) => sum + project.households, 0),
      };
    });

    const statusCounts = assignments.reduce<Record<string, number>>(
      (counts, assignment) => {
        counts[assignment.status] = (counts[assignment.status] ?? 0) + 1;
        return counts;
      },
      {},
    );

    return {
      generatedAt: new Date().toISOString(),
      dataScope:
        "Current Veritas project dataset and inspection workflow available to the REA dashboard",
      portfolio: {
        totalProjects: totals.projects,
        installedCapacityKw: totals.kw,
        householdsReached: totals.households,
        verifiedProjects: totals.verified,
        pendingProjects: totals.pending,
        verificationRatePercent: totals.verificationRate,
      },
      reportingPeriods: [...new Set(projects.map((project) => project.month))],
      statePerformance: summarizeProjectsByState(projects),
      programmePerformance,
      contractorPerformance,
      projects: projects.map((project) => ({
        name: project.name,
        state: project.state,
        programme: project.programme,
        component: project.component,
        contractor: project.contractor,
        month: project.month,
        status: project.status,
        installedCapacityKw: project.kw,
        households: project.households,
        verified: project.verified,
      })),
      inspectionWorkflow: {
        privacyScope:
          "Management-safe fields only. Signatures, device IDs, precise evidence coordinates and private evidence are excluded.",
        totalAssignments: assignments.length,
        statusCounts,
        submittedReports: assignments.filter((assignment) => assignment.report)
          .length,
        evidenceFiles: assignments.reduce(
          (total, assignment) =>
            total + (assignment.report?.evidence.length ?? 0),
          0,
        ),
        assignments: assignments.map((assignment) => ({
          id: assignment.id,
          projectName: assignment.projectName,
          programme: assignment.programme,
          component: assignment.component,
          contractor: assignment.contractor,
          state: assignment.state,
          lga: assignment.lga,
          community: assignment.community,
          dueDate: assignment.dueDate,
          status: assignment.status,
          reportSubmittedAt: assignment.report?.submittedAt,
          reviewNote: assignment.report?.reviewNote,
          observations: assignment.report?.observations,
          defects: assignment.report?.defects,
          recommendations: assignment.report?.recommendations,
        })),
      },
    };
  }, [assignments]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const send = async (prompt = question) => {
    const text = prompt.trim();
    if (!text || loading) return;

    const userMessage: DisplayMessage = { id: id(), role: "user", content: text };
    const next = [...messages, userMessage];
    setMessages(next);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/veritas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          messages: next
            .filter((message) => message.id !== "welcome")
            .slice(-10)
            .map(({ role, content }) => ({ role, content })),
          databaseContext,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        sources?: VeritasSource[];
        error?: string;
      };

      if (!response.ok || !payload.answer) {
        throw new Error(payload.error || "Veritas could not answer that question.");
      }

      setMessages((current) => [
        ...current,
        {
          id: id(),
          role: "assistant",
          content: payload.answer!,
          sources: payload.sources,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: id(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Veritas could not answer that question.",
        },
      ]);
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

  return (
    <>
      {open && (
        <section
          className="fixed inset-x-3 bottom-[96px] top-12 z-[70] flex flex-col overflow-hidden rounded-[22px] border border-[#cfe0d4] bg-white shadow-[0_30px_90px_rgba(8,61,34,0.26)] sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[min(760px,calc(100vh-118px))] sm:w-[460px]"
          aria-label="Veritas intelligence assistant"
        >
          <div className="h-1 bg-gradient-to-r from-[#064f2d] via-[#0b8a4b] to-[#62be7f]" />
          <header className="flex items-center justify-between border-b border-[#e5eee8] bg-white px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <VeritasMark compact />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-extrabold tracking-tight text-[#173b2a]">
                    Veritas
                  </h2>
                  <span className="rounded-full border border-[#cce4d4] bg-[#eef8f1] px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-[#08733f]">
                    REA Intelligence
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  Projects · verification · programmes · official REA information
                </p>
              </div>
            </div>
            <div className="ml-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([welcome])}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#173b2a]"
                aria-label="Clear Veritas chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#173b2a]"
                aria-label="Close Veritas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex items-center gap-2 border-b border-[#e8f0ea] bg-[#f7fbf8] px-4 py-2 text-[9px] font-medium text-[#557060]">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#e8f6ed] text-[#08733f]">
              <Database className="h-3 w-3" />
            </span>
            Grounded in Veritas system data
            <span className="text-slate-300">•</span>
            <Globe2 className="h-3 w-3 text-[#08733f]" /> Official REA sources
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#f6f9f7] px-4 py-4">
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-3 text-[11px] leading-5 ${
                      message.role === "user"
                        ? "rounded-br-md bg-[#075f35] text-white shadow-[0_6px_18px_rgba(7,95,53,0.16)]"
                        : "rounded-bl-md border border-[#e0e9e3] bg-white text-slate-700 shadow-[0_3px_12px_rgba(18,66,39,0.045)]"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="mb-2 flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#08733f]">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#eaf7ee]">
                          <BrainCircuit className="h-3.5 w-3.5" />
                        </span>
                        Veritas analysis
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.sources?.length ? (
                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
                          Official REA sources
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {message.sources.map((source) => (
                            <a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-start gap-1.5 text-[9px] font-semibold text-[#08733f] hover:underline"
                            >
                              <Globe2 className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>{source.title}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {messages.length === 1 && (
                <div className="space-y-3 pt-1">
                  <div className="rounded-2xl border border-[#d9e9de] bg-white p-3.5 shadow-[0_4px_14px_rgba(18,66,39,0.04)]">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-[#08733f]" />
                      <p className="text-[11px] font-extrabold text-[#173b2a]">
                        Ask a management question
                      </p>
                    </div>
                    <p className="mt-1 text-[9px] leading-4 text-slate-500">
                      Ask Veritas directly about any project, state, programme,
                      contractor, verification status or portfolio trend.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {questionExamples.map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => void send(example)}
                          className="rounded-full border border-[#dce8df] bg-[#f8fbf9] px-2.5 py-1.5 text-left text-[9px] font-semibold text-[#365845] transition-colors hover:border-[#9bc9aa] hover:bg-[#edf8f0] hover:text-[#08733f]"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                        Generate a report
                      </p>
                      <span className="text-[8px] text-slate-400">One click</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {quickActions.map(({ label, detail, prompt, icon: Icon }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => void send(prompt)}
                          className="group rounded-xl border border-[#dbe8df] bg-white p-3 text-left shadow-[0_2px_8px_rgba(18,66,39,0.03)] transition-all hover:-translate-y-0.5 hover:border-[#9bc9aa] hover:shadow-[0_7px_18px_rgba(18,66,39,0.08)]"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf8f0] text-[#08733f] transition-colors group-hover:bg-[#08733f] group-hover:text-white">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="mt-2.5 block text-[10px] font-extrabold text-[#173b2a]">
                            {label}
                          </span>
                          <span className="mt-0.5 block text-[8px] leading-3.5 text-slate-500">
                            {detail}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#dfe9e2] bg-white px-4 py-3 text-[10px] text-slate-500 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-[#08733f]" />
                    Analysing project and verification data…
                  </div>
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="border-t border-[#e1eae4] bg-white p-3.5"
          >
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="veritas-question"
                className="text-[10px] font-extrabold text-[#173b2a]"
              >
                Ask Veritas a question
              </label>
              <span className="text-[8px] text-slate-400">Enter to send</span>
            </div>
            <div className="flex items-end gap-2 rounded-xl border border-[#ccdcd1] bg-[#fbfdfb] p-2 shadow-inner focus-within:border-[#72b889] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#08733f]/10">
              <textarea
                ref={inputRef}
                id="veritas-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={3_000}
                placeholder="e.g. Which states have the highest pending verification?"
                className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-xs text-[#173b2a] outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!question.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#08733f] text-white shadow-sm transition-colors hover:bg-[#065d32] disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label="Send question to Veritas"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-[8px] text-slate-400">
              AI-generated management analysis should be reviewed before official use.
            </p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group fixed bottom-5 right-5 z-[70] flex min-h-16 items-center gap-3 rounded-2xl border border-[#c9ded0] bg-white px-2.5 py-2.5 pr-4 text-[#173b2a] shadow-[0_14px_40px_rgba(8,61,34,0.18)] transition-all hover:-translate-y-0.5 hover:border-[#9ac4a7] hover:shadow-[0_18px_48px_rgba(8,61,34,0.23)] focus:outline-none focus:ring-4 focus:ring-[#08733f]/15"
        aria-label={open ? "Close Veritas" : "Open Veritas and ask a question"}
      >
        {open ? (
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#173b2a] text-white">
            <X className="h-5 w-5" />
          </span>
        ) : (
          <VeritasMark compact />
        )}
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-extrabold tracking-tight">Veritas</span>
          <span className="mt-0.5 block text-[9px] font-medium text-slate-500">
            Ask REA intelligence
          </span>
        </span>
      </button>
    </>
  );
}
