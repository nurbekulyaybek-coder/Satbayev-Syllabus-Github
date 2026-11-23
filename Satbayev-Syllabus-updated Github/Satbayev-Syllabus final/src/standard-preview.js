// The editor, downloadable HTML and print/PDF share the approved document layout.
const standardTableOnly=new Set([1,5,6,7,8,9]);
const isFormula=line=>/(?:Баға\s*=|Оценка\s*=|Grade\s*=|Жалпы балл|Общий балл|Total score)/i.test(line);
const isSupplement=line=>/^(?:Примечание|Ескерту|Түсініктеме|Практикада:)/i.test(line);
function standardMeta(key,value=displayMeta(key)) {return `<span data-edit="meta:${key}">${esc(value||'')}</span>`}
function standardBind(el){el.querySelectorAll('[data-edit]').forEach(x=>setEditable(x,x.dataset.edit,true))}
function standardParagraphText(p,text){const match=text.match(/^(Мақсаты:|Міндеті:|Цель:|Задачи:|Objective:)/);if(!match){p.textContent=text;return}const strong=document.createElement('strong');strong.textContent=match[0];p.replaceChildren(strong,document.createTextNode(text.slice(match[0].length)))}
function standardPrintStyle(){let style=document.getElementById('documentPrintStyle');if(!style){style=document.createElement('style');style.id='documentPrintStyle';document.head.append(style)}const cssText=s=>JSON.stringify(s).replace(/</g,'\\3c ').replace(/>/g,'\\3e ');style.textContent=`@page{@top-center{content:${cssText(displayMeta('university'))};font:10pt 'Times New Roman';text-align:center}@bottom-left{content:${cssText(D('footer'))};font:10pt 'Times New Roman'}}@page:first{@top-center{content:none}}`;}
function standardSignatures(){
 const approved=document.createElement('p');approved.innerHTML=esc((S.meta.department?'«'+S.meta.department+'» ':'')+D('approvedMeeting'))+' '+standardMeta('protocol');addBlock(approved);standardBind(approved);
 const block=document.createElement('div');block.className='signatures';block.innerHTML=`<p>${esc(D('head'))} <span>____________ ${standardMeta('head')}</span></p><p>${esc(D('author'))} <span>____________ ${standardMeta('author')}</span></p>`;addBlock(block);standardBind(block);paragraph(D('agreed'));S.meta.agreement.split('\n').forEach((x,i)=>paragraph(x,`agreement:${i}`));
}
newPage=function(isCover=false){
 const wrap=document.createElement('div');wrap.className='sheet-wrap';const sheet=document.createElement('article');sheet.className='sheet standard-sheet'+(isCover?' cover':'');
 if(!isCover){const head=document.createElement('div');head.className='dochead';head.textContent=displayMeta('university');setEditable(head,'meta:university');sheet.append(head)}
 const body=document.createElement('div');body.className='body';sheet.append(body);
 if(!isCover){const foot=document.createElement('div');foot.className='foot';const label=document.createElement('span'),number=document.createElement('span');label.textContent=D('footer');number.textContent=String(pageBodies.length+1);foot.append(label,number);sheet.append(foot)}
 wrap.append(sheet);$('pages').append(wrap);body.style.height=(1122.5197-20*3.7795276-body.offsetTop-4)+'px';pageBodies.push(body);return body;
};
function standardCover(b){
 const m=S.meta,meta=standardMeta;const department=S.lang==='kk'&&!m.department.endsWith('кафедрасы')?m.department+' кафедрасы':m.department;
 b.innerHTML=`<img class="university-logo" alt="Satbayev University" width="458" height="118" src="data:image/png;base64,${EXPORT_TEMPLATE.binary['word/media/image1.png']}"><p class="institute">${meta('institute')}</p><p class="department">${meta('department',department)}</p><div class="approval"><b>${esc(D('approve'))}</b>\n${meta('directorTitle',m.directorTitle||D('director'))}\n____________ ${meta('director')}\n${meta('approvalDate',m.approvalDate?m.approvalDate.split('-').reverse().join('.'):'«___» ___________ '+m.date+D('yearSuffix'))}</div><h1>${esc(D('syllabus'))}</h1><p class="course">${meta('code')} ${meta('course')}</p><p>${meta('program')}</p><p>${esc(D('cycle'))} ${meta('cycle')}, ${meta('credits')} (${meta('distribution')}) ${esc(D('credits'))}</p><p>${meta('studyYear')} ${esc(D('yearOfStudy'))}, ${meta('semester')} ${esc(D('semester'))}</p><p>${meta('year')} ${esc(D('academicYear'))}</p><p class="city">${meta('city')} ${meta('date')}</p>`;standardBind(b);
}
function standardTeachers(){
 const m=S.meta,meta=standardMeta;
 for(const practice of [false,true]){
  const who=practice?'practice':'lecturer',office=practice?'practiceOffice':'office',hours=practice?'practiceHours':'officeHours',email=practice?'practiceEmail':'email';
  const names=String(m[who]||'').split(/\\n+/).map(x=>x.trim()).filter(Boolean),offices=String(m[office]??(practice?m.office:'')).split(/\\n+/),times=String(m[hours]??(practice?m.officeHours:'')).split(/\\n+/),emails=String(m[email]??(practice?(m.practice===m.lecturer?m.email:''):m.email)).split(/\\n+/);
  names.forEach((name,i)=>{const block=document.createElement('div');block.className='teacher-block';const suffix=names.length>1?' '+(i+1):'';block.innerHTML='<p><b>'+(practice?'1.2':'1.1')+suffix+' '+esc(D(who))+':</b>'+(practice?'<br>':' ')+meta(who,name)+'</p><div class="teacher-contacts"><div>'+(S.lang==='kk'?'кеңсе: кабинет ':esc(D('office'))+': ')+meta(office,(offices[i]||offices[0]||'').trim())+'</div><div>'+(S.lang==='kk'?'Офис-сағаты: ':esc(D('hours'))+': ')+meta(hours,(times[i]||times[0]||'').trim())+'<br>e-mail: '+meta(email,(emails[i]||emails[0]||'').trim())+'</div></div>';addBlock(block);standardBind(block)})
 }
 const p=document.createElement('p');p.className='study-mode';p.innerHTML=standardMeta('studyMode',m.studyMode||({kk:'Оқу түрі - күндізгі',ru:'Форма обучения — очная',en:'Mode of study — full-time'}[S.lang]));addBlock(p);standardBind(p);
}
function standardTable(rows,n,keys=null){
 const templateIndex={1:2,5:3,6:4,7:5,8:6,9:7,10:8}[n];
 let table=document.createElement('table');table.className='standard-table table-'+n;
 if(templateIndex!==undefined){const xml=new DOMParser().parseFromString(EXPORT_TEMPLATE.tables[templateIndex],'application/xml');const widths=Array.from(xml.getElementsByTagNameNS('*','gridCol')).map(x=>Number(x.getAttribute('w:w')));if(n===7)widths.pop();const sum=widths.reduce((a,b)=>a+b,0);const cols=document.createElement('colgroup');widths.forEach(w=>{const c=document.createElement('col');c.style.width=w/sum*100+'%';cols.append(c)});table.append(cols)}
 const head=table.createTHead(),body=table.createTBody();
 const fill=(cell,value,key)=>{cell.textContent=value;if(n===5&&(/аралық аттеста|аралық бақылау|interim assessment|interim assessments|промежуточн.*аттестаци|қорытынды емтихан|итоговый экзамен|final examination/i.test(value)))cell.style.fontWeight='bold';if(key)setEditable(cell,key,!/^table:\d+:0:/.test(key))};
 if(n===7){const row=head.insertRow();let c=document.createElement('th');c.rowSpan=2;fill(c,rows[0][0],'table:7:0:0');row.append(c);c=document.createElement('th');c.colSpan=rows[0].length-1;c.textContent={kk:'Құзыреттілік',ru:'Компетенции',en:'Competencies'}[S.lang];row.append(c)}
 rows.forEach((r,i)=>{const header=i===0&&n!==1, tr=(header?head:body).insertRow();r.forEach((value,j)=>{if(n===7&&i===0&&j===0)return;const c=document.createElement(header?'th':'td');fill(c,value,keys?.[i]?.[j]||(rows===S.tables[n]?`table:${n}:${i}:${j}`:''));tr.append(c)})});
 standardPlaceTable(table);
 if(n===9)document.querySelectorAll('.table-9').forEach(part=>{const rs=Array.from(part.tBodies[0].rows);for(let i=0;i<rs.length;){const value=rs[i].cells[4]?.textContent;let end=i+1;while(value&&end<rs.length&&rs[end].cells[4]?.textContent===value)end++;if(end-i>1){rs[i].cells[4].rowSpan=end-i;for(let j=i+1;j<end;j++)rs[j].cells[4].remove()}i=end}});
}
function standardPlaceTable(table){
 let b=pageBodies.at(-1);b.append(table);if(!overflow(b))return;
 // Keep compact tables intact; large tables repeat their headers on continuation pages.
 const measuredHeight=table.offsetHeight;table.remove();const emptyHeight=b.clientHeight;
 if(measuredHeight<emptyHeight){const heading=b.lastElementChild?.tagName==='H2'?b.lastElementChild:null;heading?.remove();b=newPage();if(heading)b.append(heading);b.append(table);if(!overflow(b))return;table.remove()}
 const rows=Array.from(table.tBodies[0].rows);const original=table;let next=()=>{const t=original.cloneNode(true);t.tBodies[0].replaceChildren();pageBodies.at(-1).append(t);return t};table=next();
 for(const row of rows){
  table.tBodies[0].append(row);if(!overflow(pageBodies.at(-1)))continue;
  if(table.tBodies[0].rows.length>1){row.remove();newPage();table=next();table.tBodies[0].append(row)}
  if(!overflow(pageBodies.at(-1)))continue;
  // A single very long user-entered cell may exceed a sheet. Preserve all text
  // and its edit key across continuations, instead of clipping the remainder.
  row.remove();const source=Array.from(row.cells),remaining=source.map(c=>c.textContent);let guard=0;
  while(remaining.some(Boolean)&&guard++<1000){
   const part=table.tBodies[0].insertRow(),cells=source.map(()=>part.insertCell());let lo=0,hi=Math.max(...remaining.map(s=>s.length));
   while(lo<hi){const mid=Math.ceil((lo+hi)/2);cells.forEach((c,j)=>c.textContent=remaining[j].slice(0,mid));if(overflow(pageBodies.at(-1)))hi=mid-1;else lo=mid}
   if(!lo){part.remove();newPage();table=next();continue}
   cells.forEach((c,j)=>{let cut=Math.min(lo,remaining[j].length);if(cut<remaining[j].length){const space=remaining[j].lastIndexOf(' ',cut);if(space>cut*.65)cut=space+1}c.textContent=remaining[j].slice(0,cut);remaining[j]=remaining[j].slice(cut);if(source[j].dataset.edit)setEditable(c,source[j].dataset.edit,true)});
   if(remaining.some(Boolean)){newPage();table=next()}
  }
 }
}
function standardScores(){
 const rows=S.tables[8],t=document.createElement('table');t.className='standard-table score-matrix';const cols=document.createElement('colgroup');[4.5,18,9.5,...Array(15).fill(3.75),11.75].forEach(w=>{const col=document.createElement('col');col.style.width=w+'%';cols.append(col)});t.append(cols);const head=t.createTHead(),r=head.insertRow();
 [rows[0][0],rows[0][1],rows[0][2],{kk:'Апта',ru:'Недели',en:'Weeks'}[S.lang],rows[0][19]].forEach((v,i)=>{const c=document.createElement('th');c.textContent=v;if(i===3)c.colSpan=15;else c.rowSpan=2;r.append(c)});const weeks=head.insertRow();for(let i=1;i<=15;i++){const c=document.createElement('th');c.textContent=i;weeks.append(c)}
 const body=t.createTBody(),regular=[],exam=[];
 rows.slice(1).forEach((row,i)=>{const weekly=row.slice(3,18).reduce((a,x)=>a+Number(x||0),0);if(weekly||!Number(row[18]))regular.push(i+1);if(Number(row[18]))exam.push(i+1)});
 for(const [group,indices] of [['weekly',regular],['exam',exam]])indices.forEach((ri,k)=>{const row=rows[ri],tr=body.insertRow();for(let j=0;j<18;j++){const cell=tr.insertCell();cell.textContent=group==='exam'&&j>=3?'':row[j];if(group==='exam'&&j>=3){if(j===3){cell.colSpan=15}else cell.remove()}else setEditable(cell,`table:8:${ri}:${j}`,true)}if(k===0){const c=tr.insertCell();c.rowSpan=indices.length;c.dataset.scoreGroup=group;c.textContent=String(indices.reduce((a,i)=>a+(group==='exam'?Number(rows[i][18]):rows[i].slice(3,18).reduce((s,x)=>s+Number(x||0),0)),0))}});
 const total=body.insertRow();total.className='standard-total';const label=total.insertCell();label.colSpan=18;label.textContent=D('total');const sum=total.insertCell();sum.dataset.scoreGroup='total';sum.textContent=totalScore();standardPlaceTable(t);
}
docTable=standardTable;
function standardCleanDocument(root){root.querySelectorAll('.paragraph-actions').forEach(x=>x.remove());root.querySelectorAll('.inline-score').forEach(x=>x.replaceWith(document.createTextNode(x.value==='0'?'':x.value)));root.querySelectorAll('[data-edit]').forEach(x=>{for(const a of ['contenteditable','data-choice','data-number','tabindex','role','data-placeholder'])x.removeAttribute(a)});return root}
function standardPrintClone(root){
 const clone=standardCleanDocument(root.cloneNode(true));clone.id='printDocument';
 // Screen pages may repeat headers and split paragraphs. Rejoin them before
 // handing pagination to the print engine, including in downloaded HTML.
 for(const n of [1,5,6,7,9,10]){const tables=Array.from(clone.querySelectorAll('.table-'+n));if(tables.length>1){const first=tables.shift();tables.forEach(t=>{first.tBodies[0].append(...Array.from(t.tBodies[0].rows));t.remove()})}}
 const groups=new Map();clone.querySelectorAll('[data-edit^="line:"],[data-edit^="agreement:"]').forEach(p=>{const key=p.dataset.edit;if(groups.has(key)){const first=groups.get(key);first.append(document.createTextNode(p.textContent));p.remove()}else groups.set(key,p)});
 const cover=clone.querySelector('.cover'),flow=document.createElement('article');flow.className='sheet standard-sheet print-flow';clone.querySelectorAll('.sheet:not(.cover) .body').forEach(body=>flow.append(...Array.from(body.children)));clone.replaceChildren(cover,flow);
 return clone;
}
window.addEventListener('beforeprint',()=>{document.getElementById('printDocument')?.remove();document.querySelector('.preview').append(standardPrintClone($('pages')))});
window.addEventListener('afterprint',()=>{document.getElementById('printDocument')?.remove();renderDocument()});
saveHTML=function(){if(!currentUser)return;clearTimeout(timer);renderDocument();const source=$('pages'),print=standardPrintClone(source),box=standardCleanDocument(source.cloneNode(true));for(const root of [box,print]){root.querySelectorAll('[data-edit]').forEach(x=>{x.removeAttribute('data-edit');x.removeAttribute('data-join')});root.querySelectorAll('[data-placeholder]').forEach(x=>x.removeAttribute('data-placeholder'));root.querySelectorAll('.sheet-wrap').forEach(w=>{w.style.width='210mm';w.style.height='297mm';w.firstChild.style.transform='none'})}const css=Array.from(document.querySelectorAll('style')).map(s=>s.textContent).join('\n');download(new Blob(['<!doctype html><html lang="'+S.lang+'"><meta charset="utf-8"><title>Satbayev · Syllabus</title><style>'+css+'body{padding:20px}.sheet-wrap{margin:0 auto 25px}@media print{body{padding:0}}</style><body>'+box.outerHTML+print.outerHTML+'</body></html>'],{type:'text/html;charset=utf-8'}),(S.meta.code||'syllabus')+'-snapshot.html')};
const standardRefresh=refreshScoreCells;refreshScoreCells=function(source){standardRefresh(source);document.querySelectorAll('.score-matrix .inline-score').forEach(input=>{if(input!==source&&input.value==='0')input.value=''});document.querySelectorAll('[data-score-group]').forEach(c=>{const kind=c.dataset.scoreGroup;c.textContent=kind==='total'?totalScore():numericString(S.tables[8].slice(1).reduce((a,r)=>a+(kind==='exam'?Number(r[18]||0):r.slice(3,18).reduce((s,x)=>s+Number(x||0),0)),0));c.closest('tr').classList.toggle('over-limit',Number(totalScore())>100)})};
ui.kk.printNote='PDF: A4, масштаб 100%, өрістер «Әдепкі», браузер колонтитулдары өшірулі болсын.';
ui.ru.printNote='Для PDF: A4, масштаб 100%, поля «По умолчанию», колонтитулы браузера выключены.';
ui.en.printNote='PDF: A4, scale 100%, default margins, browser headers and footers off.';
