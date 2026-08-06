from pathlib import Path
import re, json, base64, mimetypes

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'src/main.js'
INDEX = ROOT / 'index.html'
OUT = ROOT / 'docs/proof_build_v142.html'

IMPORT_RE = re.compile(r'''(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+)["']([^"']+)["']''')
SIDE_RE = re.compile(r'''import\s*["']([^"']+)["']''')

sources = {}
deps = {}

def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()

def scan(path: Path):
    key = rel(path)
    if key in sources:
        return
    text = path.read_text(encoding='utf-8')
    # inline key assets for about:blank proof execution
    asset = ROOT / 'public/assets/mechas/axiom-placeholder.png'
    if asset.exists():
        data = base64.b64encode(asset.read_bytes()).decode('ascii')
        uri = f'data:image/png;base64,{data}'
        text = text.replace('./assets/mechas/axiom-placeholder.png', uri)
        text = text.replace('./public/assets/mechas/axiom-placeholder.png', uri)
    specs = []
    for regex in (IMPORT_RE, SIDE_RE):
        for spec in regex.findall(text):
            if spec.startswith('.') and spec not in specs:
                specs.append(spec)
    dmap = {}
    for spec in specs:
        target = (path.parent / spec).resolve()
        if target.suffix == '':
            target = target.with_suffix('.js')
        if not target.exists():
            raise FileNotFoundError(f'{key}: {spec} -> {target}')
        dmap[spec] = rel(target)
        scan(target)
    sources[key] = text
    deps[key] = dmap

scan(ENTRY)

# recursively inline CSS imports
seen_css = set()
def css_bundle(path: Path):
    key = rel(path)
    if key in seen_css:
        return ''
    seen_css.add(key)
    text = path.read_text(encoding='utf-8')
    out = []
    pos = 0
    for m in re.finditer(r'''@import\s+["']([^"']+)["'];?''', text):
        out.append(text[pos:m.start()])
        spec = m.group(1)
        out.append(css_bundle((path.parent/spec).resolve()))
        pos = m.end()
    out.append(text[pos:])
    return '\n'.join(out)

css = css_bundle(ROOT/'src/styles/index.css')
html = INDEX.read_text(encoding='utf-8')
html = re.sub(r'<link[^>]+href=["\']\./src/styles/index\.css["\'][^>]*>', '<style id="proof-inline-css">'+css+'</style>', html)
html = re.sub(r'<script[^>]+src=["\']\./src/main\.js["\'][^>]*></script>', '', html)

loader = f'''<script type="module">
const SOURCES = {json.dumps(sources, ensure_ascii=False)};
const DEPS = {json.dumps(deps, ensure_ascii=False)};
const URLS = new Map();
const escapeRegExp = (value) => value.replace(/[.*+?^${{}}()|[\\]\\\\]/g, '\\\\$&');
async function build(path) {{
  if (URLS.has(path)) return URLS.get(path);
  let source = SOURCES[path];
  if (source == null) throw new Error('Missing proof module: '+path);
  for (const [specifier, dependency] of Object.entries(DEPS[path] || {{}})) {{
    const dependencyUrl = await build(dependency);
    const pattern = new RegExp('(["\\\'])' + escapeRegExp(specifier) + '\\\\1', 'g');
    source = source.replace(pattern, JSON.stringify(dependencyUrl));
  }}
  const url = URL.createObjectURL(new Blob([source], {{ type:'text/javascript' }}));
  URLS.set(path, url);
  return url;
}}
try {{
  const entry = await build('src/main.js');
  await import(entry);
  window.__PROOF_BUILD_READY__ = true;
}} catch (error) {{
  console.error('[proof build]', error);
  window.__PROOF_BUILD_ERROR__ = String(error && (error.stack || error.message) || error);
}}
</script>'''
html = html.replace('</body>', loader+'\n</body>')
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding='utf-8')
print(json.dumps({'out':str(OUT),'modules':len(sources),'cssBytes':len(css),'htmlBytes':len(html)}, indent=2))
