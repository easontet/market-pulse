import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync('local/word-cloud.js','utf8');
const pure=code.slice(0,code.indexOf('let activeHot='))+code.slice(code.indexOf('function packCloudWords('),code.indexOf('function drawPackedCloud('));
const ctx=vm.createContext({Intl,Date,Map,Set,RegExp});vm.runInContext(pure,ctx);
ctx.items=[{title:'台積電 TSMC 台積電',source:'a',date:Date.now()-90*86400000},{title:'台積電',source:'a',date:null},{title:'營收 AI AI',description:'台積電 TSMC',source:'a',date:Date.now()},{title:'台積電',source:'b',date:Date.now()}];
ctx.selected=new Set(['a']);let r=vm.runInContext('calculateAllKeywords(items,selected)',ctx);
assert.equal(r.sample,3);assert.equal(r.allKeywords.find(x=>x.text==='台積電').count,3);assert.equal(r.allKeywords.find(x=>x.text==='AI').count,1);
r=vm.runInContext("allCompanyCooccurrences(items,'營收',selected)",ctx);assert.equal(r[0].text,'台積電');assert.equal(r[0].count,1);
ctx.rows=Array.from({length:55},(_,i)=>({text:'熱詞'+i,score:55-i}));
r=vm.runInContext('packCloudWords(rows,400,410,(text,size)=>text.length*size*.8)',ctx);
assert.ok(r.length>=45);
for(let i=0;i<r.length;i++){const b=r[i].box;assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=400&&b.y+b.h<=410);for(let j=0;j<i;j++){const a=r[j].box;assert.ok(!(b.x<a.x+a.w&&b.x+b.w>a.x&&b.y<a.y+a.h&&b.y+b.h>a.y),'Overlap');}}
console.log('Passed: no time cutoff, undated articles included, source filter, unique mentions, all-news cooccurrence, cloud bounds and non-overlapping placement.');
