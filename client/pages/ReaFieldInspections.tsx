import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Cloud, Plus, RefreshCw, Save, Send, ShieldCheck, Users, UserPlus, X } from "lucide-react";
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<string>("");
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
  const selectedTeam = teams.find((team) => team.id === selected?.teamId);
  const isLead = selectedTeam?.teamLeadId === session?.email || selectedTeam?.teamLeadId === session?.name || selectedTeam?.teamLeadId === session?.role ? true : selectedTeam?.members.some((member) => member.id === selectedTeam.teamLeadId && member.email === session?.email);
  const currentUser = staff.find((member) => member.email?.toLowerCase() === session?.email?.toLowerCase());
  const lead = selectedTeam?.members.find((member) => member.id === selectedTeam.teamLeadId);
  const isTeamLead = Boolean(lead && currentUser && lead.id === currentUser.id);
  const assignedSections = useMemo(() => selected?.sectionAssignments || {}, [selected]);
  const completion = useMemo(() => {
    const completed = sections.filter((section) => section.fields.some((field) => selected?.form?.[field]?.trim()));
    return Math.round((completed.length / sections.length) * 100);
  }, [selected]);

  const load = async () => {
    if (!token) return;
    const data = await api("/api/field/rea-inspections", token);
    setStaff(data.staff || []);
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
    if (!selected || !token || !isTeamLead) return;
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
    if (!selectedTeam || !isTeamLead) return;
    setDraftSectionAssignments({ ...(selected?.sectionAssignments || {}) });
    setSectionAssignModal(true);
  };

  const saveSectionAssignments = async () => {
    if (!selected || !token || !isTeamLead) return;
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
      setMessage("Section assignments saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save section assignments");
    } finally {
      setSaving(false);
    }
  };

  const openTeamModal = () => {
    setTeamLeadId(currentUser?.id || staff[0]?.id || "");
    setTeamMembers(currentUser?.id ? [currentUser.id] : []);
    setTeamModal(true);
  };

  if (!token) return <div className="p-8 text-sm text-slate-500">Sign in to use Field Inspections.</div>;

  return (
    <div className="py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#08733f]">REA Operations</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[#173b2a]">Field Inspections</h2><p className="mt-1 text-sm text-slate-500">Assign REA inspection teams and work together on one shared inspection form.</p></div>
        <div className="flex gap-2"><button onClick={openTeamModal} className="inline-flex items-center gap-2 rounded-lg border border-[#b9dfc5] bg-white px-4 py-2.5 text-xs font-bold text-[#08733f]"><UserPlus className="h-4 w-4" /> Create Team</button><button onClick={() => setAssignModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#08733f] px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Assign Project</button></div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-bold text-[#173b2a]">Inspection Teams</h3><p className="text-[11px] text-slate-500">{teams.length} active teams</p></div><button onClick={() => void load()} className="rounded-md p-2 text-slate-500 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button></div>
          <div className="max-h-[620px] overflow-auto p-2">{teams.map((team, index) => <div key={team.id} className="mb-2"><div className={`rounded-lg border p-3 ${selectedTeam?.id === team.id ? "border-[#9ed1ae] bg-[#f4fbf6]" : "border-slate-100"}`}><div className="flex items-start gap-2"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${colors[index % colors.length]}`}><Users className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-xs font-bold text-[#173b2a]">{team.name}</p><p className="mt-0.5 text-[10px] text-slate-500">Lead: {team.teamLeadName}</p></div></div><p className="mt-2 text-[10px] text-slate-500">{team.members.length} REA staff</p></div></div>)}</div>
        </aside>

        <main className="min-w-0">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="text-sm font-bold text-[#173b2a]">Collaborative Inspections</h3><span className="rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[10px] font-bold text-[#08733f]">{inspections.length} assigned</span></div><p className="mt-1 text-xs text-slate-500">Everyone works in the same inspection. Changes are saved continuously.</p></div><div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500"><Cloud className="h-4 w-4 text-[#08733f]" />{saving ? "Saving…" : message}</div></div>

            {!selected ? <div className="p-12 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-600">No inspection assigned yet</p><p className="mt-1 text-xs text-slate-400">Create a team and assign an REA project.</p></div> : (
              <>
                <div className="grid gap-4 border-b border-slate-100 bg-[#fbfefb] p-4 md:grid-cols-4"><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Project</p><p className="mt-1 text-sm font-bold text-[#173b2a]">{projects.find((project) => project.id === selected.projectId)?.name || selected.projectId}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Team</p><p className="mt-1 text-sm font-bold text-[#173b2a]">{selectedTeam?.name}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Progress</p><p className="mt-1 text-sm font-bold text-[#08733f]">{completion}%</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Status</p><p className="mt-1 text-sm font-bold text-[#173b2a]">{selected.status}</p></div></div>

                <div className="grid md:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="border-b border-slate-100 p-3 md:border-b-0 md:border-r">
                    {isTeamLead && <button onClick={openSectionAssignModal} className="mb-3 w-full rounded-lg border border-[#b9dfc5] bg-white px-3 py-2 text-xs font-bold text-[#08733f]">Assign Sections</button>}
                    {sections.map((section) => {
                      const done = section.fields.some((field) => selected.form?.[field]?.trim());
                      const assigned = assignedSections[section.id];
                      const assignee = selectedTeam?.members.find((member) => member.id === assigned);
                      const status = done ? "Completed" : assigned ? "Not Started" : "Unassigned";
                      return <button key={section.id} onClick={() => setSelectedSection(section.id)} className={`mb-2 w-full rounded-lg border p-3 text-left ${selectedSection === section.id ? "border-[#9ed1ae] bg-[#edf9f0]" : "border-slate-100 hover:bg-slate-50"}`}>
                        <div className="flex items-center gap-2">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? "bg-[#08733f] text-white" : assigned ? "bg-[#eaf8ef] text-[#08733f]" : "bg-slate-100 text-slate-400"}`}>{done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{sections.indexOf(section)+1}</span>}</span>
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#173b2a]">{section.title}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                        </div>
                        <div className="mt-1 pl-9 text-[9px] text-slate-500">{assignee ? assignee.name : "Not assigned"}</div>
                        <div className="mt-1 pl-9 text-[9px] font-semibold text-slate-400">{status}</div>
                      </button>;
                    })}
                  </div>

                  <div className="p-5">
                    {(() => { const section = sections.find((item) => item.id === selectedSection) || sections[0]; const assigned = assignedSections[section.id]; const assignee = selectedTeam?.members.find((member) => member.id === assigned); const canEdit = !selected.status || !["Submitted","Approved","Verified"].includes(selected.status); return <div>
                      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><h4 className="text-base font-bold text-[#173b2a]">{section.title}</h4><p className="mt-1 text-xs text-slate-500">{section.description}</p></div><span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{assignee ? `Assigned to ${assignee.name}` : "Not assigned"}</span></div>
                      <div className="mt-5 space-y-4">{section.fields.map((field) => <label key={field} className="block"><span className="text-xs font-semibold text-slate-600">{field}</span><textarea disabled={!canEdit} value={selected.form?.[field] || ""} onChange={(event) => saveField(field, event.target.value)} rows={field.includes("observation") || field.includes("notes") ? 4 : 2} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#173b2a] outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10 disabled:bg-slate-50" placeholder="Enter inspection information…" /></label>)}</div>
                      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] text-slate-400">All team members see changes after the next sync. Last saved {selected.updatedAt ? new Date(selected.updatedAt).toLocaleTimeString() : "—"}.</p>{isTeamLead && <button disabled={selected.status==="Submitted" || selected.status==="Approved" || selected.status==="Verified"} onClick={() => void submitInspection()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Send className="h-4 w-4" /> Submit Inspection</button>}</div>
                    </div>; })()}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {teamModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold text-[#173b2a]">Create Inspection Team</h3><p className="mt-1 text-xs text-slate-500">Select a Team Lead and REA staff members.</p></div><button onClick={() => setTeamModal(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="space-y-4 p-5"><input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" className="h-10 w-full rounded-lg border px-3 text-sm" /><select value={teamLeadId} onChange={(e) => setTeamLeadId(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Select Team Lead</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><div><p className="mb-2 text-xs font-bold text-slate-600">Team members</p><div className="grid max-h-48 gap-2 overflow-auto">{staff.map((member) => <label key={member.id} className="flex items-center gap-3 rounded-lg border p-3 text-xs"><input type="checkbox" checked={teamMembers.includes(member.id)} onChange={(e) => setTeamMembers((current) => e.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />{member.name}<span className="ml-auto text-slate-400">{member.role || "REA Staff"}</span></label>)}</div></div><button onClick={() => void createTeam()} disabled={!teamName || !teamLeadId || !teamMembers.length} className="w-full rounded-lg bg-[#08733f] py-2.5 text-xs font-bold text-white disabled:bg-slate-300">Create Team</button></div></div></div>}

      {sectionAssignModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold text-[#173b2a]">Assign Inspection Sections</h3><p className="mt-1 text-xs text-slate-500">Assign each section to a member of {selectedTeam?.name}.</p></div><button onClick={() => setSectionAssignModal(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="max-h-[60vh] space-y-2 overflow-auto p-5">{sections.map((section) => <div key={section.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#173b2a]">{section.title}</p></div><select value={draftSectionAssignments[section.id] || ""} onChange={(e) => setDraftSectionAssignments((current) => ({ ...current, [section.id]: e.target.value }))} className="h-9 w-40 rounded-md border border-slate-200 bg-white px-2 text-[11px]"><option value="">Unassigned</option>{selectedTeam?.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>)}</div><div className="flex gap-2 border-t p-5"><button onClick={() => setSectionAssignModal(false)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button onClick={() => void saveSectionAssignments()} className="flex-1 rounded-lg bg-[#08733f] py-2.5 text-xs font-bold text-white">{saving ? "Saving…" : "Save Assignments"}</button></div></div></div>}
      {assignModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold text-[#173b2a]">Assign Project to Team</h3><p className="mt-1 text-xs text-slate-500">The team will work on one shared inspection form.</p></div><button onClick={() => setAssignModal(false)}><X className="h-5 w-5 text-slate-400" /></button></div><div className="space-y-4 p-5"><select value={assignTeamId} onChange={(e) => setAssignTeamId(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><select value={assignProjectId} onChange={(e) => setAssignProjectId(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm" /><button onClick={() => void assignProject()} disabled={!assignTeamId || !assignProjectId} className="w-full rounded-lg bg-[#08733f] py-2.5 text-xs font-bold text-white disabled:bg-slate-300">Assign Project</button></div></div></div>}
    </div>
  );
}
