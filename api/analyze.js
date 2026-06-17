export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;

  // Defensive: if body is a string, parse it manually
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

  // Defensive: handle double-wrapped body { body: "...json string..." }
  if (body.body && typeof body.body === 'string' && !body.faqText) {
    try {
      body = JSON.parse(body.body);
    } catch (e) {
      // leave as is, will fail below with clear error
    }
  }

  const { faqText } = body;

  if (!faqText) {
    return res.status(400).json({ error: 'Missing faqText', body_keys: Object.keys(body), body_received: JSON.stringify(body).substring(0, 200) });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'NO_API_KEY_SET' });
  }

  const SYSTEM = `你是FAQ優化專家。輸出JSON：{"items":[{"idx":0,"intent":"低","optimized":"優化回答","hook":"鉤子"}],"gaps":[]}`;

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
        max_tokens: 2000,
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
