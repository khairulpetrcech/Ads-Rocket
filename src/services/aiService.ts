
import { GoogleGenAI, Type } from "@google/genai";
import { AdCampaign, AiProvider, AiAnalysisResult, Ad, ChatMessage, AssistantContext } from "../types";

// Default Models
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_FLASH_3 = "gemini-3-flash-preview";
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

// Gemini 3 Flash specific API Key
const getGemini3ApiKey = () => {
  // Check import.meta.env first (Vite native - works in both dev and production)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    const viteKey = import.meta.env.VITE_GEMINI_3_API || import.meta.env.GEMINI_3_API;
    if (viteKey) return viteKey;
  }

  // Fallback: Check process.env (shimmed by Vite define for local dev)
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_3_API) {
    return process.env.GEMINI_3_API;
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
      return ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3-pro-preview"];
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

// --- AI ASSISTANT CHAT (Gemini 3 Flash) ---

export const assistantChatWithContext = async (
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'model', text: string }>,
  adsContext: AssistantContext,
  provider: AiProvider = AiProvider.GEMINI
): Promise<string> => {
  try {
    const gemini3Key = getGemini3ApiKey();
    if (!gemini3Key) throw new Error("Missing GEMINI_3_API Key for AI Assistant");

    // Build context from ads data
    let contextText = "";

    if (adsContext.campaigns && adsContext.campaigns.length > 0) {
      contextText += "\n\n📊 ACTIVE CAMPAIGNS:\n";
      adsContext.campaigns.forEach((camp, i) => {
        contextText += `${i + 1}. "${camp.name}" | Status: ${camp.status} | ROAS: ${camp.metrics.roas.toFixed(2)} | Spend: RM${camp.metrics.spend.toFixed(2)} | Purchases: ${camp.metrics.purchases}\n`;
      });
    }

    if (adsContext.ads && adsContext.ads.length > 0) {
      contextText += "\n\n🎯 TOP PERFORMING ADS:\n";
      adsContext.ads.slice(0, 10).forEach((ad, i) => {
        contextText += `${i + 1}. "${ad.name}" | ROAS: ${ad.metrics.roas.toFixed(2)} | Spend: RM${ad.metrics.spend.toFixed(2)} | Purchases: ${ad.metrics.purchases}\n`;
      });
    }

    if (adsContext.uncategorizedCreatives && adsContext.uncategorizedCreatives.length > 0) {
      contextText += `\n\n🎨 UNCATEGORIZED CREATIVES: ${adsContext.uncategorizedCreatives.length} files ready to create ads\n`;
    }

    // Build conversation for multi-turn
    const historyFormatted = conversationHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    const systemPrompt = `Anda adalah AI Assistant untuk Meta Ads Manager.

PERANAN:
- Anda membantu user menganalisis performance ads mereka
- Beri nasihat dalam Bahasa Malaysia (boleh campur Bahasa Inggeris untuk terma teknikal)
- Jawab dengan ringkas dan tepat
- Fokus pada actionable insights

DATA KONTEKS (Real-time dari Meta Ads):
${contextText || "Tiada data ads tersedia. Pastikan user sudah connect Meta account."}

CAPABILITIES:
- Analisis ROAS, CTR, CPA performance
- Cadangan untuk scale/kill/optimize ads
- Bandingkan creative performance
- Suggest best practices untuk Malaysian market

GAYA JAWAPAN:
- Gunakan emoji untuk highlight points penting
- Bullet points untuk clarity
- Jangan terlalu panjang (max 150 patah perkataan)
- Sentiasa berikan next action step`;

    const ai = new GoogleGenAI({ apiKey: gemini3Key });

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_FLASH_3,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Faham! Saya sedia membantu anda dengan Meta Ads. Apa yang boleh saya bantu?' }] },
        ...historyFormatted,
        { role: 'user', parts: [{ text: userMessage }] }
      ]
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI Assistant");

    return text;

  } catch (error: any) {
    console.error("AI Assistant Chat Failed:", error);
    return "Maaf, saya tidak dapat memproses permintaan anda sekarang. Sila cuba lagi. 🙏";
  }
};

// --- AI ASSISTANT WITH ACTIONS (Rapid Creator) ---

export interface RapidCreatorAction {
  type: 'SET_BUDGET' | 'CREATE_ADSETS' | 'SET_TARGETING' | 'SET_COUNTRY' | 'SET_AGE_RANGE' | 'SET_ENHANCEMENT_PLUS' | 'DISTRIBUTE_CREATIVES' | 'SET_GENDER';
  value?: number | string | boolean;
  count?: number;
  min?: number;
  max?: number;
}

