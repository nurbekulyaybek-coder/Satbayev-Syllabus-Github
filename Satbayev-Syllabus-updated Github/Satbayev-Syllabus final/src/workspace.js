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
 for(const d of workspace.documents)attachCurriculum(d.state);S=cloneState(currentDoc().state);const beforeUpgrade=JSON.stringify(S);upgradeState();const migrated=JSON.stringify(S)!==beforeUpgrade;if(migrated)currentDoc().state=cloneState(S);dirty=migrated;undoStacks.clear();redoStacks.clear();historySeed();
 $('loginScreen').hidden=true;document.body.classList.add('authenticated');renderAll();if(migrated)await saveProjectNow();else markStatus(T('savedServer'));
};
const workspaceLogout=logout;logout=async function(){await workspaceLogout();if(!currentUser){workspace=null;undoStacks.clear();redoStacks.clear();$('workspaceBar')?.remove()}};
function selectDocument(id){captureDocument();workspace.activeId=id;S=cloneState(currentDoc().state);const beforeUpgrade=JSON.stringify(S);upgradeState();const migrated=JSON.stringify(S)!==beforeUpgrade;if(migrated)captureDocument();historySeed();renderAll();if(migrated)saveProjectNow();else persist()}
function blankDocument(source,full=false){const st=cloneState(source);st.sections.forEach(s=>s.text='');for(const [k,rows]of Object.entries(st.tables))st.tables[k]=[rows[0].slice(),rows[0].map((_,j)=>k==='8'&&j>=2?'0':'')];if(full){for(const k of Object.keys(st.meta))st.meta[k]='';st.meta.university=source.meta.university;st.meta.city=source.meta.city;st.meta.date=String(new Date().getFullYear());st.meta.year=st.meta.date+'–'+(Number(st.meta.date)+1);st.active=0}return st}
function newDocument(){if(workspace.documents.length>=20)return toast(W("Можно создать до 20 силлабусов"));const name=prompt(W("Название нового силлабуса"),W("Новый силлабус"));if(!name?.trim())return;captureDocument();const id=crypto.randomUUID();workspace.documents.push({id,name:name.trim().slice(0,120),state:blankDocument(S,true),versions:[]});selectDocument(id)}
function renameDocument(){const name=prompt(W("Название вкладки"),currentDoc().name);if(name?.trim()){currentDoc().name=name.trim().slice(0,120);persist()}}
async function saveNamedVersion(name){const d=currentDoc();if(d.versions.length>=30){toast(W("Лимит 30 версий. Удалите ненужную в истории."));return false}name=name||prompt(W("Название версии"),W("Версия ")+(d.versions.length+1));if(!name?.trim())return false;d.versions.push({name:name.trim().slice(0,120),created:new Date().toISOString(),state:cloneState(S)});persist();await saveProjectNow();return !dirty}
async function resetContent(full){if(!confirm(full?W("Очистить реквизиты и содержание? Текущая версия сначала будет сохранена."):W("Очистить содержание разделов и таблиц? Реквизиты останутся. Текущая версия сначала будет сохранена.")))return;if(!await saveNamedVersion(W("Перед очисткой ")+new Date().toLocaleString()))return;S=blankDocument(S,full);changed();renderAll()}
function showVersions(){
 let dialog=$('versionsDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='versionsDialog';document.body.append(dialog)}
 dialog.innerHTML='<form method="dialog" class="pickerhead"><strong>'+W('История версий')+'</strong><button aria-label="Закрыть">×</button></form><div class="pickerbody"><p>'+W('Восстановление можно отменить кнопкой Undo.')+'</p><div id="versionList"></div></div>';
 const list=dialog.querySelector('#versionList');
 currentDoc().versions.forEach((v,i)=>{const row=document.createElement('div');row.className='version-row';const label=document.createElement('span');label.textContent=v.name+' · '+new Date(v.created).toLocaleString();row.append(label);
  const restore=document.createElement('button');restore.textContent=W("Восстановить");restore.onclick=()=>{if(confirm('Восстановить «'+v.name+'»?')){S=cloneState(v.state);changed();renderAll();dialog.close()}};
  const preview=document.createElement('button');preview.textContent=W("Просмотреть");preview.onclick=()=>{let pre=dialog.querySelector('pre');if(!pre){pre=document.createElement('pre');dialog.append(pre)}pre.textContent=JSON.stringify(v.state.meta,null,2)+'\n\n'+v.state.sections.map(s=>s.title+'\n'+s.text).join('\n\n')};
  const remove=document.createElement('button');remove.textContent=W("Удалить");remove.onclick=()=>{if(confirm(W("Удалить эту сохранённую версию?"))){currentDoc().versions.splice(i,1);persist();showVersions()}};row.append(preview,restore,remove);list.append(row);
 });if(!currentDoc().versions.length)list.textContent=W("Пока нет сохранённых версий.");if(!dialog.open)dialog.showModal();
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
const previousDisplayMeta=displayMeta;displayMeta=function(k,lang=S.lang){if(k==='university')return S.meta[k]||'';return previousDisplayMeta(k,lang)};
canEdit=function(key){if(!currentUser)return false;const p=key.split(':');return !(p[0]==='table'&&+p[1]===8&&+p[2]>0&&(+p[3]===0||+p[3]===S.tables[8][0].length-1))};
sectionTextEditable=n=>Number.isInteger(n)&&n>=0&&n<S.sections.length&&!!currentUser;
function mappedProgramTitles(){return new Set((S.relations||[]).flatMap(i=>(i.departments||[]).flatMap(d=>d.programs||[])))}
courseOptions=function(){if(!S.meta.program)return [];const mapped=mappedProgramTitles().has(S.meta.program);return (S.courses||[]).filter(c=>!mapped||(c.programs||[]).includes(S.meta.program)).map(c=>({...c,title:c.titles?.[S.lang]||c.title,cycle:c.cycles?.[S.lang]||c.cycle}))};
const previousChoices=choices;choices=function(k){if(k==='institute'){const schools=/school|мектеп|школ/i,labels={kk:['Институттар','Мектептер'],ru:['Институты','Школы'],en:['Institutes','Schools']}[interfaceLanguage]||['Институты','Школы'];return uniqueOptions((S.relations||[]).map(x=>({value:x.name,group:schools.test(x.name)?labels[1]:labels[0]})))}if(k==='program'){const level={kk:['Бакалавриат','Магистратура','Докторантура','Басқа бағдарламалар'],ru:['Бакалавриат','Магистратура','Докторантура','Другие программы'],en:['Bachelor programmes','Master programmes','Doctoral programmes','Other programmes']}[interfaceLanguage]||['Бакалавриат','Магистратура','Докторантура','Басқа'];return uniqueOptions((S.programDirectory||[]).map(p=>{const title=typeof p==='string'?p:p.title||'',code=(title.match(/^\s*([678])([A-Za-zА-Яа-яЁёВвМмДд])/i)||[]);const group=code[1]==='6'&&/[bв]/i.test(code[2])?level[0]:code[1]==='7'&&/[mм]/i.test(code[2])?level[1]:code[1]==='8'&&/[dд]/i.test(code[2])?level[2]:level[3];return {value:title,group}}))}if(k==='course')return courseOptions().map(x=>({value:x.title,group:T('course'),code:x.code||''}));return previousChoices(k)};
function hoursDraftValid(value){const s=String(value??'');if(!s)return true;if(!/^\d(?:\/\d?){0,3}$/.test(s)||s.includes('//'))return false;const count=(s.match(/\d/g)||[]).length;return count<=4&&(!s.endsWith('/')||count<4)}
function dateToISO(value){const s=String(value||'').trim();if(!s)return '';if(isISO(s))return s;const m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);if(!m)return null;const iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return isISO(iso)?iso:null}
let datePickerTimer=null;
function queueDatePicker(k,el){clearTimeout(datePickerTimer);datePickerTimer=setTimeout(()=>{if(el?.isConnected)openCalendar(k)},240)}
function enableDateTyping(k,el,event){clearTimeout(datePickerTimer);event?.preventDefault();el.dataset.dateTyping=k;if(el.tagName==='INPUT'){el.readOnly=false;el.value=S.meta[k]?formatDate(S.meta[k]):'';el.focus();el.select?.()}else{el.contentEditable='plaintext-only';el.textContent=S.meta[k]?formatDate(S.meta[k]):'';el.focus();const range=document.createRange();range.selectNodeContents(el);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)}}
function saveDateTyping(k,el){if(!el?.dataset.dateTyping)return false;const raw=el.tagName==='INPUT'?el.value:el.textContent,iso=dateToISO(raw);if(iso===null){if(el.setCustomValidity){el.setCustomValidity('Введите дату как дд.мм.гггг');el.reportValidity()}else{el.textContent=S.meta[k]?formatDate(S.meta[k]):'';el.contentEditable='false';delete el.dataset.dateTyping}return false}if(el.setCustomValidity)el.setCustomValidity('');S.meta[k]=iso;if(k==='approvalDate'&&iso)S.meta.date=iso.slice(0,4);syncMeta();delete el.dataset.dateTyping;if(el.tagName==='INPUT'){el.readOnly=true;el.value=formatDate(iso)}else{el.contentEditable='false';el.textContent=formatDate(iso)}changed();return true}
field=function(k){const options=choices(k),pick=['studyMode','examFormat','cycle','studyYear','semester','date','year'].includes(k);if(['approvalDate','protocolDate'].includes(k))return `<div class="field"><label for="f-${k}">${esc(T(k))}</label><div class="datefield"><input id="f-${k}" class="date-input" value="${esc(S.meta[k]?formatDate(S.meta[k]):'')}" readonly placeholder="дд.мм.гггг" onclick="queueDatePicker('${k}',this)" ondblclick="enableDateTyping('${k}',this,event)" onblur="saveDateTyping('${k}',this)"><button type="button" onclick="openCalendar('${k}')" aria-label="${esc(T(k))}">▦</button></div><small>${esc(T('dateEditHint'))}</small></div>`;if(pick)return `<div class="field"><label for="f-${k}">${esc(T(k))}</label><select id="f-${k}" data-meta="${k}"><option value="">— ${esc(T('choose'))} —</option>${options.map(x=>`<option value="${esc(x.value)}" ${x.value===S.meta[k]?'selected':''}>${esc(x.value)}</option>`).join('')}</select></div>`;const searchable=['institute','department','program','course'].includes(k),picker=searchable&&options.length?`<button type="button" data-picker="${k}" onclick="openPicker(this.dataset.picker)">${esc(T('choose'))}</button>`:'',distribution=k==='distribution'?`inputmode="numeric" maxlength="7" placeholder="2/0/1/2" pattern="\\d/\\d/\\d/\\d"`:'';return `<div class="field"><label for="f-${k}">${esc(T(k))}</label><div class="pickerfield"><input id="f-${k}" data-meta="${k}" value="${esc(S.meta[k]||'')}" ${distribution} ${options.length?`list="options-${k}"`:''}>${picker}</div><datalist id="options-${k}">${options.map(x=>`<option value="${esc(x.value)}">${esc(x.group)}</option>`).join('')}</datalist>${k==='distribution'?`<small>${esc(T('distributionFormat'))}</small>`:''}</div>`};
setMeta=function(k,value){if(k==='distribution'&&!hoursDraftValid(value))return;S.meta[k]=value;const chain=['institute','department','program','studyYear','semester','course'];const pos=chain.indexOf(k);if(pos>=0&&pos<5){for(const child of chain.slice(pos+1))S.meta[child]='';for(const key of ['code','credits','cycle','distribution'])S.meta[key]=''}if(k==='institute'){const[i]=relation();S.meta.director=i?.director||''}if(k==='department'){const[,d]=relation();S.meta.head=d?.head||''}if(k==='program'){const found=(S.relations||[]).map(i=>({i,d:i.departments?.find(d=>d.programs?.includes(value))})).find(x=>x.d);if(found){S.meta.institute=found.i.name;S.meta.department=found.d.name;S.meta.director=found.i.director||'';S.meta.head=found.d.head||''}}if(k==='course'){const c=courseOptions().find(x=>x.title===value);for(const key of ['code','credits','distribution','cycle'])S.meta[key]=c&&c[key]!==undefined?String(c[key]):'';if(c)for(const key of ['studyYear','semester'])if(c[key]!==undefined)S.meta[key]=String(c[key])}if(k==='examFormat'){const labels={kk:'Қорытынды емтихан: ',ru:'Итоговый экзамен: ',en:'Final examination: '},last=S.tables?.[5]?.at(-1);if(last&&(!last[0]||/емтихан|экзамен|examination/i.test(last[1]||'')))last.splice(1,4,...Array(4).fill((labels[S.lang]||labels.kk)+value))}changed()};
bindMeta=function(){document.querySelectorAll('[data-meta]').forEach(el=>{if(el.tagName==='SELECT')el.onchange=()=>{setMeta(el.dataset.meta,el.value);renderEditor()};else el.oninput=()=>{const k=el.dataset.meta;if(k==='distribution'&&!hoursDraftValid(el.value)){el.value=S.meta[k]||'';return}setMeta(k,el.value)}})};
const workspaceEditor=renderEditor;renderEditor=function(){workspaceEditor();if(!currentUser)return;const n=S.active-1;
 const title=$('sectitle');if(title){title.readOnly=false;title.oninput=()=>{S.sections[n].title=title.value;changed()}}
 const area=$('sectext');if(area){area.readOnly=false;if(!$('addSectionParagraph')){const add=textToolButton('addParagraph','+','addSectionParagraph',()=>insertSectionParagraph(n,area.value.slice(0,area.selectionEnd).split('\n').length-1));area.closest('.field').append(add);}area.oninput=()=>{S.sections[n].text=area.value;changed()};const paste=$('pasteSectionText');if(paste)paste.disabled=false}
 const agreement=$('agreement');if(agreement){agreement.readOnly=false;agreement.oninput=()=>{S.meta.agreement=agreement.value;changed()}}
 document.querySelectorAll('[data-format]').forEach(el=>el.disabled=false);
 document.querySelectorAll('.approval-fields .note').forEach(el=>el.remove());
 if(S.active===0){const code=$('f-code');if(code)code.readOnly=false}
 if(S.tables[n]){const container=$('tableedit');if(container){container.innerHTML=editorTable(n);bindTable(n)}}
};
function assessmentLabelRow(n,row){return n===5&&!String(row[0]||'').trim()&&/^(?:Бірінші аралық аттестация|Екінші аралық аттестация|Первая промежуточная аттестация|Вторая промежуточная аттестация|First interim assessment|Second interim assessment)$/i.test(String(row[1]||'').trim())}
editorTable=function(n){const rows=S.tables[n],width=rows[0].length,last=width-1;return '<table><thead><tr>'+rows[0].map((c,j)=>`<th>${esc(c)}<span class="col-status ${rows.slice(1).every(r=>String(r[j]||'').trim())?'done':'pending'}"></span></th>`).join('')+'<th></th></tr></thead><tbody>'+rows.slice(1).map((r,z)=>{const i=z+1;if(assessmentLabelRow(n,r))return `<tr class="assessment-label-row"><td colspan="${width}"><textarea data-t="${n}" data-r="${i}" data-c="1" aria-label="${esc(r[1])}">${esc(r[1])}</textarea></td><td><button onclick="removeRow(${n},${i})" aria-label="Удалить строку">×</button></td></tr>`;return '<tr>'+r.map((v,j)=>`<td>${n===8&&j===0?esc(v):n===8&&j>=3&&j<last?editorNumeric(n,i,j,v):n===8&&j===last?editorNumeric(n,i,j,v,true):`<textarea class="${n===8&&j===2?'weekly-max-input ':''}${n===5&&j===0&&['8','15'].includes(String(v).trim())?'schedule-week-number':''}" ${n===8&&j===2?'maxlength="13" placeholder="2/2"':''} data-t="${n}" data-r="${i}" data-c="${j}" aria-label="${i+1}, ${j+1}" ${canEdit(`table:${n}:${i}:${j}`)?'':'readonly'}>${esc(v)}</textarea>`}</td>`).join('')+`<td><button onclick="removeRow(${n},${i})" aria-label="${esc(T('remove'))}">×</button></td></tr>`}).join('')+'</tbody>'+(n===8?`<tfoot><tr><th colspan="${last}">${esc(T('all'))}</th><td id="score-grand">${totalScore()}</td><td></td></tr></tfoot>`:'')+'</table>'};
function weeklyMaximumDraftValid(value){const s=String(value||'').trim();if(!s)return true;if(!/^\d{1,4}(?:[.,]\d{1,2})?(?:[\/\s;]+\d{1,4}(?:[.,]\d{1,2})?)?\/?$/.test(s))return false;const parts=s.split(/[\/\s;]+/).filter(Boolean);return parts.length<=2&&parts.every(num)}
function weeklyMaximumDisplay(value){const parts=String(value||'').trim().split(/[\/\s;]+/).filter(Boolean);return parts.length===2?parts.join('/'):String(value||'')}
bindTable=function(){document.querySelectorAll('[data-t]').forEach(el=>{const n=+el.dataset.t,r=+el.dataset.r,c=+el.dataset.c;if(!canEdit(`table:${n}:${r}:${c}`))return;if(n===8&&c>=3&&c<S.tables[n][0].length-1&&el.dataset.score){bindScoreInput(el,`table:${n}:${r}:${c}`);return}el.oninput=()=>{if(n===8&&c===2&&!weeklyMaximumDraftValid(el.value)){el.value=S.tables[n][r][c];return}if(n===8&&c>=3&&c<S.tables[n][0].length-1&&!num(el.value)){el.value=S.tables[n][r][c];return}S.tables[n][r][c]=el.value;changed();if(n===8)updateScores()}})};
addRow=function(n){S.tables[n].push(S.tables[n][0].map((_,j)=>n===8&&j>=2?'0':''));changed();renderEditor()};
removeRow=function(n,i){S.tables[n].splice(i,1);changed();renderEditor()};
resetProject=()=>resetContent(true);
const workspaceSetEditable=setEditable;setEditable=function(el,key,join=false){const p=key.split(':');if(p[0]==='table'&&p[2]==='0')return v2SetEditable(el,key,join);workspaceSetEditable(el,key,join)};
const workspaceChoices=choices;choices=function(k){if(k==='semester'&&/^\d+$/.test(S.meta.studyYear))return [2*Number(S.meta.studyYear)-1,2*Number(S.meta.studyYear)].map(n=>({value:String(n),group:T(k)}));return workspaceChoices(k)};
const workspaceLanguage=switchLanguage;switchLanguage=async function(target){const bar=$('workspaceBar');if(bar)bar.inert=true;try{await workspaceLanguage(target)}finally{if(bar)bar.inert=false}};
const workspaceApi=api;api=async function(path,options={}){if(path==='/api/translate'&&workspace&&options.body){const body=JSON.parse(options.body);body.personal=true;options={...options,body:JSON.stringify(body)}}return workspaceApi(path,options)};
const workspaceCourseRows=renderCourseRows;renderCourseRows=function(){workspaceCourseRows();$('courseRows').querySelectorAll('details').forEach((el,i)=>{const box=document.createElement('div');box.className='grid2';for(const key of ['studyYear','semester','credits','distribution','cycle']){const label=document.createElement('label');label.textContent=T(key);const input=document.createElement('input');input.value=S.courses[i][key]||'';input.oninput=()=>{S.courses[i][key]=input.value;changed()};label.append(input);box.append(label)}el.append(box)})};
$('importer').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2000000)throw Error(W("Файл слишком большой"));const v=JSON.parse(await f.text());if(!valid(v)||![3,4].includes(v.schemaVersion))throw Error(T('invalid'));S=v;calculate();changed();renderAll()}catch(err){toast(err.message)}e.target.value=''};

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
  if(!state.courses.some(x=>x.curriculumId===id))state.courses.push({...row,curriculumId:id,programs:[c.program],titles:Object.fromEntries(['kk','ru','en'].map(lang=>[lang,c.courses[lang][index].title])),cycles:Object.fromEntries(['kk','ru','en'].map(lang=>[lang,c.courses[lang][index].cycle]))});
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

