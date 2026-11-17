const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),window=new JSDOM('').window;
const pack=JSON.parse(fs.readFileSync(root+'/data/export-template.json','utf8'));
const ctx={LANG_DATA:{labels:JSON.parse(fs.readFileSync(root+'/data/terms.json','utf8')).labels},DOMParser:window.DOMParser,XMLSerializer:window.XMLSerializer,Blob,TextEncoder,Uint8Array,DataView,atob,console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/src/word-export.js','utf8')+'\n'+fs.readFileSync(root+'/src/template-export.js','utf8').replace('__EXPORT_TEMPLATE__',JSON.stringify(pack)),ctx);
function unzipStore(bytes){const files={};let p=0;while(bytes.readUInt32LE(p)===0x04034b50){const size=bytes.readUInt32LE(p+18),nl=bytes.readUInt16LE(p+26),xl=bytes.readUInt16LE(p+28),name=bytes.subarray(p+30,p+30+nl).toString();const start=p+30+nl+xl;files[name]=bytes.subarray(start,start+size);p=start+size}return files}
(async()=>{
 const state=JSON.parse(fs.readFileSync(process.argv[2]||root+'/data/initial-state.json','utf8'));const original=JSON.stringify(state);
 const bytes=Buffer.from(await ctx.makeDocx(state).arrayBuffer()),files=unzipStore(bytes),xml=files['word/document.xml'].toString();
 const doc=new window.DOMParser().parseFromString(xml,'application/xml');assert(!doc.querySelector('parsererror'));
 assert(xml.includes('w:w="11906"'));assert(xml.includes('w:left="1701"'));assert(xml.includes('w:titlePg'));
 assert(xml.includes('w:sz w:val="28"'));assert(xml.includes('w:tblHeader'));assert(xml.includes('w:gridSpan'));assert(!xml.includes('{{'));
 assert.equal(JSON.stringify(state),original,'export does not mutate user data');
 assert(!files['word/media/image2.png'],'no source handwritten signature');assert(files['word/media/image1.png'],'source university logo retained');
 for(const name of ['word/header2.xml','word/footer2.xml','word/styles.xml'])assert.equal(files[name].toString(),pack.parts[name]);
 const tables=doc.getElementsByTagName('w:tbl');assert.equal(tables.length,10,'two separate instructor contact blocks');
 const score=tables[6];assert.equal(score.getElementsByTagName('w:gridCol').length,19,'standard nineteen-column matrix');
 const out=process.argv[3]||root+'/tests/template-export.docx';fs.writeFileSync(out,bytes);
 // Custom teacher contacts and input escaping must survive independently.
 state.meta.practiceEmail='practice@example.test';state.meta.email='lecture@example.test';state.meta.course='A < B & C';state.sections[2].text='First\n\nLast';
 const custom=unzipStore(Buffer.from(await ctx.makeDocx(state).arrayBuffer()))['word/document.xml'].toString();
 assert(custom.includes('practice@example.test'));assert(custom.includes('lecture@example.test'));assert(custom.includes('A &lt; B &amp; C'));
 const parsed=new window.DOMParser().parseFromString(custom,'application/xml');const ps=[...parsed.getElementsByTagName('w:p')].map(p=>p.textContent);let at=ps.indexOf('First');assert.equal(ps[at+1],'');assert.equal(ps[at+2],'Last');
 console.log('PASS: reference geometry/logo/headers/styles, separate contacts, 19-column score export, XML escaping, blank lines, no copied signature, no state mutation.');
 window.close();
})().catch(e=>{console.error(e);window.close();process.exitCode=1});
