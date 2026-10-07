# 既有程式重用基線

新 repo 是獨立交接庫，不代表從零重寫或替換原 repo。

## 已發佈、固定 commit
- 原 repo：https://github.com/kaechong/hvac-vetting-assistant
- 固定基線：https://github.com/kaechong/hvac-vetting-assistant/tree/f10b22e4fe757cfc15105420d72dce4e5e79ba4c
- 已發佈歷史狀態：Python 418、Node 65（歷史回報，非本庫重跑）

## 最新回報但未發佈
2026-10-07 工作對話回報：私有 Python 763（1 項 DWG skip）、Node 65；通用候選 Python 465、Node 65。這些成果尚未在以上發佈 commit 出現。本庫未取得／複製它們的完整程式，不能稱已整合或已發布。

42 條法規仍證據不足；真實 master 結案 0。原 10 項 master、24 項／59 條件、41 項假設／33 組計算追蹤保留。以上均為工作狀態，不等於工程合規驗收。

## 先比較再重用
1. 核查可運行 App／UI 的真正 repo、分支、commit 與建置指令；不可假定其等同 vetting 核心庫
2. 比較已發佈版、通用候選、私有成果；記錄差异、測試及資料依賴
3. 清點文字／表格解析、來源回放、固定計算、報告 renderer、狀態／版本及測試工具
4. 按新方案驗收一條真實垂直切片，再決定最小移植；不整庫搬運客戶資料或憑證
5. 把重用來源 commit、檔案、必要許可及測試證據寫入變更記錄

私人程式沒有因帳戶資格或本地橋接候選而自動開源。未有授權，不新增 LICENSE、不改公開可見性。
