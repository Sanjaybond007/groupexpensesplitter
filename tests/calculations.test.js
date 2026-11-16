const test = require('node:test');
const assert = require('node:assert/strict');

function settle(balances) {
  const debtors=balances.filter(x=>x.balance<0).map(x=>({name:x.name,n:-x.balance})).sort((a,b)=>b.n-a.n);
  const creditors=balances.filter(x=>x.balance>0).map(x=>({name:x.name,n:x.balance})).sort((a,b)=>b.n-a.n);
  const out=[];let i=0,j=0;
  while(i<debtors.length&&j<creditors.length){const amount=Math.min(debtors[i].n,creditors[j].n);out.push({from:debtors[i].name,to:creditors[j].name,amount});debtors[i].n-=amount;creditors[j].n-=amount;if(!debtors[i].n)i++;if(!creditors[j].n)j++}
  return out;
}
test('settlements conserve total net balance',()=>{
 const balances=[{name:'Asha',balance:6000},{name:'Bala',balance:-1500},{name:'Charan',balance:-4500}];
 const result=settle(balances);
 assert.equal(result.reduce((s,x)=>s+x.amount,0),6000);
 assert.deepEqual(result,[{from:'Charan',to:'Asha',amount:4500},{from:'Bala',to:'Asha',amount:1500}]);
});
test('equal split distributes leftover minor units exactly',()=>{
 const total=1001,n=3,base=Math.floor(total/n),rem=total%n;
 const shares=Array.from({length:n},(_,i)=>base+(i<rem?1:0));
 assert.equal(shares.reduce((a,b)=>a+b,0),total);
});
