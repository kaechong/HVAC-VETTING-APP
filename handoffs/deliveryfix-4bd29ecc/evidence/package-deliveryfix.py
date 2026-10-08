"""Create and independently extract/verify a new local archive; never edit originals."""
from pathlib import Path
import json,hashlib,zipfile,tempfile
root=Path(__file__).resolve().parent.parent
source=root/'hvac-vetting-offline'
base=json.loads((root/'evidence/BASELINE_VERIFICATION.json').read_text())['files']
selected={str(Path('hvac-vetting-offline')/e['path']):source/e['path'] for e in base}
new='development/offline/test/delivery-recovery.test.mjs'
selected[str(Path('hvac-vetting-offline')/new)]=source/new
selected['OFFLINE_DELIVERYFIX_HANDOFF.md']=root/'OFFLINE_DELIVERYFIX_HANDOFF.md'
for p in sorted((root/'evidence').rglob('*')):
 if p.is_file():selected[str(p.relative_to(root))]=p
for path,p in selected.items():
 assert not p.is_symlink(),path
 assert not any(c in {'node_modules','qc-lineages','test-output'} for c in Path(path).parts),path
manifest=[{'path':path,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for path,p in sorted(selected.items())]
(root/'FIX_FILES.sha256').write_text(''.join(e['sha256']+'  '+e['path']+'\n' for e in manifest))
selected['FIX_FILES.sha256']=root/'FIX_FILES.sha256'
archive=root/'HVAC_VETTING_OFFLINE_DELIVERYFIX.zip'
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for path,p in sorted(selected.items()):
  info=zipfile.ZipInfo(path,date_time=(2026,10,8,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
check=Path(tempfile.mkdtemp(prefix='archive-verification-',dir=root))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert sorted(z.namelist())==sorted(selected)
 for n in z.namelist():
  assert not Path(n).is_absolute() and '..' not in Path(n).parts
  assert z.read(n)==selected[n].read_bytes(),n
 z.extractall(check)
for e in manifest:
 b=(check/e['path']).read_bytes();assert len(b)==e['bytes'] and hashlib.sha256(b).hexdigest()==e['sha256'],e['path']
assert (check/'FIX_FILES.sha256').read_bytes()==(root/'FIX_FILES.sha256').read_bytes()
b=archive.read_bytes();sha=hashlib.sha256(b).hexdigest()
(root/'HVAC_VETTING_OFFLINE_DELIVERYFIX.zip.sha256').write_text(sha+'  '+archive.name+'\n')
receipt={'kind':'bounded-offline-deliveryfix','baseline_commit':'e394cb80bc71a91b54a5176fd0963fe4935cebd8','archive':str(archive),'bytes':len(b),'sha256':sha,'members':len(selected),'zip_crc_test':'PASS','each_zip_member_bytes_verified':'PASS','each_extracted_file_bytes_and_sha256_verified':'PASS','extraction':str(check),'changed_baseline_files':2,'new_tests':10,'focused_tests':{'pass':10,'fail':0},'full_tests':{'pass':39,'fail':0,'preserved_baseline_tests':29},'independent_sample_versions':9,'representative_xlsx_hashes':'unchanged','original_publication_97_files':'unchanged','remote_operations':0,'dependencies_included':False,'engineering_acceptance':'NOT_RUN','layout':'provisional','product_score':'NOT_ASSESSED','manifest':manifest}
(root/'DELIVERYFIX_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='manifest'},indent=2))
