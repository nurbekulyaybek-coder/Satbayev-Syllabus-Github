"""Run locally: API key is entered without echo and never sent to the browser."""
from pathlib import Path
import getpass,json,os
root=Path(__file__).resolve().parent
print('OpenAI API configuration. Do not paste your key into ChatGPT or the browser.')
key=getpass.getpass('API key (hidden): ').strip()
if not key:raise SystemExit('No key entered. Nothing changed.')
model=input('Model [gpt-4.1-mini]: ').strip() or 'gpt-4.1-mini'
p=root/'runtime/ai-config.json';p.parent.mkdir(exist_ok=True);p.write_text(json.dumps({'api_key':key,'model':model}),encoding='utf-8')
try:os.chmod(p,0o600)
except OSError:pass
print('Saved locally. Open the AI chat in the running site; no server restart is required.')
