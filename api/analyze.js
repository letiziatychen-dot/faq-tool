export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { faqText } = req.body;

  if (!faqText) {
    return res.status(400).json({ error: 'Missing faqText' });
  }

  const SYSTEM = `你是 FAQ 優化專家。分析用戶提供的 FAQ，輸出 JSON。

意圖定義：
- 低：純知識探索，不帶連結
- 中：有困擾或考慮購買，帶一個連結
- 高：明確購買意圖，帶產品頁

鉤子規則：每題回答最後加一句讓用戶回覆1-2個字的問句，不加括號選項。

優化規則：只調語氣，知識內容完全不增減，不查網路資料。

中意圖連結規則（只帶一個）：
- 問怎麼選/推薦/適合我 → 帶產品頁
- 描述困擾/問症狀 → 帶知識文

高意圖：一律帶產品頁。

產品：
- 每日衡好益生菌（便祕脹氣腸道）：https://mall.cathay-hcm.com.tw/products/probiotics
- 每日衡好葉黃素（護眼乾澀）：https://happyhabit.tw/92es7e

知識文：
- 益生菌怎麼挑：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-nutrition-supplements/益生菌怎麼挑4大指標教你快速選對的方式
- 腸胃保健：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-digestive-health
- 葉黃素是什麼：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/what-is-lutein
- 葉黃素怎麼挑：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/how-to-choose-lutein
- 光源影響：https://mall.cathay-hcm.com.tw/zh-TW/blogs/happyhabit-eye/outdoor_light_more_damaging

必須只輸出以下 JSON 格式，不加任何說明：
{"items":[{"idx":0,"intent":"低","optimized":"優化回答（含連結和鉤子）","hook":"鉤子句子"}],"gaps":[{"layer":"低","issue":"缺口說明","suggest_q":"建議問題","suggest_a":"建議回答"}]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `分析以下FAQ並輸出JSON：\n\n${faqText}`
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'API error');
    }

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    let json;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no json');
      json = JSON.parse(match[0]);
    } catch (e) {
      return res.status(500).json({ 
        error: 'AI 回傳格式錯誤，請重試',
        raw: text.substring(0, 500)
      });
    }

    return res.status(200).json(json);

  } catch (err) {
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
}
