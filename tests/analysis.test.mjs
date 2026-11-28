import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compare,DEFAULTS,indexMetric,pearson,readState,analyticalCSV} from '../web/analysis.mjs';
const countries=[{id:'AAA',name:'Alpha, "Example"',regionId:'R1',region:'Region 1'},{id:'BBB',name:'Beta',regionId:'R1',region:'Region 1'},{id:'CCC',name:'Gamma',regionId:'R2',region:'Region 2'}];
const metric=(code,rows,sourceId='2')=>({code,sourceId,rows});
function fixture(){return {countries,retrievedAt:'2026-11-28T00:00:00Z',metrics:{
  spending:metric('SPEND',[['AAA',2000,0],['AAA',2001,4],['AAA',2002,20],['BBB',2000,5],['CCC',2000,6]]),
  youth:metric('YOUTH',[['AAA',2000,40],['AAA',2001,60],['AAA',2003,100],['BBB',2000,80],['CCC',2000,90]]),
  adult:metric('ADULT',[['AAA',2001,55],['BBB',2000,70]]),
  noSchool:metric('NOED',[['AAA',2001,10],['BBB',2000,11],['CCC',2000,20]],'12')
}};}

test('averages only same-country same-year pairs, retaining valid zero',()=>{
 const r=compare(fixture(),{...DEFAULTS,start:2000,end:2003});
 const a=r.rows.find(r=>r.id==='AAA');
 assert.equal(a.x,2);assert.equal(a.y,50);assert.deepEqual(a.years,[2000,2001]);assert.equal(a.n,2);
 assert.equal(r.featured[0].id,'CCC');
});
test('common-year mode excludes unmatched dates and ignores multiyear minimum',()=>{
 const r=compare(fixture(),{...DEFAULTS,mode:'year',year:2001,minYears:30});
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].x,4);assert.equal(r.rows[0].y,60);assert.deepEqual(r.rows[0].years,[2001]);
});
test('missing is not zero, duplicate country/year is rejected, sources stay separate',()=>{
 const d=fixture();d.metrics.youth.rows.push(['BBB',2001,null],['CCC',2001,NaN]);
 assert.equal(indexMetric(d.metrics.youth).get('BBB').size,1);
 assert.equal(indexMetric(d.metrics.spending).get('AAA').get(2001),4);
 assert.equal(indexMetric(d.metrics.noSchool).get('AAA').get(2001),10);
 assert.throws(()=>indexMetric(metric('X',[['AAA',2000,2],['AAA',2000,3]])),/Duplicate/);
});
test('thresholds are strict, optional adult context does not exclude a country',()=>{
 const d=fixture(),r=compare(d,{...DEFAULTS,question:'noSchool',start:2000,end:2003,spending:4,noSchool:10});
 assert.deepEqual(r.featured.map(r=>r.id),['CCC','BBB']);
 assert.equal(r.rows.find(r=>r.id==='AAA').qualifies,false);
 const c=r.rows.find(r=>r.id==='CCC');assert.equal(c.adult,null);assert.deepEqual(c.adultYears,[]);
 d.metrics.spending.rows.find(r=>r[0]==='BBB')[2]=4;
 assert.deepEqual(compare(d,{...DEFAULTS,question:'noSchool',start:2000,end:2003}).featured.map(r=>r.id),['CCC']);
});
test('adult context uses only the selected pair years, even if other adult dates exist',()=>{
 const d=fixture();d.metrics.adult.rows.push(['AAA',2002,99]);
 const r=compare(d,{...DEFAULTS,question:'noSchool',start:2000,end:2003});
 assert.equal(r.rows.find(r=>r.id==='AAA').adult,55);assert.deepEqual(r.rows.find(r=>r.id==='AAA').adultYears,[2001]);
});
test('region and minimum years affect both comparison and coverage',()=>{
 const r=compare(fixture(),{...DEFAULTS,start:2000,end:2003,minYears:2,region:'R1'});
 assert.deepEqual(r.rows.map(r=>r.id),['AAA']);
 assert.deepEqual(r.coverage,{total:2,withSpending:2,withOutcome:2,withAnyPair:2,eligible:1,excluded:1});
});
test('Pearson needs three varied observations and is unaffected by ranking limits',()=>{
 assert.equal(pearson([{x:1,y:1},{x:2,y:2}]),null);
 assert.equal(pearson([{x:1,y:1},{x:1,y:2},{x:1,y:3}]),null);
 assert.equal(pearson([{x:1,y:3},{x:2,y:2},{x:3,y:1}]),-1);
 const d=fixture(),r=compare(d,{...DEFAULTS,start:2000,end:2003});assert.equal(r.r,pearson(r.rows));
});
test('CSV includes exact paired dates, source IDs, method, thresholds and escaped names',()=>{
 const d=fixture(),s={...DEFAULTS,start:2000,end:2003,question:'noSchool'},r=compare(d,s),csv=analyticalCSV(r,s,d);
 assert.ok(csv.includes('"Alpha, ""Example"""'));assert.ok(csv.includes('"adult_context_years"'));assert.ok(csv.includes('"2","12"'));assert.ok(csv.includes('"2026-11-28T00:00:00Z"'));assert.ok(csv.includes('outcome_source_updated'));
 assert.ok(csv.includes('"mean over paired country-years"'));assert.equal(csv.split('\r\n').length,5);
});
test('bookmark state rejects unknown values and preserves explicit thresholds of zero',()=>{
 const s=readState('#question=noSchool&mode=bad&start=2024&end=2000&minYears=1.5&spending=0&noSchool=0&country=BBB&region=R1',fixture());
 assert.equal(s.question,'noSchool');assert.equal(s.mode,'paired');assert.equal(s.start,2000);assert.equal(s.end,2024);assert.equal(s.minYears,1);assert.equal(s.spending,0);assert.equal(s.noSchool,0);assert.equal(s.country,'BBB');
});
test('saved research extract is complete for all four notebook measures and excludes aggregates',()=>{
 const d=JSON.parse(readFileSync(new URL('../web/data/research.json',import.meta.url)));
 const ids=new Set(d.countries.map(c=>c.id));assert.equal(ids.size,d.countries.length);assert.ok(!ids.has('WLD'));
 for(const m of Object.values(d.metrics)){assert.ok(m.definition.length>20);assert.ok(m.rows.length>500);assert.equal(indexMetric(m).size>0,true);for(const [id,year,value] of m.rows){assert.ok(ids.has(id));assert.ok(year>=1990&&year<=2025);assert.ok(Number.isFinite(value));}}
 assert.equal(d.metrics.noSchool.sourceId,'12');assert.equal(d.metrics.noSchool.lastYear,2010);
 const n=JSON.parse(readFileSync(new URL('../web/data/notebook-findings.json',import.meta.url)));
 assert.equal(n.tables.youth.length,5);assert.equal(n.tables.adult.length,10);assert.equal(n.tables.noSchool.length,35);
 assert.equal(n.tables.youthCorrelation[0].pearson_r,'0.3079');assert.equal(n.tables.adultCorrelation[0].pearson_r,'0.3005');
});
