// Optional DOM regression checks: npm install --no-save jsdom; node tests/text-tools.test.cjs
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let stored=JSON.parse(fs.readFileSync(root+'/data/initial-state.json')),version=0,clipboard='';const errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'http://localhost:8765',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.Blob=Blob;
 w.fetch=async(url,opts={})=>({ok:true,json:async()=>{if(url!=='/api/document')return {configured:false};if(opts.method==='PUT'){stored=JSON.parse(opts.body).state;return {version:++version,configVersion:0}}return {state:structuredClone(stored),user:{role:'admin',name:'Test',username:'test',csrf:'x'},version,configVersion:0}}});
 Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async s=>{clipboard=s},readText:async()=>clipboard}});
 w.HTMLElement.prototype.scrollTo=function(opts){this.scrollTop=opts.top||0};
}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await wait(200);const w=dom.window,d=w.document;
 try{
  w.eval('S.active=3;renderEditor()');let area=d.querySelector('#sectext');area.value='';area.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(300);
  let p=d.querySelector('[data-edit="line:2:0"]');assert(p,'Cleared section keeps an editable paragraph');assert.equal(p.textContent,'');assert(p.classList.contains('empty-paragraph'));
  p.textContent='Restored without reload';p.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelector('#sectext').value,'Restored without reload');assert.equal(w.eval('S.sections[2].text'),'Restored without reload');
  // Add in the editor at the current caret, preserving following paragraphs.
  area=d.querySelector('#sectext');area.value='First\nSecond';area.dispatchEvent(new w.Event('input',{bubbles:true}));area.setSelectionRange(3,3);d.querySelector('#addSectionParagraph').click();
  assert.equal(w.eval('S.sections[2].text'),'First\n\nSecond');assert.equal(d.querySelector('#sectext').selectionStart,6);assert(d.querySelector('[data-edit="line:2:1"]'));
  // The document plus inserts below its own paragraph and focuses the new blank one.
  d.querySelector('[data-add-paragraph="line:2:0"]').click();assert.equal(w.eval('S.sections[2].text'),'First\n\n\nSecond');assert.equal(d.activeElement.dataset.edit,'line:2:1');
  // A live paragraph may contain Enter/newlines before it is repaginated.
  p=d.querySelector('[data-edit="line:2:0"]');p.textContent='First\nContinuation';p.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-add-paragraph="line:2:0"]').click();assert.equal(w.eval('S.sections[2].text'),'First\nContinuation\n\n\n\nSecond');
  w.eval("S.sections[2].text='First\\n\\n\\nSecond';renderDocument();renderEditor()");
  // Copy all text, then paste at a selection instead of replacing the entire section.
  area=d.querySelector('#sectext');await w.copySectionText(area);assert.equal(clipboard,'First\n\n\nSecond');
  area.setSelectionRange(0,5);clipboard='Replacement\r\nParagraph';await w.pasteSectionText(area,2);assert.equal(w.eval('S.sections[2].text'),'Replacement\nParagraph\n\n\nSecond');
  // Save and reload use the existing state schema and retain inserted blank lines.
  await w.saveProjectNow();await w.loadDocument();assert.equal(w.eval('S.sections[2].text'),'Replacement\nParagraph\n\n\nSecond');assert.equal(d.querySelectorAll('#sectionTextTools').length,1);assert.equal(d.querySelectorAll('#addSectionParagraph').length,1);
  // Empty text can also be copied, and an unavailable clipboard leaves keyboard paste usable.
  area=d.querySelector('#sectext');area.value='';area.dispatchEvent(new w.Event('input',{bubbles:true}));await w.copySectionText(area);assert.equal(clipboard,'');
  Object.defineProperty(w.navigator,'clipboard',{value:undefined});await w.pasteSectionText(area,2);assert.equal(d.activeElement,area);assert(d.querySelector('#toast').textContent.includes('Ctrl+V'));
  // Exported HTML contains the document, without interactive plus controls/placeholders.
  let exported;w.download=(blob)=>{exported=blob};w.saveHTML();const snapshot=new JSDOM(await exported.text());assert(!snapshot.window.document.querySelector('.paragraph-actions'));assert(!snapshot.window.document.querySelector('[data-placeholder]'));assert(snapshot.window.document.querySelector('p.empty-paragraph'));snapshot.window.close();
  // Read-only template policies retain Copy but cannot be modified via Paste or Plus.
  w.eval("currentUser.role='user';S.active=12;renderEditor();renderDocument()");assert(d.querySelector('#sectext').readOnly);assert(d.querySelector('#pasteSectionText').disabled);assert(!d.querySelector('#addSectionParagraph'));assert(!d.querySelector('[data-add-paragraph^="line:11:"]'));assert(!d.querySelector('[data-add-paragraph^="line:12:"]'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: empty paragraph stays editable, text restoration without reload, insertion at caret/in document, following text retained, clipboard copy/paste and keyboard fallback, save/reload, protected policies.');
 }finally{dom.window.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
