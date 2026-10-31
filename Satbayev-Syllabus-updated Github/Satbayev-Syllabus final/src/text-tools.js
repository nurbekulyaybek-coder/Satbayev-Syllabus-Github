// Empty paragraphs remain real editable paragraphs; additions use the existing text schema.
for(const [lang,words] of Object.entries({
 kk:{addParagraph:'Төменге абзац қосу',emptyParagraph:'Мәтін енгізіңіз…',copyText:'Мәтінді көшіру',pasteText:'Мәтінді қою',textCopied:'Мәтін көшірілді',copyShortcut:'Көшіру үшін Ctrl+C басыңыз',pasteShortcut:'Қою үшін Ctrl+V басыңыз',clipboardRetry:'Мәтін өзгерді. Қайтадан көріңіз.'},
 ru:{addParagraph:'Добавить абзац ниже',emptyParagraph:'Введите текст…',copyText:'Скопировать текст',pasteText:'Вставить текст',textCopied:'Текст скопирован',copyShortcut:'Нажмите Ctrl+C для копирования',pasteShortcut:'Нажмите Ctrl+V для вставки',clipboardRetry:'Текст изменился. Повторите действие.'},
 en:{addParagraph:'Add paragraph below',emptyParagraph:'Enter text…',copyText:'Copy text',pasteText:'Paste text',textCopied:'Text copied',copyShortcut:'Press Ctrl+C to copy',pasteShortcut:'Press Ctrl+V to paste',clipboardRetry:'Text changed. Please try again.'}
}))Object.assign(ui[lang],words);
function sectionTextEditable(n){return Number.isInteger(n)&&n>=0&&n<S.sections.length&&!!currentUser&&(![11,12].includes(n)||isAdmin())}
function decorateParagraph(p,key){
 if(!key.startsWith('line:'))return;
 const [,section,line]=key.split(':').map((v,i)=>i?Number(v):v);
 if(!canEdit(key))return;
 p.dataset.placeholder=T('emptyParagraph');
 const controls=document.createElement('div');controls.className='paragraph-actions';controls.dataset.afterLine=key;
 const button=document.createElement('button');button.type='button';button.textContent='+';button.title=T('addParagraph');button.setAttribute('aria-label',T('addParagraph'));button.dataset.addParagraph=key;
 button.onpointerdown=e=>e.preventDefault();button.onclick=()=>insertSectionParagraph(section,renderedParagraphEnd(section,line),'document');
 controls.append(button);p.after(controls);
}
function renderedParagraphEnd(n,line){
 // Enter may add line breaks inside a live paragraph before the next render.
 const lines=(inlineBaseLines[n]||S.sections[n].text.split('\n')).slice(),groups=new Map();
 $('pages').querySelectorAll('[data-edit]').forEach(el=>{const [kind,section,index]=el.dataset.edit.split(':');if(kind==='line'&&Number(section)===n&&canEdit(el.dataset.edit))groups.set(Number(index),(groups.get(Number(index))||'')+editText(el))});
 for(const [index,text] of groups)lines[index]=text;
 return lines.slice(0,line+1).reduce((count,text)=>count+text.split('\n').length,0)-1;
}
function insertSectionParagraph(n,line,focusTarget='editor'){
 if(!sectionTextEditable(n))return;
 clearTimeout(timer);clearTimeout(inlineBlurTimer);
 const lines=S.sections[n].text.split('\n');line=Math.max(0,Math.min(lines.length-1,line));
 lines.splice(line+1,0,'');S.sections[n].text=lines.join('\n');S.active=n+1;
 // Rendering first refreshes line indices used by the permission and inline-edit handlers.
 renderDocument();renderEditor();nav();changed(false);
 const start=lines.slice(0,line+1).join('\n').length+1;
 if(focusTarget==='document'){
  const p=Array.from($('pages').querySelectorAll('[data-edit]')).find(el=>el.dataset.edit===`line:${n}:${line+1}`);
  if(p){p.focus();const range=document.createRange();range.selectNodeContents(p);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);p.scrollIntoView?.({block:'nearest',inline:'nearest'})}
 }else{const area=$('sectext');area.focus();area.setSelectionRange(start,start);}
}
const COPY_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
const PASTE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="8" y="2" width="8" height="6" rx="2"/><path d="M8 12h8M8 16h6"/></svg>';
function textToolButton(label,icon,id,action){const b=document.createElement('button');b.id=id;b.type='button';b.className='text-tool';b.title=T(label);b.setAttribute('aria-label',T(label));b.innerHTML=icon;b.onpointerdown=e=>e.preventDefault();b.onclick=action;return b}
async function copySectionText(area){
 const text=area.value;
 try{if(!navigator.clipboard?.writeText)throw Error('clipboard');await navigator.clipboard.writeText(text);toast(T('textCopied'))}
 catch(e){const start=area.selectionStart,end=area.selectionEnd;area.focus();area.select();let copied=false;try{copied=document.execCommand('copy')}catch(_){}if(copied){area.setSelectionRange(start,end);toast(T('textCopied'))}else toast(T('copyShortcut'))}
}
async function pasteSectionText(area,n){
 const original=area.value,start=area.selectionStart,end=area.selectionEnd;
 try{
  if(!navigator.clipboard?.readText)throw Error('clipboard');
  const text=(await navigator.clipboard.readText()).replace(/\r\n?/g,'\n');
  if(S.active!==n+1||S.sections[n].text!==original||!sectionTextEditable(n))return toast(T('clipboardRetry'));
  area.focus();area.setRangeText(text,start,end,'end');area.dispatchEvent(new Event('input',{bubbles:true}));
 }catch(e){area.focus();area.setSelectionRange(start,end);toast(T('pasteShortcut'))}
}
function installSectionTextTools(){
 const area=$('sectext');if(!area||$('sectionTextTools'))return;
 const n=S.active-1,editable=sectionTextEditable(n)&&!area.readOnly;
 const box=document.createElement('div');box.className='section-textbox';area.before(box);box.append(area);
 const toolbar=document.createElement('div');toolbar.id='sectionTextTools';toolbar.className='text-clipboard';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label',T('content'));
 toolbar.append(textToolButton('pasteText',PASTE_ICON,'pasteSectionText',()=>pasteSectionText(area,n)),textToolButton('copyText',COPY_ICON,'copySectionText',()=>copySectionText(area)));
 toolbar.querySelector('#pasteSectionText').disabled=!editable;box.append(toolbar);
 if(editable){const add=textToolButton('addParagraph','+','addSectionParagraph',()=>{const line=area.value.slice(0,area.selectionEnd).split('\n').length-1;insertSectionParagraph(n,line)});add.classList.add('add-paragraph-editor');area.closest('.field').append(add)}
}
const textEditor=renderEditor;renderEditor=function(){textEditor();installSectionTextTools()};
const textCommit=commitInline;commitInline=function(el){textCommit(el);const [kind,n]=String(el.dataset.edit||'').split(':');if(kind==='line'&&S.active===Number(n)+1&&$('sectext'))$('sectext').value=S.sections[Number(n)].text};
