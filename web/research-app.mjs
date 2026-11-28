import {QUESTIONS, DEFAULTS, readState, compare, indexMetric, analyticalCSV} from './analysis.mjs';
import {createWorldBankClient} from './world-bank.mjs';
import {createStory} from './story.mjs';
import {createArchive} from './notebook-archive.mjs';

const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(value,digits=2)=>value===null||value===undefined?'—':Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const date=value=>new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const period=years=>years.length===1?String(years[0]):`${years[0]}–${years.at(-1)}`;
const client=createWorldBankClient({perPage:10000});
let data,state,result,notebook,story,controller,live=false,metadataDate;
const titles={youth:'The high-literacy end of the picture.',adult:'A closer look at the literacy gap.',noSchool:'Investment alongside unmet need.'};
const rankingTitles={youth:'Highest youth literacy',adult:'Lowest adult literacy',noSchool:'Above both thresholds'};
const metricDescriptions={
  spending:'Government expenditure on education as a share of the economy. This is not spending per student.',
  youth:'The share of people ages 15–24 who can read and write with understanding a short, simple statement about everyday life.',
  adult:'The share of people ages 15+ who can read and write with understanding a short, simple statement about everyday life.',
  noSchool:'The share of people ages 15+ with no formal education. A historical attainment series, distinct from literacy.'
};
function explorerLink(metric){return `./explorer.html#${new URLSearchParams({source:metric.sourceId,indicator:metric.code,countries:'MEX,CAN',start:1990,end:2025})}`;}
function status(){ $('data-status').textContent=`${live?'API refreshed':'Saved API snapshot'} · ${date(data.retrievedAt)} · ${Object.values(data.metrics).reduce((n,m)=>n+m.rows.length,0).toLocaleString()} non-missing observations`; }
function syncControls(){
  for(const key of ['mode','start','end','year','minYears','region','spending','noSchool'])$(key).value=state[key];
  const single=state.mode==='year';
  $('range-fields').hidden=single;$('minimum-field').hidden=single;$('year-field').hidden=!single;
  $('start').disabled=single;$('end').disabled=single;$('minYears').disabled=single;$('year').disabled=!single;
  $('thresholds').hidden=state.question!=='noSchool';
  $('spending').disabled=$('noSchool').disabled=state.question!=='noSchool';
  document.querySelectorAll('[data-question]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.question===state.question)));
}
function saveState(){const params=new URLSearchParams(location.search);for(const [key,value] of Object.entries(state))params.set(key,value);history.replaceState(null,'',`${location.pathname}?${params}#comparison`);}
function render(persist=true){
  result=compare(data,state);
  const q=QUESTIONS[state.question],metric=data.metrics[q.metric];
  // Keep country selection stable even if that country has no eligible paired observations.
  syncControls();if(persist)saveState();
  $('dashboard').setAttribute('aria-busy','false');$('export').disabled=!result.rows.length;
  $('view-kicker').textContent=`Question ${q.number} / ${state.mode==='year'?'Common reporting year':'Matched country-years'} · ${result.start===result.end?result.start:`${result.start}–${result.end}`}`;
  $('view-title').textContent=titles[state.question];
  $('view-description').textContent=state.mode==='year'?`Both measures must be reported in ${state.year}. Each eligible country contributes one dot.`:`Each dot averages spending and ${metric.label.toLowerCase()} over the same reporting years within a country. Countries can contribute different sets of years.`;
  $('scatter-title').textContent=`Spending & ${metric.label.toLowerCase()}`;
  $('scatter-subtitle').textContent=state.mode==='year'?`Reported values in ${state.year}`:`Matched-year averages · ${result.start}–${result.end}`;
  $('highlight-label').textContent=state.question==='noSchool'?'Above both thresholds':state.question==='youth'?'Top 5':'Bottom 10';
  $('ranking-title').textContent=rankingTitles[state.question];
  $('ranking-count').textContent=`${result.featured.length} countries`;
  $('ranking-caption').textContent=`${rankingTitles[state.question]}: spending and ${metric.label.toLowerCase()}`;
  $('outcome-column').innerHTML=`${state.question==='noSchool'?'No school':'Literacy'}<br><small>%</small>`;
  const counts=result.rows.map(r=>r.n).sort((a,b)=>a-b),median=counts.length?(counts[Math.floor((counts.length-1)/2)]+counts[Math.ceil((counts.length-1)/2)])/2:null;
  const range=result.rows.flatMap(r=>r.years);
  const statData=[
    [result.rows.length,'Countries compared',`${result.coverage.total} in the selected geography`],
    [result.r===null?'—':fmt(result.r,3),'Pearson correlation · r',`All ${result.rows.length} eligible countries · unweighted`],
    [median===null?'—':fmt(median,median%1?1:0),'Median matched years','Per country in this comparison'],
    [range.length?`${Math.min(...range)}–${Math.max(...range)}`:'—','Actual reporting years',state.question==='noSchool'?`${result.featured.length} pass both thresholds`:`${result.coverage.excluded} excluded for insufficient data`]
  ];
  $('stats').innerHTML=statData.map(([value,label,note])=>`<div class="stat"><span class="stat-label">${escape(label)}</span><span class="stat-value">${escape(value)}</span><span class="stat-note">${escape(note)}</span></div>`).join('');
  const old=state.question==='noSchool';
  $('coverage-warning').hidden=!old;
  $('coverage-warning').textContent=`Historical measure: Barro-Lee no-schooling observations in this extract end in ${metric.lastYear}. Later spending is excluded when no same-year schooling observation exists. No schooling is not the inverse of literacy.`;
  renderScatter();renderRankings();renderCountry();renderCoverage();
}
function axisText(x,y,text,extra=''){return `<text x="${x}" y="${y}" fill="#64726c" font-family="DM Sans,system-ui,sans-serif" font-size="10" ${extra}>${escape(text)}</text>`;}
function renderScatter(){
  const metric=data.metrics[QUESTIONS[state.question].metric];
  if(!result.rows.length){$('scatter').innerHTML='<p class="empty">No countries meet these reporting requirements.<br>Try a wider period, fewer matched years, or another region.</p>';$('point-readout').textContent='No paired observations in this view.';return;}
  const W=Math.max(360,Math.min(750,$('scatter').clientWidth||650)),H=380,L=48,R=24,T=34,B=60,pw=W-L-R,ph=H-T-B;
  const xmax=Math.max(10,Math.ceil(Math.max(...result.rows.map(r=>r.x),state.question==='noSchool'?state.spending:0)/2)*2);
  const ymax=Math.max(100,Math.ceil(Math.max(...result.rows.map(r=>r.y))/20)*20);
  const x=v=>L+v/xmax*pw,y=v=>T+ph-v/ymax*ph;
  const featured=new Set(result.featured.map(r=>r.id));
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Interactive scatterplot. Horizontal axis education spending as percent of GDP; vertical axis ${escape(metric.label)} as percent. ${result.rows.length} countries. Select dots with Enter or Space.">`;
  if(state.question==='noSchool')svg+=`<rect x="${x(state.spending)}" y="${T}" width="${W-R-x(state.spending)}" height="${y(Math.min(ymax,state.noSchool))-T}" fill="#f3e8dd"/>`;
  for(let n=0;n<=ymax;n+=20){svg+=`<line x1="${L}" y1="${y(n)}" x2="${W-R}" y2="${y(n)}" stroke="#dde2d9"/>`+axisText(L-12,y(n)+3,n,'text-anchor="end"');}
  for(let i=0;i<=5;i++){const n=xmax*i/5;svg+=axisText(x(n),H-B+22,fmt(n,n%1?1:0),'text-anchor="middle"');}
  svg+=axisText(L,T-16,`${metric.label} (${metric.unit})`)+axisText(L+pw/2,H-10,'Education spending (% of GDP)','text-anchor="middle"');
  if(state.question==='noSchool'){
    svg+=`<line x1="${x(state.spending)}" y1="${T}" x2="${x(state.spending)}" y2="${y(0)}" stroke="#b74d34" stroke-dasharray="4 4"/><line x1="${L}" y1="${y(state.noSchool)}" x2="${W-R}" y2="${y(state.noSchool)}" stroke="#b74d34" stroke-dasharray="4 4"/>`;
  }
  const rows=[...result.rows].sort((a,b)=>Number(featured.has(a.id))-Number(featured.has(b.id))||Number(a.id===state.country)-Number(b.id===state.country));
  for(const r of rows){const selected=r.id===state.country;svg+=`<circle class="chart-point" data-country="${escape(r.id)}" cx="${x(r.x)}" cy="${y(r.y)}" r="${selected?6:featured.has(r.id)?4.8:3.7}" fill="${featured.has(r.id)?'#b74d34':'#387d70'}" fill-opacity="${featured.has(r.id)||selected?1:.52}" stroke="${selected?'#203f3b':'#fcfcf8'}" stroke-width="${selected?2.5:.7}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${escape(pointLabel(r))}"><title>${escape(pointLabel(r))}</title></circle>`;}
  const selected=result.rows.find(r=>r.id===state.country);
  if(selected)svg+=`<text x="${Math.min(W-R-22,Math.max(L+15,x(selected.x)))}" y="${Math.max(T+11,y(selected.y)-12)}" text-anchor="middle" fill="#203f3b" stroke="#fcfcf8" stroke-width="3" paint-order="stroke" font-size="11" font-weight="600" pointer-events="none">${escape(selected.id)}</text>`;
  $('scatter').innerHTML=svg+'</svg>';
  $('point-readout').textContent=selected?pointLabel(selected):'Select a country to inspect its observations.';
}
function pointLabel(r){const metric=data.metrics[QUESTIONS[state.question].metric];return `${r.name} · Spending ${fmt(r.x)}% GDP · ${metric.label} ${fmt(r.y)}% · ${r.n} matched ${r.n===1?'year':'years'} (${period(r.years)})`;}
function renderRankings(){
  const search=$('country-search').value.trim().toLowerCase(),all=$('show-all').checked||Boolean(search);
  const ordered=[...result.rows].sort((a,b)=>QUESTIONS[state.question].direction*(a.y-b.y)||a.name.localeCompare(b.name));
  const rows=(all?ordered:result.featured).filter(r=>`${r.name} ${r.id}`.toLowerCase().includes(search));
  const positions=new Map(ordered.map((r,i)=>[r.id,i+1]));
  $('rankings').innerHTML=rows.length?rows.map(r=>`<tr class="${r.id===state.country?'selected':''}"><td><button type="button" data-country="${escape(r.id)}" aria-label="Inspect ${escape(r.name)}" aria-pressed="${r.id===state.country}"><span class="rank-number">${positions.get(r.id)}</span>${escape(r.name)}</button><small>${r.n} matched ${r.n===1?'year':'years'} · ${period(r.years)}${state.question==='noSchool'&&all?` · ${r.qualifies?'Passes both':'Below threshold'}`:''}</small></td><td>${fmt(r.x)}</td><td><strong>${fmt(r.y)}</strong><span class="bar" style="width:${Math.min(100,r.y)}%"></span></td></tr>`).join(''):'<tr><td colspan="3">No countries match this view.</td></tr>';
  $('ranking-note').textContent=`${rows.length} shown${all?' across all eligible countries':state.question==='noSchool'?' passing both thresholds':` from ${result.rows.length} eligible`}. Ordered by unrounded ${data.metrics[QUESTIONS[state.question].metric].label.toLowerCase()}. Search includes all eligible countries.`;
}
function selectCountry(id){state.country=id;saveState();renderScatter();renderRankings();renderCountry();}
function renderCountry(){
  const country=data.countries.find(c=>c.id===state.country),row=result.rows.find(r=>r.id===state.country),metric=data.metrics[QUESTIONS[state.question].metric];
  $('country-select').value=state.country;$('country-heading').textContent=country?.name??'Select a country';$('country-region').textContent=`${country?.region.trim()??''} · ${country?.income??''}`;
  $('country-values').innerHTML=row?`<div><span>${fmt(row.x)}<small>% of GDP</small></span><small>Education spending</small></div><div><span>${fmt(row.y)}<small>${escape(metric.unit)}</small></span><small>${escape(metric.label)}</small></div>${state.question==='noSchool'?`<p class="context-note">Adult literacy context: ${row.adult===null?'no observation in the matched years':`${fmt(row.adult)}% (${row.adultYears.join(', ')})`}</p>`:''}`:'<p class="context-note">This country is outside the selected geography or has insufficient matched observations. Its available history is shown alongside.</p>';
  $('country-years').textContent=row?`${state.mode==='year'?'Reported in':'Averages use'} ${row.years.join(', ')}. ${row.n} matched ${row.n===1?'year':'years'}; no values imputed.`:'Try a wider comparison period or a different country.';
  renderTrend();
}
function renderTrend(){
  const key=$('trend-metric').value==='outcome'?QUESTIONS[state.question].metric:$('trend-metric').value,metric=data.metrics[key];
  const rows=metric.rows.filter(r=>r[0]===state.country).map(([,year,value])=>({year,value})).sort((a,b)=>a.year-b.year);
  if(!rows.length){$('trend').innerHTML=`<p class="empty">No ${escape(metric.label.toLowerCase())} observations for this country in 1990–2025.</p>`;return;}
  const W=Math.max(360,Math.min(850,$('trend').clientWidth||690)),H=270,L=48,R=15,T=36,B=36,pw=W-L-R,ph=H-T-B;
  const ymax=Math.max(key==='spending'?6:100,Math.ceil(Math.max(...rows.map(r=>r.value))/(key==='spending'?2:20))*(key==='spending'?2:20));
  const x=year=>L+(year-1990)/35*pw,y=value=>T+ph-value/ymax*ph;
  const left=x(result.start),right=x(result.end);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(metric.label)} for ${escape(state.country)}, ${rows.length} observations, ${rows[0].year} to ${rows.at(-1).year}. Individual dots have value tooltips."><rect x="${Math.max(L,left-3)}" y="${T}" width="${Math.max(6,right-left)}" height="${ph}" fill="#eaf0e6"/>`;
  for(let i=0;i<=4;i++){const n=ymax*i/4;svg+=`<line x1="${L}" y1="${y(n)}" x2="${W-R}" y2="${y(n)}" stroke="#dde2d9"/>`+axisText(L-9,y(n)+3,fmt(n,n%1?1:0),'text-anchor="end"');}
  for(const year of [1990,2000,2010,2020,2025])svg+=axisText(x(year),H-12,year,'text-anchor="middle"');
  svg+=axisText(L,18,`${metric.label} (${metric.unit})`);
  rows.forEach((r,i)=>{const prev=rows[i-1];if(prev&&r.year===prev.year+1)svg+=`<line x1="${x(prev.year)}" y1="${y(prev.value)}" x2="${x(r.year)}" y2="${y(r.value)}" stroke="#387d70" stroke-width="1.7"/>`;svg+=`<circle cx="${x(r.year)}" cy="${y(r.value)}" r="3.5" fill="#387d70" tabindex="0"><title>${escape(`${r.year}: ${fmt(r.value)} ${metric.unit}`)}</title></circle>`;});
  $('trend').innerHTML=svg+'</svg>';
}
function renderCoverage(){
  const c=result.coverage,metric=data.metrics[QUESTIONS[state.question].metric];
  $('coverage-summary').textContent=`Inspect data coverage · ${c.eligible} included / ${c.total} countries and economies`;
  $('coverage-detail').innerHTML=`<div class="coverage-flow"><div><strong>${c.total}</strong>Countries in geography</div><div><strong>${c.withSpending}</strong>With spending</div><div><strong>${c.withOutcome}</strong>With ${escape(metric.label.toLowerCase())}</div><div><strong>${c.eligible}</strong>Meet paired-year minimum</div></div><p>${c.withAnyPair} countries have at least one same-year pair; ${c.withAnyPair-c.eligible} of those fall below your minimum-year setting. ${c.excluded} countries are excluded overall. Counts refer to ${result.start===result.end?result.start:`${result.start}–${result.end}`}. A small or uneven reporting sample can change the relationship substantially.</p>`;
}
function renderMetadata(){
  $('metric-cards').innerHTML=Object.entries(data.metrics).map(([key,m])=>`<article class="metric-card"><p class="eyebrow">${m.sourceId==='2'?'WDI / Source 2':'EdStats / Source 12'}</p><h3>${escape(m.label)}</h3><p class="metric-unit">${escape(m.unit)}</p><code>${escape(m.code)}</code><p>${metricDescriptions[key]}</p><a href="${escape(explorerLink(m))}">Explore this indicator ↗</a><details><summary>Full definition & producer</summary><p>${escape(m.name)}</p><p>${escape(m.definition)}</p><p>${escape(m.producer)}</p><a href="https://api.worldbank.org/v2/indicator/${encodeURIComponent(m.code)}?source=${m.sourceId}&format=json" target="_blank" rel="noreferrer">API definition ↗</a></details><p class="vintage">Extract coverage: ${m.firstYear}–${m.lastYear}<br>Source updated: ${escape(m.sourceUpdated??'not reported')}</p></article>`).join('');
  $('provenance-date').textContent=`Observations retrieved: ${date(data.retrievedAt)} (${live?'this session':'saved extract'}). Definitions and country catalog retrieved: ${date(metadataDate)}. Source update dates are shown on each indicator card. EdStats was last updated separately from WDI; “updated” is not an observation year.`;
  $('request-links').innerHTML=data.requests.map((url,i)=>`<li><a href="${escape(url)}" target="_blank" rel="noreferrer">${escape(new URL(url).pathname.replace('/v2/',''))} · request ${i+1} ↗</a></li>`).join('');
}
function historicalTable(){
  const key=$('notebook-question').value,rows=notebook.tables[key],noSchool=key==='noSchool';
  $('historical-table').innerHTML=`<table><thead><tr><th>Country</th><th>Avg. spending<br><small>% GDP</small></th><th>Avg. ${noSchool?'no education':'literacy'}<br><small>%</small></th>${noSchool?'<th>Avg. adult literacy<br><small>%</small></th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td>${escape(r.country_name)} <small>${escape(r.country_code)}</small></td><td>${escape(r.avg_GDP_spend)}</td><td>${escape(noSchool?r.avg_15_plus_no_education_percent:r.avg_literacy_rate)}</td>${noSchool?`<td>${escape(r.avg_literacy_rate)}</td>`:''}</tr>`).join('')}</tbody></table>`;
}
async function refresh(){
  controller=new AbortController();$('refresh').disabled=true;$('cancel').hidden=false;$('error').hidden=true;
  $('data-status').textContent='Refreshing all four series for 1990–2025… Current data remains visible.';
  try{
    client.clearCache();
    const next=structuredClone(data),requests=[];
    // Two source-specific requests; sequential to keep upstream load bounded.
    for(const source of ['2','12']){
      const metrics=Object.entries(data.metrics).filter(([,m])=>m.sourceId===source);
      $('data-status').textContent=`Refreshing ${source==='2'?'WDI literacy and spending':'historical EdStats attainment'}… Current data remains visible.`;
      const pulled=await client.observations({source,indicators:metrics.map(([,m])=>m.code),date:'1990:2025'},{signal:controller.signal});
      requests.push(...pulled.requests);
      const countries=new Set(data.countries.map(c=>c.id));
      for(const [key,m] of metrics){
        const rows=pulled.rows.filter(r=>r.indicatorId===m.code&&countries.has(r.iso3)&&typeof r.value==='number'&&Number.isFinite(r.value)&&Number.isInteger(r.year)).map(r=>[r.iso3,r.year,r.value]);
        if(!rows.length)throw new Error(`The API returned no usable observations for ${m.code}; the current extract was retained.`);
        next.metrics[key]={...m,rows,firstYear:Math.min(...rows.map(r=>r[1])),lastYear:Math.max(...rows.map(r=>r[1])),sourceUpdated:pulled.meta.lastupdated};
        indexMetric(next.metrics[key]);
      }
    }
    controller.signal.throwIfAborted();next.metadataRetrievedAt=metadataDate;next.retrievedAt=new Date().toISOString();next.requests=requests;
    data=next;live=true;render(false);renderStory();renderMetadata();status();
  }catch(error){
    status();$('error').hidden=false;$('error').textContent=controller.signal.aborted?'Refresh canceled. The previous extract remains visible.':`Could not complete the API refresh. The previous extract remains visible. ${error.message}`;
  }finally{$('refresh').disabled=false;$('cancel').hidden=true;controller=null;}
}
function renderStory(){story?.render();}
function openComparison(question,country,options,follow){
  state={...DEFAULTS,question,country:country??'MEX',spending:options.spending,noSchool:options.noSchool};
  $('deep-dive').open=true;$('country-search').value='';$('show-all').checked=false;render();
  (follow?document.querySelector('.country-panel'):$('comparison')).scrollIntoView({behavior:'smooth',block:'start'});
}
async function init(){
  try{
    const [apiPayload,notebookPayload,archive,world]=await Promise.all(['research.json','notebook-findings.json','notebook-archive.json','world-map.json'].map(async name=>{const response=await fetch(`./data/${name}`);if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);return response.json();}));
    data=apiPayload;notebook=notebookPayload;metadataDate=data.metadataRetrievedAt??data.retrievedAt;state=readState(location.search||location.hash,data);
    story=createStory({getData:()=>data,notebook,onInspect:openComparison,world});createArchive(archive);
    $('notebook-provenance').textContent=notebook.provenance;historicalTable();$('notebook-question').addEventListener('change',historicalTable);
    const regions=[...new Map(data.countries.map(c=>[c.regionId,c.region.trim()])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    $('region').insertAdjacentHTML('beforeend',regions.map(([id,name])=>`<option value="${escape(id)}">${escape(name)}</option>`).join(''));
    $('country-select').innerHTML=[...data.countries].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
    $('supporting-links').innerHTML=[['12','BAR.NOED.25UP.ZS','No education, ages 25+'],['12','BAR.POP.1519','Population, ages 15–19 (thousands)'],['12','BAR.POP.2024','Population, ages 20–24 (thousands)'],['2','SH.DYN.MORT','Under-5 mortality (per 1,000 live births)'],['2','SH.DYN.1014','Probability of dying, ages 10–14 (per 1,000)'],['2','SH.DYN.2024','Probability of dying, ages 20–24 (per 1,000)']].map(([sourceId,code,label])=>`<a href="${escape(explorerLink({sourceId,code}))}">${escape(label)} ↗<code>${escape(code)}</code></a>`).join('');
    if(location.search.includes('question=')||location.hash.includes('='))$('deep-dive').open=true;
    render(false);renderStory();renderMetadata();status();
    $('controls').addEventListener('submit',event=>{event.preventDefault();const next={...state};for(const key of ['mode','start','end','year','minYears','region','spending','noSchool'])next[key]=['mode','region'].includes(key)?$(key).value:Number($(key).value);if(next.start>next.end){$('error').textContent='First year must be no later than last year.';$('error').hidden=false;return;}state=next;$('error').hidden=true;render();});
    $('mode').addEventListener('change',()=>{const single=$('mode').value==='year';$('range-fields').hidden=single;$('minimum-field').hidden=single;$('year-field').hidden=!single;$('start').disabled=$('end').disabled=$('minYears').disabled=single;$('year').disabled=!single;});
    document.querySelectorAll('[data-question]').forEach(button=>button.addEventListener('click',()=>{state.question=button.dataset.question;$('country-search').value='';$('show-all').checked=false;render();}));
    $('scatter').addEventListener('click',e=>{const point=e.target.closest('[data-country]');if(point)selectCountry(point.dataset.country);});
    $('scatter').addEventListener('keydown',e=>{const point=e.target.closest('[data-country]');if(point&&['Enter',' '].includes(e.key)){e.preventDefault();const id=point.dataset.country;selectCountry(id);$('scatter').querySelector(`[data-country="${id}"]`)?.focus({preventScroll:true});}});
    for(const type of ['pointerover','focusin'])$('scatter').addEventListener(type,e=>{const point=e.target.closest('[data-country]');if(point)$('point-readout').textContent=pointLabel(result.rows.find(r=>r.id===point.dataset.country));});
    $('rankings').addEventListener('click',e=>{const button=e.target.closest('button[data-country]');if(button)selectCountry(button.dataset.country);});
    $('country-select').addEventListener('change',()=>selectCountry($('country-select').value));
    $('country-search').addEventListener('input',renderRankings);$('show-all').addEventListener('change',renderRankings);$('trend-metric').addEventListener('change',renderTrend);
    $('refresh').addEventListener('click',refresh);$('cancel').addEventListener('click',()=>controller?.abort(new DOMException('User canceled','AbortError')));
    $('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([analyticalCSV(result,state,data)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`world-bank-${state.question}-${result.start}-${result.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    window.addEventListener('hashchange',()=>{if(location.hash.includes('=')){state=readState(location.hash,data);$('deep-dive').open=true;render(false);}});
    window.addEventListener('popstate',()=>{state=readState(location.search||location.hash,data);story?.restore();render(false);});
    $('deep-dive').addEventListener('toggle',()=>{if($('deep-dive').open){renderScatter();renderTrend();}});
    let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{renderStory();if($('deep-dive').open){renderScatter();renderTrend();}},150);});

  }catch(error){$('deep-dive').open=true;$('story-data-status').textContent='The saved extract could not be loaded. Reload the page or use the indicator library.';$('error').hidden=false;$('error').textContent=`Could not initialize the research view: ${error.message}`;$('dashboard').setAttribute('aria-busy','false');}
}
init();
