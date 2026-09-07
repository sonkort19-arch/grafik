from pathlib import Path
import re
import hashlib

index_path = Path('index.html')
css_path = Path('styles.css')

html = index_path.read_text(encoding='utf-8')
if css_path.exists():
    raise SystemExit('styles.css already exists; refusing to overwrite unexpectedly')

style_matches = list(re.finditer(r'<style>(.*?)</style>', html, re.S))
if len(style_matches) != 1:
    raise SystemExit(f'Expected exactly 1 <style> block, found {len(style_matches)}')

match = style_matches[0]
css = match.group(1)
if len(css.strip()) < 1000:
    raise SystemExit('CSS block unexpectedly small')

# Safety snapshots: body and all JS must remain byte-for-byte identical.
body_before = html[html.find('<body'):]
scripts_before = re.findall(r'<script\b[^>]*>.*?</script>', html, re.S)
script_hash_before = hashlib.sha256('\n'.join(scripts_before).encode('utf-8')).hexdigest()

replacement = '<link rel="stylesheet" href="styles.css">'
new_html = html[:match.start()] + replacement + html[match.end():]

body_after = new_html[new_html.find('<body'):]
scripts_after = re.findall(r'<script\b[^>]*>.*?</script>', new_html, re.S)
script_hash_after = hashlib.sha256('\n'.join(scripts_after).encode('utf-8')).hexdigest()

if body_before != body_after:
    raise SystemExit('Safety check failed: body changed')
if script_hash_before != script_hash_after:
    raise SystemExit('Safety check failed: JavaScript changed')
if new_html.count('href="styles.css"') != 1:
    raise SystemExit('styles.css link count is not 1')
if '<style>' in new_html or '</style>' in new_html:
    raise SystemExit('Inline style block still present')

# Preserve CSS content exactly, only ensure file ends with newline.
if not css.endswith('\n'):
    css += '\n'

css_path.write_text(css, encoding='utf-8')
index_path.write_text(new_html, encoding='utf-8')

print(f'Extracted {len(css)} CSS characters')
print('JavaScript unchanged:', script_hash_before)
print('Body unchanged: yes')
