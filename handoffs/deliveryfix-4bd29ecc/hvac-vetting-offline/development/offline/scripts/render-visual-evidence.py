"""Use an already-installed LibreOffice; never install or change workbook bytes."""
from pathlib import Path
import subprocess, argparse, json, hashlib
ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--out',required=True);args=p.parse_args()
out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
inputs={'mother':ROOT/'baseline/plan/templates/HVAC_VETTING_CHECKLIST_MOTHER_20261007.xlsx',**{case:ROOT/'samples/final-r3'/case/'report-v1.0.xlsx' for case in ['normal','zero','long-18']}}
results=[]
for case,path in inputs.items():
    target=out/case;target.mkdir();original=path.read_bytes()
    cmd=['soffice','-env:UserInstallation='+(out/'lo-profile').as_uri(),'--headless','--convert-to','pdf:calc_pdf_Export','--outdir',str(target),str(path)]
    run=subprocess.run(cmd,capture_output=True,text=True,timeout=55)
    result={'case':case,'input_sha256':hashlib.sha256(original).hexdigest(),'command':cmd,'returncode':run.returncode,'stdout':run.stdout,'stderr':run.stderr}
    assert path.read_bytes()==original
    assert run.returncode==0 and (target/(path.stem+'.pdf')).is_file(),result
    results.append(result);print(case,flush=True)
(out/'CONVERSION_LOG.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