// Keep document labels independent of the interface preference, including later rerenders.
const contentRenderDocument=renderDocument;
renderDocument=function(){renderingDocument=true;try{return contentRenderDocument()}finally{renderingDocument=false}};
const workspaceUi={
 kk:['＋ Силлабус','Атын өзгерту','↶ Болдырмау','↷ Қайталау','Нұсқаны сақтау','Нұсқалар тарихы','Мазмұнды тазалау','Таза үлгі'],
 ru:['＋ Силлабус','Переименовать','↶ Отменить','↷ Повторить','Сохранить версию','История версий','Очистить содержание','Чистый шаблон'],
 en:['＋ Syllabus','Rename','↶ Undo','↷ Redo','Save version','Version history','Clear content','Blank template']
};
const localizedWorkspaceBar=renderWorkspaceBar;
renderWorkspaceBar=function(){localizedWorkspaceBar();document.querySelectorAll('.workspace-actions button').forEach((b,i)=>b.textContent=workspaceUi[interfaceLanguage][i])};
Object.assign(ui.kk,{notice:'Тіл таңдауы тек интерфейсті өзгертеді. Силлабус мазмұны өзгермейді.'});
Object.assign(ui.ru,{notice:'Выбор языка меняет только интерфейс. Содержание силлабуса не изменяется.'});
Object.assign(ui.en,{notice:'Language selection changes only the interface. Syllabus content stays unchanged.'});

