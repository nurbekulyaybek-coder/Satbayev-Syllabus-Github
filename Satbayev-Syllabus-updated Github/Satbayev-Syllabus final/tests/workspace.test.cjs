const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),seed=JSON.parse(fs.readFileSync(root+'/data/initial-state.json'));
let saved={activeId:'original',documents:[{id:'original',name:'Original',state:seed,versions:[]}]},revision=0,fail=false;
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'http://localhost:8765',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.confirm=()=>true;w.prompt=()=> 'New document';
 w.HTMLElement.prototype.scrollTo=function(o){this.scrollTop=o.top||0};
 w.fetch=async(url,opts={})=>{let response={configured:false};if(url==='/api/me')response={user:{role:'user',name:'Test',username:'test',csrf:'x'}};
 if(url==='/api/workspace'){if(opts.method==='PUT'){if(fail)return {ok:false,status:409,json:async()=>({error:'Conflict'})};saved=JSON.parse(opts.body).workspace;revision++}response={workspace:structuredClone(saved),revision}}
 return {ok:true,json:async()=>response};};
}});
(async()=>{try{await new Promise(r=>setTimeout(r,250));const w=dom.window;
 assert.equal(w.document.querySelectorAll('[role=tab]').length,1);
 const original=w.eval('S.sections[0].text');w.eval("S.sections[0].text='First edit';changed();moveHistory()");assert.equal(w.eval('S.sections[0].text'),original);
 w.eval('moveHistory(true)');assert.equal(w.eval('S.sections[0].text'),'First edit');
 await w.eval("saveNamedVersion('Milestone')");assert.equal(saved.documents[0].versions[0].state.sections[0].text,'First edit');
 w.eval('newDocument()');assert.equal(w.document.querySelectorAll('[role=tab]').length,2);assert.equal(w.eval('S.sections[0].text'),'');
 w.eval("S.sections[0].text='Second';changed();selectDocument('original')");assert.equal(w.eval('S.sections[0].text'),'First edit');
 w.eval("S.meta.university='Custom';S.active=13;renderEditor()");assert.equal(w.document.querySelector('#sectext').readOnly,false);assert.equal(w.document.querySelector('#sectitle').readOnly,false);
 await w.eval('saveProjectNow()');await w.eval('loadDocument()');assert.equal(w.eval('S.meta.university'),'Custom');assert.equal(saved.documents[1].state.sections[0].text,'Second');
 await w.eval('resetContent(false)');assert.equal(w.eval('S.sections[0].text'),'');assert.equal(w.eval('S.meta.university'),'Custom');w.eval('moveHistory()');assert.equal(w.eval('S.sections[0].text'),'First edit');
 fail=true;w.eval("S.sections[0].text='Unsaved';changed()");await w.eval('saveProjectNow()');assert.equal(w.eval('dirty'),true);assert.equal(w.eval('S.sections[0].text'),'Unsaved');

 fail=false;
 w.eval("setMeta('institute',CURRICULUM.institute);setMeta('department',CURRICULUM.department);setMeta('program',CURRICULUM.program);setMeta('studyYear','2');setMeta('semester','4');S.lang='ru';renderEditor()");
 assert(w.eval("courseOptions().some(c=>c.code==='GPH552')"));assert(!w.eval("courseOptions().some(c=>c.code==='GPH548')"));
 w.eval("setMeta('course','Введение в сейсмологию')");assert.equal(w.eval('S.meta.code'),'GPH552');assert.equal(w.eval('S.meta.credits'),'4');assert.equal(w.eval('S.meta.distribution'),'30/15/0');assert.equal(w.eval('S.meta.year'),'2026–2027');
 w.eval("setMeta('studyYear','4');setMeta('semester','8');setMeta('course','Искусственный интеллект и анализ сейсмологических данных')");assert.equal(w.eval('S.meta.code'),'GPH548');assert.equal(w.eval('S.meta.credits'),'5');
 await w.eval('saveProjectNow()');await w.eval('loadDocument()');assert.equal(w.eval("S.courses.filter(c=>c.curriculumId).length"),81);

 await w.eval('saveProjectNow()');w.eval('renderAll()');
 const beforeLanguage=w.eval('JSON.stringify(S)'),beforeWorkspace=w.eval('JSON.stringify(workspace)'),beforeRevision=revision;
 const beforePreview=w.document.querySelector('#pages').textContent;
 for(const lang of ['en','ru','kk']){
  await w.eval(`switchLanguage('${lang}')`);
  assert.equal(w.document.documentElement.lang,lang);
  assert.equal(w.eval('JSON.stringify(S)'),beforeLanguage,'language must not mutate syllabus');
  assert.equal(w.eval('JSON.stringify(workspace)'),beforeWorkspace,'language must not mutate tabs or versions');
  assert.equal(w.document.querySelector('#pages').textContent,beforePreview,'document preview must stay unchanged');
  assert.equal(w.localStorage.getItem('syllabus-interface-language'),lang);
 }
 assert.equal(revision,beforeRevision,'language must not save or translate the document');
 await w.eval("switchLanguage('en');loadDocument()");assert.equal(w.document.querySelector('#language').value,'en');
 assert.equal(w.document.querySelectorAll('.workspace-actions button')[4].textContent,'Save version');
 console.log('PASS: three interface languages preserve document, preview, tabs, versions and server revision; preference survives reload.');
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: full startup, Undo/Redo, tab isolation, version persistence, reload, editable user fields, reset/undo and failed-save preservation.');
 }catch(e){console.error(e);process.exitCode=1}finally{dom.window.close()}})();
