import {readStoryOptions,storyResult,matrixRows,savedRowsCSV} from './notebook-model.mjs';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=(v,n=2)=>v===null||v===undefined?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n});
const avg=rows=>rows.reduce((sum,r)=>sum+r.x,0)/rows.length;
const label={youth:'Youth literacy',adult:'Adult literacy',noSchool:'No schooling'};
const text=(x,y,value,attr='')=>`<text x="${x}" y="${y}" fill="#64726c" font-family="DM Sans,system-ui,sans-serif" font-size="11" ${attr}>${esc(value)}</text>`;
function download(name,content){const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function createStory({getData,notebook,onInspect}) {
  let options=readStoryOptions(location.search);
  const selected={youth:'UZB',adult:'SOM',noSchool:'YEM'};
  const results={};
  function persist(){
    const url=new URL(location.href);
    for(const [key,value] of Object.entries({basis:options.basis,storySpending:options.spending,storySchooling:options.noSchool,storySort:options.sort}))url.searchParams.set(key,value);
    history.replaceState(null,'',url);
  }
  function pointLabel(r,q){return `${r.name} · Spending ${f(r.x)}% GDP · ${label[q]} ${f(r.y)}%${q==='noSchool'?` · Adult literacy ${f(r.adult)}% · ${r.qualifies?'Above both cutoffs':'Below current cutoffs'}`:''} · ${options.basis==='notebook'?'Saved notebook averages; reporting years unavailable':`Matched years: ${r.years.join(', ')}`}`;}
  function render(){
    const data=getData(),archived=options.basis==='notebook';
    document.querySelectorAll('[data-basis]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.basis===options.basis)));
    $('story-basis-description').textContent=archived?'Notebook results: original saved rankings, correlations and 35-country result. Series were averaged separately over their available years.':'API comparison: 2000–2025, using the same reporting years for both measures within each country. Different data and a different method.';
    $('story-data-status').textContent=archived?'Historical BigQuery extract · Exact saved outputs · Original extraction date and full year ranges unavailable':`World Bank API ${data.retrievedAt.slice(0,10)} · Window: 2000–2025 · Same-year pairs before averaging`;
    $('story-youth-chart-title').textContent=archived?'How the five leaders compare':'Youth literacy & spending across countries';
    $('story-noSchool-chart-title').textContent=archived?'The 35-country finding, measure by measure':'Schooling, literacy & spending in the API';
    const youth=storyResult(data,notebook,'youth',options),adult=storyResult(data,notebook,'adult',options);
    for(const q of ['youth','adult','noSchool']){
      const result=q==='youth'?youth:q==='adult'?adult:storyResult(data,notebook,q,options);
      results[q]=result;
      if(!(q==='adult'?result.featured:result.rows).some(r=>r.id===selected[q]))selected[q]=result.featured[0]?.id??result.rows[0]?.id;
      const r=result.rows.find(r=>r.id===selected[q]);
      $(`story-${q}-readout`).textContent=r?pointLabel(r,q):'No observations in this view.';
      const follow=document.querySelector(`[data-follow="${q}"]`);follow.disabled=!r;follow.textContent=r?`Compare ${r.name} with API history →`:'No country selected';
      $(`story-${q}-evidence`).innerHTML=evidence(q,result);
      $(`story-${q}-scope`).textContent=archived?`Original notebook · ${result.rows.length} saved country rows${q==='noSchool'?' · Threshold experiments use the saved rounded averages':''}`:`API extract · ${result.rows.length} countries with matched observations · 2000–2025`;
    }
    const top=youth.featured[0],low=adult.featured[0];
    $('story-youth-finding').textContent=archived?`Uzbekistan leads the notebook’s top five at 99.98% youth literacy and 5.95% of GDP spent on education. These five countries average ${f(avg(youth.rows),3)}% of GDP in spending.`:`Among ${youth.rows.length} eligible countries, the five highest youth-literacy averages span spending of ${f(Math.min(...youth.featured.map(r=>r.x)))}–${f(Math.max(...youth.featured.map(r=>r.x)))}% of GDP. ${youth.featured.filter(r=>r.n===1).length} of those five have just one matched year.`;
    $('story-youth-correlation').textContent=`Pearson r = ${f(youth.r,4)} · ${youth.correlationN} countries${archived?' in the original correlation query; the chart shows only the five saved leaders.':' in the API matched-year sample.'}`;
    $('story-youth-caution').textContent=archived?'The five literacy averages differ by only 0.11 percentage points. The magnified axis makes that small difference visible; switch to the full scale to see its size.':'Matched-year averages can rest on a single observation. Inspect the reporting years before drawing comparisons.';
    $('story-adult-finding').textContent=archived?`Somalia has the lowest saved adult-literacy average, 5.40%, alongside education spending of 1.23% of GDP. Across the bottom ten, average spending is ${f(avg(adult.rows),3)}% of GDP.`:`${low.name} has the lowest matched-period average in this API sample: ${f(low.y)}% adult literacy, paired with ${f(low.x)}% of GDP in spending across ${low.n} matched years.`;
    $('story-adult-correlation').textContent=`Pearson r = ${f(adult.r,4)} · ${adult.correlationN} countries${archived?' in the original adult-literacy correlation query.':' with matched data.'}`;
    $('story-adult-caution').textContent=archived?'The notebook’s two selected groups average 4.700% and 2.369% of GDP in spending. They involve different countries and age groups; this is a descriptive comparison, not an estimate of spending’s effect.':'This is the lowest-ranked group among countries with matched data in this window. Missing countries are not assigned a zero literacy rate.';
    const schooling=results.noSchool;
    $('story-spending').value=options.spending;$('story-schooling').value=options.noSchool;
    $('story-spending-value').textContent=f(options.spending,options.spending%1?1:0);$('story-schooling-value').textContent=f(options.noSchool,0);
    $('story-noSchool-finding').textContent=archived?`The original query returned 35 countries with spending above 4% of GDP and no schooling above 10%. At your cutoffs, ${schooling.featured.length} of those 35 saved countries qualify. Yemen’s original averages are 8.01% spending, 82.22% no schooling and 45.59% adult literacy.`:`${schooling.featured.length} of ${schooling.rows.length} eligible API countries exceed both cutoffs. Their comparisons use same-year observations within 2000–${Math.min(2025,data.metrics.noSchool.lastYear)}.`;
    $('story-noSchool-caution').textContent=archived?'The 35 rows are the original filtered result, not all countries. Lowering cutoffs cannot reveal countries excluded by the original SQL. Experiments use rounded saved values; the full original result remains available below.':'The API’s Barro-Lee no-schooling series ends in 2010. This is a historical attainment comparison, not a description of today’s schooling.';
    $('story-youth-countries').innerHTML=youth.featured.map(r=>`<button type="button" data-story-country="${r.id}" data-story-question="youth" aria-pressed="${r.id===selected.youth}">${esc(r.name)}</button>`).join('');
    renderScatter(youth);renderBars(adult);renderMatrix(schooling);
  }
  function evidence(q,result){
    return `<table><caption class="sr-only">${options.basis==='notebook'?'Original notebook':'API comparison'} ${label[q]} result</caption><thead><tr><th scope="col">Country</th><th scope="col">Spending<br><small>% GDP</small></th><th scope="col">${label[q]}<br><small>%</small></th>${q==='noSchool'?'<th scope="col">Adult literacy<br><small>% ages 15+</small></th>':''}</tr></thead><tbody>${(q==='noSchool'?result.rows:options.basis==='notebook'?result.rows:result.featured).map(r=>`<tr><td>${esc(r.name)}<small>${r.id}</small></td><td>${f(r.x)}</td><td>${f(r.y)}</td>${q==='noSchool'?`<td>${f(r.adult)}</td>`:''}</tr>`).join('')}</tbody></table>`;
  }
  function renderScatter(result){
    const target=$('story-youth-chart'),W=Math.max(360,Math.min(720,target.clientWidth||600)),H=340,L=53,R=24,T=30,B=49,pw=W-L-R,ph=H-T-B;
    const full=$('youth-full-scale').checked,rows=result.rows,notebookMode=options.basis==='notebook';
    const min=full?0:notebookMode?99.8:Math.floor(Math.min(...rows.map(r=>r.y))/10)*10;
    const xmax=Math.max(8,Math.ceil(Math.max(...rows.map(r=>r.x))/2)*2),x=v=>L+v/xmax*pw,y=v=>T+ph-(v-min)/(100-min)*ph;
    const featured=new Set(result.featured.map(r=>r.id));
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Youth literacy versus education spending. ${rows.length} countries. Literacy axis ${min} to 100 percent. Select a country with Enter or Space.">`;
    for(let i=0;i<=4;i++){const n=min+(100-min)*i/4;svg+=`<line x1="${L}" y1="${y(n)}" x2="${W-R}" y2="${y(n)}" stroke="#dde2d9"/>`+text(L-10,y(n)+3,f(n,min>99?2:0),'text-anchor="end"');}
    for(let i=0;i<=4;i++)svg+=text(x(xmax*i/4),H-B+21,f(xmax*i/4,1),'text-anchor="middle"');
    svg+=text(L,13,`Youth literacy (%)${min>0?' · magnified axis':''}`)+text(L+pw/2,H-5,'Education spending (% of GDP)','text-anchor="middle"');
    for(const r of [...rows].sort((a,b)=>Number(a.id===selected.youth)-Number(b.id===selected.youth))){const active=r.id===selected.youth;svg+=`<circle class="chart-point" cx="${x(r.x)}" cy="${y(r.y)}" r="${active?7:notebookMode?6:4}" fill="${featured.has(r.id)?'#b74d34':'#387d70'}" fill-opacity="${featured.has(r.id)?1:.5}" stroke="${active?'#203f3b':'#fcfcf8'}" stroke-width="${active?2:.7}" data-story-country="${r.id}" data-story-question="youth" role="button" tabindex="0" aria-pressed="${active}" aria-label="${esc(pointLabel(r,'youth'))}"><title>${esc(pointLabel(r,'youth'))}</title></circle>`;
      if(notebookMode||active)svg+=text(Math.max(L+16,Math.min(W-R-16,x(r.x))),Math.max(T+13,y(r.y)-13),r.id,'text-anchor="middle" pointer-events="none"');}
    target.innerHTML=svg+'</svg>';
    $('youth-axis-note').textContent=`Literacy axis: ${f(min,min>99?1:0)}–100%. ${notebookMode?'Five ranked results are plotted; the full 192-country correlation input was not saved.':'All eligible country averages are plotted.'}`;
  }
  function renderBars(result){
    const target=$('story-adult-chart'),W=Math.max(360,Math.min(720,target.clientWidth||600)),L=W<450?116:148,R=88,T=33,H=374,pw=W-L-R;
    const sort=$('adult-sort').value;
    const rows=[...result.featured].sort((a,b)=>sort==='spending'?b.x-a.x:sort==='name'?a.name.localeCompare(b.name):a.y-b.y||a.name.localeCompare(b.name));
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Ten lowest adult-literacy averages. Bars encode literacy from 0 to 100 percent. Education spending appears as a separate numeric column. Select a country with Enter or Space.">`;
    for(const v of [0,25,50,75,100])svg+=`<line x1="${L+v/100*pw}" y1="${T-5}" x2="${L+v/100*pw}" y2="${T+300}" stroke="#e0e5dc"/>`+text(L+v/100*pw,H-13,`${v}%`,'text-anchor="middle"');
    svg+=text(L,13,'Adult literacy (%)')+text(W-3,13,'Spend % GDP','text-anchor="end"');
    rows.forEach((r,i)=>{const y=T+i*30,active=r.id===selected.adult,maxName=W<450?17:23,name=r.name.length>maxName?r.name.slice(0,maxName-1)+'…':r.name;svg+=`<g class="story-bar" data-story-country="${r.id}" data-story-question="adult" role="button" tabindex="0" aria-pressed="${active}" aria-label="${esc(pointLabel(r,'adult'))}"><title>${esc(pointLabel(r,'adult'))}</title><rect x="0" y="${y-4}" width="${W}" height="29" fill="${active?'#eaf0e6':'transparent'}"/><rect x="${L}" y="${y+2}" width="${r.y/100*pw}" height="13" fill="${active?'#203f3b':'#b74d34'}"/>${text(L-8,y+13,name,'text-anchor="end" pointer-events="none"')}${text(L+r.y/100*pw+5,y+13,f(r.y,1),'pointer-events="none"')}${text(W-7,y+13,f(r.x),'text-anchor="end" pointer-events="none"')}</g>`;});
    target.innerHTML=svg+'</svg>';
  }
  function renderMatrix(result){
    const rows=matrixRows(result,{sort:options.sort,search:$('matrix-search').value,onlyMatches:$('matrix-matches').checked});
    const max=Math.max(12,Math.ceil(Math.max(...result.rows.map(r=>r.x))/2)*2);
    const heat=(value,domain)=>value===null?'#f0f0eb':`rgba(56,125,112,${.08+.4*Math.min(1,value/domain)})`;
    $('matrix-count').textContent=`${rows.length} shown · ${result.featured.length} above both cutoffs · ${result.rows.length} ${options.basis==='notebook'?'saved matches in the original result':'eligible API countries'}`;
    $('matrix-sort').value=options.sort;
    $('story-noSchool-chart').innerHTML=`<div class="matrix-scroll" tabindex="0" role="region" aria-label="Country-by-indicator heatmap, scroll to inspect all countries"><table class="heatmap"><caption class="sr-only">Education spending, no schooling and adult literacy for ${rows.length} countries. Values are percentages; each column has its own color scale.</caption><thead><tr><th scope="col">Country</th><th scope="col">Spending<br><small>% GDP</small></th><th scope="col">No school<br><small>% ages 15+</small></th><th scope="col">Adult literacy<br><small>% ages 15+</small></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr class="${r.id===selected.noSchool?'selected':''}"><td><button type="button" data-story-country="${r.id}" data-story-question="noSchool" aria-pressed="${r.id===selected.noSchool}">${esc(r.name)}</button><small>${r.id}${r.qualifies?'':' · Below cutoff'}</small></td><td style="background:${heat(r.x,max)}">${f(r.x)}</td><td style="background:${heat(r.y,100)}">${f(r.y)}</td><td style="background:${heat(r.adult,100)}">${f(r.adult)}</td></tr>`).join(''):'<tr><td colspan="4">No countries match these cutoffs and search. Show all rows or change a cutoff.</td></tr>'}</tbody></table></div>`;
    $('matrix-legend').textContent=`Light → dark = lower → higher within each column. Scales: spending 0–${max}% GDP; no schooling 0–100%; adult literacy 0–100%. Values are printed in every cell. ${options.basis==='notebook'?'Only the notebook’s 35 original matches are available.':'Missing adult-literacy context is shown as —.'}`;
  }
  function select(q,id,keyboard=false){
    const matrixScroll=$('story-noSchool-chart').querySelector('.matrix-scroll')?.scrollTop??0;
    selected[q]=id;render();
    const matrix=$('story-noSchool-chart').querySelector('.matrix-scroll');if(matrix)matrix.scrollTop=matrixScroll;
    if(keyboard)document.querySelector(`[data-story-question="${q}"][data-story-country="${id}"]`)?.focus({preventScroll:true});
  }
  document.querySelectorAll('[data-basis]').forEach(button=>button.addEventListener('click',()=>{options.basis=button.dataset.basis;$('youth-full-scale').checked=options.basis==='api';persist();render();}));
  document.querySelectorAll('.story-chapter').forEach(chapter=>{
    const choose=e=>{const point=e.target.closest('[data-story-country]');if(!point)return;if(e.type==='keydown'&&(!['Enter',' '].includes(e.key)||point.tagName==='BUTTON'))return;e.preventDefault();select(point.dataset.storyQuestion,point.dataset.storyCountry,e.type==='keydown'||point.tagName==='BUTTON');};
    chapter.addEventListener('click',choose);chapter.addEventListener('keydown',choose);
  });
  for(const id of ['story-spending','story-schooling'])$(id).addEventListener('input',()=>{options.spending=Number($('story-spending').value);options.noSchool=Number($('story-schooling').value);persist();render();});
  $('matrix-sort').addEventListener('change',()=>{options.sort=$('matrix-sort').value;persist();renderMatrix(results.noSchool);});
  $('matrix-search').addEventListener('input',()=>renderMatrix(results.noSchool));$('matrix-matches').addEventListener('change',()=>renderMatrix(results.noSchool));
  $('adult-sort').addEventListener('change',()=>renderBars(results.adult));$('youth-full-scale').addEventListener('change',()=>renderScatter(results.youth));
  document.querySelectorAll('[data-investigate],[data-follow]').forEach(button=>button.addEventListener('click',()=>{const q=button.dataset.investigate??button.dataset.follow;onInspect(q,selected[q],options,Boolean(button.dataset.follow));}));
  document.querySelectorAll('[data-story-csv]').forEach(button=>button.addEventListener('click',()=>{const q=button.dataset.storyCsv,result=results[q];if(options.basis==='notebook'){const rows=notebook.tables[q],columns=Object.keys(rows[0]);download(`notebook-${q}-original.csv`,savedRowsCSV(columns,rows.map(r=>columns.map(c=>r[c]))));}else{const rows=q==='noSchool'?result.rows:result.featured;download(`api-${q}-story.csv`,savedRowsCSV(['country','iso3','spending_pct_GDP','outcome_pct','matched_years','adult_literacy_context','adult_context_years','retrieved_at'],rows.map(r=>[r.name,r.id,r.x,r.y,r.years.join(';'),r.adult,r.adultYears.join(';'),getData().retrievedAt])));}}));
  $('youth-full-scale').checked=options.basis==='api';
  return {render,restore(){options=readStoryOptions(location.search);$('youth-full-scale').checked=options.basis==='api';render();}};
}
