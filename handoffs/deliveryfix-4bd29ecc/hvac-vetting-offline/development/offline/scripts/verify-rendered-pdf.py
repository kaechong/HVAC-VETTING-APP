"""Regression: actual rendered PDF must contain every complete Finding with exact counts.
Text checks supplement screenshots; they are not a substitute for viewing the pages.
"""
from pathlib import Path
from collections import Counter
import argparse,json,hashlib
import fitz
ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--pdf-root',required=True);p.add_argument('--output',required=True);a=p.parse_args()
root=Path(a.pdf_root);results=[]
base=fitz.open(next((root/'mother').glob('*.pdf')))
for case in ['mother','normal','zero','long-18']:
    path=next((root/case).glob('*.pdf'));doc=fitz.open(path)
    # The unmodified checklist is six pages with this exact renderer/font environment.
    # A changed count or different fonts requires review, not silently resetting the baseline.
    if case!='mother':
        assert len(doc)>=6
        for i in range(6):assert doc[i].get_pixmap(alpha=False).samples==base[i].get_pixmap(alpha=False).samples,(case,i+1,'CHECKLIST_PIXEL_CHANGED')
    text=''.join(''.join(p.get_text().split()) for p in list(doc)[6:]);counts=[]
    if case!='mother':
        data=json.loads((ROOT/'samples/final-r3'/case/'input.json').read_text())
        expected=Counter(''.join(f['description'].split()) for f in data['findings'])
        for value,count in expected.items():
            actual=text.count(value);counts.append({'expected':count,'actual':actual,'description_sha256':hashlib.sha256(value.encode()).hexdigest()})
            assert actual==count,(case,'CLIPPED_OR_MISSING_FINDING',actual,count)
        assert text.count('；')==len(data['findings']), (case,'TERMINATOR_COUNT')
        assert 'XXXXX' not in text and '沒有提交通風系統風量計算書及空調系統負荷計算書；' not in text,(case,'EXAMPLE_LEAK')
    results.append({'case':case,'pages':len(doc),'report_pages':len(doc)-6,'full_problem_text_counts':counts,'status':'PASS_RENDERED_TEXT_REGRESSION'})
Path(a.output).write_text(json.dumps({'engine':'LibreOffice Calc PDF + PyMuPDF','status':'PASS','scope':'rendered-content regression; visual/print signoff remains provisional','results':results},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False))
