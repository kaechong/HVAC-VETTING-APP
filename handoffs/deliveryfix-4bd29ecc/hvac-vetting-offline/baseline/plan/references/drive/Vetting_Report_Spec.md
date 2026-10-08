# Vetting 報告生成契約 (Vetting_Report_Spec.md)

> [SOP-VERSION: v3.0 | 2026-08-15]
> 本檔為 CC 報告生成腳本（`vetting_report.py`）之輸出契約。
> **報告格式以用戶提供之權威母本為準**（Google Sheets `1ziMfxvgUG6PZuDoFwztZhyIh0WVscsksMeI-7B3_pNU` 第二頁「工作表1」），
> 要求 **100% 相同格式**。本地鏡像：`/opt/data/vetting_workspace/tmp/vetting_checklist_source.xlsx`。

---

## 0. 用戶裁定之執行規則（2026-08-15，不可違反）

| # | 規則 | 內容 |
|---|------|------|
| R1 | 每項目只出一份 Excel | 唯一交付檔案，唔出 Markdown / Word |
| R2 | 項目名稱 | 用專案**全名**（唔用編號） |
| R3 | 複核日期 | 格式 `YYYY-MM-DD`（審查當日） |
| R4 | 複核版本 | 由輸出次數起計：`1.0 → 2.0 → 3.0 …`（每次重新輸出遞增） |
| R5 | 複核文件名稱欄 | 圖則 → 用**圖號**；圖則以外文件 → 用**文件名 + 頁數** |
| R6 | 嚴重等級 | **報告唔反映嚴重等級**（4 欄照母本：編號/文件名稱/問題內容/違反法規；等級只係 Hermes DoD 內部用） |
| R7 | Finding 粒度 | **每個違規一項**（一事一行，唔合併） |
| R8 | 檔案命名 | `專案名_日期_版本.xlsx`（例：`永春藥房(上葡京)_135A_20260807_v1.0.xlsx`） |
| R9 | 存放位置 | Drive `05_輸出審查報告_Output_Reports/<專案名>/` 子資料夾 |
| R10 | 規範體系 | 由用戶提供具體指示；**雙規範時以兩種規範各單獨 CHECK**（各自出 Finding，code_citation 標明所屬體系） |
| R11 | 審查範圍 | 只做用戶 spreadsheet 第一頁（澳門 24 項）對應範圍；IBC 無獨立 checklist，參考澳門檢查內容、適用於 IBC 者對照 IBC 條款 |

## 1. 輸入

- `--project-info`：Project Name（全名）/ Review Date（YYYY-MM-DD）/ Review Version（輸出次數 1.0 起）
- `--findings`：Hermes 已核准之 Findings JSON 陣列
  ```json
  [{"finding_id":"F-001","system_category":"排煙系統","location":"圖號 M-102 地庫防火分區 A",
    "discrepancy_description":"...","code_citation":"第39/2022號行政法規 第175條",
    "severity":"Critical","suggested_action":"..."}]
  ```
- severity 只接受：`Critical` / `Major` / `Minor`；其他值報錯並列出非法值
- `--output-name`：`{專案名}_{YYYYMMDD}_v{版本}.xlsx`（R8）

## 2. 輸出檔案（每項目只出一份 Excel）

### 唯一輸出：`Vetting_Report_Master.xlsx`（openpyxl）

> ⚠️ **每項目只出一份 Excel 報告**，唔出 Markdown / Word 摘要。

**工作表結構（100% 對齊權威母本「工作表1」）：**

| 列 | 內容 | 合併 | 樣式 |
|----|------|------|------|
| Row 1 | `項目名稱` | A1:D1 | Arial 14 bold、水平置中、垂直置中 |
| Row 2 | `複核日期` | A2:D2 | Arial 14 bold、水平置中、垂直置中 |
| Row 3 | `複核版本` | A3:D3 | Arial 14 bold、水平置中、垂直置中 |
| Row 4 | （空行，分隔線，無內容） | — | — |
| Row 5 | 表頭：`編號` `複核文件名稱` `問題內容` `違反法規` | — | Arial、四邊 thin border、水平置中 |
| Row 6+ | 數據行（每 Finding 一行） | — | Arial、四邊 thin border、水平置中 |

**欄位映射（Findings JSON → 報表欄，R5/R6/R7）：**

| 報表欄 | 來源 | 規則 |
|--------|------|------|
| 編號 | 序號 1.0, 2.0, 3.0…（數字格式，一位小數） | 每個違規一項，順序編號 |
| 複核文件名稱 | finding.location | **圖則 → 圖號**（如 M-102）；**圖則以外 → 文件名 + 頁數**（如「Design Statement.pdf p.5」） |
| 問題內容 | finding.discrepancy_description（客觀缺失事實，結尾用全形分號 `；`） | 一事一行，唔合併多個違規 |
| 違反法規 | finding.code_citation | 雙規範時標明所屬體系（如「第39/2022號…」/「IBC 2021 Section…」） |

> ⚠️ R6：**報告唔顯示嚴重等級**——4 欄照母本，等級只係 Hermes DoD 內部用，唔寫入報告。

**欄寬（100% 對齊母本）：**

| 欄 | 寬度 |
|----|------|
| A | 預設（未設定） |
| B | 22.75 |
| C | 46.88 |
| D | 55.38 |

**樣式規格（不可妥協）：**
- 全表無 fill（純白背景，無底色高亮）
- 標題行：Arial 14 bold、置中（水平+垂直）
- 表頭/數據行：Arial 常規、四邊 thin solid border（黑色）、水平置中
- showGridLines 保持預設（與母本一致）
- 預留數據行至編號 15（母本有 1.0~15.0 預填編號；不足 15 項時照樣預留空行？——**依母本行為：只填實際 Findings 行，不強制填滿**，但格式（border）應延伸至最後一個實際數據行）

### 輸出 2（stdout）
- 檔案絕對路徑 + 統計摘要（如 `FINDINGS: 2 Critical / 3 Major / 1 Minor`）

## 3. 驗收準則（Hermes 檢查）

- [ ] Row 1-3 標題正確合併（A:D）且格式 Arial 14 bold 置中
- [ ] Row 5 表頭四欄名稱與母本 100% 相同：`編號` `複核文件名稱` `問題內容` `違反法規`
- [ ] 數據行四欄 border thin、置中
- [ ] 欄寬 B=22.75、C=46.88、D=55.38
- [ ] 無 fill 底色
- [ ] 冇硬編碼門檻數值（grep 檢查）
- [ ] 語法 OK（python -m py_compile）
- [ ] 每項目只出一份 Excel（冇多餘 md/docx）

## 4. 禁止事項

1. ❌ 硬編碼法規門檻數值 —— 一律由 `database/master_db_*.json` 讀取
2. ❌ 改寫 findings 內容（描述/條號/等級）—— 純渲染
3. ❌ 加入裁決判斷文字 —— 裁決屬 Hermes
4. ❌ 依賴 HVAC 設計助手 `export_deliverables.py` / `excel_styles.py` 內部結構
5. ❌ 偏離權威母本格式（自創顏色/合併/欄位）—— 100% 相同格式係硬性要求
