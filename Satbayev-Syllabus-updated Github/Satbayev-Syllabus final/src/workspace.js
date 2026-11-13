const CURRICULUM=__CURRICULUM_DATA__;
// Personal documents and histories. Shared accounts/configuration are never overwritten.
let workspace=null,workspaceRevision=0,workspaceSaving=null;
const undoStacks=new Map(),redoStacks=new Map();
const cloneState=x=>structuredClone(x);
const currentDoc=()=>workspace?.documents.find(d=>d.id===workspace.activeId);
function captureDocument(){if(currentDoc())currentDoc().state=cloneState(S)}
function historySeed(){if(currentDoc()&&!undoStacks.has(currentDoc().id))undoStacks.set(currentDoc().id,[JSON.stringify(S)])}
function rememberEdit(){if(!currentDoc())return;historySeed();const stack=undoStacks.get(currentDoc().id),next=JSON.stringify(S);if(stack.at(-1)!==next){stack.push(next);if(stack.length>100)stack.shift();redoStacks.set(currentDoc().id,[])}captureDocument();renderWorkspaceBar()}
function moveHistory(redo=false){const d=currentDoc();if(!d)return;historySeed();const past=undoStacks.get(d.id),future=redoStacks.get(d.id)||[];if(redo){if(!future.length)return;past.push(future.pop())}else{if(past.length<2)return;future.push(past.pop())}redoStacks.set(d.id,future);S=JSON.parse(past.at(-1));captureDocument();renderAll();past[past.length-1]=JSON.stringify(S);persist()}
const oldPersist=persist;
persist=function(){if(!workspace)return oldPersist();rememberEdit();dirty=true;markStatus(T('unsaved'));clearTimeout(saveTimer);saveTimer=setTimeout(saveProjectNow,900)};
saveProjectNow=async function(){
 if(!workspace||!currentUser)return;
 clearTimeout(saveTimer);captureDocument();
 if(workspaceSaving)return workspaceSaving;
 workspaceSaving=(async()=>{try{
  do {const snapshot=JSON.stringify(workspace);markStatus(T('saving'));
   const r=await api('/api/workspace',{method:'PUT',body:JSON.stringify({workspace:JSON.parse(snapshot),revision:workspaceRevision})});
   workspaceRevision=r.revision;captureDocument();dirty=JSON.stringify(workspace)!==snapshot;
  }while(dirty);
  markStatus(T('savedServer'));
 }catch(e){dirty=true;markStatus(e.message);toast(e.message)}finally{workspaceSaving=null;renderWorkspaceBar()}})();
 return workspaceSaving;
};
loadDocument=async function(){
 const me=await api('/api/me');currentUser=me.user;
 const r=await api('/api/workspace');workspace=r.workspace;workspaceRevision=r.revision;
 for(const d of workspace.documents)attachCurriculum(d.state);S=cloneState(currentDoc().state);dirty=false;undoStacks.clear();redoStacks.clear();historySeed();
 $('loginScreen').hidden=true;document.body.classList.add('authenticated');renderAll();markStatus(T('savedServer'));
};
const workspaceLogout=logout;logout=async function(){await workspaceLogout();if(!currentUser){workspace=null;undoStacks.clear();redoStacks.clear();$('workspaceBar')?.remove()}};
function selectDocument(id){captureDocument();workspace.activeId=id;S=cloneState(currentDoc().state);historySeed();renderAll();persist()}
function blankDocument(source,full=false){const st=cloneState(source);st.sections.forEach(s=>s.text='');for(const [k,rows]of Object.entries(st.tables))st.tables[k]=[rows[0].slice(),rows[0].map((_,j)=>k==='8'&&j>=2?'0':'')];if(full){for(const k of Object.keys(st.meta))st.meta[k]='';st.meta.university=source.meta.university;st.meta.city=source.meta.city;st.meta.date=String(new Date().getFullYear());st.meta.year=st.meta.date+'–'+(Number(st.meta.date)+1);st.active=0}return st}
function newDocument(){if(workspace.documents.length>=20)return toast('Можно создать до 20 силлабусов');const name=prompt('Название нового силлабуса','Новый силлабус');if(!name?.trim())return;captureDocument();const id=crypto.randomUUID();workspace.documents.push({id,name:name.trim().slice(0,120),state:blankDocument(S,true),versions:[]});selectDocument(id)}
function renameDocument(){const name=prompt('Название вкладки',currentDoc().name);if(name?.trim()){currentDoc().name=name.trim().slice(0,120);persist()}}
async function saveNamedVersion(name){const d=currentDoc();if(d.versions.length>=30){toast('Лимит 30 версий. Удалите ненужную в истории.');return false}name=name||prompt('Название версии','Версия '+(d.versions.length+1));if(!name?.trim())return false;d.versions.push({name:name.trim().slice(0,120),created:new Date().toISOString(),state:cloneState(S)});persist();await saveProjectNow();return !dirty}
async function resetContent(full){if(!confirm(full?'Очистить реквизиты и содержание? Текущая версия сначала будет сохранена.':'Очистить содержание разделов и таблиц? Реквизиты останутся. Текущая версия сначала будет сохранена.'))return;if(!await saveNamedVersion('Перед очисткой '+new Date().toLocaleString()))return;S=blankDocument(S,full);changed();renderAll()}
function showVersions(){
 let dialog=$('versionsDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='versionsDialog';document.body.append(dialog)}
 dialog.innerHTML='<form method="dialog" class="pickerhead"><strong>История версий</strong><button aria-label="Закрыть">×</button></form><div class="pickerbody"><p>Восстановление можно отменить кнопкой Undo.</p><div id="versionList"></div></div>';
 const list=dialog.querySelector('#versionList');
 currentDoc().versions.forEach((v,i)=>{const row=document.createElement('div');row.className='version-row';const label=document.createElement('span');label.textContent=v.name+' · '+new Date(v.created).toLocaleString();row.append(label);
  const restore=document.createElement('button');restore.textContent='Восстановить';restore.onclick=()=>{if(confirm('Восстановить «'+v.name+'»?')){S=cloneState(v.state);changed();renderAll();dialog.close()}};
  const preview=document.createElement('button');preview.textContent='Просмотреть';preview.onclick=()=>{let pre=dialog.querySelector('pre');if(!pre){pre=document.createElement('pre');dialog.append(pre)}pre.textContent=JSON.stringify(v.state.meta,null,2)+'\n\n'+v.state.sections.map(s=>s.title+'\n'+s.text).join('\n\n')};
  const remove=document.createElement('button');remove.textContent='Удалить';remove.onclick=()=>{if(confirm('Удалить эту сохранённую версию?')){currentDoc().versions.splice(i,1);persist();showVersions()}};row.append(preview,restore,remove);list.append(row);
 });if(!currentDoc().versions.length)list.textContent='Пока нет сохранённых версий.';if(!dialog.open)dialog.showModal();
}
function renderWorkspaceBar(){
 if(!workspace||!currentUser)return;let bar=$('workspaceBar');if(!bar){bar=document.createElement('section');bar.id='workspaceBar';document.querySelector('header').after(bar)}
 bar.replaceChildren();const tabs=document.createElement('div');tabs.className='document-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Силлабусы');
 for(const doc of workspace.documents){const b=document.createElement('button');b.textContent=doc.name;b.setAttribute('role','tab');b.setAttribute('aria-selected',doc.id===workspace.activeId);b.onclick=()=>selectDocument(doc.id);tabs.append(b)}bar.append(tabs);
 const actions=document.createElement('div');actions.className='workspace-actions';
 for(const [label,action,disabled]of [['＋ Силлабус',newDocument,false],['Переименовать',renameDocument,false],['↶ Undo',()=>moveHistory(false),(undoStacks.get(workspace.activeId)?.length||0)<2],['↷ Redo',()=>moveHistory(true),!redoStacks.get(workspace.activeId)?.length],['Сохранить версию',()=>saveNamedVersion(),false],['История версий',showVersions,false],['Очистить содержание',()=>resetContent(false),false],['Чистый шаблон',()=>resetContent(true),false]]){const b=document.createElement('button');b.textContent=label;b.onclick=action;b.disabled=disabled;actions.append(b)}bar.append(actions);
}
const workspaceRenderAll=renderAll;renderAll=function(){workspaceRenderAll();renderWorkspaceBar()};
document.addEventListener('keydown',e=>{if(!workspace||!(e.ctrlKey||e.metaKey)||e.altKey||document.querySelector('dialog[open]'))return;if(e.key.toLowerCase()==='z'||e.key.toLowerCase()==='y'){e.preventDefault();moveHistory(e.shiftKey||e.key.toLowerCase()==='y')}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
// All document fields are personal and editable; computed totals remain derived.
syncMeta=function(){};
const previousDisplayMeta=displayMeta;displayMeta=function(k,lang=S.lang){if(['university','protocol'].includes(k))return S.meta[k]||'';return previousDisplayMeta(k,lang)};
canEdit=function(key){if(!currentUser)return false;const p=key.split(':');return !(p[0]==='table'&&+p[1]===8&&+p[2]>0&&(+p[3]===0||+p[3]===S.tables[8][0].length-1))};
sectionTextEditable=n=>Number.isInteger(n)&&n>=0&&n<S.sections.length&&!!currentUser;
courseOptions=function(){return (S.courses||[]).filter(c=>(c.programs||[]).includes(S.meta.program)&&(!c.studyYear||String(c.studyYear)===S.meta.studyYear)&&(!c.semester||String(c.semester)===S.meta.semester)).map(c=>({...c,title:c.titles?.[S.lang]||c.title}))};
field=function(k){const options=choices(k);return `<div class="field"><label for="f-${k}">${esc(T(k))}</label><input id="f-${k}" data-meta="${k}" value="${esc(S.meta[k]||'')}" ${options.length?`list="options-${k}"`:''}><datalist id="options-${k}">${options.map(x=>`<option value="${esc(x.value)}">${esc(x.group)}</option>`).join('')}</datalist></div>`};
setMeta=function(k,value){S.meta[k]=value;const chain=['institute','department','program','studyYear','semester','course'];const pos=chain.indexOf(k);if(pos>=0&&pos<5){for(const child of chain.slice(pos+1))S.meta[child]='';S.meta.code=''}if(k==='institute'){const[i]=relation();S.meta.director=i?.director||''}if(k==='department'){const[,d]=relation();S.meta.head=d?.head||''}if(k==='course'){const c=courseOptions().find(x=>x.title===value);if(c)for(const key of ['code','credits','distribution','cycle','studyYear','semester'])if(c[key]!==undefined)S.meta[key]=String(c[key])}changed()};
bindMeta=function(){document.querySelectorAll('[data-meta]').forEach(el=>{el.oninput=()=>setMeta(el.dataset.meta,el.value);el.onchange=()=>renderEditor()})};
const workspaceEditor=renderEditor;renderEditor=function(){workspaceEditor();if(!currentUser)return;const n=S.active-1;
 const title=$('sectitle');if(title){title.readOnly=false;title.oninput=()=>{S.sections[n].title=title.value;changed()}}
 const area=$('sectext');if(area){area.readOnly=false;if(!$('addSectionParagraph')){const add=textToolButton('addParagraph','+','addSectionParagraph',()=>insertSectionParagraph(n,area.value.slice(0,area.selectionEnd).split('\n').length-1));area.closest('.field').append(add);}area.oninput=()=>{S.sections[n].text=area.value;changed()};const paste=$('pasteSectionText');if(paste)paste.disabled=false}
 const agreement=$('agreement');if(agreement){agreement.readOnly=false;agreement.oninput=()=>{S.meta.agreement=agreement.value;changed()}}
 document.querySelectorAll('[data-format]').forEach(el=>el.disabled=false);
 document.querySelectorAll('.approval-fields .note').forEach(el=>el.remove());
 if(S.active===0){const code=$('f-code');if(code)code.readOnly=false}
 if(S.tables[n]){const container=$('tableedit');if(container){container.innerHTML=editorTable(n);bindTable(n)}}
};
editorTable=function(n){return '<table><tbody>'+S.tables[n].map((r,i)=>'<tr>'+r.map((v,j)=>`<td><textarea data-t="${n}" data-r="${i}" data-c="${j}" aria-label="${i+1}, ${j+1}" ${canEdit(`table:${n}:${i}:${j}`)?'':'readonly'}>${esc(v)}</textarea></td>`).join('')+(i?`<td><button onclick="removeRow(${n},${i})" aria-label="Удалить строку">×</button></td>`:'')+'</tr>').join('')+'</tbody></table>'};
bindTable=function(){document.querySelectorAll('[data-t]').forEach(el=>el.oninput=()=>{const n=+el.dataset.t,r=+el.dataset.r,c=+el.dataset.c;if(!canEdit(`table:${n}:${r}:${c}`))return;if(n===8&&r>0&&c>=2&&!num(el.value)){el.value=S.tables[n][r][c];return}S.tables[n][r][c]=el.value;changed()})};
addRow=function(n){S.tables[n].push(S.tables[n][0].map((_,j)=>n===8&&j>=2?'0':''));changed();renderEditor()};
removeRow=function(n,i){S.tables[n].splice(i,1);changed();renderEditor()};
resetProject=()=>resetContent(true);
const workspaceSetEditable=setEditable;setEditable=function(el,key,join=false){const p=key.split(':');if(p[0]==='table'&&p[2]==='0')return v2SetEditable(el,key,join);workspaceSetEditable(el,key,join)};
const workspaceChoices=choices;choices=function(k){if(k==='semester'&&/^\d+$/.test(S.meta.studyYear))return [2*Number(S.meta.studyYear)-1,2*Number(S.meta.studyYear)].map(n=>({value:String(n),group:T(k)}));return workspaceChoices(k)};
const workspaceLanguage=switchLanguage;switchLanguage=async function(target){const bar=$('workspaceBar');if(bar)bar.inert=true;try{await workspaceLanguage(target)}finally{if(bar)bar.inert=false}};
const workspaceApi=api;api=async function(path,options={}){if(path==='/api/translate'&&workspace&&options.body){const body=JSON.parse(options.body);body.personal=true;options={...options,body:JSON.stringify(body)}}return workspaceApi(path,options)};
const workspaceCourseRows=renderCourseRows;renderCourseRows=function(){workspaceCourseRows();$('courseRows').querySelectorAll('details').forEach((el,i)=>{const box=document.createElement('div');box.className='grid2';for(const key of ['studyYear','semester','credits','distribution','cycle']){const label=document.createElement('label');label.textContent=T(key);const input=document.createElement('input');input.value=S.courses[i][key]||'';input.oninput=()=>{S.courses[i][key]=input.value;changed()};label.append(input);box.append(label)}el.append(box)})};
$('importer').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2000000)throw Error('Файл слишком большой');const v=JSON.parse(await f.text());if(!valid(v)||![3,4].includes(v.schemaVersion))throw Error(T('invalid'));S=v;calculate();changed();renderAll()}catch(err){toast(err.message)}e.target.value=''};

