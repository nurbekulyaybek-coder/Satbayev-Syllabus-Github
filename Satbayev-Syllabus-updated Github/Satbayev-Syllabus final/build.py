"""Build the single-page frontend served by server.py from readable source files. Python 3, standard library only."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parent
state=json.loads((ROOT/'data/initial-state.json').read_text(encoding='utf-8'))
app=(ROOT/'src/app.js').read_text(encoding='utf-8')
inline=(ROOT/'src/inline-editor.js').read_text(encoding='utf-8')
for name,nextname in [('paragraph','docTable'),('docTable','renderDocument'),('renderDocument','scalePages')]:
 start=inline.index('function '+name+'(');end=inline.index('\nfunction '+nextname+'(',start);app=app.replace('__'+name.upper()+'__',inline[start:end])
app=app.replace('__SCALEPAGES__',inline[inline.index('function scalePages('):])
app=app.replace('__EXTENSIONS__',(ROOT/'src/word-export.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/features.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/v3.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/v4.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/ux.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/text-tools.js').read_text(encoding='utf-8'))
if re.search(r'__[A-Z]+__',app):raise RuntimeError('Unexpanded source placeholder')
css=(ROOT/'src/styles.css').read_text(encoding='utf-8')
shell=(ROOT/'src/shell.html').read_text(encoding='utf-8')
language_data={'packs':json.loads((ROOT/'data/languages.json').read_text(encoding='utf-8')),**json.loads((ROOT/'data/terms.json').read_text(encoding='utf-8'))}
embedded=json.dumps(state,ensure_ascii=False).replace('<','\\u003c')
html=shell.replace('__CSS__',css)+'<script id="language-data" type="application/json">'+json.dumps(language_data,ensure_ascii=False).replace('<','\\u003c')+'</script><script id="embedded-state" type="application/json">'+embedded+'</script>\n<script>\n'+app+'\n</script></body></html>'
(ROOT/'index.html').write_text(html,encoding='utf-8')
(ROOT/'tests/compiled-app.js').write_text(app,encoding='utf-8')
print('Built',ROOT/'index.html')
