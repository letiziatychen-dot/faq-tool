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

  const itemCount = (faqText.match(/^Q\d+\./gm) || []).length || 10;
  const dynamicMaxTokens = Math.min(Math.max(itemCount * 350, 4000), 64000);

  const SYSTEM = `你是FAQ優化專家，採用三層意圖設計法分析FAQ。

【意圖定義】
低：純知識探索，不帶連結
中：有困擾或考慮購買，帶一個連結
高：明確購買意圖，帶產品頁連結

【鉤子規則 - 絕對必須遵守】
每一題的optimized欄位，最後必須換行後加一句鉤子問句。
鉤子規則：
1. 必須是疑問句，讓用戶只需回覆1-2個字
2. 絕對不可以是肯定句或直述句結尾
3. 不要加括號選項
4. 範例正確鉤子："你平時有這個困擾嗎？" "想了解怎麼挑選嗎？" "需要我推薦適合的產品嗎？"
5. 每一題分析完，optimized欄位的最後一行一定是問句，這是強制規則，沒有例外

【連結規則】一題最多一個連結
低意圖：不帶連結
中意圖：問怎麼選/推薦/適合我→帶產品頁；描述困擾/問症狀→帶知識文
高意圖：一律帶產品頁

產品連結：
益生菌：https://mall.cathay-hcm.com.tw/products/probiotics
葉黃素：https://happyhabit.tw/92es7e

知識文連結：
益生菌怎麼挑：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-nutrition-supplements/益生菌怎麼挑4大指標教你快速選對的方式
腸胃保健：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-digestive-health
葉黃素是什麼：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/what-is-lutein
葉黃素怎麼挑：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/how-to-choose-lutein
光源影響：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/outdoor_light_more_damaging

【缺題建議規則】
分析三層意圖分佈是否均衡，針對缺口提供2-4個建議新題目。
每個建議都必須包含完整的suggest_q（問題）和suggest_a（完整回答，含連結和鉤子），不可留空。

原始回答的知識內容不能增減，只調語氣。不可查網路資料。

只輸出以下JSON格式，不要任何說明文字、不要markdown標記：
{"items":[{"idx":0,"intent":"低","optimized":"優化回答內容\n鉤子問句？"}],"gaps":[{"layer":"中","issue":"缺口說明文字","suggest_q":"建議的問題","suggest_a":"完整建議回答\n鉤子問句？"}]}`;

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
        messages: [{ role: 'user', content: `分析FAQ輸出JSON：\n${faqText}` }]
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
      return res.status(500).json({ error: 'NO_JSON_FOUND_IN_RESPONSE', raw_text: text });
    }
    json = JSON.parse(match[0]);
  } catch (jsonErr) {
    return res.status(500).json({ error: 'JSON_PARSE_FAILED', detail: String(jsonErr), raw_text: text });
  }

  return res.status(200).json(json);
}
