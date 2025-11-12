// sends prompt to ai.hackclub and returns response
import axios from 'axios';

export async function callAiHackClub(prompt) {
  const apiKey = process.env.AIHACKCLUB_API_KEY;
  if (!apiKey) {
    throw new Error('AIHACKCLUB_API_KEY is not set in environment variables!');
  }
  const response = await axios.post(
    'https://ai.hackclub.com/proxy/v1/chat/completions',
    {
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );
  if (!response.data || !response.data.choices || response.data.choices.length === 0) {
    throw new Error('Invalid response from ai.hackclub.com');
  }
  return response.data.choices?.[0]?.message?.content;
}
