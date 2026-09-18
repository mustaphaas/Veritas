import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Cloud, Plus, RefreshCw, Save, Send, ShieldCheck, Trash2, Users, UserPlus, X } from "lucide-react";
import { useAuth } from "../lib/auth";

type Staff = { id: string; name: string; email?: string; role?: string; };
type Project = { id: string; name: string; projectName?: string; programme: string; component: string; contractor: string; state: string; lga: string; community: string; };
type Team = { id: string; name: string; teamLeadId: string; teamLeadName: string; members: Staff[]; status: string; };
type Section = { id: string; title: string; description: string; fields: string[]; };
type Inspection = { id: string; teamId: string; projectId: string; status: string; dueDate?: string; form: Record<string,string>; sectionAssignments: Record<string,string>; version: number; updatedAt: string; lastSavedBy?: string; submittedAt?: string; };

const sections: Section[] = [
  { id: "project", title: "Project Details", description: "Confirm the project and implementation details.", fields: ["Project reference confirmed", "Programme and component", "Contractor details"] },
  { id: "site", title: "Site Assessment", description: "Record physical site observations and installation condition.", fields: ["Site condition", "GPS/location notes", "Access and surroundings"] },
  { id: "equipment", title: "Equipment & Infrastructure", description: "Capture installed equipment and technical observations.", fields: ["Equipment installed", "Capacity / specification", "Condition and operation"] },
  { id: "beneficiaries", title: "Beneficiary Verification", description: "Record beneficiary and service information.", fields: ["Beneficiary count", "Community served", "Service availability"] },
  { id: "evidence", title: "Photos & Evidence", description: "Record evidence references and inspection notes.", fields: ["Photo references", "Supporting documents", "Evidence notes"] },
  { id: "hse", title: "HSE / Environment", description: "Capture health, safety and environmental observations.", fields: ["HSE observations", "Environmental observations", "Corrective actions"] },
  { id: "final", title: "Final Observations", description: "Team Lead completes the final inspection assessment.", fields: ["Overall observation", "Outstanding issues", "Recommendation"] },
];

const defaultForm = Object.fromEntries(sections.flatMap((section) => section.fields.map((field) => [field, ""])));
const colors = ["bg-[#08733f]", "bg-[#3772ad]", "bg-[#7452bd]", "bg-[#c58300]"];

function api(path: string, token: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) } }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  });
}

