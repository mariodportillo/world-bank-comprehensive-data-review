import {QUESTIONS} from './analysis.mjs';
import {storyResult} from './notebook-model.mjs';

export const MAP_COLORS=['#dcebe2','#afd1bf','#79b098','#468a72','#205b4d'];
export const WORLD_VIEW=[0,0,1000,520];

export function readMapOptions(search,data) {
  const p=new URLSearchParams(search);
  const question=Object.hasOwn(QUESTIONS,p.get('mapQuestion'))?p.get('mapQuestion'):'noSchool';
  return {question,metric:['outcome','spending','adult'].includes(p.get('mapMetric'))&&(p.get('mapMetric')!=='adult'||question==='noSchool')?p.get('mapMetric'):'outcome',
    region:data.countries.some(c=>c.regionId===p.get('mapRegion'))?p.get('mapRegion'):'all',
    country:data.countries.some(c=>c.id===p.get('mapCountry'))?p.get('mapCountry'):null,
    onlyMatches:p.get('mapMatches')!=='false'};
}

export function mapColor(value,metric='outcome') {
  if(typeof value!=='number'||!Number.isFinite(value))return null;
  return MAP_COLORS[Math.max(0,Math.min(4,Math.floor(value/(metric==='spending'?2:20))))];
}

export function mapData(data,notebook,storyOptions,mapOptions) {
  const result=storyResult(data,notebook,mapOptions.question,storyOptions);
  const countries=new Map(data.countries.map(c=>[c.id,c]));
  const rows=result.rows.filter(r=>mapOptions.region==='all'||countries.get(r.id)?.regionId===mapOptions.region).map(r=>{
    const value=mapOptions.metric==='spending'?r.x:mapOptions.metric==='adult'?r.adult:r.y;
    const state=mapOptions.question==='noSchool'&&mapOptions.onlyMatches&&!r.qualifies?'below':mapColor(value,mapOptions.metric)===null?'missing':'value';
    return {...r,value,state,region:countries.get(r.id)?.region.trim()??'Region unavailable'};
  });
  return {...result,rows,total:result.rows.length,colored:rows.filter(r=>r.state==='value'),missing:rows.filter(r=>r.state==='missing'),below:rows.filter(r=>r.state==='below')};
}

/** Clamp pan/zoom to the canvas, preserving its aspect ratio and a maximum 8× zoom. */
export function clampMapView([x,y,width]) {
  const w=Math.max(125,Math.min(1000,Number.isFinite(width)?width:1000)),h=w*.52;
  return [Math.max(0,Math.min(1000-w,Number.isFinite(x)?x:0)),Math.max(0,Math.min(520-h,Number.isFinite(y)?y:0)),w,h];
}
export function zoomMapView(view,factor) {
  const width=Math.max(125,Math.min(1000,view[2]/factor));
  return clampMapView([view[0]+(view[2]-width)/2,view[1]+(view[3]-width*.52)/2,width]);
}
export function countryMapView(world,id) {
  const feature=world.features.find(f=>f.id===id),point=world.locators.find(p=>p.id===id);
  const b=feature?.focusBounds??(point?[point.point[0]-10,point.point[1]-10,point.point[0]+10,point.point[1]+10]:null);
  if(!b)return [...WORLD_VIEW];
  const width=Math.max(125,(b[2]-b[0])*1.35,(b[3]-b[1])*1.35/.52);
  return clampMapView([(b[0]+b[2]-width)/2,(b[1]+b[3]-width*.52)/2,width]);
}

export function locatedMapRows(world,rows) {
  const polygonIds=new Set(world.features.map(f=>f.id).filter(Boolean)),pointIds=new Set(world.locators.map(p=>p.id));
  return {polygons:rows.filter(r=>polygonIds.has(r.id)),points:rows.filter(r=>!polygonIds.has(r.id)&&pointIds.has(r.id)),
    unlocated:rows.filter(r=>!polygonIds.has(r.id)&&!pointIds.has(r.id))};
}
