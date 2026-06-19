function sanitizeJsonNewlines(str) {
  let inString = false, escaped = false, result = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) { result += c; escaped = false; continue; }
    if (c === '\\' && inString) { result += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString && (c === '\n' || c === '\r')) { result += '\\n'; continue; }
    result += c;
  }
  return result;
}

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'BODY_PARSE_FAILED', raw_body: body.substring(0, 200) });
    }
  }

  if (!body) {
    return res.status(400).json({ error: 'NO_BODY_RECEIVED' });
  }

  if (body.body && typeof body.body === 'string' && !body.faqText) {
    try {
      body = JSON.parse(body.body);
    } catch (e) {}
  }

  const { faqText } = body;

  if (!faqText) {
    return res.status(400).json({ error: 'Missing faqText', body_keys: Object.keys(body) });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'NO_API_KEY_SET' });
  }

  // 依FAQ筆數動態計算max_tokens，避免被截斷
  const itemCount = (faqText.match(/^Q\d+\./gm) || []).length || 10;
  const dynamicMaxTokens = Math.min(Math.max(itemCount * 450, 4000), 64000);

  const SYSTEM = `你是國泰健康管理 LINE OA FAQ 優化顧問，採用三層意圖設計法分析FAQ，目標是提升回答品質、對話延續率、FAQ之間的旅程銜接，並協助發現題庫缺口。

【三層意圖定義】

低：用戶純粹想了解知識，尚未考慮自己需不需要

中：用戶有具體生活困擾，或開始考慮是否需要補充

高：用戶已決定要行動，需要具體的選購或購買指引

【字數規則】

優化版回答的總字數（不含連結網址），嚴格控制在原始回答字數 +50字以內。
若原始回答本身已偏長，優化版可以比原文更短，但不可更長超過50字。
禁止為了湊字數而加入原文未提及的內容。

【核心原則：鉤子必須能被現有FAQ接住 - 最重要規則】

設計每一題的鉤子之前，先執行以下步驟：

步驟1：判斷這題的意圖等級，並決定鉤子應該引導往哪個方向（低→中、中→高，或高→行動）

步驟2：在全部FAQ題目中，搜尋是否已存在「使用者順著鉤子回答後，能對應到的下一題」

  例如：低意圖題目的鉤子問「你有在服藥嗎」，要搜尋是否已有「服藥可以吃益生菌嗎」這類題目

步驟3：

  - 如果找到對應題目存在 → 鉤子的問法要對齊那一題的關鍵字或情境

  - 如果找不到對應題目 → 仍可設計這個鉤子，但必須記錄這個缺口，列入gaps

鉤子不是憑空問一個問題就結束，而是要確保問出去之後，FAQ庫裡有題目可以接住使用者的下一步。

【鉤子語氣規則】

每一題optimized欄位最後，必須換行後加一句親切的鉤子，不是冷冰冰的疑問句斷句，而是帶一點關心、有溫度的延伸。

寫法：先問一句關鍵問題，再補一句簡短說明為什麼問、或這跟對方有什麼關係，可加一個溫和表情符號。

範例（參考語氣，不要照抄）：

"你目前有在服用任何藥物嗎？

如果有的話可以先跟我說，我幫你判斷有沒有需要特別留意的地方 😊"

"你目前飲食中的蔬果攝取還OK嗎？

若外食比例高，這類抗氧化營養特別容易攝取不足喔 😊"

規則：

1. 第一句是疑問句，讓用戶只需回覆1-2個字即可

2. 第二句補一句簡短的關心或說明，不是制式問句

3. 不要加括號選項

4. 每題結尾加一個正向表情符號，但全篇必須多樣化，不可每題都用 😊
   可用符號範例（輪流使用，不重複連用同一個）：😊 🙂 💡 🌿 👍 ✨ 🫶 💪 🌱 😄
   禁止使用負面、強烈推銷感、或不相關的符號

5. 整體語氣親切自然，像朋友在關心，不是制式客服問句

6. 絕對不可以用肯定句或直述句結尾，最後一定要是疑問句開頭的鉤子

【連結規則】一題最多一個連結，格式如下：

連結位置：放在鉤子前一行
連結格式：必須在連結前加上「可以參考>>」，例如：
可以參考>> https://mall.cathay-hcm.com.tw/products/probiotics

低意圖：不帶連結
中意圖：問怎麼選/推薦/適合我→帶產品頁；描述困擾/問症狀→帶知識文
高意圖：一律帶產品頁

【產品頁連結】
益生菌：
https://mall.cathay-hcm.com.tw/products/probiotics
葉黃素：
https://happyhabit.tw/92es7e

【知識文連結（依主題對應）】
─ 益生菌相關 ─
・益生菌怎麼挑（選購入門）：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-nutrition-supplements/益生菌怎麼挑4大指標教你快速選對的方式
・益生菌456公式（選購進階）：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-nutrition-supplements/益生菌怎麼選從「456」黃金關鍵看懂挑選好菌秘訣
・便祕脹氣腸道警訊：
  https://mall.cathay-hcm.com.tw/blogs/happyhabit-digestive-health/便秘脹氣消化不良腸道健康警訊與益生菌解方一次看懂
・換季體質與腸道保健：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/破解迷思/換季體質大亂3個保健習慣＋益生菌幫你穩住腸道
・腸胃保健總覽：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-digestive-health

─ 葉黃素相關 ─
・葉黃素是什麼：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/what-is-lutein
・葉黃素怎麼挑（篇一）：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/how-to-choose-lutein
・葉黃素選購完整攻略（篇二）：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/lutein-selection-guide
・葉黃素常見疑問：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/lutein-faq
・光源對眼睛的影響：
  https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/outdoor_light_more_damaging


【優化規則 - 絕對限制，無例外】

每一題的optimized欄位，只能以「這一題自己的原始回答」為唯一內容來源，嚴禁以下行為：

❌ 禁止：從其他題目的回答中借用任何文字、知識點、菌株名稱、症狀描述、數據
❌ 禁止：新增原始回答中未出現的任何資訊
❌ 禁止：查詢或補充網路資料
❌ 禁止：調換題目順序或跳過任何題目（每題都必須輸出，idx順序不變）
❌ 禁止：增加或刪除原文列出的清單項目（菌株名稱、數字等必須一模一樣）

✅ 僅允許：
- 改變句子的語氣（口語化、更溫馨）
- 改變句子的結構（但意思必須相同）
- 加入鉤子（延伸問句）
- 加入連結（依連結規則）

自我檢查：優化完每一題後，確認：「這段優化版裡的每一個知識點，是否都出現在這題自己的原始回答中？」若有任何一個不是 → 必須刪除。

【缺題建議規則 - gaps欄位，兩種來源都要找】

來源一：三層意圖分佈不均衡的缺口

來源二（更重要）：所有「鉤子問出去但FAQ庫接不住」的情況，逐一列出

  每筆gaps格式必須包含：

  - source: "鉤子斷層" 或 "意圖不均"

  - related_idx: 如果是來源二，註明是哪一題的idx（鉤子斷層才需要，意圖不均可省略或填-1）

  - issue: 說明缺口（鉤子斷層要說明原題鉤子問了什麼方向）

  - suggest_q: 建議新增的問題

  - suggest_a: 完整建議回答（含連結和鉤子，遵循上述所有規則）

請優先確保來源二（鉤子斷層）被完整記錄，這是最重要的分析目的。每筆gaps的suggest_q和suggest_a絕對不可留空。

【gaps欄位JSON格式說明】

每筆gaps必須包含以下欄位：

- source: "鉤子斷層" 或 "意圖不均"

- related_idx: 鉤子斷層時填原題idx，意圖不均填-1

- cat: 建議新增題目的分類（參考原FAQ的分類命名）

- suggest_q: 建議新增的問題（B欄）

- suggest_c: 建議新增的完整回答（C欄），格式為：主體內容 → 連結（如有）→ 鉤子，遵循連結規則與鉤子語氣規則

- intent: 建議新增題目的意圖等級（低/中/高）

- reason: 說明兩件事：①新增原因（鉤子斷層來自哪一題、意圖不均缺哪個層級）；②suggest_c的內容來源（明確列出參照了哪幾題的原始回答，格式例如「回答內容參照Q2、Q5原始回答組合」；若使用非FAQ庫知識則標注「含非FAQ庫知識，請人工審查」）

只輸出以下JSON格式，不要任何說明文字、不要markdown標記。JSON字串值中的換行請用 \\n 表示，不要直接換行：

{"items":[{"idx":0,"intent":"低","optimized":"優化回答內容\\n鉤子問句？\\n補充關心語句 😊"}],"gaps":[{"source":"鉤子斷層","related_idx":0,"cat":"分類名稱","suggest_q":"建議問題","suggest_c":"建議回答主體\\n連結（如有）\\n鉤子問句？\\n補充關心語句 😊","intent":"中","reason":"鉤子無法承接缺口：原題『XXX』的鉤子引導至YYY方向，FAQ庫無對應題目"}]}`;

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: dynamicMaxTokens,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `分析以下FAQ並輸出JSON。請記得：設計每題鉤子前，先檢查表格中其他題目是否能接住這個鉤子方向。\n\n${faqText}`
        }]
      })
    });
  } catch (fetchErr) {
    return res.status(500).json({ error: 'FETCH_FAILED', detail: String(fetchErr) });
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    return res.status(500).json({ error: 'RESPONSE_NOT_JSON', status: response.status, detail: String(parseErr) });
  }

  if (!response.ok) {
    return res.status(500).json({ error: 'ANTHROPIC_API_ERROR', status: response.status, detail: data });
  }

  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

  let json;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({ error: 'NO_JSON_FOUND_IN_RESPONSE', raw_text: text.substring(0, 1000) });
    }
    // 修正 JSON 字串值中的裸換行，避免 JSON.parse 失敗
    const sanitized = sanitizeJsonNewlines(match[0]);
    json = JSON.parse(sanitized);
  } catch (jsonErr) {
    return res.status(500).json({ error: 'JSON_PARSE_FAILED', detail: String(jsonErr), raw_text: text.substring(0, 1000) });
  }

  return res.status(200).json(json);
}
