import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-dynamic-token-budget-r1";');

const detector = `function isManagementAnalysisQuestion(question) {
  return /\\b(analy[sz]e|analysis|management|risk|pressure|issue|implication|recommend|action|attention|why|what does|interpret|priority|prioritise|prioritize|concern|bottleneck|trend|performance|review next)\\b/i.test(String(question || ""));
}`;

const replacement = `${detector}

function responseTokenBudget(question) {
  return isManagementAnalysisQuestion(question) ? 2500 : 1600;
}`;

if (!s.includes('function responseTokenBudget(question)')) {
  if (!s.includes(detector)) throw new Error('management analysis detector not found');
  s = s.replace(detector, replacement);
}

if (!s.includes('const outputTokenBudget = responseTokenBudget(question);')) {
  const anchor = '  let answer = "";\n';
  if (!s.includes(anchor)) throw new Error('answer initialization anchor not found');
  s = s.replace(anchor, `${anchor}  const outputTokenBudget = responseTokenBudget(question);\n`);
}

s = s.replace(/max_tokens:\s*1600,/g, 'max_tokens: outputTokenBudget,');
s = s.replace(/generationConfig:\s*\{\s*maxOutputTokens:\s*1600\s*\},/g, 'generationConfig: { maxOutputTokens: outputTokenBudget },');

// Planner calls must remain small and deterministic.
s = s.replace(/max_tokens:\s*outputTokenBudget,\n\s*temperature:\s*0,/g, 'max_tokens: 700,\n          temperature: 0,');
s = s.replace(/generationConfig:\s*\{\s*maxOutputTokens:\s*outputTokenBudget\s*\},\n\s*\}\),\n\s*signal:\s*AbortSignal\.timeout\(12000\)/g, 'generationConfig: { maxOutputTokens: 700 },\n          }),\n          signal: AbortSignal.timeout(12000)');

fs.writeFileSync(workerPath, s);
console.log('Applied dynamic Veritas response token budgets: 2500 management, 1600 simple');
