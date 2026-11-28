import {savedRowsCSV} from './notebook-model.mjs';
const $=id=>document.getElementById(id);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createArchive(archive){
  const categories=['Main findings','Supporting analysis','Data audit & discovery'];
  $('archive-output').innerHTML=categories.map(category=>`<optgroup label="${category}">${archive.outputs.filter(t=>t.category===category).map(t=>`<option value="${t.id}">${escape(t.title)} · ${t.rows.length} rows</option>`).join('')}</optgroup>`).join('');
  function render(){
    const table=archive.outputs.find(t=>t.id===$('archive-output').value),search=$('archive-search').value.trim().toLowerCase();
    const rows=table.rows.filter(row=>row.some(v=>String(v).toLowerCase().includes(search)));
    $('archive-scope').textContent=`Notebook cell ${table.cell} · ${rows.length} shown of ${table.rows.length} saved rows. ${table.limited?'The original query has a LIMIT clause; inspect its SQL for scope.':'All saved output rows are included.'} ${table.rows.length===0?'A zero-row duplicate-key check means no duplicate groups were returned.':''} Original extraction date unknown.`;
    $('archive-table').innerHTML=`<table><caption class="sr-only">${escape(table.title)}</caption><thead><tr>${table.columns.map(c=>`<th scope="col">${escape(c)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${table.columns.length}">${table.rows.length?'No saved rows match this search.':'The saved query returned zero rows.'}</td></tr>`}</tbody></table>`;
    $('archive-sql').textContent=table.sql||'No SQL literal was available in this saved cell.';
  }
  $('archive-output').addEventListener('change',()=>{$('archive-search').value='';render();});$('archive-search').addEventListener('input',render);
  $('archive-download').addEventListener('click',()=>{const table=archive.outputs.find(t=>t.id===$('archive-output').value);const url=URL.createObjectURL(new Blob([savedRowsCSV(table.columns,table.rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`notebook-${table.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  render();
}
