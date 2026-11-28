/** Pure analysis: pair by country AND year before averaging. No imputed observations. */
export const QUESTIONS = {
  youth: {metric: 'youth', number: '01', title: 'Where is youth literacy highest?', short: 'Youth literacy', limit: 5, direction: -1},
  adult: {metric: 'adult', number: '02', title: 'Where is adult literacy lowest?', short: 'Adult literacy', limit: 10, direction: 1},
  noSchool: {metric: 'noSchool', number: '03', title: 'Where do spending and unmet need coexist?', short: 'No schooling', limit: Infinity, direction: -1}
};
export const DEFAULTS = {question:'youth', mode:'paired', start:2000, end:2025, year:2010, minYears:1, region:'all', spending:4, noSchool:10, country:'MEX'};

export function readState(hash, data) {
  const p = new URLSearchParams(hash.replace(/^[#?]/, ''));
  const state = {...DEFAULTS};
  if (QUESTIONS[p.get('question')]) state.question = p.get('question');
  if (['paired','year'].includes(p.get('mode'))) state.mode=p.get('mode');
  const bounds = {start:[1990,2025],end:[1990,2025],year:[1990,2025],minYears:[1,36],spending:[0,30],noSchool:[0,100]};
  for (const [key,[min,max]] of Object.entries(bounds)) {
    if (!p.has(key)) continue;
    const n=Number(p.get(key));
    if (Number.isFinite(n) && n>=min && n<=max && (['spending','noSchool'].includes(key) || Number.isInteger(n))) state[key]=n;
  }
  if(state.start>state.end) [state.start,state.end]=[state.end,state.start];
  if(data.countries.some(c=>c.regionId===p.get('region'))) state.region=p.get('region');
  if(data.countries.some(c=>c.id===p.get('country'))) state.country=p.get('country');
  return state;
}

export function indexMetric(metric) {
  const index=new Map();
  for(const [country,year,value] of metric.rows) {
    if(!Number.isInteger(year) || typeof value!=='number' || !Number.isFinite(value)) continue;
    if(!index.has(country)) index.set(country,new Map());
    const years=index.get(country);
    if(years.has(year)) throw new Error(`Duplicate observation for ${metric.code}: ${country}, ${year}`);
    years.set(year,value);
  }
  return index;
}
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
export function compare(data,state) {
  const question=QUESTIONS[state.question];
  if(!question) throw new Error('Unknown research question');
  const x=indexMetric(data.metrics.spending), y=indexMetric(data.metrics[question.metric]);
  const adult=indexMetric(data.metrics.adult);
  const start=state.mode==='year'?state.year:state.start, end=state.mode==='year'?state.year:state.end;
  const min=state.mode==='year'?1:state.minYears;
  const countries=data.countries.filter(c=>state.region==='all'||c.regionId===state.region);
  let withSpending=0,withOutcome=0,withAnyPair=0;
  const rows=[];
  for(const c of countries) {
    const xs=x.get(c.id)??new Map(), ys=y.get(c.id)??new Map();
    if([...xs.keys()].some(year=>year>=start&&year<=end))withSpending++;
    if([...ys.keys()].some(year=>year>=start&&year<=end))withOutcome++;
    const years=[...xs.keys()].filter(year=>year>=start&&year<=end&&ys.has(year)).sort((a,b)=>a-b);
    if(years.length)withAnyPair++;
    if(years.length<min)continue;
    const adultYears=years.filter(year=>adult.get(c.id)?.has(year));
    const row={...c,x:mean(years.map(year=>xs.get(year))),y:mean(years.map(year=>ys.get(year))),years,n:years.length,
      adult:adultYears.length?mean(adultYears.map(year=>adult.get(c.id).get(year))):null,adultYears};
    row.qualifies=state.question!=='noSchool'||(row.x>state.spending&&row.y>state.noSchool);
    rows.push(row);
  }
  const ranked=rows.filter(r=>r.qualifies).sort((a,b)=>question.direction*(a.y-b.y)||a.name.localeCompare(b.name));
  const featured=ranked.slice(0,question.limit);
  return {rows,ranked,featured,start,end,coverage:{total:countries.length,withSpending,withOutcome,withAnyPair,eligible:rows.length,excluded:countries.length-rows.length},r:pearson(rows)};
}

export function pearson(rows) {
  if(rows.length<3)return null;
  const mx=mean(rows.map(r=>r.x)),my=mean(rows.map(r=>r.y));
  let xy=0,xx=0,yy=0;
  for(const r of rows){const x=r.x-mx,y=r.y-my;xy+=x*y;xx+=x*x;yy+=y*y;}
  return xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null;
}

export function analyticalCSV(result,state,data) {
  const cols=['country','iso3','region','education_spending_pct_GDP','outcome_value','outcome_code','paired_years','paired_year_count','adult_literacy_context','adult_context_years','passes_thresholds','method','selected_start','selected_end','minimum_paired_years','spending_threshold_strictly_above','no_schooling_threshold_strictly_above','spending_source_id','outcome_source_id','spending_source_updated','outcome_source_updated','metadata_retrieved_at','retrieved_at'];
  const metric=data.metrics[QUESTIONS[state.question].metric];
  const cell=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const rows=result.rows.map(r=>[r.name,r.id,r.region,r.x,r.y,metric.code,r.years.join(';'),r.n,r.adult,r.adultYears.join(';'),state.question==='noSchool'?r.qualifies:'',state.mode==='year'?'single common year':'mean over paired country-years',result.start,result.end,state.mode==='year'?1:state.minYears,state.question==='noSchool'?state.spending:'',state.question==='noSchool'?state.noSchool:'',data.metrics.spending.sourceId,metric.sourceId,data.metrics.spending.sourceUpdated,metric.sourceUpdated,data.metadataRetrievedAt??data.retrievedAt,data.retrievedAt]);
  return [cols,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
