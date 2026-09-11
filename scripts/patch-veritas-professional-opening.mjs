import fs from 'node:fs';

const workerPath = 'worker/index.js';
let w = fs.readFileSync(workerPath, 'utf8');
w = w.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-professional-opening-r3";');

const workerAnchor = 'Answer naturally, intelligently, and directly. Use reasoning to explain findings, comparisons, implications, risks, and next actions when useful.\n';
const workerBlock = `${workerAnchor}\nOPENING VOICE STANDARD:\n- Start like an experienced REA professional speaking to a colleague, director, or management team. The first sentence should sound assured, informed, and purposeful.\n- Lead with the conclusion or strongest confirmed finding. Do not begin with generic setup such as \"Based on the data\", \"According to the information provided\", \"Here is an analysis\", \"The data shows\", \"It appears\", \"It seems\", \"As an AI\", or similar chatbot language.\n- Use confident declarative language when the evidence is clear. Reserve words such as \"may\", \"could\", and \"warrants review\" for interpretation or uncertainty, not for confirmed facts.\n- Make the opening persuasive through evidence, not exaggeration. Pair the main conclusion with the most relevant figure or contrast when one is available.\n- The opening should feel human and executive-ready, not formulaic. Avoid announcing sections before giving the answer.\n- Never use confidence to overstate causation, policy, authority, or facts that the evidence does not establish.\n`;
if (!w.includes('OPENING VOICE STANDARD:') && w.includes(workerAnchor)) {
  w = w.replace(workerAnchor, workerBlock);
}
fs.writeFileSync(workerPath, w);

const analyticsPath = 'worker/analytics.js';
let a = fs.readFileSync(analyticsPath, 'utf8');
const alreadyApplied = a.includes('professional management readout that sounds like an experienced REA officer');
if (!alreadyApplied) {
  const marker = 'RESPONSE STANDARD:\n';
  const next = '\nEVIDENCE DISCIPLINE:';
  const start = a.indexOf(marker);
  const end = start >= 0 ? a.indexOf(next, start) : -1;
  if (start >= 0 && end > start) {
    const analyticsBlock = `RESPONSE STANDARD:\n1. Start with a one- or two-sentence professional management readout that sounds like an experienced REA officer briefing senior management. Lead with the strongest confirmed conclusion, and include the most useful supporting figure or contrast where available.\n2. The opening must be confident, convincing and human. Do not begin with \"Based on the data\", \"According to the data\", \"Here is the analysis\", \"The data shows\", \"It appears\", \"It seems\", \"As an AI\", or similar generic framing.\n3. Use direct declarative language for confirmed facts. Use cautious language only for interpretations whose cause is not established.\n4. Follow with \"What the data confirms\" and give only the few figures needed to support that readout. Do not dump the full result set unless the user explicitly asks for all rows.\n5. Follow with \"What this may mean\" only when interpretation is useful. Explain the management risk or implication without presenting a possible cause as a fact.\n6. Follow with \"What management should review next\" and give practical checks or actions tied directly to the confirmed finding.\n7. End with a short bottom line only when it adds something new.\n`;
    a = a.slice(0, start) + analyticsBlock + a.slice(end);
  } else {
    console.log('Analytics response standard already changed; leaving it unchanged');
  }
}
fs.writeFileSync(analyticsPath, a);
console.log('Applied professional confident opening style to Veritas');
