// Domain-logic tests. Pure functions only — no DOM, no storage, no deps.
// Run: node test/domain.test.mjs
import { currentPeriodStatus, schedule, payDateAt, toISO, parseDate, upcoming } from '../src/domain/payPeriods.js';
import { reconcile, shiftStatus } from '../src/domain/work.js';
import { reserveStatus } from '../src/domain/tax.js';
import { byMonth, cumulativeNet } from '../src/domain/aggregate.js';

const ref = parseDate('2026-08-25');
let fails = 0;
const ok = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+' '+name+(cond?'':' <- '+extra)); if(!cond) fails++; };

// biweekly anchored 2026-08-07 -> pay dates 8/07, 8/21, 9/04
const bw = { mode:'biweekly', anchorDate:'2026-08-07', intervalDays:14 };
ok('biweekly current', toISO(schedule(bw, ref).current)==='2026-08-21', toISO(schedule(bw,ref).current));
ok('biweekly next', toISO(schedule(bw, ref).next)==='2026-09-04', toISO(schedule(bw,ref).next));

// unpaid on 8/21 -> overdue (4 days ago)
let st = currentPeriodStatus(bw, {}, ref);
ok('overdue state', st.state==='overdue' && st.daysUntil===-4, st.state+' '+st.daysUntil);
// once marked paid, attention moves to 9/04
st = currentPeriodStatus(bw, {'2026-08-21':{amount:500}}, ref);
ok('rolls to next', toISO(st.dueDate)==='2026-09-04' && st.state==='upcoming', toISO(st.dueDate)+' '+st.state);

// monthly clamp: anchor Jan 31 -> Feb 28
const mo = { mode:'monthly', anchorDate:'2026-01-31' };
ok('monthly clamp', toISO(payDateAt(mo,1))==='2026-02-28', toISO(payDateAt(mo,1)));
ok('monthly restores', toISO(payDateAt(mo,2))==='2026-03-31', toISO(payDateAt(mo,2)));
ok('upcoming count', upcoming(bw,4,ref).length===4);

// work reconciliation
const shifts = [
  { date:'2026-08-01', employer:'Handshake', role:'Setup', hours:6, rate:20, expected:120, paidAmount:100, flatAmount:null, attachments:[] }, // short 20
  { date:'2026-07-10', employer:'Handshake', hours:5, rate:20, expected:100, paidAmount:null, flatAmount:null, attachments:[] },              // unpaid 100
  { date:'2026-08-24', employer:'Cafe', hours:4, rate:18, expected:72, paidAmount:null, flatAmount:null, attachments:[] },                    // awaiting
  { date:'2026-06-01', employer:'Cafe', hours:3, rate:20, expected:60, paidAmount:60, flatAmount:null, attachments:[] },                      // paid
];
ok('underpaid', shiftStatus(shifts[0],14,ref)==='underpaid', shiftStatus(shifts[0],14,ref));
ok('unpaid', shiftStatus(shifts[1],14,ref)==='unpaid', shiftStatus(shifts[1],14,ref));
ok('awaiting', shiftStatus(shifts[2],14,ref)==='awaiting', shiftStatus(shifts[2],14,ref));
ok('paid', shiftStatus(shifts[3],14,ref)==='paid', shiftStatus(shifts[3],14,ref));
const r = reconcile(shifts,14,ref);
ok('atRisk = 120', Math.abs(r.atRisk-120)<0.001, r.atRisk);            // 20 short + 100 unpaid
ok('outstanding = 192', Math.abs(r.outstanding-192)<0.001, r.outstanding); // +72 awaiting
ok('totalHours 18', r.totalHours===18, r.totalHours);
ok('received 160', r.totalReceived===160, r.totalReceived);

// tax
const entries=[{date:'2026-08-01',amount:1000,type:'income',category:'Gig'},{date:'2026-08-02',amount:200,type:'expense',category:'Gas'}];
const rs = reserveStatus(entries,0.25,100);
ok('net 800', rs.net===800); ok('owed 200', rs.owed===200); ok('shortfall 100', rs.shortfall===100); ok('pct .5', rs.pct===0.5);
ok('neg net no tax', reserveStatus([{date:'2026-01-01',amount:50,type:'expense',category:'x'}],0.3,0).owed===0);

// aggregate month gap-fill: Jun and Aug present -> Jul filled
const gap=[{date:'2026-06-05',amount:10,type:'income',category:'a'},{date:'2026-08-05',amount:20,type:'income',category:'a'}];
ok('month gap fill', byMonth(gap).length===3, byMonth(gap).map(m=>m.key).join());
ok('cumulative', cumulativeNet(entries).at(-1).net===800, JSON.stringify(cumulativeNet(entries)));

console.log(fails? `\n${fails} FAILING` : '\nAll green');
process.exit(fails?1:0);
