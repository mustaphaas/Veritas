import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  Database,
  FileText,
  Globe2,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  matchingProjects,
  summarizePortfolio,
  summarizeProjectsByState,
  type Filters,
} from "../lib/dashboard-data";
import { useInspectionWorkflow } from "../lib/inspection-workflow";
import type { ReaAiMessage, ReaAiSource } from "../../shared/rea-ai";

type DisplayMessage = ReaAiMessage & {
  id: string;
  sources?: ReaAiSource[];
};

const welcomeMessage: DisplayMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello. I’m REA AI Insights. Ask me about dashboard projects, programme performance, contractors, verification, monthly reports, or information on the official REA website.",
};

const quickActions = [
  {
    label: "Portfolio insight",
    prompt: "Summarise the current filtered portfolio and highlight key risks.",
    icon: BarChart3,
  },
  {
    label: "Verification risks",
    prompt:
      "Which reports and locations require the most urgent verification attention?",
    icon: Database,
  },
  {
    label: "Monthly report",
    prompt:
      "Generate a management monthly report for the current dashboard period and filters.",
    icon: FileText,
  },
  {
    label: "REA website news",
    prompt: "What are the latest announcements on the official REA website?",
    icon: Globe2,
  },
];

function messageId() {
  return `message-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ReaAiAssistant({ filters }: { filters: Filters }) {
  const { assignments } = useInspectionWorkflow();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([welcomeMessage]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const databaseContext = useMemo(() => {
    const filteredProjects = matchingProjects(filters);
    const totals = summarizePortfolio(filteredProjects);
    const workflowReports = assignments.filter(
      (assignment) =>
        (filters.programs === "All Programmes" ||
          assignment.programme === filters.programs) &&
        (filters.components === "All Components" ||
          assignment.component === filters.components) &&
        (filters.states === "All States" ||
          assignment.state === filters.states) &&
        (filters.contractors === "All Contractors" ||
          assignment.contractor === filters.contractors),
    );
    const workflowBreakdown = (
      key: "status" | "programme" | "component" | "contractor" | "state",
    ) =>
      [...new Set(workflowReports.map((assignment) => assignment[key]))].map(
        (value) => ({
          [key]: value,
          assignments: workflowReports.filter(
            (assignment) => assignment[key] === value,
          ).length,
        }),
      );

    const programmePerformance = [
      ...new Set(filteredProjects.map((project) => project.programme)),
    ].map((programme) => {
      const rows = filteredProjects.filter(
        (project) => project.programme === programme,
      );
      return {
        programme,
        projects: rows.length,
        installedCapacityKw: rows.reduce((sum, project) => sum + project.kw, 0),
        households: rows.reduce((sum, project) => sum + project.households, 0),
        verified: rows.filter((project) => project.verified).length,
      };
    });

    const contractorPerformance = [
      ...new Set(filteredProjects.map((project) => project.contractor)),
    ].map((contractor) => {
      const rows = filteredProjects.filter(
        (project) => project.contractor === contractor,
      );
      return {
        contractor,
        projects: rows.length,
        installedCapacityKw: rows.reduce((sum, project) => sum + project.kw, 0),
        households: rows.reduce((sum, project) => sum + project.households, 0),
        verified: rows.filter((project) => project.verified).length,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      dataScope: "REA Admin dashboard demo database and inspection workflow",
      activeFilters: filters,
      portfolio: {
        totalProjects: totals.projects,
        installedCapacityKw: totals.kw,
        householdsReached: totals.households,
        verifiedProjects: totals.verified,
        pendingProjects: totals.pending,
        verificationRatePercent: totals.verificationRate,
      },
      statePerformance: summarizeProjectsByState(filteredProjects),
      programmePerformance,
      contractorPerformance,
      projects: filteredProjects.map((project) => ({
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
          "Aggregated workflow statistics only; personal data, precise GPS, evidence, device IDs, signatures and audit actors are excluded.",
        assignments: workflowReports.length,
        submittedReports: workflowReports.filter(
          (assignment) => assignment.report,
        ).length,
        gpsVerifiedAssignments: workflowReports.filter(
          (assignment) => assignment.arrival,
        ).length,
        evidenceFiles: workflowReports.reduce(
          (total, assignment) =>
            total + (assignment.report?.evidence.length ?? 0),
          0,
        ),
        byStatus: workflowBreakdown("status"),
        byProgramme: workflowBreakdown("programme"),
        byComponent: workflowBreakdown("component"),
        byContractor: workflowBreakdown("contractor"),
        byState: workflowBreakdown("state"),
      },
    };
  }, [assignments, filters]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, open]);

  const sendQuestion = async (prompt = question) => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    const userMessage: DisplayMessage = {
      id: messageId(),
      role: "user",
      content: trimmed,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/rea-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.id !== "welcome")
            .slice(-10)
            .map(({ role, content }) => ({ role, content })),
          databaseContext,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        sources?: ReaAiSource[];
        error?: string;
      };
      if (!response.ok || !payload.answer) {
        throw new Error(
          payload.error || "REA AI could not answer the question.",
        );
      }
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: payload.answer!,
          sources: payload.sources,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "REA AI could not answer the question.",
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
          className="fixed inset-x-3 bottom-[88px] top-20 z-50 flex flex-col overflow-hidden rounded-2xl border border-[#c8dfcf] bg-white shadow-[0_24px_80px_rgba(8,72,39,0.24)] sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[min(720px,calc(100vh-120px))] sm:w-[420px]"
          aria-label="REA AI Insights assistant"
        >
          <header className="flex items-center justify-between bg-gradient-to-r from-[#075c33] to-[#0b8248] px-4 py-3.5 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold">REA AI Insights</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-emerald-50">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8df0b4]" />
                  Dashboard data + official REA website
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([welcomeMessage])}
                className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Close REA AI"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto bg-[#f7faf8] p-4"
          >
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-[11px] leading-5 ${
                      message.role === "user"
                        ? "rounded-br-md bg-[#08733f] text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-[#08733f]">
                        <Bot className="h-3.5 w-3.5" /> REA AI
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
                      onClick={() => void sendQuestion(prompt)}
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
                    Analysing REA data…
                  </div>
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendQuestion();
            }}
            className="border-t border-slate-200 bg-white p-3"
          >
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-[#78bb8f] focus-within:ring-2 focus-within:ring-[#08733f]/10">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendQuestion();
                  }
                }}
                maxLength={2_000}
                rows={1}
                placeholder="Ask about projects, verification or REA…"
                className="max-h-28 min-h-9 flex-1 resize-none border-0 px-2 py-2 text-xs text-[#173b2a] outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!question.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#08733f] text-white transition-colors hover:bg-[#065d32] disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label="Send question"
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
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 right-5 z-50 flex h-14 items-center gap-2 rounded-full bg-[#08733f] px-4 text-white shadow-[0_12px_35px_rgba(8,115,63,0.35)] transition-transform hover:scale-[1.03] hover:bg-[#065d32] focus:outline-none focus:ring-4 focus:ring-[#08733f]/20"
        aria-label={open ? "Close REA AI Insights" : "Open REA AI Insights"}
        aria-expanded={open}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
        <span className="text-xs font-bold">REA AI</span>
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#f2a100]">
            <Sparkles className="h-2.5 w-2.5" />
          </span>
        )}
      </button>
    </>
  );
}
