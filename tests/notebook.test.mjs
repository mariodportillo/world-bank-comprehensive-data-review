import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notebookResult,storyResult,matrixRows,readStoryOptions,savedRowsCSV} from '../web/notebook-model.mjs';
const read=name=>JSON.parse(readFileSync(new URL(`../web/data/${name}.json`,import.meta.url)));
const notebook=read('notebook-findings'),data=read('research'),archive=read('notebook-archive');
test('the original story preserves all five youth leaders, exact averages and full-query correlation',()=>{
 const r=notebookResult(notebook,'youth');
 assert.deepEqual(r.rows.map(r=>r.id),['UZB','KOR','AZE','UKR','BRB']);
 assert.deepEqual(r.rows.map(r=>[r.x,r.y]),[[5.95,99.98],[3.47,99.95],[3.09,99.94],[5.63,99.89],[5.36,99.87]]);
 assert.equal(r.r,.3079);assert.equal(r.correlationN,192);assert.equal(r.rows[0].years,null);assert.equal(r.rows[0].n,null);
 assert.equal(r.rows.reduce((s,r)=>s+r.x,0)/5,4.7);
});
test('the adult story preserves Somalia and the complete bottom ten rather than substituting API rankings',()=>{
 const r=notebookResult(notebook,'adult');
 assert.equal(r.rows.length,10);assert.deepEqual([r.rows[0].id,r.rows[0].x,r.rows[0].y],['SOM',1.23,5.4]);assert.equal(r.r,.3005);assert.equal(r.correlationN,194);
 assert.ok(Math.abs(r.rows.reduce((s,r)=>s+r.x,0)/10-2.369)<1e-12);
});
test('the complete third finding is 35 countries, including its adult literacy context',()=>{
 const r=notebookResult(notebook,'noSchool');
 assert.equal(r.rows.length,35);assert.equal(r.featured.length,35);
 assert.deepEqual([r.rows[0].id,r.rows[0].x,r.rows[0].y,r.rows[0].adult],['YEM',8.01,82.22,45.59]);
 assert.equal(r.rows.at(-1).id,'MNG');assert.equal(r.r,null);assert.equal(r.correlationN,null);
});
test('threshold experiments filter only saved matches, use strict comparisons, and leave the source untouched',()=>{
 const before=JSON.stringify(notebook),all=notebookResult(notebook,'noSchool',{spending:0,noSchool:0});
 assert.equal(all.rows.length,35);assert.equal(all.featured.length,35);
 const cut=notebookResult(notebook,'noSchool',{spending:8.01,noSchool:10});assert.ok(!cut.featured.some(r=>r.id==='YEM'));
 assert.ok(cut.featured.every(r=>r.x>8.01&&r.y>10));assert.equal(JSON.stringify(notebook),before);
});
test('matrix search, sorting and match filtering preserve country identities and missing adult context',()=>{
 const r=notebookResult(notebook,'noSchool',{spending:8,noSchool:10});
 assert.equal(matrixRows(r,{search:'Mexico',onlyMatches:false})[0].id,'MEX');assert.equal(matrixRows(r,{search:'Mexico'}).length,0);
 const sorted=matrixRows(r,{sort:'spending',onlyMatches:false});assert.equal(sorted[0].id,'ZWE');
 const source={rows:[{id:'A',name:'A',x:0,y:0,adult:null,qualifies:true},{id:'B',name:'B',x:1,y:1,adult:0,qualifies:true}]};
 assert.equal(matrixRows(source,{sort:'adult'})[0].id,'B');
});
test('switching source changes the method and sample, retaining notebook results independently',()=>{
 const n=storyResult(data,notebook,'noSchool',{basis:'notebook',spending:4,noSchool:10});
 const a=storyResult(data,notebook,'noSchool',{basis:'api',spending:4,noSchool:10});
 assert.equal(n.basis,'notebook');assert.equal(a.basis,'api');assert.equal(n.featured.length,35);assert.ok(a.rows.length>35);assert.ok(a.rows.every(r=>r.years.every(y=>y>=2000&&y<=2010)));
 assert.equal(notebookResult(notebook,'noSchool').featured.length,35);
});
test('story bookmarks default to the notebook and validate numeric cutoffs',()=>{
 assert.deepEqual(readStoryOptions(''),{basis:'notebook',spending:4,noSchool:10,sort:'noSchool'});
 assert.deepEqual(readStoryOptions('?basis=api&storySpending=0&storySchooling=80&storySort=spending'),{basis:'api',spending:0,noSchool:80,sort:'spending'});
 assert.deepEqual(readStoryOptions('?basis=other&storySpending=NaN&storySchooling=-1&storySort=bad'),{basis:'notebook',spending:4,noSchool:10,sort:'noSchool'});
});
test('all 26 saved tables are archived, including zero-row audits and both mortality ranking outputs',()=>{
 assert.equal(archive.outputs.length,26);assert.equal(archive.outputs.reduce((n,t)=>n+t.rows.length,0),884);
 assert.deepEqual(archive.outputs.filter(t=>t.cell===51).map(t=>t.columns.at(-1)),['RANK','ROW_NUMBER']);
 assert.ok(archive.outputs.find(t=>t.id==='cell-51-0').sql.includes('RANK()'));assert.ok(archive.outputs.find(t=>t.id==='cell-51-1').sql.includes('ROW_NUMBER()'));
 assert.equal(archive.outputs.find(t=>t.cell===20).rows.length,0);assert.equal(archive.outputs.find(t=>t.cell===22).rows.length,0);
 const main=archive.outputs.find(t=>t.cell===71),example=archive.outputs.find(t=>t.cell===79);
 assert.equal(main.rows.length,35);assert.equal(example.rows.length,10);
 for(const [q,cell] of [['youth',59],['adult',65],['noSchool',71],['youthCorrelation',61],['adultCorrelation',67]]){
   const original=archive.outputs.find(t=>t.cell===cell);
   assert.deepEqual(original.rows.map(row=>Object.fromEntries(original.columns.map((c,i)=>[c,row[i]]))),notebook.tables[q]);
 }
 for(const t of archive.outputs){assert.ok(t.sql.includes('bigquery-public-data.'));assert.ok(t.rows.every(r=>r.length===t.columns.length));}
});
test('original-table CSV keeps saved decimal precision, country names and all 35 source rows',()=>{
 const t=archive.outputs.find(t=>t.cell===71),csv=savedRowsCSV(t.columns,t.rows);
 assert.equal(csv.split('\r\n').length,37);assert.ok(csv.includes('"Yemen, Rep.","YEM","82.22","8.01","45.59"'));
 assert.equal(savedRowsCSV(['x'],[['Country, "Example"']]),'"x"\r\n"Country, ""Example"""\r\n');
});
