const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const dbDir = path.join(__dirname, 'database');
fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'expenses.db'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'database_schema.sql'), 'utf8'));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const currencies = new Set(['INR','USD','EUR','GBP','AED','SGD','AUD','CAD','JPY','LKR','MYR']);
const clean = v => String(v ?? '').trim();
function bad(res, message, status=400) { return res.status(status).json({ error: message }); }
function validateShares(amountMinor, shares, participantIds) {
  if (!Array.isArray(shares) || shares.length === 0) throw new Error('Select at least one participant.');
  const seen = new Set();
  let total = 0;
  for (const s of shares) {
    const id = Number(s.participantId);
    const amount = Number(s.amountMinor);
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Share amounts must be non-negative valid minor units.');
    if (seen.has(id)) throw new Error('A participant can appear only once in an expense split.');
    if (!participantIds.has(id)) throw new Error('A selected participant does not exist.');
    seen.add(id); total += amount;
  }
  if (total !== amountMinor) throw new Error('Individual shares must add up exactly to the expense amount.');
}
function expenseById(id) {
  const e = db.prepare(`SELECT e.*, p.name AS payer_name FROM expenses e JOIN participants p ON p.id=e.payer_id WHERE e.id=?`).get(id);
  if (!e) return null;
  e.shares = db.prepare(`SELECT s.participant_id AS participantId, p.name, s.amount_minor AS amountMinor FROM expense_shares s JOIN participants p ON p.id=s.participant_id WHERE s.expense_id=? ORDER BY p.name`).all(id);
  return e;
}
function listExpenses() {
  return db.prepare(`SELECT id FROM expenses ORDER BY expense_date DESC, id DESC`).all().map(x=>expenseById(x.id));
}
app.get('/api/participants', (req,res) => {
  res.json(db.prepare('SELECT id,name,created_at AS createdAt FROM participants ORDER BY name').all());
});
app.post('/api/participants', (req,res) => {
  const name=clean(req.body.name);
  if (!name || name.length>70) return bad(res,'Enter a participant name (1–70 characters).');
  try {
    const info=db.prepare('INSERT INTO participants(name) VALUES(?)').run(name);
    res.status(201).json(db.prepare('SELECT id,name,created_at AS createdAt FROM participants WHERE id=?').get(info.lastInsertRowid));
  } catch(e) { if(String(e.message).includes('UNIQUE')) return bad(res,'That participant already exists.'); throw e; }
});
app.delete('/api/participants/:id', (req,res) => {
  const id=Number(req.params.id);
  const used=db.prepare('SELECT 1 FROM expenses WHERE payer_id=? UNION SELECT 1 FROM expense_shares WHERE participant_id=? LIMIT 1').get(id,id);
  if(used) return bad(res,'This participant is used by an expense. Delete or edit those expenses first.',409);
  const info=db.prepare('DELETE FROM participants WHERE id=?').run(id);
  if(!info.changes) return bad(res,'Participant not found.',404);
  res.json({ok:true});
});
app.get('/api/expenses', (req,res) => res.json(listExpenses()));
function saveExpense(req,res,id=null) {
  const body=req.body||{}, description=clean(body.description), currency=clean(body.currency).toUpperCase();
  const category=clean(body.category), date=clean(body.date), payerId=Number(body.payerId), amountMinor=Number(body.amountMinor);
  if(!description||description.length>140) return bad(res,'Description is required (max 140 characters).');
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0) return bad(res,'Amount must be a positive integer number of minor units.');
  if(!currency||currency.length>8) return bad(res,'Currency is required (max 8 characters).');
  if(!category||category.length>60) return bad(res,'Category is required (max 60 characters).');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))) return bad(res,'Enter a valid expense date.');
  const people=new Set(db.prepare('SELECT id FROM participants').all().map(p=>p.id));
  if(!people.has(payerId)) return bad(res,'Choose a valid payer.');
  try { validateShares(amountMinor,body.shares,people); } catch(e) { return bad(res,e.message); }
  const tx=db.transaction(()=>{
    let expenseId=id;
    if(id===null) {
      const info=db.prepare('INSERT INTO expenses(description,amount_minor,currency,payer_id,category,expense_date) VALUES(?,?,?,?,?,?)').run(description,amountMinor,currency,payerId,category,date);
      expenseId=Number(info.lastInsertRowid);
    } else {
      if(!db.prepare('SELECT 1 FROM expenses WHERE id=?').get(id)) throw Object.assign(new Error('Expense not found.'),{status:404});
      db.prepare('UPDATE expenses SET description=?,amount_minor=?,currency=?,payer_id=?,category=?,expense_date=? WHERE id=?').run(description,amountMinor,currency,payerId,category,date,id);
      db.prepare('DELETE FROM expense_shares WHERE expense_id=?').run(id);
    }
    const ins=db.prepare('INSERT INTO expense_shares(expense_id,participant_id,amount_minor) VALUES(?,?,?)');
    for(const s of body.shares) ins.run(expenseId,Number(s.participantId),Number(s.amountMinor));
    return expenseById(expenseId);
  });
  try { const saved=tx();res.status(id===null?201:200).json(saved); }
  catch(e) { if(e.status) return bad(res,e.message,e.status); throw e; }
}
app.post('/api/expenses',(req,res)=>saveExpense(req,res));
app.put('/api/expenses/:id',(req,res)=>saveExpense(req,res,Number(req.params.id)));
app.delete('/api/expenses/:id',(req,res)=>{
  const info=db.prepare('DELETE FROM expenses WHERE id=?').run(Number(req.params.id));
  if(!info.changes) return bad(res,'Expense not found.',404);
  res.json({ok:true});
});
function summaryData() {
  const expenses=listExpenses(), participants=db.prepare('SELECT id,name FROM participants ORDER BY name').all();
  const map=new Map(participants.map(p=>[p.id,{participantId:p.id,name:p.name,balances:{}}]));
  const totals={};
  for(const e of expenses) {
    totals[e.currency]=(totals[e.currency]||0)+e.amount_minor;
    const payer=map.get(e.payer_id); payer.balances[e.currency]=(payer.balances[e.currency]||0)+e.amount_minor;
    for(const s of e.shares) { const p=map.get(s.participantId); p.balances[e.currency]=(p.balances[e.currency]||0)-s.amountMinor; }
  }
  const settlements=[];
  for(const currency of Object.keys(totals)) {
    const debtors=[],creditors=[];
    for(const p of map.values()) { const n=p.balances[currency]||0; if(n<0)debtors.push({name:p.name,amountMinor:-n});else if(n>0)creditors.push({name:p.name,amountMinor:n}); }
    debtors.sort((a,b)=>b.amountMinor-a.amountMinor);creditors.sort((a,b)=>b.amountMinor-a.amountMinor);
    let i=0,j=0;
    while(i<debtors.length&&j<creditors.length) { const n=Math.min(debtors[i].amountMinor,creditors[j].amountMinor);settlements.push({currency,from:debtors[i].name,to:creditors[j].name,amountMinor:n});debtors[i].amountMinor-=n;creditors[j].amountMinor-=n;if(!debtors[i].amountMinor)i++;if(!creditors[j].amountMinor)j++; }
  }
  return {participants:[...map.values()],totals,settlements};
}
app.get('/api/summary',(req,res)=>res.json(summaryData()));
app.post('/api/export',(req,res)=>{
  const allowed=new Set(['description','amount','currency','payer','participants','shares','category','date','settlements','balances']);
  const selected=Array.isArray(req.body.fields)?req.body.fields.filter(x=>allowed.has(x)):[];
  if(!selected.length) return bad(res,'Select at least one valid export field.');
  const scope=req.body.scope==='settlements'?'settlements':'all',sum=summaryData();
  let records;
  if(scope==='settlements') records=sum.settlements.map(s=>{const o={};if(selected.includes('settlements'))o.settlement=`${s.from} pays ${s.to}`;if(selected.includes('amount'))o.amount=s.amountMinor/100;if(selected.includes('currency'))o.currency=s.currency;return o;});
  else records=listExpenses().map(e=>{
    const o={};
    if(selected.includes('description'))o.description=e.description;
    if(selected.includes('amount'))o.amount=e.amount_minor/100;
    if(selected.includes('currency'))o.currency=e.currency;
    if(selected.includes('payer'))o.payer=e.payer_name;
    if(selected.includes('participants'))o.participants=e.shares.map(s=>s.name).join('; ');
    if(selected.includes('shares'))o.shares=e.shares.map(s=>({participant:s.name,amount:s.amountMinor/100,currency:e.currency}));
    if(selected.includes('category'))o.category=e.category;
    if(selected.includes('date'))o.date=e.expense_date;
    if(selected.includes('settlements'))o.suggestedSettlements=sum.settlements.filter(s=>s.currency===e.currency).map(s=>({from:s.from,to:s.to,amount:s.amountMinor/100,currency:s.currency}));
    if(selected.includes('balances'))o.balances=sum.participants.map(p=>({participant:p.name,balance:(p.balances[e.currency]||0)/100,currency:e.currency}));
    return o;
  });
  res.json({fields:selected,records});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Group Expense Splitter running at http://localhost:${PORT}`));