const workspaceText={"Название нового силлабуса": ["Жаңа силлабус атауы", "New syllabus name"], "Новый силлабус": ["Жаңа силлабус", "New syllabus"], "Название вкладки": ["Қойынды атауы", "Tab name"], "Название версии": ["Нұсқа атауы", "Version name"], "Версия ": ["Нұсқа ", "Version "], "Восстановить": ["Қалпына келтіру", "Restore"], "Просмотреть": ["Қарау", "Preview"], "Удалить": ["Жою", "Delete"], "Пока нет сохранённых версий.": ["Сақталған нұсқалар жоқ.", "No saved versions yet."], "Можно создать до 20 силлабусов": ["20 силлабусқа дейін жасауға болады", "You can create up to 20 syllabuses"], "Лимит 30 версий. Удалите ненужную в истории.": ["Шектеу: 30 нұсқа. Артық нұсқаны тарихтан жойыңыз.", "Limit: 30 versions. Remove an unused version from history."], "Удалить эту сохранённую версию?": ["Осы сақталған нұсқаны жою керек пе?", "Delete this saved version?"], "Очистить реквизиты и содержание? Текущая версия сначала будет сохранена.": ["Деректемелер мен мазмұнды тазалау керек пе? Алдымен ағымдағы нұсқа сақталады.", "Clear details and content? The current version will be saved first."], "Очистить содержание разделов и таблиц? Реквизиты останутся. Текущая версия сначала будет сохранена.": ["Бөлімдер мен кестелер мазмұнын тазалау керек пе? Деректемелер қалады. Алдымен ағымдағы нұсқа сақталады.", "Clear section and table content? Details stay. The current version will be saved first."], "Перед очисткой ": ["Тазалау алдында ", "Before reset "], "Файл слишком большой": ["Файл тым үлкен", "File is too large"], "История версий": ["Нұсқалар тарихы", "Version history"], "Восстановление можно отменить кнопкой Undo.": ["Қалпына келтіруді Болдырмау батырмасымен қайтаруға болады.", "Restoration can be reversed with Undo."]};
function W(text){const item=workspaceText[text];return interfaceLanguage==='ru'||!item?text:item[interfaceLanguage==='kk'?0:1]}

