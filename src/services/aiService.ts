
import { GoogleGenAI, Type } from "@google/genai";
import { AdCampaign, AiProvider, AiAnalysisResult, Ad } from "../types";

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
    3. "sentiment": "POSITIVE", "NEUTRAL", "NEGATIVE".
    
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
  const envKey = getEnvApiKey();
  const key = provider === AiProvider.GEMINI ? envKey : (userApiKey || envKey);
  
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
      if (!key) return []; 
      
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json();
          const models = data.data.map((m: any) => m.id);
          const priorities = ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-pro-1.5'];
          
          return models.sort((a: string, b: string) => {
             const aP = priorities.findIndex(p => a.includes(p));
             const bP = priorities.findIndex(p => b.includes(p));
             if (aP !== -1 && bP !== -1) return aP - bP; 
             if (aP !== -1) return -1; 
             if (bP !== -1) return 1; 
             return a.localeCompare(b);
          });
        }
      } catch (e) {
        throw new Error("Failed to fetch OpenRouter models. Check connection.");
      }
    }

  } catch (error) {
    console.error("Error fetching models:", error);
    if (provider === AiProvider.OPENROUTER) {
        throw error;
    }
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

const simulateAccountAnalysis = async (): Promise<string[]> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return [
        "Create similar UGC video creatives for winning ads.",
        "Scale the 'Broad' audience ad set by 20%.",
        "Retest the headline from Top Ad #1 on other ad sets."
    ];
};

const simulateChatResponse = async (): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    return "Your top ad 'Video V1' is driving 80% of sales. Consider duplicating it to a broad audience.";
};

// --- Main Analysis Function ---

export const executeAiRequest = async (
    prompt: string,
    provider: AiProvider,
    userApiKey?: string,
    modelOverride?: string,
    schema?: any
): Promise<string> => {
    
    // --- GEMINI ---
    if (provider === AiProvider.GEMINI) {
        // Enforce process.env.API_KEY for Gemini
        const envKey = getEnvApiKey();
        if (!envKey) throw new Error("Missing system API Key for Gemini. Please select a key.");
        
        const ai = new GoogleGenAI({ apiKey: envKey });
        const modelName = modelOverride || DEFAULT_GEMINI_MODEL;
        const config: any = {};
        if (schema) {
            config.responseMimeType = "application/json";
            config.responseSchema = schema;
        }
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config
        });
        const text = response.text;
        if (!text) throw new Error("Empty response from Gemini");
        return text;
    }

    // For other providers, use userApiKey or fallback
    const apiKey = userApiKey || getEnvApiKey();

    // --- CLAUDE ---
    if (provider === AiProvider.CLAUDE) {
        if (!apiKey) throw new Error("Missing API Key for Claude");
        const modelName = modelOverride || DEFAULT_CLAUDE_MODEL;
        const claudePrompt = `${prompt}
        ${schema ? 'CRITICAL: Return strictly JSON. No markdown, no pre-text.' : ''}`;

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
        return content.replace(/```json\n?|\n?```/g, '').trim();
    }

    // --- OPENAI ---
    if (provider === AiProvider.OPENAI) {
        if (!apiKey) throw new Error("Missing API Key for OpenAI");
        const modelName = modelOverride || DEFAULT_OPENAI_MODEL;
        const body: any = {
            model: modelName,
            messages: [{ role: "user", content: prompt }]
        };
        if (schema) {
            body.response_format = { type: "json_object" };
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`OpenAI request failed: ${response.statusText}`);
        const data = await response.json();
        return data.choices[0]?.message?.content;
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
        return content.replace(/```json\n?|\n?```/g, '').trim();
    }

    throw new Error("Unknown Provider");
};


export const analyzeCampaign = async (
  campaign: AdCampaign,
  provider: AiProvider,
  userApiKey?: string,
  modelOverride?: string
): Promise<AiAnalysisResult> => {
  try {
    const prompt = createPrompt(campaign);
    
    // Schema for Gemini
    const schema = {
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
    };

    const resultStr = await executeAiRequest(prompt, provider, userApiKey, modelOverride, schema);
    return JSON.parse(resultStr) as AiAnalysisResult;
  } catch (error) {
    console.error("Campaign Analysis Failed:", error);
    return await simulateAiResponse(campaign);
  }
};


