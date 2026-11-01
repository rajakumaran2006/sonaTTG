import json

with open('ocr_results.json', 'r', encoding='utf-8-sig') as f:
    pages = json.load(f)

for p, name in [(9, 'IT_II_A'), (10, 'IT_II_B'), (11, 'IT_II_C'), (21, 'AIDS_II_A'), (22, 'AIDS_II_B'), (23, 'AIDS_II_C')]:
    print(f"\n=== PAGE {p} ({name}) ===")
    for l in pages[p]['lines']:
        text = l['text']
        if any(k in text.lower() for k in ['u23mat301e', 'applied prob', 'ap&s']):
            words = l.get('words', [])
            y = words[0]['y'] if words else 0
            print(f"  y={int(y)}: {text}")