// Course code picker includes every discipline currently in the workspace directory.
const workspaceChoicesFinal=choices;
choices=function(k){
 if(k==='courseCode'){const seen=new Set(),pool=S.meta.program?courseOptions():(S.courses||[]);return pool.filter(x=>x.code&&x.title).map(x=>({value:`${x.code} — ${x.titles?.[S.lang]||x.title}`,group:'',code:x.code,title:x.titles?.[S.lang]||x.title,curriculumId:x.curriculumId})).filter(x=>!seen.has(x.value)&&seen.add(x.value))}
 if(k==='examFormat'){const formats={kk:['Ауызша','Жазбаша'],ru:['Устный','Письменный'],en:['Oral','Written']}[S.lang]||['Ауызша','Жазбаша'];return formats.map(value=>({value,group:T(k)}))}
 return workspaceChoicesFinal(k)
};
const workspaceOpenPickerFinal=openPicker;
openPicker=function(k){workspaceOpenPickerFinal(k);if(k==='courseCode')$('pickerTitle').textContent=T('code')};
const workspaceFieldFinal=field;
field=function(k){
 if(['approvalDate','protocolDate'].includes(k))return `<div class="field"><label for="f-${k}">${esc(T(k))}</label><div class="datefield"><input id="f-${k}" class="date-input" value="${esc(S.meta[k]?formatDate(S.meta[k]):'')}" readonly placeholder="дд.мм.гггг" onclick="queueDatePicker('${k}',this)" ondblclick="enableDateTyping('${k}',this,event)" onblur="saveDateTyping('${k}',this)"><button type="button" onclick="openCalendar('${k}')" aria-label="${esc(T(k))}">▦</button></div><small>${esc(T('dateEditHint'))}</small></div>`;
 const multi=['lecturer','practice','office','officeHours','email','practiceOffice','practiceHours','practiceEmail'].includes(k),pickKey=k==='code'?'courseCode':k,options=choices(k),pickerOptions=k==='code'?choices('courseCode'):options,searchable=['institute','department','program','course'].includes(k),picker=(searchable||k==='code')&&pickerOptions.length?`<button type="button" data-picker="${pickKey}" onclick="openPicker(this.dataset.picker)">${esc(T('choose'))}</button>`:'',distribution=k==='distribution'?`inputmode="numeric" maxlength="7" placeholder="2/0/1/2" pattern="\\d/\\d/\\d/\\d"`:'';
 if(['studyMode','examFormat','cycle','studyYear','semester','date','year'].includes(k))return workspaceFieldFinal(k);
 const control=multi?`<textarea id="f-${k}" data-meta="${k}" rows="2">${esc(S.meta[k]||'')}</textarea>`:`<input id="f-${k}" data-meta="${k}" value="${esc(S.meta[k]||'')}" ${distribution} ${options.length?`list="options-${k}"`:''}>`;
 return `<div class="field"><label for="f-${k}">${esc(T(k))}</label><div class="pickerfield">${control}${picker}</div><datalist id="options-${k}">${options.map(x=>`<option value="${esc(x.value)}">${esc(x.group)}</option>`).join('')}</datalist>${k==='distribution'?`<small>${esc(T('distributionFormat'))}</small>`:''}${k==='code'?`<small>${esc(T('codePicker'))}</small>`:''}</div>`
};
const workspaceApplyChoiceFinal=applyChoice;
applyChoice=function(value){
 if(pickerKey==='courseCode'){
  const course=choices('courseCode').find(x=>x.value===value);if(!course)return;
  S.meta.course=course.title;S.meta.code=course.code;
  const source=(S.courses||[]).find(x=>x.code===course.code&&(x.titles?.[S.lang]||x.title)===course.title);
  if(source)for(const key of ['credits','cycle','distribution','studyYear','semester'])if(source[key]!==undefined)S.meta[key]=String(source[key]);if(source?.curriculumId)S.meta.year=CURRICULUM.year;
  $('picker').close();changed();renderEditor();return
 }
 return workspaceApplyChoiceFinal(value)
};
const workspaceSetMetaFinal=setMeta;
setMeta=function(k,value){workspaceSetMetaFinal(k,value);if(k==='examFormat'){
 const labels={kk:'Қорытынды емтихан',ru:'Итоговый экзамен',en:'Final examination'},last=S.tables?.[5]?.at(-1);
 if(last&&(!last[0]||/емтихан|экзамен|examination/i.test(last[1]||''))){const text=`${labels[S.lang]||labels.kk}${value?` (${String(value).toLocaleLowerCase()})`:''}`;last.splice(1,4,...Array(4).fill(text));last[1]=text;for(let j=2;j<last.length-1;j++)last[j]=''}
 }};
