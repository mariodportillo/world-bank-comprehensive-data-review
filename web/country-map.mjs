import {MAP_COLORS,WORLD_VIEW,readMapOptions,mapColor,mapData,locatedMapRows,clampMapView,zoomMapView,countryMapView} from './map-model.mjs';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=(v,n=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const outcomeNames={youth:'Youth literacy',adult:'Adult literacy',noSchool:'No schooling'};

export function createCountryMap({world,getData,getOptions,notebook,onSelect,onInspect,onThresholds}) {
  let state=readMapOptions(location.search,getData()),view=[...WORLD_VIEW],context,selection,rowsById=new Map(),drag=null,suppressClick=false;
  const countryById=new Map(getData().countries.map(c=>[c.id,c]));
  const host=$('country-map');
  const regions=[...new Map(getData().countries.map(c=>[c.regionId,c.region.trim()])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  $('map-region').insertAdjacentHTML('beforeend',regions.map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join(''));
  function persist(){
    const url=new URL(location.href);
    for(const [key,value] of Object.entries({mapQuestion:state.question,mapMetric:state.metric,mapRegion:state.region,mapCountry:state.country??'',mapMatches:state.onlyMatches}))url.searchParams.set(key,value);
    history.replaceState(null,'',url);
  }
  function metricName(){return state.metric==='spending'?'Education spending':state.metric==='adult'?'Adult literacy context':outcomeNames[state.question];}
  function unit(){return state.metric==='spending'?'% GDP':state.question==='youth'&&state.metric==='outcome'?'% ages 15–24':'% ages 15+';}
  function readout(r){
    return `${r.name} · ${metricName()} ${f(r.value)} ${unit()} · ${r.state==='below'?'Below at least one cutoff · ':r.state==='missing'?'No value for this measure · ':''}${getOptions().basis==='notebook'?'Saved notebook averages; reporting years unavailable':state.metric==='adult'?`${r.adultYears.length} context ${r.adultYears.length===1?'year':'years'}: ${r.adultYears.join(', ')||'none reported'}`:`${r.n} matched ${r.n===1?'year':'years'}: ${r.years.join(', ')}`}`;
  }
  function rowFill(r){return !r?'#dce0d8':r.state==='below'?'#f1e3d5':r.state==='missing'?'url(#map-missing-pattern)':mapColor(r.value,state.metric);}
  function render(){
    const options=getOptions(),data=getData();
    if(state.question!=='noSchool'&&state.metric==='adult')state.metric='outcome';
    context=mapData(data,notebook,options,state);rowsById=new Map(context.rows.map(r=>[r.id,r]));
    const selectedId=selection?.[state.question]??state.country;
    state.country=selectedId??null;
    $('map-question').value=state.question;$('map-region').value=state.region;$('map-matches').checked=state.onlyMatches;
    $('map-metric').innerHTML=`<option value="outcome">${outcomeNames[state.question]} (${state.question==='youth'?'% ages 15–24':'% ages 15+'})</option><option value="spending">Education spending (% GDP)</option>${state.question==='noSchool'?'<option value="adult">Adult literacy context (% ages 15+)</option>':''}`;
    $('map-metric').value=state.metric;
    $('map-threshold-controls').hidden=state.question!=='noSchool';
    $('map-spending').value=options.spending;$('map-schooling').value=options.noSchool;
    $('map-spending-value').textContent=f(options.spending,options.spending%1?1:0);$('map-schooling-value').textContent=f(options.noSchool,0);
    $('map-source').textContent=options.basis==='notebook'?`Original notebook · ${context.total} saved countries in this result · Full reporting-year ranges unavailable`:`API comparison · ${context.total} eligible countries · Same-year pairs in 2000–2025 · Extract ${data.retrievedAt.slice(0,10)}`;
    const base=world.features.map(feature=>{
      const row=rowsById.get(feature.id),active=row&&row.id===selectedId;
      const description=row?readout(row):`${feature.name} · Outside this result or selected region; no value is assigned.`;
      return `<path d="${feature.path}" fill="${rowFill(row)}" fill-rule="evenodd" class="map-country-shape ${row?'map-interactive':''} ${active?'map-selected':''}" ${row?`data-map-country="${row.id}" role="button" tabindex="0" aria-pressed="${Boolean(active)}" aria-label="${esc(description)}"`:''}><title>${esc(description)}</title></path>`;
    }).join('');
    const markers=world.locators.filter(p=>rowsById.has(p.id)).map(point=>{
      const row=rowsById.get(point.id),active=row.id===selectedId,description=`${readout(row)} · Capital locator: ${point.capital||point.name}`;
      return `<g class="map-interactive" data-map-country="${row.id}" role="button" tabindex="0" aria-pressed="${active}" aria-label="${esc(description)}"><title>${esc(description)}</title><circle data-marker-hit cx="${point.point[0]}" cy="${point.point[1]}" r="12" fill="transparent"/><circle data-map-marker class="map-marker ${active?'map-marker-selected':''}" cx="${point.point[0]}" cy="${point.point[1]}" r="${active?7:5}" fill="${rowFill(row)}"/></g>`;
    }).join('');
    const selectedRow=rowsById.get(selectedId),selectedLocation=world.features.find(p=>p.id===selectedId)??world.locators.find(p=>p.id===selectedId);
    const label=selectedRow&&selectedLocation?`<text x="${selectedLocation.point[0]}" y="${selectedLocation.point[1]-10/(1000/view[2])}" data-map-label fill="#203f3b" stroke="#fcfcf8" stroke-width="3" paint-order="stroke" text-anchor="middle" font-size="${13/(1000/view[2])}" font-family="DM Sans,system-ui,sans-serif" font-weight="700" pointer-events="none">${selectedId}</text>`:'';
    host.innerHTML=`<svg viewBox="${view.join(' ')}" role="group" aria-label="Interactive Equal Earth world map. Colors show ${esc(metricName().toLowerCase())}. Gray means outside the selected result or region. Use country buttons or the country finder; navigation buttons zoom and pan."><defs><pattern id="map-missing-pattern" patternUnits="userSpaceOnUse" width="5" height="5"><rect width="5" height="5" fill="#f8faf5"/><path d="M0 5L5 0" stroke="#acb9ae" stroke-width="1"/></pattern></defs><rect class="map-ocean" x="0" y="0" width="1000" height="520"/>${base}${markers}${label}</svg>`;
    updateView();renderLegend();renderCountries();renderDetail();
    const located=locatedMapRows(world,context.colored);
    $('map-coverage').textContent=`${context.colored.length} colored countries in this region/result: ${located.polygons.length} outlines and ${located.points.length} capital ${located.points.length===1?'locator':'locators'}.${context.missing.length?` ${context.missing.length} lack this measure.`:''}${context.below.length?` ${context.below.length} are muted below a cutoff.`:''}${located.unlocated.length?` ${located.unlocated.length} have no map location and remain available in the country finder.`:''}`;
    $('map-scope-note').textContent=options.basis==='notebook'?`This map contains the notebook’s saved ${state.question==='youth'?'five youth-literacy leaders':state.question==='adult'?'ten lowest adult-literacy results':'35 original spending/no-schooling matches'}. Gray countries are outside this result or region, not zero. The full 192/194-group correlation inputs were not saved. ${state.question==='noSchool'?'Lowering cutoffs cannot add countries omitted from the original query; experiments use rounded saved averages.':''}`:`Only countries with a spending–${outcomeNames[state.question].toLowerCase()} same-year pair in 2000–2025 are included. Color compares their country averages; reporting years can differ between countries. ${state.question==='noSchool'?'No-schooling observations end in 2010; adult literacy is optional context from those matched years.':''} Gray countries have no row in this comparison or are outside the selected region.`;
    $('map-hover').textContent=selectedRow?readout(selectedRow):'Select a colored country or use the country finder. Drag the map to pan after zooming.';
  }
  function renderLegend(){
    const breaks=state.metric==='spending'?[0,2,4,6,8]:[0,20,40,60,80];
    $('map-legend').innerHTML=`<span class="map-legend-title">${metricName()} (${unit()}) · Higher values are darker</span>${breaks.map((n,i)=>`<span><i style="background:${MAP_COLORS[i]}"></i>${n}${i===4?(state.metric==='spending'?'+':'–100'):`–<${breaks[i+1]}`}</span>`).join('')}<span><i class="map-neutral"></i>Outside result / region</span>${state.question==='noSchool'&&state.onlyMatches?'<span><i class="map-below"></i>Below cutoff</span>':''}${state.metric==='adult'?'<span><i class="map-missing"></i>No value reported</span>':''}`;
  }
  function renderCountries(){
    const search=$('map-search').value.trim().toLowerCase();
    const rows=context.rows.filter(r=>`${r.name} ${r.id}`.toLowerCase().includes(search)).sort((a,b)=>a.name.localeCompare(b.name));
    $('map-country').innerHTML=`<option value="">${rows.length?'Choose a country…':'No countries in this search / region'}</option>`+rows.map(r=>`<option value="${r.id}">${esc(r.name)} · ${f(r.value)}${r.state==='below'?' · Below cutoff':''}</option>`).join('');
    $('map-country').value=rows.some(r=>r.id===state.country)?state.country:'';
  }
  function renderDetail(){
    const row=rowsById.get(state.country),located=locatedMapRows(world,row?[row]:[]);
    $('map-focus').disabled=!row||Boolean(located.unlocated.length);$('map-history').disabled=!row;
    if(!row){$('map-country-detail').innerHTML='<p class="empty">Choose a country in this result and region to inspect its values.</p>';return;}
    const scope=getOptions().basis==='notebook'?'Saved notebook averages. Reporting-year ranges were not saved.':`Matched reporting years: ${row.years.join(', ')}. Values average the same years for spending and the outcome.`;
    $('map-country-detail').innerHTML=`<p class="eyebrow">Selected country / ${row.id}</p><h3>${esc(row.name)}</h3><p class="map-selection-region">${esc(row.region)}</p><p class="map-value-label">${metricName()}</p><p class="map-value-number">${f(row.value)} <small>${unit()}</small></p><div class="country-values"><div><span>${f(row.x)}</span><small>Education spending<br>% of GDP</small></div><div><span>${f(row.y)}</span><small>${outcomeNames[state.question]}<br>${state.question==='youth'?'% ages 15–24':'% ages 15+'}</small></div></div>${state.question==='noSchool'?`<p class="chart-note">Adult literacy context: ${f(row.adult)}%${getOptions().basis==='api'&&row.adultYears.length?` · ${row.adultYears.join(', ')}`:''}. ${row.qualifies?'Above both current cutoffs.':'Below at least one current cutoff.'}</p>`:''}<p class="chart-note">${esc(scope)}</p>${located.points.length?'<p class="chart-note">Circle position: World Bank capital coordinates. The country’s outline is absent at this map scale.</p>':''}${located.unlocated.length?'<p class="chart-note map-unlocated">No location available in this basemap. Country values remain available here.</p>':''}`;
    $('map-history').textContent=`Compare ${row.name} with API history →`;
  }
  function updateView(){
    const svg=host.querySelector('svg');if(!svg)return;
    svg.setAttribute('viewBox',view.join(' '));
    const zoom=1000/view[2],pixelScale=1000/Math.max(250,host.clientWidth);$('map-zoom').textContent=`${f(zoom,1)}×`;
    document.querySelector('[data-map-action="zoom-in"]').disabled=zoom>=8;
    document.querySelector('[data-map-action="zoom-out"]').disabled=zoom<=1;
    for(const direction of ['north','south','east','west'])document.querySelector(`[data-map-action="${direction}"]`).disabled=zoom<=1;
    for(const circle of svg.querySelectorAll('[data-map-marker]'))circle.setAttribute('r',(circle.classList.contains('map-marker-selected')?7:5)*pixelScale/zoom);
    for(const circle of svg.querySelectorAll('[data-marker-hit]'))circle.setAttribute('r',12*pixelScale/zoom);
    const label=svg.querySelector('[data-map-label]');
    if(label){label.setAttribute('font-size',12*pixelScale/zoom);const point=(world.features.find(p=>p.id===state.country)??world.locators.find(p=>p.id===state.country))?.point;if(point)label.setAttribute('y',point[1]-11*pixelScale/zoom);}
  }
  function choose(id,keyboard=false){if(!rowsById.has(id))return;state.country=id;persist();onSelect(state.question,id);if(keyboard)host.querySelector(`[data-map-country="${id}"]`)?.focus({preventScroll:true});}
  host.addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}const country=event.target.closest('[data-map-country]');if(country)choose(country.dataset.mapCountry);});
  host.addEventListener('keydown',event=>{const country=event.target.closest('[data-map-country]');if(country&&['Enter',' '].includes(event.key)){event.preventDefault();choose(country.dataset.mapCountry,true);}});
  for(const type of ['pointerover','focusin'])host.addEventListener(type,event=>{const country=event.target.closest('[data-map-country]');const row=country&&rowsById.get(country.dataset.mapCountry);if(row)$('map-hover').textContent=readout(row);});
  host.addEventListener('pointerdown',event=>{if(event.button!==0||1000/view[2]<=1)return;drag={x:event.clientX,y:event.clientY,view:[...view],pointer:event.pointerId,svg:host.querySelector('svg'),moving:false};});
  host.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moving&&Math.hypot(dx,dy)<5)return;
    if(!drag.moving){drag.moving=true;drag.svg.setPointerCapture(event.pointerId);drag.svg.classList.add('is-panning');}
    const rect=drag.svg.getBoundingClientRect();view=clampMapView([drag.view[0]-dx/rect.width*drag.view[2],drag.view[1]-dy/rect.height*drag.view[3],drag.view[2]]);updateView();
  });
  function endDrag(){if(!drag)return;suppressClick=drag.moving;drag.svg.classList.remove('is-panning');if(drag.svg.hasPointerCapture(drag.pointer))drag.svg.releasePointerCapture(drag.pointer);drag=null;}
  host.addEventListener('pointerup',endDrag);host.addEventListener('pointercancel',endDrag);host.addEventListener('pointerleave',()=>{if(drag&&!drag.moving)drag=null;});
  document.querySelectorAll('[data-map-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.mapAction;
    if(action==='reset')view=[...WORLD_VIEW];else if(action==='zoom-in'||action==='zoom-out')view=zoomMapView(view,action==='zoom-in'?1.6:1/1.6);
    else view=clampMapView([view[0]+(action==='east'?1:action==='west'?-1:0)*view[2]*.22,view[1]+(action==='south'?1:action==='north'?-1:0)*view[3]*.22,view[2]]);
    updateView();
  }));
  $('map-question').addEventListener('change',()=>{state.question=$('map-question').value;if(state.question!=='noSchool'&&state.metric==='adult')state.metric='outcome';$('map-search').value='';view=[...WORLD_VIEW];render();persist();});
  $('map-metric').addEventListener('change',()=>{state.metric=$('map-metric').value;persist();render();});
  $('map-region').addEventListener('change',()=>{state.region=$('map-region').value;$('map-search').value='';view=[...WORLD_VIEW];render();persist();});
  $('map-matches').addEventListener('change',()=>{state.onlyMatches=$('map-matches').checked;persist();render();});
  $('map-search').addEventListener('input',renderCountries);$('map-country').addEventListener('change',()=>choose($('map-country').value));
  for(const id of ['map-spending','map-schooling'])$(id).addEventListener('input',()=>onThresholds(Number($('map-spending').value),Number($('map-schooling').value)));
  $('map-focus').addEventListener('click',()=>{view=countryMapView(world,state.country);updateView();});
  $('map-history').addEventListener('click',()=>{if(rowsById.has(state.country))onInspect(state.question,state.country,getOptions(),true);});
  return {render(selected){if(selected)selection=selected;render();},
    selectChapter(question,id){if(state.question!==question){state.question=question;view=[...WORLD_VIEW];if(question!=='noSchool'&&state.metric==='adult')state.metric='outcome';}if(state.region!=='all'&&countryById.get(id)?.regionId!==state.region)state.region='all';state.country=id;persist();},
    initial:state,restore(){state=readMapOptions(location.search,getData());view=[...WORLD_VIEW];return state;}};
}
