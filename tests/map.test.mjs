import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAP_COLORS,WORLD_VIEW,mapColor,mapData,readMapOptions,clampMapView,zoomMapView,countryMapView,locatedMapRows} from '../web/map-model.mjs';
const read=name=>JSON.parse(readFileSync(new URL(`../web/data/${name}.json`,import.meta.url)));
const data=read('research'),notebook=read('notebook-findings'),world=read('world-map');
const story={basis:'notebook',spending:4,noSchool:10};
const defaults={question:'noSchool',metric:'outcome',region:'all',onlyMatches:true};
test('the map locates all saved notebook countries, including the three omitted small-country polygons',()=>{
 const ids=new Set([...world.features.map(f=>f.id),...world.locators.map(p=>p.id)]);
 for(const q of ['youth','adult','noSchool'])for(const row of notebook.tables[q])assert.ok(ids.has(row.country_code),row.country_code);
 const r=mapData(data,notebook,story,defaults),located=locatedMapRows(world,r.colored);
 assert.equal(r.rows.length,35);assert.equal(r.colored.length,35);assert.equal(located.unlocated.length,0);
 assert.deepEqual(located.points.map(r=>r.id).sort(),['MDV','MLT']);assert.equal(located.polygons.length,33);
 const youth=mapData(data,notebook,story,{...defaults,question:'youth'});assert.deepEqual(locatedMapRows(world,youth.colored).points.map(r=>r.id),['BRB']);
});
test('map joins use country codes and preserve the exact notebook measures',()=>{
 const r=mapData(data,notebook,story,defaults),yemen=r.rows.find(r=>r.id==='YEM');
 assert.equal(yemen.value,82.22);assert.equal(yemen.x,8.01);assert.equal(yemen.adult,45.59);
 const spend=mapData(data,notebook,story,{...defaults,metric:'spending'});
 assert.equal(spend.rows.find(r=>r.id==='YEM').value,8.01);
 const adult=mapData(data,notebook,story,{...defaults,metric:'adult'});
 assert.equal(adult.rows.find(r=>r.id==='YEM').value,45.59);
});
test('missing values and outside-result countries are never colored as a reported zero',()=>{
 assert.equal(mapColor(0),MAP_COLORS[0]);assert.equal(mapColor(null),null);assert.equal(mapColor(undefined),null);assert.equal(mapColor(NaN),null);
 assert.equal(mapColor(100),MAP_COLORS[4]);assert.equal(mapColor(0,'spending'),MAP_COLORS[0]);assert.equal(mapColor(8,'spending'),MAP_COLORS[4]);
 const r=mapData(data,notebook,story,defaults);assert.ok(!r.rows.some(r=>r.id==='USA'));
 const d=structuredClone(data);d.metrics.adult.rows=[];
 const context=mapData(d,notebook,{...story,basis:'api'},{...defaults,metric:'adult',onlyMatches:false});
 assert.ok(context.rows.length>0);assert.equal(context.colored.length,0);assert.ok(context.rows.every(r=>r.state==='missing'&&r.value===null));
});
test('regions filter the same saved result; thresholds mute rather than invent missing countries',()=>{
 const r=mapData(data,notebook,{...story,spending:4.5},defaults);
 assert.equal(r.rows.length,35);assert.equal(r.colored.length,26);assert.equal(r.below.length,9);
 const all=mapData(data,notebook,{...story,spending:4.5},{...defaults,onlyMatches:false});assert.equal(all.colored.length,35);
 const africa=mapData(data,notebook,story,{...defaults,region:'SSF'});
 assert.ok(africa.rows.length>0);assert.ok(africa.rows.every(r=>data.countries.find(c=>c.id===r.id).regionId==='SSF'));
});
test('switching source changes map membership and matches the story analysis',()=>{
 const api=mapData(data,notebook,{...story,basis:'api'},defaults);
 assert.equal(api.rows.length,124);assert.equal(api.colored.length,21);
 const youth=mapData(data,notebook,story,{...defaults,question:'youth'});assert.equal(youth.rows.length,5);assert.equal(youth.rows[0].id,'UZB');
 const apiYouth=mapData(data,notebook,{...story,basis:'api'},{...defaults,question:'youth'});assert.equal(apiYouth.rows.length,147);
});
test('map URL settings reject unknown codes, invalid measures and non-existent regions',()=>{
 assert.deepEqual(readMapOptions('',data),{...defaults,country:null});assert.equal(readMapOptions('?mapQuestion=__proto__',data).question,'noSchool');
 const p=readMapOptions('?mapQuestion=youth&mapMetric=adult&mapRegion=bad&mapCountry=ZZZ&mapMatches=false',data);
 assert.equal(p.question,'youth');assert.equal(p.metric,'outcome');assert.equal(p.region,'all');assert.equal(p.country,null);assert.equal(p.onlyMatches,false);
 const good=readMapOptions('?mapQuestion=noSchool&mapMetric=spending&mapRegion=SSF&mapCountry=SWZ',data);assert.equal(good.country,'SWZ');assert.equal(good.region,'SSF');
});
test('pan and zoom remain inside the canvas and honor the 1–8× zoom bounds',()=>{
 assert.deepEqual(zoomMapView(WORLD_VIEW,.1),WORLD_VIEW);
 const close=zoomMapView(WORLD_VIEW,100);assert.equal(close[2],125);assert.equal(close[3],65);
 assert.deepEqual(clampMapView([-20,999,200]),[0,416,200,104]);
 assert.deepEqual(clampMapView([NaN,NaN,NaN]),WORLD_VIEW);
 for(const id of ['USA','YEM','BRB','MDV','MLT','FJI','FRA','NOR','XKX']){
   const [x,y,w,h]=countryMapView(world,id);assert.ok(w>=125&&w<=1000);assert.ok(x>=0&&x+w<=1000);assert.ok(y>=0&&y+h<=520);
 }
 assert.deepEqual(countryMapView(world,'INVALID'),WORLD_VIEW);
});
test('the prepared basemap has finite projected geometry, stable country identifiers and source attribution',()=>{
 assert.equal(world.projection,'Equal Earth');assert.equal(world.features.length,176);assert.ok(world.sourceCommit.length===40);
 assert.equal(new Set(world.features.map(f=>f.key)).size,world.features.length);
 assert.ok(!world.features.some(f=>f.key==='ATA'));
 for(const feature of world.features){assert.match(feature.path,/^M/);assert.doesNotMatch(feature.path,/NaN|Infinity/);for(const n of [...feature.point,...feature.bounds,...feature.focusBounds])assert.ok(Number.isFinite(n));}
 const known=new Set(data.countries.map(c=>c.id));for(const p of world.locators){assert.ok(known.has(p.id));assert.ok(!world.features.some(f=>f.id===p.id));assert.ok(p.point.every(Number.isFinite));}
 assert.equal(world.features.find(f=>f.key==='FRA').id,'FRA');assert.equal(world.features.find(f=>f.key==='NOR').id,'NOR');assert.equal(world.features.find(f=>f.key==='KOS').id,'XKX');
 assert.ok(world.sources.boundaries.includes(world.sourceCommit));assert.ok(world.sources.locations.startsWith('https://api.worldbank.org/'));
});
