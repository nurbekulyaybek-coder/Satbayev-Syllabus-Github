// Editing and navigation refinements. Source is included by build.py.
for(const [lang,words] of Object.entries({kk:{hideEditor:'Редакторды жасыру',showEditor:'Редакторды ашу',exportMenu:'Экспорт',overLimit:'Жалпы балл 100-ден асады'},ru:{hideEditor:'Скрыть редактор',showEditor:'Открыть редактор',exportMenu:'Экспорт',overLimit:'Общий балл превышает 100'},en:{hideEditor:'Hide editor',showEditor:'Show editor',exportMenu:'Export',overLimit:'Total exceeds 100'}}))Object.assign(ui[lang],words);
function validScoreInput(value){return value===''||/^\d{1,3}$/.test(value)&&Number(value)<=100}
function bindScoreInput(input,key){
 input.onfocus=()=>input.select();
 input.onbeforeinput=e=>{if(e.data&&/[^0-9]/.test(e.data))e.preventDefault()};
 input.oninput=()=>{
  const [,n,r,c]=key.split(':').map((v,i)=>i?Number(v):v);
  if(!canEdit(key))return;
  if(!validScoreInput(input.value)){input.value=S.tables[n][r][c];return}
  S.tables[n][r][c]=input.value===''?'0':String(Number(input.value));
  changed(false);refreshScoreCells(input);
 };
 input.onblur=()=>{const [,n,r,c]=key.split(':');input.value=S.tables[n][r][c];};
 input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur()}};
}
function refreshScoreCells(source){
 updateScores();const rows=S.tables[8],last=rows[0].length-1;
 document.querySelectorAll('.inline-score').forEach(input=>{const [,n,r,c]=input.dataset.inlineScore.split(':');if(input!==source)input.value=S.tables[n][r][c]});
 document.querySelectorAll('[data-edit^="table:8:"]').forEach(cell=>{const [,,r,c]=cell.dataset.edit.split(':').map(Number);if(c===last)cell.textContent=rows[r][c]});
 document.querySelectorAll('.assessment-total').forEach(row=>Array.from(row.cells).forEach((cell,c)=>{if(c>=3)cell.textContent=numericString(rows.slice(1).reduce((sum,r)=>sum+Number(String(r[c]||0).replace(',','.')),0))}));
 const total=Number(totalScore());
 document.querySelectorAll('.assessment-total, #scoreSummary, #score-grand').forEach(el=>{el.classList.toggle('over-limit',total>100);el.title=total>100?T('overLimit'):''});
}
const uxEditable=setEditable;setEditable=function(el,key,join=false){uxEditable(el,key,join);const input=el.querySelector('.inline-score');if(input)bindScoreInput(input,key)};
function updateEditorToggle(){const hidden=document.body.classList.contains('preview-mode');const label=T(hidden?'showEditor':'hideEditor');$('viewBtn').textContent='→';$('viewBtn').title=label;$('viewBtn').setAttribute('aria-label',label);document.querySelectorAll('.editor-toggle').forEach(b=>b.setAttribute('aria-expanded',String(!hidden)));$('exportLabel').textContent=T('exportMenu')+' ▾'}
togglePreview=function(){const hidden=document.body.classList.toggle('preview-mode');$('editor').classList.toggle('view-only',hidden);updateEditorToggle();requestAnimationFrame(scalePages)};
const uxEditor=renderEditor;renderEditor=function(){uxEditor();updateEditorToggle()};
$('exportMenu').addEventListener('click',e=>{if(e.target.closest('button'))$('exportMenu').open=false});
document.addEventListener('click',e=>{if(!e.target.closest('#exportMenu'))$('exportMenu').open=false});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('exportMenu').open){$('exportMenu').open=false;$('exportLabel').focus()}});
let sectionScrollFrame=0,sectionScrollLock=false,sectionScrollEnd;
function revealActiveNavigation(){const b=$('nav').querySelector('.active'),aside=document.querySelector('aside');if(!b||!aside)return;const r=b.getBoundingClientRect(),a=aside.getBoundingClientRect();if(getComputedStyle(aside).display==='flex'){if(r.left<a.left||r.right>a.right)aside.scrollLeft+=r.left-a.left;return}if(r.top<a.top+30)aside.scrollTop+=r.top-a.top-30;else if(r.bottom>a.bottom-15)aside.scrollTop+=r.bottom-a.bottom+15}
const uxGoSection=goSection;goSection=function(n){sectionScrollLock=true;clearTimeout(sectionScrollEnd);uxGoSection(n);revealActiveNavigation();sectionScrollEnd=setTimeout(()=>{sectionScrollLock=false},1400)};
function syncScrolledSection(){
 sectionScrollFrame=0;if(sectionScrollLock||!currentUser)return;
 const preview=document.querySelector('.preview');if(!preview.offsetWidth)return;
 const bar=preview.querySelector('.editbar'),threshold=Math.max(preview.getBoundingClientRect().top,0)+(bar?.offsetHeight||0)+45;
 const markers=Array.from($('pages').querySelectorAll('[data-doc-section]'));let active=0;
 for(const el of markers){if(el.getBoundingClientRect().top<=threshold)active=Number(el.dataset.docSection);else break}
 if(active===S.active)return;
 // Leave catalogue/settings available until the reader actually scrolls the document.
 if(document.activeElement?.closest('#editor input, #editor textarea, #pages input, #pages [contenteditable]'))document.activeElement.blur();
 S.active=active;renderEditor();nav();revealActiveNavigation();
}
function onDocumentScroll(){if(sectionScrollLock){clearTimeout(sectionScrollEnd);sectionScrollEnd=setTimeout(()=>{sectionScrollLock=false},160);return}if(!sectionScrollFrame)sectionScrollFrame=requestAnimationFrame(syncScrolledSection)}
document.querySelector('.preview')?.addEventListener('scroll',onDocumentScroll,{passive:true});
window.addEventListener('scroll',onDocumentScroll,{passive:true});
const uxDocument=renderDocument;renderDocument=function(){uxDocument();refreshScoreCells(document.activeElement)};
