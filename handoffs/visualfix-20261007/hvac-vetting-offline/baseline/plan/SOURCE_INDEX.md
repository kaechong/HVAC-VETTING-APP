# 來源索引與版本

快照日期：2026-10-07。來源檔案保持原樣；新文件為交接整理，並非已驗證法律／已實作軟件。檔案 SHA-256 見 MANIFEST.sha256；hash 僅確認本次入庫 bytes，Google 原生工作表匯出 hash 不等於 Drive 原始版本 ID。

| 本庫檔案 | 來源／狀態 |
|---|---|
| docs/INTEGRATED_PLAN_20261007.docx | 2026-10-07 整合詳細方案 v1.0；既有交付 Word 原件，12 頁已作渲染 QA |
| docs/INTEGRATED_PLAN_20261007.md | 從同一 DOCX 按段落、標題、表格順序轉成可讀 Markdown；內容一致，排版非 Word 複製 |
| templates/HVAC_VETTING_CHECKLIST_MOTHER_20261007.xlsx | [指定 Google Sheets 母本](https://docs.google.com/spreadsheets/d/1ziMfxvgUG6PZuDoFwztZhyIh0WVscsksMeI-7B3_pNU/edit)；修改時間 2026-08-15T08:45:12.528Z；2026-10-07 匯出 XLSX，56,619 bytes，保留兩工作表與示例格式 |
| requirements/checklist_24_source_snapshot.json | 從上述 Excel 第一工作表逐行轉錄 24 項；含 source_row、原名稱、原條款及完整子條件。條款效力／適用性仍 pending |
| references/drive/Workflow_SOP.md | [Drive 原件](https://drive.google.com/file/d/1oJ4Luq0MbEeM117RY06gEAXpCSM5kj87/view)；檔頭 v1.1，2026-08-15；修改時間 2026-08-15T09:02:17.752Z；6,655 bytes |
| references/drive/Vetting_Report_Spec.md | [Drive 原件](https://drive.google.com/file/d/1xnMZe-eMQxydNbLTIA5f8Ho6yc5wFxry/view)；檔頭 v3.0，2026-08-15；修改時間 2026-08-15T09:02:13.972Z；5,719 bytes |
| references/drive/Audit_SOP.md | [Drive 原件](https://drive.google.com/file/d/1Gr162FQBZRCP8skQxwTOOt4sM5hKKDcg/view)；檔頭 v1.0，2026-08-15；修改時間 2026-08-15T08:49:51.192Z；4,036 bytes |
| references/drive/ARCHITECTURE.md | [Drive 原件](https://drive.google.com/file/d/1RWJNkzlPIsii9UKC_cgjhPrCwQcF8f0d/view)；檔頭 v2.0，2026-08-15；修改時間 2026-08-15T08:49:39.818Z；16,312 bytes。歷史雙平台架構，不當成新執行指令 |

## 只連結、不複製的來源
- [來源根資料夾](https://drive.google.com/drive/folders/1ex6JbrbdDWyhHHX6tbKnd3S5izeGPeLO)：保留 Drive 原組織，不改權限
- [用戶提供第39號原文參考](https://drive.google.com/file/d/1TswGkMd-Kb4xNl51H57yutOoBw4wf2fJ/view)：待與官方原文及現行適用版本核對
- [Vetting 工作對話](https://chatgpt.com/local/01a1115d-a7d4-7339-b8a7-30fb573a60e0)：最新測試／未發布狀態的對話來源；讀者需相應帳戶存取
- [既有固定程式基線](https://github.com/kaechong/hvac-vetting-assistant/tree/f10b22e4fe757cfc15105420d72dce4e5e79ba4c)：不複製整庫或私人資料
- [官方 ChatGPT 計劃應用授權](https://developers.openai.com/siwc/token-sharing-open-source)及[預覽限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)：須於 G1 再核實當時規則、實際帳戶資格與限制，本庫不證明資格通過

## 未包含及原因
- IBC／NFPA 等第三方受限制標準全文：不假定有再分發權；實作時記錄合法取得版本及權威來源
- 客戶原始圖紙、計算書、個案資料及完整私人對話：不是這份公開範圍未定的開發交接庫所需材料；仍存原授權來源
- 最新 763／465 測試成果完整程式：未在固定已發布基線中取得，不冒称已整合
- 憑證、API key、OAuth token、日誌及帳戶資料：不入庫
- 法規主資料庫衍生全集：來源矛盾未解，避免被誤當作已核可規則；先以 24 項原文快照與原件來源追蹤

各 Drive 連結權限維持原狀；加入 GitHub 不授予讀者存取其他 Drive 檔案的權利。此庫不新增任何第三方授權或開源 LICENSE。
