export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { faqText, system } = req.body;

  if (!faqText) {
    return res.status(400).json({ error: 'Missing faqText' });
  }

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
        system: system,
        messages: [
          {
            role: 'user',
            content: `以下是 FAQ 內容，請分析並回傳 JSON：\n\n${faqText}`
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || '呼叫 API 失敗');
    }

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    let json;
    try {
      json = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      throw new Error('AI 回傳格式錯誤');
    }

    return res.status(200).json(json);

  } catch (err) {
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
}