const workspaceSetEditableFinal=setEditable;
setEditable=function(el,key,join=false){workspaceSetEditableFinal(el,key,join);if(/^meta:(approvalDate|protocolDate)$/.test(key)){
 const k=key.slice(5);el.removeAttribute('data-choice');el.contentEditable='false';el.dataset.datePicker=k;el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',T(k))
 }};
function workspaceContactLine(key,index,text){const rows=String(S.meta[key]||'').split(/\r?\n/);while(rows.length<=index)rows.push('');rows[index]=text;S.meta[key]=rows.join('\n');const side=$('f-'+key);if(side)side.value=S.meta[key];changed(false)}
const workspaceCommitFinal=commitInline;
commitInline=function(el){
 if(el.dataset.dateTyping)return;
 const p=String(el.dataset.edit||'').split(':');
 if(p[0]==='contact'){workspaceContactLine(p[1],+p[2],editText(el));return}
 if(p[0]==='meta'&&p[1]==='distribution'&&!hoursDraftValid(editText(el)))return;
 return workspaceCommitFinal(el)
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-date-picker]');if(el)queueDatePicker(el.dataset.datePicker,el)});
document.addEventListener('dblclick',e=>{const el=e.target.closest('[data-date-picker]');if(el)enableDateTyping(el.dataset.datePicker,el,e)});
document.addEventListener('focusout',e=>{const el=e.target.closest('[data-date-picker][data-date-typing]');if(el)saveDateTyping(el.dataset.dateTyping,el)});
document.addEventListener('keydown',e=>{const el=e.target.closest('[data-date-picker]');if(el&&['Enter',' '].includes(e.key)){e.preventDefault();openCalendar(el.dataset.datePicker)}});

