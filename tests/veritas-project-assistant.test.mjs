import test from "node:test";
import assert from "node:assert/strict";
import {
  isGenericProjectVerificationRequest,
  isProjectListQuestion,
  runProjectAssistant,
  shouldRunProjectAssistant,
} from "../worker/project-assistant.js";

const PROJECTS = [
  {
    id: "EXT-VIIRS-OGUN-MOKOLOKI-001",
    name: "Mokoloki Mini-Grid (External VIIRS Demo)",
    programme: "Others",
    component: "Mini Grid",
    contractor: "Nayo Tropical Technology",
    consultantFirm: "External Public Demo",
    state: "Ogun",
    lga: "Obafemi-Owode",
    community: "Mokoloki",
    status: "External Demo",
    installedCapacityKw: 100,
    households: 0,
    verified: 0,
    latitude: 6.8864,
    longitude: 3.38401,
    commissionedAt: "2020-02-01",
    dataSource: "external-public-viirs-demo",
  },
  {
    id: "REA-DARES-KANO-001",
    name: "Kura Mini-Grid",
    programme: "DARES",
    component: "Mini Grid",
    contractor: "Example",
    consultantFirm: "Example",
    state: "Kano",
    lga: "Kura",
    community: "Kura Town",
    status: "Active",
    installedCapacityKw: 120,
    households: 300,
    verified: 1,
    latitude: 11.77,
    longitude: 8.42,
    commissionedAt: "2024-04-01",
    dataSource: "production",
  },
  {
    id: "REA-NEP-JIGAWA-001",
    name: "Dutse Grid Extension",
    programme: "NEP",
    component: "Grid Extension",
    contractor: "Example",
    consultantFirm: "Example",
    state: "Jigawa",
    lga: "Dutse",
    community: "Dutse Central",
    status: "Pending Verification",
    installedCapacityKw: 250,
    households: 800,
    verified: 0,
    latitude: 11.7,
    longitude: 9.3,
    commissionedAt: null,
    dataSource: "production",
  },
];

function fakeEnv(rows = PROJECTS) {
  return {
    DB: {
      prepare(sql) {
        return {
          all: async () => ({ results: rows }),
          bind: (...args) => ({
            first: async () => rows.find((row) => row.id === args[0]) || null,
            all: async () => ({ results: rows }),
          }),
        };
      },
    },
  };
}

test("project list intent recognises natural portfolio browsing", () => {
  assert.equal(isProjectListQuestion("list all minigrids"), true);
  assert.equal(isProjectListQuestion("show me all Mini Grids in Ogun"), true);
  assert.equal(isProjectListQuestion("how many minigrids are there"), false);
});

test("verification intent works without satellite wording", () => {
  assert.equal(isGenericProjectVerificationRequest("verify a project"), true);
  assert.equal(isGenericProjectVerificationRequest("verify Mokoloki minigrid"), true);
  assert.equal(isGenericProjectVerificationRequest("please check a mini-grid"), true);
  assert.equal(shouldRunProjectAssistant("verify Mokoloki minigrid"), true);
});

test("list all minigrids returns selectable project records instead of only an aggregate", async () => {
  const result = await runProjectAssistant(fakeEnv(), "list all minigrids");
  assert.equal(result.kind, "list");
  assert.equal(result.choiceMode, "project");
  assert.deepEqual(result.choices.map((item) => item.id).sort(), [
    "EXT-VIIRS-OGUN-MOKOLOKI-001",
    "REA-DARES-KANO-001",
  ]);
  assert.match(result.answer, /2 Mini Grid projects/i);
});

test("generic verify asks the user to choose a mappable project", async () => {
  const result = await runProjectAssistant(fakeEnv(), "verify a project");
  assert.equal(result.kind, "verify-select");
  assert.equal(result.choiceMode, "satellite");
  assert.equal(result.choices.length, 3);
  assert.match(result.answer, /Which project do you want me to verify/i);
});

test("named verification narrows the picker to the named community", async () => {
  const result = await runProjectAssistant(fakeEnv(), "verify Mokoloki minigrid");
  assert.equal(result.kind, "verify-select");
  assert.equal(result.choices.length, 1);
  assert.equal(result.choices[0].id, "EXT-VIIRS-OGUN-MOKOLOKI-001");
});

test("selecting a listed project opens a professional project profile", async () => {
  const result = await runProjectAssistant(
    fakeEnv(),
    "Open the project record for Kura Mini-Grid.",
    { projectId: "REA-DARES-KANO-001" },
  );
  assert.equal(result.kind, "profile");
  assert.match(result.answer, /Kura Mini-Grid/);
  assert.match(result.answer, /Verified/);
  assert.match(result.answer, /satellite imagery check/i);
  assert.match(result.answer, /VIIRS/i);
});
