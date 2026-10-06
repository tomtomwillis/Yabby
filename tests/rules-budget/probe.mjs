// Finds how many lineup acts an event create can carry before the rules run
// out of their 1,000-expression budget. RULES picks the rules file.
import fs from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');
const rules = fs.readFileSync(process.env.RULES || 'firestore.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-yabby-budget', firestore: { rules } });
await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), 'users/alice'), { username: 'alice' });
});
const db = env.authenticatedContext('alice').firestore();

const event = (full, acts, links) => ({
  title: 't'.repeat(120), date: '2026-10-03', category: 'other',
  ...(full ? {
    time: '22:00', endTime: '04:00', timeZone: 'America/Argentina/Buenos_Aires', description: 'd'.repeat(2000),
    comment: 'c'.repeat(500), location: 'l'.repeat(200), city: 'São Paulo', cost: '£'.repeat(60), hosted: true,
    imageId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  } : {}),
  lineup: Array.from({ length: acts }, (_, i) => ({ name: 'n'.repeat(100), artistId: `ar_${i}`.padEnd(64, 'x') })),
  urls: Array.from({ length: links }, (_, i) => `https://example.com/${i}`.padEnd(500, 'x')),
  userId: 'alice', username: 'alice', createdAt: serverTimestamp(),
});

let n = 0;
async function verdict(full, acts, links) {
  try { await setDoc(doc(db, `events/p${n++}`), event(full, acts, links)); return 'ok'; }
  catch (e) { return /maximum of 1000/.test(e.message) ? 'budget' : 'denied'; }
}

const maxActs = process.env.MAX_ACTS ? Number(process.env.MAX_ACTS) : 60;
for (const full of [true, false]) {
  for (const links of [0, 5]) {
    let best = -1;
    let stop = '';
    for (let acts = 0; acts <= maxActs; acts++) {
      const v = await verdict(full, acts, links);
      if (v !== 'ok') { stop = v; break; }
      best = acts;
    }
    console.log(`${full ? 'full   ' : 'minimal'} links=${links} max acts=${best}${stop ? ` (then ${stop})` : ''}`);
  }
}
await env.cleanup();
