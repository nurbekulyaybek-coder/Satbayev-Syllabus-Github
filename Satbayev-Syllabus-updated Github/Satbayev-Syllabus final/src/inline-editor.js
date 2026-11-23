function paragraph(txt,key=''){
 if(!txt.trim()&&!/^(line|agreement):/.test(key))return;txt=renderText(txt);
 let p=document.createElement('p'),b=pageBodies.at(-1);standardParagraphText(p,txt);if(key){const q=key.split(':');if(q[0]==='line'&&+q[1]===4){const lines=S.sections[4].text.split('\\n'),headings=/^(Білуі керек|Істей алуы керек|Дағдыларды меңгеру|Знать|Уметь|Владеть|Knowledge|Skills|Ability to)\\s*:/i;const firsts=lines.map((line,i)=>headings.test(line.trim())?lines.findIndex((x,j)=>j>i&&x.trim()): -1).filter(i=>i>=0);if(firsts.includes(+q[2])&&txt.trim())p.style.fontWeight='bold'}}if(!txt.trim())p.classList.add('empty-paragraph');if(key)setEditable(p,key,true);b.append(p);if(!overflow(b)){decorateParagraph(p,key);return}p.remove();if(!txt.trim()){newPage();pageBodies.at(-1).append(p);decorateParagraph(p,key);return}let rest=txt;
 while(rest){b=pageBodies.at(-1);p=document.createElement('p');b.append(p);let lo=0,hi=rest.length;while(lo<hi){const mid=Math.ceil((lo+hi)/2);p.textContent=rest.slice(0,mid);if(overflow(b))hi=mid-1;else lo=mid}if(!lo){p.remove();newPage();continue}let cut=lo;if(lo<rest.length){let space=rest.lastIndexOf(' ',lo);if(space>lo*.65)cut=space+1}standardParagraphText(p,rest.slice(0,cut));if(rest!==txt)p.style.textIndent='0';if(key)setEditable(p,key,true);rest=rest.slice(cut);if(rest)newPage();else decorateParagraph(p,key)}
}
function docTable(rows,n,keys=null){
 let table,tbody;
 const fill=(cell,text,r,c,join=false)=>{cell.textContent=text;const key=keys?.[r]?.[c]||(rows===S.tables[n]?`table:${n}:${r}:${c}`:'');if(key)setEditable(cell,key,join||r>0)};
 const init=()=>{table=document.createElement('table');if(n===8)table.className='dense';let tr=table.createTHead().insertRow();rows[0].forEach((c,j)=>{let th=document.createElement('th');fill(th,c,0,j);tr.append(th)});tbody=table.createTBody();pageBodies.at(-1).append(table)};
 init();for(let i=1;i<rows.length;i++){const r=rows[i];let tr=tbody.insertRow();r.forEach((c,j)=>fill(tr.insertCell(),c,i,j));if(overflow(pageBodies.at(-1))){tr.remove();if(!tbody.rows.length)table.remove();newPage();init();tbody.append(tr);if(overflow(pageBodies.at(-1))){tr.remove();let remaining=r.slice();while(remaining.some(Boolean)){let part=tbody.insertRow(),cells=remaining.map(()=>part.insertCell()),low=1,high=Math.max(...remaining.map(x=>x.length)),fit=0;while(low<=high){const mid=Math.floor((low+high)/2);cells.forEach((c,j)=>c.textContent=remaining[j].slice(0,mid));if(overflow(pageBodies.at(-1)))high=mid-1;else{fit=mid;low=mid+1}}if(!fit){part.remove();break}cells.forEach((c,j)=>{fill(c,remaining[j].slice(0,fit),i,j,true);remaining[j]=remaining[j].slice(fit)});if(remaining.some(Boolean)){newPage();init()}}}}}
 if(n===8){const footer=table.insertRow();footer.className='assessment-total';rows[0].forEach((_,j)=>{const cell=footer.insertCell();cell.textContent=j===1?D('total'):j<3?'':numericString(rows.slice(1).reduce((sum,row)=>sum+Number(String(row[j]||'0').replace(',','.')),0))});if(overflow(pageBodies.at(-1))){footer.remove();newPage();init();tbody.append(footer)}}
}
function renderDocument(){
 let preview=document.querySelector('.preview'),oldStyle=preview.getAttribute('style');if(!preview.offsetWidth)preview.style.cssText='display:block;position:fixed;left:-10000px;top:0;width:850px;max-height:none;visibility:hidden';let prior=$('pages').innerHTML;
 try{
 $('pages').innerHTML='';pageBodies=[];inlineBaseLines=S.sections.map(x=>x.text.split('\n'));inlineBaseAgreement=S.meta.agreement.split('\n');let m=S.meta,b=newPage(true);
 standardCover(b);
 newPage();S.sections.forEach((sec,n)=>{
 let current=pageBodies.at(-1);if(current.lastElementChild&&current.clientHeight-(current.lastElementChild.offsetTop-current.offsetTop+current.lastElementChild.offsetHeight)<80)newPage();let h=document.createElement('h2');h.textContent=sec.title;setEditable(h,`title:${n}`);addBlock(h);
 if(n===0)standardTeachers();
 else if(!standardTableOnly.has(n))sec.text.split('\n').forEach((txt,i)=>{if(n!==10||!isFormula(txt)&&!isSupplement(txt))paragraph(txt,`line:${n}:${i}`)});
 if(S.tables[n]){if(n===8)standardScores();else docTable(S.tables[n],n)}
 if(n===10)sec.text.split('\n').forEach((txt,i)=>{if(isFormula(txt)){paragraph(txt,`line:${n}:${i}`);pageBodies.at(-1).lastElementChild?.classList.add('formula')}});

 });
 standardSignatures();standardPrintStyle();
 $('pageCount').textContent=pageBodies.length+' '+T('pages')+' · A4';if(S.active===15)checks();
 }catch(e){$('pages').innerHTML=prior;toast('Құжатты құру қатесі: '+e.message)}finally{if(oldStyle===null)preview.removeAttribute('style');else preview.setAttribute('style',oldStyle);scalePages()}
}
function scalePages(){const p=$('pages');if(!p.clientWidth)return;const width=793.7008,scale=zoomMode||Math.min(1,p.clientWidth/width);p.querySelectorAll('.sheet-wrap').forEach(w=>{w.style.width=width*scale+'px';w.style.height=1122.5197*scale+'px';w.firstChild.style.transform=`scale(${scale})`})}