export default function ReaFieldInspections() {
  const { session } = useAuth();
  const token = session?.apiToken || "";
  const [staff, setStaff] = useState<Staff[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [showSectionList, setShowSectionList] = useState(true);
  const [selectedSection, setSelectedSection] = useState("project");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Saved");
  const [teamModal, setTeamModal] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamLeadId, setTeamLeadId] = useState("");
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [assignTeamId, setAssignTeamId] = useState("");
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [sectionAssignModal, setSectionAssignModal] = useState(false);
  const [draftSectionAssignments, setDraftSectionAssignments] = useState<Record<string,string>>({});

  const selected = inspections.find((item) => item.id === selectedInspection);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams.find((team) => team.id === selected?.teamId);
  const isLead = selectedTeam?.teamLeadId === session?.email || selectedTeam?.teamLeadId === session?.name || selectedTeam?.teamLeadId === session?.role ? true : selectedTeam?.members.some((member) => member.id === selectedTeam.teamLeadId && member.email === session?.email);
  const currentUser = staff.find((member) => member.email?.toLowerCase() === session?.email?.toLowerCase());
  const lead = selectedTeam?.members.find((member) => member.id === selectedTeam.teamLeadId);
  const isTeamLead = Boolean((currentUserId && selectedTeam?.teamLeadId === currentUserId) || (lead && currentUser && lead.id === currentUser.id));
  const canAssignSections = isTeamLead || session?.role === "rea";
  const assignedSections = useMemo(() => selected?.sectionAssignments || {}, [selected]);
  const completion = useMemo(() => {
    const completed = sections.filter((section) => section.fields.some((field) => selected?.form?.[field]?.trim()));
    return Math.round((completed.length / sections.length) * 100);
  }, [selected]);

  const load = async () => {
    if (!token) return;
    const data = await api("/api/field/rea-inspections", token);
    setStaff(data.staff || []);
      setCurrentUserId(data.currentUserId || "");
    setProjects(data.projects || []);
    setTeams(data.teams || []);
    setInspections(data.inspections || []);
    setSelectedInspection((current) => current || data.inspections?.[0]?.id || "");
  };

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [token]);
  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 2500);
    return () => window.clearInterval(timer);
  }, [token]);

  const saveField = (field: string, value: string) => {
    if (!selected || !token || selected.status === "Submitted" || selected.status === "Approved" || selected.status === "Verified") return;
    setInspections((current) => current.map((item) => item.id === selected.id ? { ...item, form: { ...item.form, [field]: value }, status: "In Progress" } : item));
    setSaving(true); setMessage("Saving…");
    window.clearTimeout((saveField as unknown as { timer?: number }).timer);
    (saveField as unknown as { timer?: number }).timer = window.setTimeout(async () => {
      try {
        await api(`/api/field/rea-inspections/${selected.id}`, token, { method: "PATCH", body: JSON.stringify({ formPatch: { [field]: value } }) });
        setSaving(false); setMessage("Saved");
      } catch { setSaving(false); setMessage("Save failed — retrying"); }
    }, 450);
  };

  const createTeam = async () => {
    if (!teamName || !teamLeadId || !teamMembers.length) return;
    await api("/api/field/rea-inspections/teams", token, { method: "POST", body: JSON.stringify({ name: teamName, teamLeadId, memberIds: [...new Set([teamLeadId, ...teamMembers])] }) });
    setTeamModal(false); setTeamName(""); setTeamLeadId(""); setTeamMembers([]); await load();
  };

  const assignProject = async () => {
    if (!assignTeamId || !assignProjectId) return;
    await api("/api/field/rea-inspections/assign", token, { method: "POST", body: JSON.stringify({ teamId: assignTeamId, projectId: assignProjectId, dueDate: assignDueDate || null }) });
    setAssignModal(false); setAssignTeamId(""); setAssignProjectId(""); setAssignDueDate(""); await load();
  };

  const updateAssignment = async (sectionId: string, userId: string) => {
    if (!selected || !token || !canAssignSections) return;
    const next = { ...selected.sectionAssignments, [sectionId]: userId };
    setInspections((current) => current.map((item) => item.id === selected.id ? { ...item, sectionAssignments: next } : item));
    await api(`/api/field/rea-inspections/${selected.id}`, token, { method: "PATCH", body: JSON.stringify({ sectionAssignments: next }) });
  };

  const submitInspection = async () => {
    if (!selected || !isTeamLead) return;
    if (completion < 100) { setMessage("Complete all sections before submission"); return; }
    await api(`/api/field/rea-inspections/${selected.id}/submit`, token, { method: "POST" });
    await load();
    setMessage("Submitted");
  };

  const openSectionAssignModal = () => {
    if (!selectedTeam || !canAssignSections) return;
    setDraftSectionAssignments({ ...(selected?.sectionAssignments || {}) });
    setSectionAssignModal(true);
  };

  const saveSectionAssignments = async () => {
    if (!selected || !token || !canAssignSections) return;
    try {
      setSaving(true);
      setMessage("Saving section assignments…");
      const result = await api(`/api/field/rea-inspections/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ sectionAssignments: draftSectionAssignments })
      });
      setInspections((current) => current.map((item) => item.id === selected.id
        ? { ...item, sectionAssignments: draftSectionAssignments, version: result.version ?? item.version, updatedAt: result.updatedAt ?? item.updatedAt }
        : item
      ));
      setSectionAssignModal(false);
      setSelectedSection("project");
      setShowSectionList(true);
      setMessage("Section assignments saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save section assignments");
    } finally {
      setSaving(false);
    }
  };

  const selectTeam = (team: Team) => {
    setSelectedTeamId(team.id);
    const teamInspection = inspections.find((item) => item.teamId === team.id);
    setSelectedInspection(teamInspection?.id || "");
    setSelectedSection("project");
    setShowSectionList(true);
  };

  const deleteTeam = async (team: Team) => {
    if (!token) return;
    if (!window.confirm(`Delete ${team.name}? This cannot be undone.`)) return;
    try {
      setMessage("Deleting team…");
      await api(`/api/field/rea-inspections/teams/${team.id}`, token, { method: "DELETE" });
      if (selectedTeamId === team.id) { setSelectedTeamId(""); setSelectedInspection(""); }
      await load();
      setMessage("Team deleted");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete team");
    }
  };

  const openTeamModal = () => {
    setTeamLeadId(currentUser?.id || staff[0]?.id || "");
    setTeamMembers(currentUser?.id ? [currentUser.id] : []);
    setTeamModal(true);
  };

  const getProgress = (inspection: Inspection) => {
    const completed = sections.filter((section) => section.fields.some((field) => inspection.form?.[field]?.trim())).length;
    return Math.round((completed / sections.length) * 100);
  };

  const getStatus = (inspection: Inspection) => {
    const progress = getProgress(inspection);
    if (inspection.status === "Verified") return "Verified";
    if (inspection.status === "Approved") return "Approved";
    if (inspection.status === "Submitted") return "Submitted";
    if (progress === 100) return "Completed";
    if (progress > 0) return "In Progress";
    return "Not Started";
  };

  const assignmentRows = inspections.map((inspection) => {
    const team = teams.find((item) => item.id === inspection.teamId);
    const project = projects.find((item) => item.id === inspection.projectId);
    return { inspection, team, project, progress: getProgress(inspection), status: getStatus(inspection) };
  });

  if (!token) return <div className="p-8 text-sm text-slate-500">Sign in to use Field Inspections.</div>;

  return (
    <div className="py-5">
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-[#173b2a]">Inspection Assignments</h3>
          <p className="mt-1 text-xs text-slate-500">Select an assignment to open the inspection.</p>
        </div>
        {assignmentRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No inspection assignments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.1fr_2fr_0.8fr_1.2fr_1fr] gap-4 border-b border-slate-100 bg-[#fbfefb] px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <span>Group</span><span>Assignment</span><span>Progress</span><span>Team Lead</span><span>Status</span>
              </div>
              {assignmentRows.map(({ inspection, team, project, progress, status }) => (
                <button key={inspection.id} type="button" onClick={() => {
                  setSelectedInspection(inspection.id);
                  setSelectedTeamId(inspection.teamId);
                  setShowSectionList(true);
                }} className="grid w-full grid-cols-[1.1fr_2fr_0.8fr_1.2fr_1fr] gap-4 border-b border-slate-100 px-5 py-4 text-left transition hover:bg-[#f7fcf8]">
                  <span className="truncate text-xs font-bold text-[#173b2a]">{team?.name || "—"}</span>
                  <span className="truncate text-xs text-slate-600">{project ? `${project.name} · ${project.programme} · ${project.component}` : inspection.projectId}</span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-[#08733f]"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#08733f]" style={{ width: `${progress}%` }} /></span>{progress}%</span>
                  <span className="truncate text-xs text-slate-600">{team?.teamLeadName || "—"}</span>
                  <span className="text-xs font-semibold text-slate-600">{status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm">

      {teamModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold text-[#173b2a]">Create Inspection Team</h3><p className="mt-1 text-xs text-slate-500">Select a Team Lead and REA staff members.</p></div><button onClick={() => setTeamModal(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="space-y-4 p-5"><input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" className="h-10 w-full rounded-lg border px-3 text-sm" /><select value={teamLeadId} onChange={(e) => setTeamLeadId(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Select Team Lead</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><div><p className="mb-2 text-xs font-bold text-slate-600">Team members</p><div className="grid max-h-48 gap-2 overflow-auto">{staff.map((member) => <label key={member.id} className="flex items-center gap-3 rounded-lg border p-3 text-xs"><input type="checkbox" checked={teamMembers.includes(member.id)} onChange={(e) => setTeamMembers((current) => e.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />{member.name}<span className="ml-auto text-slate-400">{member.role || "REA Staff"}</span></label>)}</div></div><button onClick={() => void createTeam()} disabled={!teamName || !teamLeadId || !teamMembers.length} className="w-full rounded-lg bg-[#08733f] py-2.5 text-xs font-bold text-white disabled:bg-slate-300">Create Team</button></div></div></div>}

      {sectionAssignModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold text-[#173b2a]">Assign Inspection Sections</h3><p className="mt-1 text-xs text-slate-500">Assign each section to a member of {selectedTeam?.name}.</p></div><button type="button" onClick={() => setSectionAssignModal(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="max-h-[60vh] space-y-2 overflow-auto p-5">{sections.map((section) => <div key={section.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#173b2a]">{section.title}</p></div><select value={draftSectionAssignments[section.id] || ""} onChange={(e) => setDraftSectionAssignments((current) => ({ ...current, [section.id]: e.target.value }))} className="h-9 w-40 rounded-md border border-slate-200 bg-white px-2 text-[11px]"><option value="">Unassigned</option>{selectedTeam?.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>)}</div><div className="border-t p-5"><p className={message && message.toLowerCase().includes("unable") || message.toLowerCase().includes("failed") || message.toLowerCase().includes("only") ? "mb-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700" : "mb-3 text-[11px] text-slate-500"}>{message}</p><div className="flex gap-2"><button type="button" onClick={() => setSectionAssignModal(false)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button type="button" disabled={saving} onClick={() => void saveSectionAssignments()} className="flex-1 rounded-lg bg-[#08733f] py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "Saving…" : "Save Assignments"}</button></div></div></div></div>}
      {assignModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold text-[#173b2a]">Assign Project to Team</h3><p className="mt-1 text-xs text-slate-500">The team will work on one shared inspection form.</p></div><button onClick={() => setAssignModal(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="space-y-4 p-5"><select value={assignTeamId} onChange={(e) => setAssignTeamId(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><select value={assignProjectId} onChange={(e) => setAssignProjectId(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm" /><button onClick={() => void assignProject()} disabled={!assignTeamId || !assignProjectId} className="w-full rounded-lg bg-[#08733f] py-2.5 text-xs font-bold text-white disabled:bg-slate-300">Assign Project</button></div></div></div>}
    </div>
  );
}
