import { describe, expect, it } from "vitest";
import type { Project } from "./dashboard-data";
import type { ConsultantRecord } from "./consultants";
import type { FieldOfficerAccount, InspectionAssignment } from "./inspection-workflow";
import { assignmentBelongsToConsultant, selectConsultantScope, type ConsultantOwnership } from "./consultant-tenancy";
import { resolveSessionConsultant } from "./use-consultant-portfolio";

const officers=[{id:"fo-a",name:"Amina Yusuf",email:"amina@supreme.ng"},{id:"fo-b",name:"Bello Musa",email:"bello@meridian.ng"}] as FieldOfficerAccount[];
const assignments=[
 {id:"a-supreme",officer:"Amina Yusuf",projectName:"Supreme assigned project",status:"Submitted",syncStatus:"synced"},
 {id:"a-meridian",officer:"Bello Musa",projectName:"Meridian assigned project",status:"Approved",syncStatus:"synced"},
 {id:"a-draft",officer:"Amina Yusuf",projectName:"Private officer draft",status:"Draft",syncStatus:"synced"},
 {id:"a-queued",officer:"Amina Yusuf",projectName:"Offline submission",status:"Submitted",syncStatus:"queued"},
] as InspectionAssignment[];
const projects=[{name:"Supreme assigned project"},{name:"Supreme unallocated project"},{name:"Meridian assigned project"},{name:"Meridian unallocated project"}] as Project[];
const ownership:ConsultantOwnership={officerOwners:{"amina@supreme.ng":"con-001","bello@meridian.ng":"con-002"},assignmentOwners:{"a-supreme":"con-001","a-meridian":"con-002","a-draft":"con-001","a-queued":"con-001"},projectOwners:{"Supreme assigned project":"con-001","Supreme unallocated project":"con-001","Meridian assigned project":"con-002","Meridian unallocated project":"con-002"}};

describe("consultant tenant scope",()=>{
 it("returns only the selected consultant's officers and assignments",()=>{const scope=selectConsultantScope("con-001",officers,assignments,projects,ownership);expect(scope.fieldOfficers.map(x=>x.id)).toEqual(["fo-a"]);expect(scope.ownedAssignments.map(x=>x.id)).toEqual(["a-supreme","a-draft","a-queued"]);expect(scope.visibleAssignments.map(x=>x.id)).toEqual(["a-supreme"])});
 it("shows only explicitly REA-allocated projects that remain unassigned",()=>{const scope=selectConsultantScope("con-001",officers,assignments,projects,ownership);expect(scope.projects.map(x=>x.name)).toEqual(["Supreme assigned project","Supreme unallocated project"]);expect(scope.unallocatedProjects.map(x=>x.name)).toEqual(["Supreme unallocated project"])});
 it("does not leak an unowned assignment when officer names are duplicated",()=>{const duplicate=[...officers,{...officers[1],id:"fo-c",name:"Amina Yusuf",email:"amina@meridian.ng"}];const legacy={...assignments[0],id:"legacy-unowned"} as InspectionAssignment;const owners={...ownership,officerOwners:{...ownership.officerOwners,"amina@meridian.ng":"con-002"}};expect(assignmentBelongsToConsultant(legacy,"con-001",duplicate,owners)).toBe(false)});
 it("honours assignment ownership even when the named officer belongs elsewhere",()=>{const mismatch={...assignments[0],id:"explicit-meridian"} as InspectionAssignment;const owners={...ownership,assignmentOwners:{...ownership.assignmentOwners,"explicit-meridian":"con-002"}};expect(assignmentBelongsToConsultant(mismatch,"con-001",officers,owners)).toBe(false);expect(assignmentBelongsToConsultant(mismatch,"con-002",officers,owners)).toBe(true)});
 it("changes scope immediately when the active consultant changes",()=>{const scope=selectConsultantScope("con-002",officers,assignments,projects,ownership);expect(scope.fieldOfficers.map(x=>x.id)).toEqual(["fo-b"]);expect(scope.visibleAssignments.map(x=>x.id)).toEqual(["a-meridian"]);expect(scope.unallocatedProjects.map(x=>x.name)).toEqual(["Meridian unallocated project"])});
 it("uses signed-in email over a stale consultant id",()=>{const consultants=[{id:"con-001",adminEmail:"supreme@example.ng"},{id:"con-002",adminEmail:"meridian@example.ng"}] as ConsultantRecord[];expect(resolveSessionConsultant("meridian@example.ng","con-001",consultants)?.id).toBe("con-002")});
});