function attachCurriculum(state){
 const c=CURRICULUM;
 if(!state.programDirectory.some(p=>p.title===c.program))state.programDirectory.push({title:c.program,url:''});
 let inst=state.relations.find(i=>i.name===c.institute);
 if(!inst){inst={name:c.institute,director:c.director,departments:[]};state.relations.push(inst)}
 let dep=inst.departments.find(d=>d.name===c.department);
 if(!dep){dep={name:c.department,head:c.head,programs:[],verified:true};inst.departments.push(dep)}
 if(!inst.director)inst.director=c.director;if(!dep.head)dep.head=c.head;
 if(!dep.programs.includes(c.program))dep.programs.push(c.program);
 for(const [index,row]of c.courses.kk.entries()){
  const id=c.id+':'+row.code+':'+row.semester;
  if(!state.courses.some(x=>x.curriculumId===id))state.courses.push({...row,curriculumId:id,programs:[c.program],titles:Object.fromEntries(['kk','ru','en'].map(lang=>[lang,c.courses[lang][index].title]))});
 }
}
for(let i=0;i<CURRICULUM.courses.kk.length;i++)addGroup(Object.fromEntries(['kk','ru','en'].map(lang=>[lang,CURRICULUM.courses[lang][i].title])));
addGroup({kk:CURRICULUM.institute,ru:'Институт геологии, нефтегазового дела имени К.Т.Турысова',en:'Geology and Oil-gas Business Institute named after K. Turyssov'});
addGroup({kk:CURRICULUM.department,ru:'Геофизика и сейсмология',en:'Geophysics and seismology'});
const curriculumSetMeta=setMeta;setMeta=function(k,value){curriculumSetMeta(k,value);if(k==='course'){
 const c=courseOptions().find(x=>x.title===value);if(c?.curriculumId){S.meta.year=CURRICULUM.year;changed()}
}};
const curriculumEditor=renderEditor;renderEditor=function(){curriculumEditor();if(S.active!==0)return;
 const first=$('f-institute')?.closest('.field');if(first){let after=first;for(const key of ['department','program','studyYear','semester','course']){const el=$('f-'+key)?.closest('.field');if(el){after.after(el);after=el}}}
 if(S.meta.program===CURRICULUM.program){const note=document.createElement('div');note.className='note';const c=courseOptions().find(x=>x.title===S.meta.course);note.textContent='Учебный план 6B05208 · 2026–2027. '+(c?`Всего: ${c.totalHours||'не указано'} ч. · Лекции/лабораторные/практика: ${c.distribution||'не указано'} · СРО, включая СРОП: ${c.selfStudyHours||'не указано'} ч. · Пререквизиты: ${c.prerequisites||'не указаны'}. ${c.block?'Дисциплина по выбору, блок '+c.block+'.':''}`:'Выберите курс, семестр и дисциплину.');$('editor').append(note)}
};
