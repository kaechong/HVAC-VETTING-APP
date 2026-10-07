# HVAC VETTING APP

暖通空調／排煙／樓梯加壓工程複核 App 的獨立規劃及開發交接庫。

**目前狀態：方案與原始參考文件已整理；本 repo 尚未實作或部署 App。** 不應把本文件庫當成已能運行的產品。本次沒有複製、覆寫或改動既有專案程式。

## 先讀這些文件
1. [整合詳細方案（Markdown）](docs/INTEGRATED_PLAN_20261007.md)／[Word 原件](docs/INTEGRATED_PLAN_20261007.docx)
2. [範圍與不可變契約](requirements/SCOPE_AND_CONTRACTS.md)
3. [來源索引及版本](SOURCE_INDEX.md)及[待解衝突](docs/SOURCE_CONFLICTS.md)
4. [驗收計劃](docs/ACCEPTANCE_PLAN.md)及[分階段工作清單](docs/IMPLEMENTATION_BACKLOG.md)
5. [既有程式重用入口](docs/REUSE_BASELINE.md)及[安全與資料邊界](SECURITY.md)

## 目標流程
PC 網頁開專案 → 私有 Drive 文件及版本 → 24 項／四路審查 → 來源及獨立 QC → 每個審查版本一份母本格式 Excel。

- 四路保留：文字規範、程式計算、圖面幾何、圖紙／規範／設備表／計算書交叉核對
- 澳門、IBC/NFPA、雙規範分開判定，不混用門檻
- 母本固定四欄：編號、複核文件名稱、問題內容、違反法規
- 帳戶是否支援以现有 ChatGPT 計劃自動執行仍待實測；不預設 API 費用或公開私人程式
- 24 項登記不等於 24 項已支援；未支援、資料不足、規範待核必須明示

## 內容
- `docs/`：完整方案、驗收、工作清單、重用基線、衝突記錄
- `requirements/`：新系統契約、24 項原文轉錄（未核法規）
- `templates/`：由指定 Google Sheets 原樣匯出的兩頁母本 Excel
- `references/drive/`：原 Drive SOP、報告契約、QC SOP、舊架構的未改寫快照
- `SOURCE_INDEX.md`、`MANIFEST.sha256`：來源、檢索日期與檔案完整性

此處 Markdown／Word 是專案開發文件；不改變工程個案正式交付只有 Excel 的規則。Drive 原件及既有 GitHub repo 不受影響。參考快照中的舊工具指令、閾值及「唯一正本」說法不自動成為本 repo 的新執行規則。

## 私有與授權
以私人儲存庫交接。沒有添加開源授權；第三方標準全文、客戶原始圖纸／計算書、憑證不入庫。未經批准，不轉為公開或擴大分享。
