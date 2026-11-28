import {compare, DEFAULTS, QUESTIONS} from './analysis.mjs';

export function readStoryOptions(search='') {
  const p=new URLSearchParams(search);
  const number=(key,fallback,max)=>p.has(key)&&p.get(key).trim()!==''&&Number.isFinite(Number(p.get(key)))&&Number(p.get(key))>=0&&Number(p.get(key))<=max?Number(p.get(key)):fallback;
  return {basis:p.get('basis')==='api'?'api':'notebook', spending:number('storySpending',4,12), noSchool:number('storySchooling',10,80), sort:['noSchool','spending','adult','name'].includes(p.get('storySort'))?p.get('storySort'):'noSchool'};
}

/** Notebook correlations are saved full-sample outputs, never recomputed from ranked subsets. */
export function notebookResult(notebook, question, {spending=4,noSchool=10}={}) {
  if(!QUESTIONS[question])throw new Error('Unknown notebook question');
  const rows=notebook.tables[question].map((r,i)=>({id:r.country_code,name:r.country_name,x:Number(r.avg_GDP_spend),
    y:Number(question==='noSchool'?r.avg_15_plus_no_education_percent:r.avg_literacy_rate),
    adult:question==='noSchool'?Number(r.avg_literacy_rate):null,years:null,n:null,rank:i+1,
    qualifies:question!=='noSchool'||(Number(r.avg_GDP_spend)>spending&&Number(r.avg_15_plus_no_education_percent)>noSchool)}));
  const corr=notebook.tables[`${question}Correlation`]?.[0];
  return {rows,featured:rows.filter(r=>r.qualifies),r:corr?Number(corr.pearson_r):null,correlationN:corr?Number(corr.countries_compared):null,basis:'notebook',spending,noSchool};
}

export function storyResult(data,notebook,question,options) {
  if(options.basis==='notebook')return notebookResult(notebook,question,options);
  const result=compare(data,{...DEFAULTS,question,spending:options.spending,noSchool:options.noSchool});
  return {...result,correlationN:result.rows.length,basis:'api',spending:options.spending,noSchool:options.noSchool};
}

export function matrixRows(result,{sort='noSchool',search='',onlyMatches=true}={}) {
  const q=search.trim().toLowerCase();
  const rows=result.rows.filter(r=>(!onlyMatches||r.qualifies)&&`${r.name} ${r.id}`.toLowerCase().includes(q));
  return [...rows].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):
    (sort==='spending'?b.x-a.x:sort==='adult'?(b.adult??-Infinity)-(a.adult??-Infinity):b.y-a.y)||a.name.localeCompare(b.name));
}

export function savedRowsCSV(columns,rows) {
  const quote=value=>`"${String(value??'').replaceAll('"','""')}"`;
  return [columns,...rows].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