export interface RapidCreatorAssistantResponse {
  message: string;
  actions: RapidCreatorAction[];
}

export const rapidCreatorAssistantWithActions = async (
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'model', text: string }>,
  currentState: {
    creativesCount: number;
    creativesTypes: { images: number; videos: number };
    adSetsCount: number;
    campaignObjective: 'SALES' | 'LEAD';
    currentBudget?: number;
    currentTargeting?: 'BROAD' | 'CUSTOM';
  }
): Promise<RapidCreatorAssistantResponse> => {
  try {
    const gemini3Key = getGemini3ApiKey();
    if (!gemini3Key) throw new Error("Missing GEMINI_3_API Key");

    const contextText = `
CURRENT STATE:
- Creatives: ${currentState.creativesCount} total (${currentState.creativesTypes.images} images, ${currentState.creativesTypes.videos} videos)
- Ad Sets: ${currentState.adSetsCount}
- Campaign Objective: ${currentState.campaignObjective}
- Current Budget per AdSet: RM${currentState.currentBudget || 10}
- Current Targeting: ${currentState.currentTargeting || 'BROAD'}
`;

    const systemPrompt = `Anda adalah AI Assistant untuk Rapid Creator Meta Ads. Anda BOLEH mengambil tindakan untuk setup ads.

${contextText}

AVAILABLE ACTIONS (gunakan dalam "actions" array):
1. SET_BUDGET - Set daily budget. Example: { "type": "SET_BUDGET", "value": 50 }
2. CREATE_ADSETS - Create ad sets. Example: { "type": "CREATE_ADSETS", "count": 3 }
3. SET_TARGETING - BROAD or CUSTOM. Example: { "type": "SET_TARGETING", "value": "BROAD" }
4. SET_COUNTRY - Country code. Example: { "type": "SET_COUNTRY", "value": "MY" }
5. SET_AGE_RANGE - Age range. Example: { "type": "SET_AGE_RANGE", "min": 25, "max": 45 }
6. SET_ENHANCEMENT_PLUS - true/false. Example: { "type": "SET_ENHANCEMENT_PLUS", "value": false }
7. SET_GENDER - ALL, MALE, FEMALE. Example: { "type": "SET_GENDER", "value": "FEMALE" }
8. DISTRIBUTE_CREATIVES - Split creatives across adsets evenly. Example: { "type": "DISTRIBUTE_CREATIVES" }

STRICT RULES:
1. ALWAYS respond with valid JSON only (no markdown, no pre-text)
2. Format: { "message": "...", "actions": [...] }
3. "message" is your response in Bahasa Malaysia, max 100 words
4. "actions" is array of action objects to execute
5. If user just asking question (not requesting action), return empty actions array
6. Use emoji in message for clarity

EXAMPLES:
User: "Buat 3 adset dengan budget RM30"
Response: { "message": "Done! ✅ Saya dah create 3 ad sets dengan budget RM30 each. Nak saya setup targeting?", "actions": [{ "type": "CREATE_ADSETS", "count": 3 }, { "type": "SET_BUDGET", "value": 30 }] }

User: "Guna broad targeting untuk semua"
Response: { "message": "Roger! 🎯 Semua ad sets sekarang guna Advantage+ Audience (broad targeting). Meta AI akan cari audience terbaik.", "actions": [{ "type": "SET_TARGETING", "value": "BROAD" }] }

User: "Apa itu CBO?"
Response: { "message": "CBO (Campaign Budget Optimization) adalah strategi di mana Meta auto-distribute budget across semua ad sets. Best untuk testing banyak audience.", "actions": [] }`;

    const historyFormatted = conversationHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    const ai = new GoogleGenAI({ apiKey: gemini3Key });

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_FLASH_3,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: '{"message": "Saya sedia membantu anda setup ads! Apa yang anda nak buat?", "actions": []}' }] },
        ...historyFormatted,
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  value: { type: Type.STRING },
                  count: { type: Type.NUMBER },
                  min: { type: Type.NUMBER },
                  max: { type: Type.NUMBER }
                }
              }
            }
          },
          required: ["message", "actions"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");

    const parsed = JSON.parse(text) as RapidCreatorAssistantResponse;
    return parsed;

  } catch (error: any) {
    console.error("AI Action Assistant Failed:", error);
    return {
      message: "Maaf, berlaku ralat. Sila cuba lagi. 🙏",
      actions: []
    };
  }
};

