
import { GoogleGenAI, Type } from "@google/genai";
import { AdCampaign, AiProvider, AiAnalysisResult } from "../types";

// Default Models
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";

// Helper to format prompt - HIGHLY OPTIMIZED FOR LOW COST
const createPrompt = (campaign: AdCampaign) => {
  return `
    Context: Meta Ads Analysis.
    Data:
    - Campaign: ${campaign.name} (${campaign.status})
    - Spend: RM ${campaign.metrics.spend.toFixed(2)}
    - ROAS: ${campaign.metrics.roas.toFixed(2)} (Target: >2.0)
    - CPA: RM ${campaign.metrics.costPerPurchase.toFixed(2)}
    - CTR: ${campaign.metrics.ctr.toFixed(2)}%

    Task: Return a JSON object.
    1. "summary": One short sentence (max 15 words) on performance.
    2. "actionPlan": Array of exactly 3 short, imperative bullet points (max 10 words each). Focus on Scale, Kill, or Optimize.
    3. "sentiment": "POSITIVE", "NEUTRAL", or "NEGATIVE".
    
    Keep response strictly minimal to minimize token cost. No fluff.
  `;
};

// Safe access to environment variable
const getEnvApiKey = () => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.API_KEY;
  }
  return undefined;
};

// --- Model Fetching Services ---

export const getAvailableModels = async (provider: AiProvider, userApiKey?: string): Promise<string[]> => {
  const key = userApiKey || getEnvApiKey();
  
  try {
    if (provider === AiProvider.CLAUDE) {
      const latestClaudeModels = [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229"
      ];

      if (!key) return latestClaudeModels;
      
      try {
        const response = await fetch('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'dangerously-allow-browser': 'true'
          }
        });
        if (response.ok) {
          const data = await response.json();
          const fetchedModels = data.data
            .filter((m: any) => m.id.includes('claude-3'))
            .map((m: any) => m.id)
            .sort();
          return fetchedModels.length > 0 ? fetchedModels : latestClaudeModels;
        }
      } catch (e) {
        console.warn("Could not fetch Claude models dynamically, using defaults.");
      }
      return latestClaudeModels;
    } 
    
    if (provider === AiProvider.GEMINI) {
      return ["gemini-2.5-flash", "gemini-3-pro-preview"];
    }

    if (provider === AiProvider.OPENAI) {
      return ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];
    }

    if (provider === AiProvider.OPENROUTER) {
      return [
        "anthropic/claude-3.5-sonnet",
        "openai/gpt-4o",
        "google/gemini-pro-1.5",
        "meta-llama/llama-3-70b-instruct"
      ];
    }

  } catch (error) {
    console.error("Error fetching models:", error);
  }
  return [];
};


// --- Simulation Service ---

const simulateAiResponse = async (campaign: AdCampaign): Promise<AiAnalysisResult> => {
  await new Promise(resolve => setTimeout(resolve, 800)); 
  
  let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
  const plans = [];

  if (campaign.metrics.roas > 2.5) {
    sentiment = 'POSITIVE';
    plans.push("Scale budget by 20% immediately.");
    plans.push("Duplicate best ad set to broad audience.");
    plans.push("Launch new creative variations.");
  } else if (campaign.metrics.roas < 1.5) {
    sentiment = 'NEGATIVE';
    plans.push("Pause ad sets with high CPA.");
    plans.push("Check landing page speed.");
    plans.push("Test new scroll-stopper hooks.");
  } else {
    plans.push("Monitor CPA for 24 hours.");
    plans.push("Refresh primary text copy.");
    plans.push("Exclude Audience Network placement.");
  }

  return {
    summary: `ROAS is ${campaign.metrics.roas.toFixed(2)}, campaign is ${sentiment.toLowerCase()}.`,
    actionPlan: plans,
    sentiment
  };
};

// --- Main Analysis Function ---

export const analyzeCampaign = async (
  campaign: AdCampaign,
  provider: AiProvider,
  userApiKey?: string,
  modelOverride?: string
): Promise<AiAnalysisResult> => {
  
  try {
    const apiKey = userApiKey || getEnvApiKey();
    const prompt = createPrompt(campaign);
    
    // --- GEMINI ---
    if (provider === AiProvider.GEMINI) {
      if (!apiKey) throw new Error("Missing API Key for Gemini");

      const ai = new GoogleGenAI({ apiKey });
      const modelName = modelOverride || DEFAULT_GEMINI_MODEL;
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                actionPlan: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] }
              },
              required: ["summary", "actionPlan", "sentiment"]
            }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      return JSON.parse(text) as AiAnalysisResult;
    } 
    
    // --- CLAUDE ---
    if (provider === AiProvider.CLAUDE) {
      if (!apiKey) throw new Error("Missing API Key for Claude");

      const modelName = modelOverride || DEFAULT_CLAUDE_MODEL;
      const claudePrompt = `${prompt}
      CRITICAL: Return strictly JSON. No markdown, no pre-text.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: modelName, 
          max_tokens: 1024,
          messages: [{ role: "user", content: claudePrompt }]
        })
      });

      if (!response.ok) throw new Error(`Claude API request failed: ${response.statusText}`);
      const data = await response.json();
      const content = data.content?.[0]?.text;
      if (!content) throw new Error("Empty response from Claude");
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(jsonStr) as AiAnalysisResult;
    }

    // --- OPENAI ---
    if (provider === AiProvider.OPENAI) {
      if (!apiKey) throw new Error("Missing API Key for OpenAI");
      
      const modelName = modelOverride || DEFAULT_OPENAI_MODEL;
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) throw new Error(`OpenAI request failed: ${response.statusText}`);
      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      return JSON.parse(content) as AiAnalysisResult;
    }

    // --- OPENROUTER ---
    if (provider === AiProvider.OPENROUTER) {
       if (!apiKey) throw new Error("Missing API Key for OpenRouter");
       
       const modelName = modelOverride || DEFAULT_OPENROUTER_MODEL;
       const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${apiKey}`,
           'Content-Type': 'application/json',
           'HTTP-Referer': window.location.href, 
           'X-Title': 'Ads Roket', 
         },
         body: JSON.stringify({
           model: modelName,
           messages: [{ role: "user", content: prompt }]
         })
       });
 
       if (!response.ok) throw new Error(`OpenRouter request failed: ${response.statusText}`);
       const data = await response.json();
       const content = data.choices[0]?.message?.content;
       const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
       return JSON.parse(jsonStr) as AiAnalysisResult;
    }

    return await simulateAiResponse(campaign);

  } catch (error) {
    console.error("AI Analysis Failed:", error);
    return await simulateAiResponse(campaign);
  }
};
