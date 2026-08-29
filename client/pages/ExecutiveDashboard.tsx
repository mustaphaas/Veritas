import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Gauge,
  Home,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Presentation,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  Zap,
} from "lucide-react";
import {
  projects,
  summarizePortfolio,
  summarizeProjectsByState,
  type Project,
} from "../lib/dashboard-data";

const SLIDE_DURATION = 8500;
const GREEN = "#0b7a45";
const DARK_GREEN = "#123d2b";
const BLUE = "#2f76c4";
const AMBER = "#d69019";
const RED = "#c7564e";
const TEAL = "#2e8b79";
const PURPLE = "#8068b2";

const slideMeta = [
  { kicker: "Executive pulse", title: "National portfolio at a glance" },
  { kicker: "Programme performance", title: "Where delivery is strongest" },
  { kicker: "Geographic delivery", title: "Where impact is concentrating" },
  { kicker: "Field assurance", title: "Verification and quality position" },
  { kicker: "Delivery risk", title: "Contractors and backlog exposure" },
  { kicker: "Leadership focus", title: "Decisions and priorities for management" },
];

const monthIndex: Record<string, number> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};

function monthSortKey(value: string) {
  const [month, year] = value.split(" ");
  return Number(year) * 12 + (monthIndex[month] ?? 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(Math.round(value));
}

function formatMW(kw: number) {
  return `${(kw / 1000).toLocaleString("en-NG", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} MW`;
}

function verificationRate(items: Project[]) {
  if (!items.length) return 0;
  return Math.round((items.filter((item) => item.verified).length / items.length) * 100);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = "green",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Zap;
  accent?: "green" | "blue" | "amber" | "teal";
}) {
  const accents = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
  };
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.06)]">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${accents[accent]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#143a2a] sm:text-4xl">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0b7a45]">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] text-[#143a2a] sm:text-4xl xl:text-[42px]">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{body}</p>
    </div>
  );
}

function VerificationGauge({ rate, size = 184 }: { rate: number; size?: number }) {
  const safe = Math.min(100, Math.max(0, rate));
  return (
    <div
      className="relative grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${GREEN} 0 ${safe}%, #e7eee9 ${safe}% 100%)`,
      }}
      aria-label={`${safe}% verified`}
    >
      <div className="grid h-[76%] w-[76%] place-items-center rounded-full bg-white text-center shadow-inner">
        <div>
          <p className="text-4xl font-black tracking-[-0.05em] text-[#143a2a]">{safe}%</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Verified</p>
        </div>
      </div>
    </div>
  );
}

function ExecutiveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-bold text-[#143a2a]">{label}</p>
      {payload.map((item: any) => (
        <p key={`${item.name}-${item.value}`} className="mt-0.5 text-slate-600">
          {item.name}: <span className="font-bold text-slate-900">{Number(item.value).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const portfolio = useMemo(() => summarizePortfolio(projects), []);
  const stateData = useMemo(() => summarizeProjectsByState(projects), []);

  const monthData = useMemo(() => {
    return [...new Set(projects.map((project) => project.month))]
      .sort((a, b) => monthSortKey(a) - monthSortKey(b))
      .map((month) => {
        const items = projects.filter((project) => project.month === month);
        const verified = items.filter((project) => project.verified).length;
        const submitted = items.filter((project) => project.status !== "In progress").length;
        return {
          month: month.slice(0, 3),
          inspections: items.length,
          submitted,
          verified,
          verification: items.length ? Math.round((verified / items.length) * 100) : 0,
        };
      });
  }, []);

  const programmeData = useMemo(() => {
    return [...new Set(projects.map((project) => project.programme))]
      .map((programme) => {
        const items = projects.filter((project) => project.programme === programme);
        return {
          programme,
          projects: items.length,
          capacity: Number((items.reduce((sum, item) => sum + item.kw, 0) / 1000).toFixed(1)),
          households: items.reduce((sum, item) => sum + item.households, 0),
          verification: verificationRate(items),
          pending: items.filter((item) => !item.verified).length,
        };
      })
      .sort((a, b) => b.projects - a.projects);
  }, []);

  const topStates = useMemo(
    () => [...stateData].sort((a, b) => b.projects - a.projects).slice(0, 10),
    [stateData],
  );

  const impactStates = useMemo(
    () => [...stateData].sort((a, b) => b.households - a.households).slice(0, 5),
    [stateData],
  );

  const backlogStates = useMemo(
    () => [...stateData].sort((a, b) => b.pending - a.pending).slice(0, 5),
    [stateData],
  );

  const contractorData = useMemo(() => {
    return [...new Set(projects.map((project) => project.contractor))]
      .map((contractor) => {
        const items = projects.filter((project) => project.contractor === contractor);
        return {
          contractor,
          projects: items.length,
          pending: items.filter((item) => !item.verified).length,
          verification: verificationRate(items),
          capacity: Number((items.reduce((sum, item) => sum + item.kw, 0) / 1000).toFixed(1)),
        };
      })
      .sort((a, b) => b.pending - a.pending);
  }, []);

  const statusData = useMemo(() => {
    return ["Verified", "Submitted", "Pending", "In progress"].map((status) => ({
      status,
      value: projects.filter((project) => project.status === status).length,
    }));
  }, []);

  const submittedCount = statusData.find((item) => item.status === "Submitted")?.value ?? 0;
  const pendingCount = statusData.find((item) => item.status === "Pending")?.value ?? 0;
  const inProgressCount = statusData.find((item) => item.status === "In progress")?.value ?? 0;
  const deliveryConfidence = Math.round(
    portfolio.verificationRate * 0.6 + Math.max(0, 100 - (portfolio.pending / Math.max(portfolio.projects, 1)) * 100) * 0.4,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slideMeta.length), SLIDE_DURATION);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, slide]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setSlide((current) => (current + 1) % slideMeta.length);
      if (event.key === "ArrowLeft") setSlide((current) => (current - 1 + slideMeta.length) % slideMeta.length);
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      setFullscreen(false);
    }
  };

  const goTo = (index: number) => setSlide((index + slideMeta.length) % slideMeta.length);
  const chartMargin = { top: 8, right: 12, left: -16, bottom: 0 };

  const slides = [
    <div className="grid min-h-[560px] gap-5 xl:grid-cols-[1.1fr_0.9fr]" key="pulse">
      <div className="flex min-w-0 flex-col gap-5">
        <SectionTitle
          eyebrow="Executive pulse"
          title="A single view of national delivery"
          body="A boardroom-ready summary of portfolio scale, electricity capacity, household impact and the current assurance position."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Projects" value={formatNumber(portfolio.projects)} detail="Across all 36 states and FCT coverage data" icon={Building2} />
          <MetricCard label="Installed capacity" value={formatMW(portfolio.kw)} detail="Aggregate project capacity in the portfolio" icon={Zap} accent="teal" />
          <MetricCard label="Households reached" value={formatNumber(portfolio.households)} detail="Estimated household connections represented" icon={Home} accent="blue" />
          <MetricCard label="Pending assurance" value={formatNumber(portfolio.pending)} detail="Projects not yet verified by REA" icon={CircleAlert} accent="amber" />
        </div>
        <div className="min-h-[250px] flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-sm font-bold text-[#143a2a]">Inspection & verification trend</p><p className="mt-1 text-xs text-slate-500">Monthly inspection volume against verified outputs</p></div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Portfolio rhythm</span>
          </div>
          <ResponsiveContainer width="100%" height="82%">
            <AreaChart data={monthData} margin={chartMargin}>
              <defs>
                <linearGradient id="execInspections" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BLUE} stopOpacity={0.25}/><stop offset="100%" stopColor={BLUE} stopOpacity={0.02}/></linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#edf1ee" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#718078" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#89958f" }} allowDecimals={false} />
              <Tooltip content={<ExecutiveTooltip />} />
              <Area type="monotone" dataKey="inspections" name="Inspections" stroke={BLUE} fill="url(#execInspections)" strokeWidth={2.5} />
              <Line type="monotone" dataKey="verified" name="Verified" stroke={GREEN} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-1">
        <div className="flex items-center justify-between gap-5 rounded-2xl bg-[#123d2b] p-6 text-white shadow-[0_20px_50px_rgba(18,61,43,0.18)]">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Delivery confidence</p><p className="mt-3 text-5xl font-black tracking-[-0.06em]">{deliveryConfidence}</p><p className="mt-2 max-w-[220px] text-sm leading-6 text-emerald-50/75">Blended indicator based on verification completion and current backlog exposure.</p></div>
          <div className="relative h-32 w-32 shrink-0 rounded-full p-2" style={{ background: `conic-gradient(#72d49a 0 ${deliveryConfidence}%, rgba(255,255,255,.12) ${deliveryConfidence}% 100%)` }}><div className="grid h-full w-full place-items-center rounded-full bg-[#123d2b]"><Gauge className="h-10 w-10 text-emerald-200" /></div></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
          <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#143a2a]">Assurance position</p><p className="mt-1 text-xs text-slate-500">Portfolio verification completion</p></div><ShieldCheck className="h-6 w-6 text-emerald-600" /></div>
          <div className="mt-6 flex items-center justify-center"><VerificationGauge rate={portfolio.verificationRate} size={176} /></div>
          <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Verified</p><p className="mt-1 text-2xl font-black text-[#143a2a]">{formatNumber(portfolio.verified)}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Pending</p><p className="mt-1 text-2xl font-black text-amber-800">{formatNumber(portfolio.pending)}</p></div></div>
        </div>
      </div>
    </div>,

    <div className="min-h-[560px]" key="programmes">
      <SectionTitle eyebrow="Programme performance" title="Compare delivery across programmes" body="Projects, capacity and assurance performance are presented together so leadership can see scale and quality in the same view." />
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="min-h-[390px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#143a2a]">Projects vs verification rate</p><p className="mt-1 text-xs text-slate-500">Bar = project count · line = verified percentage</p></div><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={programmeData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#edf1ee" />
              <XAxis dataKey="programme" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: "#375348" }} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#89958f" }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "#89958f" }} />
              <Tooltip content={<ExecutiveTooltip />} />
              <Bar yAxisId="left" dataKey="projects" name="Projects" fill={TEAL} radius={[8, 8, 0, 0]} barSize={44} />
              <Line yAxisId="right" type="monotone" dataKey="verification" name="Verification %" stroke={AMBER} strokeWidth={3} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {programmeData.map((item, index) => (
            <article key={item.programme} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(16,50,35,0.04)]">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{item.programme}</p><p className="mt-1 text-3xl font-black tracking-[-0.04em] text-[#143a2a]">{item.projects} <span className="text-sm font-bold text-slate-400">projects</span></p></div><div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: ["#e8f6ee", "#ebf3fb", "#fff4df", "#f1ecfa"][index % 4], color: [GREEN, BLUE, AMBER, PURPLE][index % 4] }}><Award className="h-5 w-5" /></div></div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Capacity</p><p className="mt-1 text-sm font-black text-[#143a2a]">{item.capacity} MW</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Households</p><p className="mt-1 text-sm font-black text-[#143a2a]">{formatNumber(item.households)}</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Verified</p><p className="mt-1 text-sm font-black text-[#143a2a]">{item.verification}%</p></div></div>
            </article>
          ))}
        </div>
      </div>
    </div>,

    <div className="min-h-[560px]" key="geography">
      <SectionTitle eyebrow="Geographic delivery" title="Where national impact is concentrating" body="State-level delivery reveals both the largest project clusters and the locations contributing the most household impact." />
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="min-h-[430px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
          <div className="mb-4"><p className="text-sm font-bold text-[#143a2a]">Top states by project count</p><p className="mt-1 text-xs text-slate-500">Largest delivery footprints in the current portfolio</p></div>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={topStates} layout="vertical" margin={{ top: 4, right: 20, left: 12, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="#edf1ee" />
              <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#89958f" }} />
              <YAxis type="category" dataKey="state" width={80} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: "#375348" }} />
              <Tooltip content={<ExecutiveTooltip />} />
              <Bar dataKey="projects" name="Projects" fill={GREEN} radius={[0, 7, 7, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-[#123d2b] p-6 text-white shadow-[0_20px_50px_rgba(18,61,43,0.16)]">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">National reach</p><p className="mt-3 text-5xl font-black tracking-[-0.06em]">{stateData.length}</p><p className="mt-1 text-sm text-emerald-50/75">states represented in portfolio data</p></div><div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10"><UsersRound className="h-6 w-6 text-emerald-100" /></div></div>
          </div>
          <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
            <p className="text-sm font-bold text-[#143a2a]">Highest household impact</p><p className="mt-1 text-xs text-slate-500">Top five states by represented household connections</p>
            <div className="mt-5 space-y-4">
              {impactStates.map((item, index) => {
                const max = impactStates[0]?.households || 1;
                return <div key={item.state}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold text-[#254a3a]">{index + 1}. {item.state}</span><span className="font-black text-[#143a2a]">{formatNumber(item.households)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2f76c4] exec-bar-grow" style={{ width: `${Math.max(8, (item.households / max) * 100)}%` }} /></div></div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,

    <div className="min-h-[560px]" key="assurance">
      <SectionTitle eyebrow="Field assurance" title="Verification is the control point" body="This scene separates completed assurance from work still moving through submission, pending review and field progress." />
      <div className="mt-6 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
          <VerificationGauge rate={portfolio.verificationRate} size={220} />
          <p className="mt-6 text-lg font-black text-[#143a2a]">{formatNumber(portfolio.verified)} projects assured</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">The remaining {formatNumber(portfolio.pending)} projects require completion of verification or progression through the assurance workflow.</p>
        </div>
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Submitted" value={formatNumber(submittedCount)} detail="Awaiting the next assurance step" icon={ArrowRight} accent="blue" />
            <MetricCard label="Pending" value={formatNumber(pendingCount)} detail="Queued for review or verification" icon={CircleAlert} accent="amber" />
            <MetricCard label="In progress" value={formatNumber(inProgressCount)} detail="Still under field execution" icon={Gauge} accent="teal" />
          </div>
          <div className="min-h-[285px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
            <div className="mb-4"><p className="text-sm font-bold text-[#143a2a]">Assurance throughput</p><p className="mt-1 text-xs text-slate-500">Submitted and verified activity across reporting months</p></div>
            <ResponsiveContainer width="100%" height={225}>
              <ComposedChart data={monthData} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke="#edf1ee" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#718078" }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#89958f" }} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="submitted" name="Submitted" fill="#b7c9d9" radius={[5, 5, 0, 0]} barSize={16} />
                <Line type="monotone" dataKey="verified" name="Verified" stroke={GREEN} strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>,

    <div className="min-h-[560px]" key="risk">
      <SectionTitle eyebrow="Delivery risk" title="Concentrate management attention where backlog is highest" body="Contractor-level and state-level exposure highlight where follow-up can have the greatest effect on assurance throughput." />
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
          <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#143a2a]">Contractor assurance exposure</p><p className="mt-1 text-xs text-slate-500">Pending portfolio and verification rate by contractor</p></div><CircleAlert className="h-5 w-5 text-amber-600" /></div>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <div className="grid grid-cols-[1.45fr_.55fr_.55fr_.65fr] bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-[0.13em] text-slate-500"><span>Contractor</span><span>Projects</span><span>Pending</span><span>Verified</span></div>
            {contractorData.map((item, index) => (
              <div key={item.contractor} className={`grid grid-cols-[1.45fr_.55fr_.55fr_.65fr] items-center px-4 py-4 text-xs ${index !== contractorData.length - 1 ? "border-b border-slate-100" : ""}`}>
                <span className="truncate pr-3 font-bold text-[#254a3a]">{item.contractor}</span><span className="font-semibold text-slate-600">{item.projects}</span><span className={`font-black ${item.pending >= contractorData[0].pending ? "text-amber-700" : "text-slate-700"}`}>{item.pending}</span><span className="font-black text-[#143a2a]">{item.verification}%</span>
              </div>
            ))}
          </div>
          <div className="mt-5 min-h-[190px]">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={contractorData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf1ee" />
                <XAxis dataKey="contractor" axisLine={false} tickLine={false} tickFormatter={(value) => String(value).split(" ")[0]} tick={{ fontSize: 10, fill: "#718078" }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#89958f" }} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="pending" name="Pending" fill={AMBER} radius={[7, 7, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-[#fff8e8] p-5 ring-1 ring-amber-100">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.17em] text-amber-700">Highest backlog state</p><p className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#5d4517]">{backlogStates[0]?.state}</p></div><CircleAlert className="h-7 w-7 text-amber-700" /></div>
            <p className="mt-2 text-sm text-amber-900/70">{backlogStates[0]?.pending ?? 0} projects pending assurance in the current portfolio.</p>
          </div>
          <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
            <p className="text-sm font-bold text-[#143a2a]">Backlog concentration</p><p className="mt-1 text-xs text-slate-500">States with the highest number of unverified projects</p>
            <div className="mt-5 space-y-4">
              {backlogStates.map((item) => {
                const max = backlogStates[0]?.pending || 1;
                return <div key={item.state}><div className="flex items-center justify-between text-xs"><span className="font-bold text-[#254a3a]">{item.state}</span><span className="font-black text-amber-700">{item.pending} pending</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500 exec-bar-grow" style={{ width: `${Math.max(8, (item.pending / max) * 100)}%` }} /></div></div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,

    <div className="min-h-[560px]" key="focus">
      <SectionTitle eyebrow="Leadership focus" title="Turn the dashboard into decisions" body="The executive view ends with a concise management agenda derived from portfolio scale, assurance backlog and delivery concentration." />
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl bg-[#123d2b] p-6 text-white shadow-[0_20px_50px_rgba(18,61,43,0.18)]"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><ShieldCheck className="h-5 w-5 text-emerald-100" /></span><span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Priority 01</span></div><h3 className="mt-6 text-2xl font-black tracking-[-0.035em]">Accelerate assurance backlog</h3><p className="mt-3 text-sm leading-6 text-emerald-50/75">Focus REA verification capacity on the {formatNumber(portfolio.pending)} projects not yet verified, beginning with {backlogStates[0]?.state} and {backlogStates[1]?.state}.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(16,50,35,0.05)]"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50"><TrendingUp className="h-5 w-5 text-blue-700" /></span><span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Priority 02</span></div><h3 className="mt-6 text-2xl font-black tracking-[-0.035em] text-[#143a2a]">Protect high-impact delivery</h3><p className="mt-3 text-sm leading-6 text-slate-500">Sustain delivery momentum in {impactStates[0]?.state}, {impactStates[1]?.state} and {impactStates[2]?.state}, which lead the portfolio in represented household impact.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(16,50,35,0.05)]"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50"><Award className="h-5 w-5 text-amber-700" /></span><span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Priority 03</span></div><h3 className="mt-6 text-2xl font-black tracking-[-0.035em] text-[#143a2a]">Manage contractor variance</h3><p className="mt-3 text-sm leading-6 text-slate-500">Review delivery and assurance performance with {contractorData[0]?.contractor}, which currently carries the largest pending portfolio among listed contractors.</p></article>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(16,50,35,0.05)]">
          <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#143a2a]">Management scorecard</p><p className="mt-1 text-xs text-slate-500">Four numbers to carry into the next executive review</p></div><Sparkles className="h-5 w-5 text-emerald-600" /></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">Projects</p><p className="mt-2 text-2xl font-black text-[#143a2a]">{formatNumber(portfolio.projects)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">Capacity</p><p className="mt-2 text-2xl font-black text-[#143a2a]">{formatMW(portfolio.kw)}</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-700">Verified</p><p className="mt-2 text-2xl font-black text-emerald-800">{portfolio.verificationRate}%</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-amber-700">Backlog</p><p className="mt-2 text-2xl font-black text-amber-800">{formatNumber(portfolio.pending)}</p></div></div>
        </div>
        <div className="rounded-2xl bg-[#eef7f1] p-6 ring-1 ring-emerald-100"><p className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-700">Executive takeaway</p><p className="mt-3 text-2xl font-black leading-9 tracking-[-0.035em] text-[#143a2a]">Delivery scale is strong; the management opportunity is converting more of the portfolio into verified, decision-ready evidence.</p></div>
      </div>
    </div>,
  ];

  return (
    <div ref={stageRef} className="exec-stage min-h-screen bg-[#f4f7f4] text-slate-900">
      <style>{`
        .exec-stage { background-image: radial-gradient(circle at 12% 10%, rgba(11,122,69,.07), transparent 22%), radial-gradient(circle at 92% 4%, rgba(47,118,196,.06), transparent 20%); }
        .exec-slide { animation: exec-enter .65s cubic-bezier(.2,.8,.2,1) both; }
        .exec-bar-grow { transform-origin: left center; animation: exec-grow .8s cubic-bezier(.2,.8,.2,1) both; }
        .exec-progress { transform-origin: left center; animation: exec-progress ${SLIDE_DURATION}ms linear both; }
        @keyframes exec-enter { from { opacity: 0; transform: translateY(12px) scale(.995); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes exec-grow { from { transform: scaleX(.15); opacity: .45; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes exec-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) { .exec-slide, .exec-bar-grow, .exec-progress { animation: none !important; } }
      `}</style>

      <header className="border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigate("/")} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700" aria-label="Back to REA dashboard"><ArrowLeft className="h-4 w-4" /></button>
            <img src="/rea-brand-mark.svg" alt="REA" className="h-11 w-11 rounded-xl bg-white object-contain" />
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-base font-black tracking-tight text-[#143a2a] sm:text-lg">MD Executive Dashboard</h1><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-amber-700">Sample portfolio data</span></div><p className="mt-0.5 hidden text-xs text-slate-500 sm:block">Presentation view · Rural Electrification Agency</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPlaying((current) => !current)} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50" aria-label={playing ? "Pause slideshow" : "Play slideshow"}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}<span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span></button>
            <button type="button" onClick={toggleFullscreen} className="flex h-10 items-center gap-2 rounded-xl bg-[#123d2b] px-3 text-xs font-bold text-white transition hover:bg-[#0d3022]" aria-label={fullscreen ? "Exit presentation mode" : "Enter presentation mode"}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}<span className="hidden sm:inline">Presentation</span></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-4 py-5 sm:px-7 lg:px-10 lg:py-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{slideMeta[slide].kicker}</p><p className="mt-1 text-sm font-bold text-[#29493b]">{slideMeta[slide].title}</p></div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500"><Presentation className="h-4 w-4 text-emerald-600" />Scene {slide + 1} of {slideMeta.length}</div>
        </div>

        <section key={slide} className="exec-slide rounded-[26px] border border-white/80 bg-white/55 p-4 shadow-[0_24px_60px_rgba(18,61,43,0.06)] backdrop-blur-sm sm:p-6 lg:p-7">
          {slides[slide]}
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goTo(slide - 1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50" aria-label="Previous slide"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => goTo(slide + 1)} className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b7a45] text-white transition hover:bg-[#08683b]" aria-label="Next slide"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="flex min-w-[220px] flex-1 items-center justify-center gap-2">
            {slideMeta.map((item, index) => (
              <button key={item.kicker} type="button" onClick={() => goTo(index)} className={`h-2.5 rounded-full transition-all ${index === slide ? "w-9 bg-[#0b7a45]" : "w-2.5 bg-slate-200 hover:bg-slate-300"}`} aria-label={`Go to slide ${index + 1}: ${item.title}`} />
            ))}
          </div>
          <div className="w-[112px] overflow-hidden rounded-full bg-slate-100"><div key={`${slide}-${playing}`} className={`h-1.5 rounded-full bg-[#0b7a45] ${playing && !reducedMotion ? "exec-progress" : "w-full"}`} style={{ animationPlayState: playing ? "running" : "paused" }} /></div>
        </div>
      </main>
    </div>
  );
}
