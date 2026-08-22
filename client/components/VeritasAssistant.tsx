import { useMemo, useRef, useState, useEffect } from "react";
import {
  BarChart3,
  Bot,
  Database,
  FileText,
  Globe2,
  Loader2,
  MessageCircle,
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
    "I’m Veritas, REA’s project and verification intelligence assistant. Ask me about programmes, projects, contractors, inspections, verification status, REA information, or generate management reports.",
};

const quickActions = [
  {
    label: "Insight Report",
    prompt:
      "Generate a management Insight Report from the current Veritas system data. Highlight performance, risks, verification gaps and recommended actions.",
    icon: BarChart3,
  },
  {
    label: "Monthly Report",
    prompt:
      "Generate a Monthly Report from the current Veritas system data, using the most recent reporting period represented in the data.",
    icon: FileText,
  },
  {
    label: "Verification Report",
    prompt:
      "Generate a Verification Report showing verified, pending, approved, submitted and re-inspection work, priority locations and QA actions.",
    icon: ShieldCheck,
  },
  {
    label: "Ask about REA",
    prompt:
      "Give me a concise overview of REA and its current programmes using the official REA website where appropriate.",
    icon: Globe2,
  },
];

function id() {
  return `veritas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VeritasAssistant() {
  const { assignments } = useInspectionWorkflow();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([welcome]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    }
  };

  return (
    <>
      {open && (
        <section
          className="fixed inset-x-3 bottom-[88px] top-16 z-[70] flex flex-col overflow-hidden rounded-2xl border border-[#c8dfcf] bg-white shadow-[0_24px_80px_rgba(8,72,39,0.24)] sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[min(720px,calc(100vh-120px))] sm:w-[430px]"
          aria-label="Veritas intelligence assistant"
        >
          <header className="flex items-center justify-between bg-gradient-to-r from-[#075c33] to-[#0b8248] px-4 py-3.5 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Veritas</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-emerald-50">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8df0b4]" />
                  REA data · verification · official REA information
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([welcome])}
                className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Clear Veritas chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Close Veritas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#f7faf8] p-4">
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-3 text-[11px] leading-5 ${
                      message.role === "user"
                        ? "rounded-br-md bg-[#08733f] text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-[#08733f]">
                        <Bot className="h-3.5 w-3.5" /> Veritas
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
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {quickActions.map(({ label, prompt, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => void send(prompt)}
                      className="rounded-xl border border-[#d7e8dc] bg-white p-3 text-left transition-colors hover:border-[#8fc9a2] hover:bg-[#f0faf3]"
                    >
                      <Icon className="h-4 w-4 text-[#08733f]" />
                      <span className="mt-2 block text-[10px] font-bold text-[#173b2a]">
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-[10px] text-slate-500 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-[#08733f]" />
                    Analysing Veritas data…
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
            className="border-t border-slate-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-[9px] text-slate-500">
              <Database className="h-3.5 w-3.5 text-[#08733f]" />
              Grounded in Veritas project and verification data
            </div>
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 p-2 focus-within:border-[#78bb8f] focus-within:ring-2 focus-within:ring-[#08733f]/10">
              <textarea
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
                placeholder="Ask Veritas about REA, projects or verification…"
                className="max-h-28 min-h-9 flex-1 resize-none border-0 px-2 py-2 text-xs text-[#173b2a] outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!question.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#08733f] text-white hover:bg-[#065d32] disabled:cursor-not-allowed disabled:bg-slate-300"
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
              AI-generated analysis should be reviewed before official use.
            </p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-[70] flex h-14 items-center gap-2 rounded-full bg-[#08733f] px-4 text-white shadow-[0_12px_35px_rgba(8,115,63,0.35)] transition-transform hover:scale-[1.03] hover:bg-[#065d32] focus:outline-none focus:ring-4 focus:ring-[#08733f]/20"
        aria-label={open ? "Close Veritas" : "Open Veritas"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        <span className="text-xs font-bold">Veritas</span>
      </button>
    </>
  );
}