// Hovering an editor field points to the matching text or cell in the document preview.
let hoverPreviewNodes=[];
function clearPreviewHover(){hoverPreviewNodes.forEach(x=>x.classList.remove('preview-hover-highlight'));hoverPreviewNodes=[]}
function previewNodesForEditor(el){
 const key=el.dataset.meta||'',targets=[];
 const addEdit=k=>document.querySelectorAll('[data-edit]').forEach(x=>{if(x.dataset.edit===k)targets.push(x)});
 const addSectionLines=n=>document.querySelectorAll('[data-edit^="line:"]').forEach(x=>{if(+x.dataset.edit.split(':')[1]===n)targets.push(x)});
 if(key){if(['office','officeHours','email','practiceOffice','practiceHours','practiceEmail','lecturer','practice'].includes(key))document.querySelectorAll('[data-edit^="contact:'+key+':"]').forEach(x=>targets.push(x));else addEdit('meta:'+key);return targets}
 if(el.id==='sectitle'){document.querySelectorAll('[data-doc-section]').forEach(x=>{if(+x.dataset.docSection===S.active)targets.push(x)});return targets}
 if(el.id==='sectext'){addSectionLines(S.active-1);return targets}
 if(el.id==='goalText'||el.id==='objectiveText'){
  const lines=S.sections[2].text.split('\n'),mark=lines.findIndex(x=>/^(Міндеттері?|Задачи|Tasks|Course tasks)\s*:/i.test(x.trim()));
  lines.forEach((_,i)=>{if(el.id==='goalText'?(mark<0?i===0:i<mark):(mark<0?i>0:i>=mark))addEdit(`line:2:${i}`)});return targets
 }
 if(el.dataset.outcome!==undefined){const lines=S.sections[4].text.split('\n'),starts=[];lines.forEach((line,i)=>{if(outcomeHeadingIndex(line)>=0)starts.push(i)});const start=starts[+el.dataset.outcome],end=starts[+el.dataset.outcome+1]??lines.length;if(start!==undefined)for(let i=start;i<end;i++)addEdit(`line:4:${i}`);return targets}
 if(el.dataset.t!==undefined){addEdit(`table:${el.dataset.t}:${el.dataset.r}:${el.dataset.c}`);return targets}
 if(el.classList.contains('date-input'))addEdit('meta:'+el.id.slice(2));
 return targets
}
document.addEventListener('pointerover',e=>{const el=e.target.closest('#editor [data-meta],#editor [data-t],#editor .date-input,#editor #sectitle,#editor #sectext,#editor #goalText,#editor #objectiveText,#editor [data-outcome]');if(!el)return;clearPreviewHover();hoverPreviewNodes=previewNodesForEditor(el);hoverPreviewNodes.forEach(x=>x.classList.add('preview-hover-highlight'))});
document.addEventListener('pointerout',e=>{if(e.target.closest('#editor')&&!e.relatedTarget?.closest('#editor'))clearPreviewHover()});