export const analyzeAccountPerformance = async (
    topAds: Ad[],
    provider: AiProvider,
    userApiKey?: string,
    modelOverride?: string
): Promise<string[]> => {
    try {
        if (topAds.length === 0) return ["Not enough data to analyze."];

        const adDetails = topAds.map((ad, i) => `
            Ad Name: "${ad.name}"
            - ROAS: ${ad.metrics.roas.toFixed(2)}
            - Spend: RM ${ad.metrics.spend.toFixed(2)}
            - CTR: ${ad.metrics.ctr.toFixed(2)}%
            - Purchases: ${ad.metrics.purchases}
        `).join('\n');

        const prompt = `
            Context: Meta Ads Analysis for the Top 3 Performing Ads of the week.
            Ads Data:
            ${adDetails}

            Task: Analyze the winning elements.
            Output: Return a JSON object with a property "actionPlan" (Array of strings).
            1. The array must contain exactly 3 concise bullet points.
            2. IMPORTANT: Reference the specific Ad Names provided in the data (e.g., "Scale 'Video V1'...") instead of saying "Ad #1".
            3. Keep it imperative and short.
        `;

        const schema = {
            type: Type.OBJECT,
            properties: {
                actionPlan: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["actionPlan"]
        };

        const resultStr = await executeAiRequest(prompt, provider, userApiKey, modelOverride, schema);
        const json = JSON.parse(resultStr);
        return json.actionPlan || [];

    } catch (error) {
        console.error("Account Analysis Failed:", error);
        return await simulateAccountAnalysis();
    }
};

export const chatWithAi = async (
    userMessage: string,
    contextAds: Ad[],
    provider: AiProvider,
    userApiKey?: string,
    modelOverride?: string
): Promise<string> => {
    try {
        let contextText = "No active ads data available.";
        if (contextAds.length > 0) {
            contextText = contextAds.map(ad => 
                `Ad: "${ad.name}" | ROAS: ${ad.metrics.roas.toFixed(2)} | Spend: RM${ad.metrics.spend} | Purchases: ${ad.metrics.purchases}`
            ).join('\n');
        }

        const prompt = `
            Role: Expert Meta Ads Manager Assistant.
            Context (Top Performing Ads):
            ${contextText}

            User Question: "${userMessage}"

            Instructions:
            1. Answer based on the context provided.
            2. STRICT CONSTRAINT: Reply in LESS THAN 25 WORDS.
            3. Be direct and helpful.
        `;

        // No schema needed for chat, just text
        const response = await executeAiRequest(prompt, provider, userApiKey, modelOverride);
        return response;

    } catch (error) {
        console.error("Chat Failed:", error);
        return await simulateChatResponse();
    }
}

// --- IMAGE GENERATION (Nano Banana Pro / OpenRouter) ---

export const generateImageOpenRouter = async (
    prompt: string,
    apiKey: string
): Promise<string> => {
    if (!apiKey) throw new Error("OpenRouter API Key is required.");

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        messages: [
            {
              "role": "user",
              "content": prompt
            }
          ],
        modalities: ['image', 'text']
      }),
    });

    const result = await response.json();
    
    if (result.error) {
        throw new Error(result.error.message || "OpenRouter API Error");
    }

    if (result.choices && result.choices.length > 0) {
      const message = result.choices[0].message;
      // OpenRouter Gemini Image response structure
      if ((message as any).images && (message as any).images.length > 0) {
          return (message as any).images[0].image_url.url;
      }
    }
    
    throw new Error("No image returned from OpenRouter.");
};

export const generateImage = async (
    prompt: string,
    userApiKey?: string, 
    aspectRatio: "1:1" | "16:9" | "9:16" = "1:1"
): Promise<string> => {
    // This is the old direct Google GenAI implementation
    // Keeping it as fallback or legacy if needed elsewhere, 
    // but EpicPoster now prefers generateImageOpenRouter
    const apiKey = getEnvApiKey();
    if (!apiKey) throw new Error("API Key is required for image generation.");

    const modelName = 'gemini-3-pro-image-preview';
    const ai = new GoogleGenAI({ apiKey });
    
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: prompt }] },
            config: {
                imageConfig: {
                    aspectRatio: aspectRatio,
                    imageSize: "1K"
                }
            },
        });

        if (response.candidates && response.candidates[0].content.parts) {
             for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64EncodeString: string = part.inlineData.data;
                    return `data:image/png;base64,${base64EncodeString}`;
                }
            }
        }
        
        throw new Error("No image data returned from model.");
    } catch (error: any) {
        console.error("Image Generation Failed:", error);
        throw new Error(error.message || "Failed to generate image.");
    }
};
