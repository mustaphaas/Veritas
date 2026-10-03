import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const worker = fs.readFileSync("worker/index.js", "utf8");
const assistant = fs.readFileSync("client/components/VeritasAssistant.tsx", "utf8");

test("monthly reports have a dedicated concise structure", () => {
  assert.match(worker, /MONTHLY REPORT STANDARD:/);
  assert.match(worker, /Portfolio Scorecard/);
  assert.match(worker, /Management Actions for Next Month/);
  assert.match(worker, /Do not add separate Portfolio Overview, Performance Analysis, Confirmed Facts, Interpretation or Conclusion sections/);
});

test("monthly reports keep portfolio, workflow and satellite verification separate", () => {
  assert.match(worker, /Portfolio verification =/);
  assert.match(worker, /Inspection workflow =/);
  assert.match(worker, /Satellite verification =/);
  assert.match(worker, /Never add satellite verification actions to portfolio Verified counts/);
});

test("monthly reports avoid unsupported consultant and contractor conclusions", () => {
  assert.match(worker, /Treat "REA Unallocated".*allocation\/status bucket/s);
  assert.match(worker, /not "market consolidation"/);
  assert.match(worker, /do not assume redistribution is feasible or authorised/i);
});

test("monthly reports avoid causal claims not present in live data", () => {
  assert.match(worker, /Do not infer capacity constraints, delayed submissions, staffing shortages/);
  assert.match(worker, /If the cause is not recorded, state that it is not established/);
});

test("monthly report quick action requests the refined executive format", () => {
  assert.match(assistant, /Keep portfolio verification, inspection workflow and satellite checks separate/);
  assert.match(assistant, /no more than five evidence-led management actions/);
});
