// University export uses components distilled from the supplied Үлгі.docx.
// Document content is copied, never rewritten in the workspace.
const EXPORT_TEMPLATE=__EXPORT_TEMPLATE__;
function makeDocx(state){
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 const parser=new DOMParser(),serializer=new XMLSerializer();
 const parse=s=>parser.parseFromString(s,'application/xml');
 const documentXml=parse(EXPORT_TEMPLATE.document),body=documentXml.getElementsByTagNameNS(W,'body')[0];
 const children=(el,tag)=>Array.from(el.children).filter(e=>e.namespaceURI===W&&e.localName===tag);
 const first=(el,tag)=>children(el,tag)[0];
 const make=(tag,attrs={})=>{const el=documentXml.createElementNS(W,'w:'+tag);for(const[k,v]of Object.entries(attrs))el.setAttributeNS(W,'w:'+k,String(v));return el};
 const prop=(el,tag,attrs={})=>{for(const old of children(el,tag))old.remove();const p=make(tag,attrs);el.append(p);return p};
 const load=s=>documentXml.importNode(parse(s).documentElement,true);
 const templates=Object.fromEntries(Object.entries(EXPORT_TEMPLATE.paragraphs).map(([k,v])=>[k,load(v)]));
 const tables=EXPORT_TEMPLATE.tables.map(load);
 const L=state.documentLabels||LANG_DATA.labels[state.lang||'kk'],m=state.meta,lang=state.lang||'kk';
 const words={kk:{department:'кафедрасы',weeks:'Апта',competence:'Құзыреттілік',exam:'Қорытынды емтихан',study:'Оқу түрі - күндізгі',total:'Барлығы',director:'институтының директоры'},ru:{department:'Кафедра',weeks:'Недели',competence:'Компетенции',exam:'Итоговый экзамен',study:'Форма обучения — очная',total:'Итого',director:'Директор института'},en:{department:'Department',weeks:'Weeks',competence:'Competencies',exam:'Final examination',study:'Mode of study — full-time',total:'Total',director:'Institute director'}}[lang];
 function setText(p,text,{bold,size,keep=false,align,breakBefore=false}={}){
  let pr=first(p,'pPr');if(!pr){pr=make('pPr');p.prepend(pr)}
  const oldRun=children(p,'r').find(r=>r.getElementsByTagNameNS(W,'t').length),oldRp=oldRun&&first(oldRun,'rPr');
  const rp=oldRp?oldRp.cloneNode(true):make('rPr');
  // Prevent inherited review markings, all-caps and foreign proofing from altering input.
  for(const tag of ['color','highlight','caps','vanish','lang','b','bCs','i','iCs','u'])for(const x of children(rp,tag))x.remove();
  if(bold!==undefined){prop(rp,'b',{val:bold?'1':'0'});prop(rp,'bCs',{val:bold?'1':'0'})}
  if(size){prop(rp,'sz',{val:size*2});prop(rp,'szCs',{val:size*2})}
  prop(rp,'rFonts',{ascii:'Times New Roman',hAnsi:'Times New Roman',cs:'Times New Roman'});
  if(keep)prop(pr,'keepNext');else for(const x of children(pr,'keepNext'))x.remove();
  if(align)prop(pr,'jc',{val:align});if(breakBefore)prop(pr,'pageBreakBefore');
  for(const c of Array.from(p.children))if(c!==pr)c.remove();
  const run=make('r');run.append(rp);String(text??'').split('\n').forEach((line,i)=>{if(i)run.append(make('br'));const t=make('t');t.setAttribute('xml:space','preserve');t.textContent=line;run.append(t)});p.append(run);return p;
 }
 function paragraph(text,options={},prototype=67){const p=templates[prototype].cloneNode(true);setText(p,text,{size:14,bold:false,...options});const pr=first(p,'pPr');prop(pr,'spacing',{before:prototype===46&&!options.breakBefore?160:0,after:prototype===46?100:0,beforeAutospacing:0,afterAutospacing:0,line:240,lineRule:'auto'});const lead=String(text).match(/^(Мақсаты:|Міндеті:|Цель:|Задачи:|Objective:)/);if(lead&&!options.bold){const run=children(p,'r')[0],label=run.cloneNode(true);label.getElementsByTagNameNS(W,'t')[0].textContent=lead[0];prop(first(label,'rPr'),'b',{val:'1'});run.getElementsByTagNameNS(W,'t')[0].textContent=String(text).slice(lead[0].length);p.insertBefore(label,run)}return p}
 const sect=first(body,'sectPr');const add=el=>body.insertBefore(el,sect);
 const values={institute:m.institute,department:lang==='kk'?m.department+(m.department.endsWith(words.department)?'':' '+words.department):words.department+' '+m.department,approve:L.approve,directorTitle:m.directorTitle||L.director,director:'____________ '+m.director,approvalDate:m.approvalDate?m.approvalDate.split('-').reverse().join('.'):'«___» ___________ '+m.date+L.yearSuffix,syllabus:L.syllabus,course:m.code+' '+m.course,program:m.program,credits:L.cycle+' '+m.cycle+', '+m.credits+' ('+m.distribution+') '+L.credits,term:lang==='kk'?m.studyYear+' '+L.yearOfStudy+', '+m.semester+' '+L.semester:L.yearOfStudy+' '+m.studyYear+', '+L.semester+' '+m.semester,year:lang==='kk'?m.year+' '+L.academicYear:L.academicYear+' '+m.year,city:m.city+' '+m.date};
 for(const t of Array.from(body.getElementsByTagNameNS(W,'t'))){const match=t.textContent.match(/^\{\{(\w+)\}\}$/);if(match)t.textContent=values[match[1]]||''}
 // Cover labels must not inherit the source's caps on the course title.
 for(const p of children(body,'p'))for(const caps of Array.from(p.getElementsByTagNameNS(W,'caps')))caps.remove();
 function cellText(cell,value,opt={}){
  let p=first(cell,'p');if(!p){p=make('p');cell.append(p)}
  for(const x of children(cell,'p').slice(1))x.remove();
  setText(p,value,opt);const pr=first(p,'pPr');prop(pr,'spacing',{before:0,after:0,beforeAutospacing:0,afterAutospacing:0,line:240,lineRule:'auto'});prop(pr,'ind',{left:0,right:0,firstLine:0});
  return cell;
 }
 function rowText(row,values,opt={}){children(row,'tc').forEach((c,i)=>cellText(c,values[i]??'',opt));return row}
 function repeatHeader(row){let pr=first(row,'trPr');if(!pr){pr=make('trPr');row.prepend(pr)}prop(pr,'tblHeader');for(const h of children(pr,'trHeight'))h.remove()}
 function cleanRow(row){let pr=first(row,'trPr');if(pr){for(const c of children(pr,'trHeight'))c.remove();for(const c of children(pr,'tblHeader'))c.remove()}
  for(const cell of children(row,'tc')){const cp=first(cell,'tcPr');if(cp)for(const tag of ['vMerge','gridSpan'])for(const x of children(cp,tag))x.remove()}
 }
 function buildTable(index,rows,{header=true,keep=false}={}){
  const table=tables[index].cloneNode(true),sourceRows=children(table,'tr').map(r=>r.cloneNode(true));for(const r of children(table,'tr'))r.remove();
  const special=index===5||index===6;
  if(special){const group=sourceRows[0].cloneNode(true);rowText(group,index===5?[rows[0][0],words.competence]:[...rows[0].slice(0,3),words.weeks],{bold:true,size:12,align:'center'});repeatHeader(group);table.append(group)}
  const headerProto=sourceRows[special?1:0],dataProto=sourceRows[special?2:1]||headerProto;
  rows.forEach((values,i)=>{
   const row=(i===0&&header?headerProto:dataProto).cloneNode(true);if(i>0||!header)cleanRow(row);
   // Source prerequisite/contact/signature tables have no header row.
   const displayed=values.map((v,j)=>i===0&&special&&(index===5?j===0:j<3)?'':index===6&&i>0&&j>=2&&String(v)==='0'?'':v);
   rowText(row,displayed,{bold:i===0&&header,size:[0,1,9].includes(index)?14:index===8?11:12,align:index===6?'center':i===0&&header?'center':'left'});
   if(index===3&&i===0&&header)cellText(children(row,'tc')[5],displayed[5],{bold:true,size:11,align:'center'});
   if(i===0&&header)repeatHeader(row);
   for(const c of children(row,'tc')){const pr=first(c,'tcPr');if(pr)prop(pr,'vAlign',{val:'center'});const p=first(c,'p');if(keep&&p)prop(first(p,'pPr'),'keepNext');}
   table.append(row);
  });
  // Prevent a compact matrix/header from splitting over two pages. Long prose tables can flow.
  if(keep){const cells=table.getElementsByTagNameNS(W,'p');for(let i=0;i<cells.length-1;i++)prop(first(cells[i],'pPr'),'keepNext')}
  return table;
 }
 const textOf=sec=>String(sec.text||'').replace(/\{\{(\w+)\}\}/g,(_,k)=>m[k]??'');
 const tableOnly=new Set([1,5,6,7,8,9]);
 state.sections.forEach((sec,n)=>{
  add(paragraph(sec.title,{bold:true,keep:true,breakBefore:n===0},46));
  if(n===0){
   const lecturerLine=paragraph('1.1 '+L.lecturer+': ',{bold:true,keep:true},48);lecturerLine.append(children(paragraph(m.lecturer),'r')[0]);add(lecturerLine);
   const officeLabel=lang==='kk'?'кеңсе: кабинет ':L.office+': ',hoursLabel=lang==='kk'?'Офис-сағаты: ':L.hours+': ';
   add(buildTable(0,[[officeLabel+(m.office||''),hoursLabel+(m.officeHours||'')],['','e-mail: '+(m.email||'')]],{header:false}));
   add(paragraph(''));
   add(paragraph('1.2 '+L.practice+':',{bold:true,keep:true},53));add(paragraph(m.practice,{keep:true},54));
   add(buildTable(1,[[officeLabel+(m.practiceOffice??m.office??''),hoursLabel+(m.practiceHours??m.officeHours??'')],['','e-mail: '+(m.practiceEmail??(m.practice===m.lecturer?m.email:''))]],{header:false}));
   add(paragraph(''));add(paragraph(m.studyMode||words.study,{bold:true},58));
  }else if(!tableOnly.has(n)&&n!==10){for(const line of textOf(sec).split('\n'))add(paragraph(line))}
  if(n===10){const lines=textOf(sec).split('\n');for(const line of lines.filter(x=>!/(?:Баға\s*=|Оценка\s*=|Grade\s*=|Жалпы балл|Общий балл|Total score|^Примечание|^Ескерту|^Түсініктеме|^Практикада:)/i.test(x)))add(paragraph(line))}
  if(state.tables[n]){
   const map={1:2,5:3,6:4,7:5,8:6,9:7,10:8};let rows=state.tables[n].map(r=>r.slice()),scoreGroups=[];
   if(n===8){
    const projected=[rows[0].filter((_,j)=>j!==18)],regular=[],exams=[];let sum=0;
    for(const r of rows.slice(1)){
     const weekly=r.slice(3,18).reduce((a,x)=>a+(Number(String(x).replace(',','.'))||0),0),exam=Number(String(r[18]||0).replace(',','.'))||0;
     if(weekly||!exam){const p=r.filter((_,j)=>j!==18);p[18]=String(weekly);regular.push(p)}
     if(exam){const p=Array(19).fill('');p[0]=r[0];p[1]=weekly?r[1]+' — '+words.exam:r[1]||words.exam;p[2]=r[2];p[18]=String(exam);exams.push(p)}sum+=weekly+exam;
    }
    projected.push(...regular,...exams);scoreGroups=[{start:2,count:regular.length,total:regular.reduce((a,r)=>a+Number(r[18]),0)},{start:2+regular.length,count:exams.length,total:exams.reduce((a,r)=>a+Number(r[18]),0)}];
    const total=Array(19).fill('');total[1]=words.total;total[18]=String(Math.round(sum*100)/100);projected.push(total);rows=projected;
   }
   const table=buildTable(map[n],rows,{header:n!==1,keep:n===8&&rows.length<16});
   if(n===8){const rs=children(table,'tr');for(const group of scoreGroups)for(let i=0;i<group.count;i++){const c=children(rs[group.start+i],'tc')[18];if(group.count>1)prop(first(c,'tcPr'),'vMerge',i===0?{val:'restart'}:{});cellText(c,i===0?String(Math.round(group.total*100)/100):'',{size:12,align:'center'})}}
   // Reproduce vertically merged traditional-grade groups without discarding custom labels.
   if(n===9){const rs=children(table,'tr');let start=1;while(start<rs.length){const value=rows[start]?.[4];let end=start+1;while(value&&end<rs.length&&rows[end]?.[4]===value)end++;if(end-start>1)for(let j=start;j<end;j++){const cell=children(rs[j],'tc')[4];prop(first(cell,'tcPr'),'vMerge',j===start?{val:'restart'}:{});if(j>start)cellText(cell,'',{size:12})}start=end}}
   add(table);add(paragraph(''));
  }
  if(n===10){const formula=textOf(sec).split('\n').filter(x=>/(?:Баға\s*=|Оценка\s*=|Grade\s*=|Жалпы балл|Общий балл|Total score)/i.test(x));for(const line of formula)add(paragraph(line,{bold:/=/.test(line)}))}
 });
 add(paragraph((m.department?'«'+m.department+'» ':'')+L.approvedMeeting+' '+m.protocol));add(paragraph(''));
 add(buildTable(9,[[L.head,m.head],['',''],[L.author,m.author]],{header:false}));add(paragraph(''));
 add(paragraph(L.agreed,{bold:true,keep:true},151));
 for(const line of String(m.agreement||'________________________').split('\n'))add(paragraph(line,{},154));
 const files={...EXPORT_TEMPLATE.parts,'word/document.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+serializer.serializeToString(documentXml)};
 for(const[name,data]of Object.entries(EXPORT_TEMPLATE.binary))files[name]=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
 files['word/settings.xml']=files['word/settings.xml'].replace('</w:settings>','<w:updateFields w:val="true"/></w:settings>');
 return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
