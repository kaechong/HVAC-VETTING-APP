# 本次實際渲染核對（離線合成，provisional）

LibreOfficeDev 26.8.0.0.alpha0 直接將真正母本及正常、零問題、18 項長中文 XLSX 轉 PDF；未改輸入檔，未安裝軟體。PyMuPDF 1.26.6 rasterize PDF，實際檢視母本／零問題／正常表格、違反法規頁及長中文首／末項。

初次長中文 PDF 明確裁字：18 個問題均缺頭尾，完整段落計數 0／18。before PNG／PDF 保留，rendered-before-regression.log 為實際失敗。

最小修正只改 report body 行高估算，使用 11 pt 預設字型及 1.5 倍行距估算；長中文 row6–23 從 238 增至 301 pt。title 行高策略不變。PRESERVATION_VERIFIED.json 證明 ZIP 成員只改 sheet2 row height；文字、樣式、欄寬、merge、頁設定及其他母本成員 bytes 一致，超過 409.5 pt 仍拒絕。

修正後 PDF 的完整段落開頭及末尾全形分號可見，完整問題計數 18／18。正常兩项完整，零問題無示例。29 項 Node suite、9 版本 openpyxl 讀回通過；三個樣本前六頁清單與母本逐像素相同。

母本原本為 A4 縱向橫向跨頁，A:C 與 D「違反法規」分到不同頁，較長項目名稱亦可能分到右側頁。母本／正常／零問題各 8 PDF 頁（清單 6＋報告 2）；長中文 24 頁（清單 6＋報告 18）。沒有自行改成單頁、橫向或重複標題。

目前只驗此 Linux／LibreOffice／已安裝替代字型環境；不是 Microsoft Excel／PC 列印、工程師或業務正式驗收。實際中文 PDF 字型為 NotoSansCJKsc-Regular，其他環境需重看。15 個預留編號、示例處置與正式列印選擇仍 provisional。沒有真模型 QC、月費 runner／Drive／帳戶、完整24項工程或部署。

樣本生成器曾因重新建構已保存的 QC lineage 被 QC_HISTORY_RESET 阻擋，沒有清空 ledger 或放寬門禁。改為合成 fixture 建構相同兩輪不可變歷史，由原交付同步流程核對既有 prefix；recordQcRound／三輪預算和原回歸不變。首次 premature readback 因生成尚未完成而未找到 manifest，後續完成再驗全部9版本。

本機檔案不是已送達用戶。沒有使用 Library／瀏覽器下載／Page／第三方分享，也未改權限。
