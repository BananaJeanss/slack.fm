// sends prompt to ai.hackclub and returns response
import axios from 'axios';

export async function callAiHackClub(prompt) {
  const apiKey = process.env.AIHACKCLUB_API_KEY;
  if (!apiKey) {
    throw new Error('AIHACKCLUB_API_KEY is not set in environment variables!');
  }
  console.log(`Using AI model: ${process.env.AI_MODEL_NAME || 'qwen/qwen3-32b'}`);
  const response = await axios.post(
    'https://ai.hackclub.com/proxy/v1/chat/completions',
    {
      model: process.env.AI_MODEL_NAME || 'qwen/qwen3-32b',
      stream: false,
      temperature: process.env.AI_TEMPERATURE ? parseFloat(process.env.AI_TEMPERATURE) : 1.5,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }
  );
  if (!response.data || !response.data.choices || response.data.choices.length === 0) {
    throw new Error('Invalid response from ai.hackclub.com');
  }
  return response.data.choices?.[0]?.message?.content;
}
