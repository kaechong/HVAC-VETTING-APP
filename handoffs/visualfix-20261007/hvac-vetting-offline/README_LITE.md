# HVAC Vetting 離線精簡交接：VISUALFIX

只重現已批准的合成 Finding／母本renderer／本地交付及離線驗證，沒有新增產品功能。原QCFIX ZIP保留，SHA-256 dbd26dd932b7c0fc2340dc716477557bf33cb86618d697a91ab6282d4a6ca2dc。

29項Node測試全部保留且重跑PASS；8組合成資料重現9個版本並獨立讀回。實際LibreOffice PDF發現長中文行高不足，僅改報告body行高估算，385字問題從238pt增至301pt。文字、樣式、欄寬、頁設定和母本不變，標題行高不變，超過409.5pt仍拒絕。完整段落由0／18變18／18，保留前後PDF、實際截圖、diff與失敗日誌。三個樣本的前六個清單頁與母本逐像素相同。

母本原本橫向分頁，D「違反法規」及較長項目名称部分會在另一頁。15預留編號、示例及正式列印選擇仍provisional，不自行改單頁／橫向或重複標題。這不是Microsoft Excel／PC、工程師、真模型QC或全24項工程驗收。產品分數未評估，月費資格／runner／Drive／部署未完成。完整24項、四路及澳門／IBC-NFPA隔離不縮範圍。

## 檔案

- baseline/plan/：固定commit 15d768da15271c238d2a85581b93d8da62e12d52 的20檔，含真正兩頁母本及完整需求／計劃／阻塞文件。
- development/offline/：完整離線實作、Finding schema、全部29項測試／fixture、package.json／lockfile、CLI及樣本／讀回／PDF回歸工具。
- samples/final-r3/：8組固定input＋合成來源、正常重出input及三個代表性XLSX；其他版本可由samples命令重新生成。
- evidence/：必要QC／視覺前後證據、完整重跑日誌、來源及保留核對；FILES.sha256列每份封裝檔的實際hash。

排除node_modules、npm cache、runtime ledger、原UI92檔、舊ZIP和大量store／prepared／receipt重複檔。原UI未修改，也不是離線模組的執行依賴。

## 版本與還原

實測Node24.19.0／npm11.9.0（package最低Node22）、Python3.12.14；lockfile固定Ajv8.17.1、ExcelJS4.4.0、fflate0.8.3及transitive版本。獨立讀回需openpyxl3.1.5；PDF回歸需PyMuPDF1.26.6；渲染用LibreOfficeDev26.8.0.0.alpha0和已安裝Noto CJK字型。Pillow12.3.0只用於附上的截圖比較。其他Office／OS／字型未驗收。

**精簡ZIP不含依賴，不能單靠此ZIP直接離線重建。** npm ci需公共npm registry或完整固定cache；Python／LibreOffice需事先存在。本次沒有重新安裝、下載軟體或依賴，解包驗證重用了既有node_modules。

解到新的可棄用位置，在hvac-vetting-offline/執行 `sha256sum -c FILES.sha256`。只有另行允許網絡／具備完整cache時才還原依賴：

```sh
cd hvac-vetting-offline/development/offline
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run samples
python -B scripts/verify-artifacts.py
node cli.mjs --input ../../samples/final-r3/normal/input.json --sources ../../samples/final-r3/normal/sources --store ./new-local-store
```

完整npm cache存在時可加 `--offline --cache /path/to/complete-cache`，沒有cache則不能成功。亦可受控重用原完整QCFIX的相同node_modules。不要刪QC ledger或改review_id重開預算；固定fixture只建構相同不可變歷史，再由持久流程核對prefix，recordQcRound及三輪回歸保留。

已具備LibreOffice／PyMuPDF時，渲染新目錄（不可已有）並重跑實際PDF回歸：

```sh
python -B scripts/render-visual-evidence.py --out ../../evidence/visual-replay-1
python -B scripts/verify-rendered-pdf.py --pdf-root ../../evidence/visual-replay-1 --output ../../evidence/visual-replay-1/RESULT.json
```

render工具只輸出PDF，不改輸入XLSX。實際PDF／PNG用於視覺核對；文字回歸是附加完整性檢查。6頁清單pixel基線限定本次渲染環境，其他版本有差異須複核。

ZIP另附.sha256及旁附LITE_DELIVERY.json，避免把ZIP自身hash塞入ZIP造成循環。只存executor本機，不代表用戶已收到。Library工具缺失／瀏覽器無下載事件已知，沒有重試、Page、公開／第三方分享、權限變更、帳戶／模型呼叫、付款、n8n、push或部署。停用獨立副本即可回退，不刪原件。