// --- TEMPLATE PARSING FOR AD CREATION ---

export interface ParsedAdTemplate {
  isTemplate: boolean;
  campaign: {
    name?: string;
    id?: string;
    objective: 'SALES' | 'LEAD';
  };
  adset: {
    count: number;
    namingConvention?: string;
    budget: number;
    targeting: 'BROAD' | 'CUSTOM';
    placement: string;
  };
  ad: {
    headline?: string;
    websiteUrl?: string;
    cta: string;
  };
  primaryTexts: Array<{
    name: string;
    text: string;
  }>;
  message: string;
}

export const parseAdTemplatePrompt = async (
  userMessage: string
): Promise<ParsedAdTemplate> => {
  try {
    const gemini3Key = getGemini3ApiKey();
    if (!gemini3Key) throw new Error("Missing GEMINI_3_API Key");

    // Check if this looks like a template prompt
    const templateIndicators = ['goal:', 'primary text', 'adset', 'setting', 'naming convention', 'campaign'];
    const lowerMessage = userMessage.toLowerCase();
    const isLikelyTemplate = templateIndicators.filter(ind => lowerMessage.includes(ind)).length >= 2;

    if (!isLikelyTemplate) {
      return {
        isTemplate: false,
        campaign: { objective: 'SALES' },
        adset: { count: 1, budget: 10, targeting: 'BROAD', placement: 'ADVANTAGE_PLUS' },
        ad: { cta: 'LEARN_MORE' },
        primaryTexts: [],
        message: "Ini bukan template prompt. Sila berikan template yang lengkap dengan goal, setting adset, dan primary texts."
      };
    }

    const systemPrompt = `You are a template parser for Meta Ads. Parse the user's ad creation template and extract structured data.

EXTRACT THE FOLLOWING:
1. Campaign: name, id (if existing), objective (SALES or LEAD)
2. Adset: count, naming convention, budget (in RM), targeting (BROAD or CUSTOM), placement
3. Ad: headline, website URL, CTA (LEARN_MORE, SHOP_NOW, ORDER_NOW, etc.)
4. Primary Texts: array of {name, text} - extract ALL primary texts with their names (like C2, C5, C6, C7)

RESPOND WITH JSON ONLY:
{
  "isTemplate": true,
  "campaign": { "name": "...", "id": "...", "objective": "SALES" },
  "adset": { "count": 3, "namingConvention": "DD/MM | CR <filename>", "budget": 10, "targeting": "BROAD", "placement": "ADVANTAGE_PLUS" },
  "ad": { "headline": "...", "websiteUrl": "...", "cta": "LEARN_MORE" },
  "primaryTexts": [{ "name": "C2", "text": "..." }, { "name": "C5", "text": "..." }],
  "message": "Summary of what will be created in Bahasa Malaysia, max 50 words"
}`;

    const ai = new GoogleGenAI({ apiKey: gemini3Key });

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_FLASH_3,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: '{"isTemplate": true, "message": "Saya faham. Sila beri template."}' }] },
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isTemplate: { type: Type.BOOLEAN },
            campaign: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                id: { type: Type.STRING },
                objective: { type: Type.STRING }
              }
            },
            adset: {
              type: Type.OBJECT,
              properties: {
                count: { type: Type.NUMBER },
                namingConvention: { type: Type.STRING },
                budget: { type: Type.NUMBER },
                targeting: { type: Type.STRING },
                placement: { type: Type.STRING }
              }
            },
            ad: {
              type: Type.OBJECT,
              properties: {
                headline: { type: Type.STRING },
                websiteUrl: { type: Type.STRING },
                cta: { type: Type.STRING }
              }
            },
            primaryTexts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  text: { type: Type.STRING }
                }
              }
            },
            message: { type: Type.STRING }
          },
          required: ["isTemplate", "message"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");

    const parsed = JSON.parse(text) as ParsedAdTemplate;
    return parsed;

  } catch (error: any) {
    console.error("Template Parsing Failed:", error);
    return {
      isTemplate: false,
      campaign: { objective: 'SALES' },
      adset: { count: 1, budget: 10, targeting: 'BROAD', placement: 'ADVANTAGE_PLUS' },
      ad: { cta: 'LEARN_MORE' },
      primaryTexts: [],
      message: "Maaf, gagal parse template. Sila cuba lagi. 🙏"
    };
  }
};
