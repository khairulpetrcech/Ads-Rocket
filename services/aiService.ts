import { GoogleGenAI, Type } from "@google/genai";
import { AdCampaign, AiProvider, AiAnalysisResult } from "../types";

// Default Models
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";

// Helper to format prompt
const createPrompt = (campaign: AdCampaign) => {
  return `
    You are a senior Meta Ads Expert. Analyze this Facebook Ad Campaign performance data.
    
    Campaign Name: ${campaign.name}
    Status: ${campaign.status}
    Spend: $${campaign.metrics.spend}
    Revenue: $${campaign.metrics.revenue}
    ROAS: ${campaign.metrics.roas}
    CTR: ${campaign.metrics.ctr}%
    Cost Per Purchase: $${campaign.metrics.costPerPurchase}
    Cost Per Landing Page View: $${campaign.metrics.costPerLandingPageView}
    
    Provide a concise summary, a concrete step-by-step action plan to improve performance, and an overall sentiment.
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
  // Use user key if provided, else fallback to env (if available)
  const key = userApiKey || getEnvApiKey();
  
  try {
    if (provider === AiProvider.CLAUDE) {
      if (!key) return [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
      ];
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
          return data.data
            .filter((m: any) => m.id.includes('claude-3'))
            .map((m: any) => m.id)
            .sort();
        }
      } catch (e) {
        console.warn("Could not fetch Claude models dynamically, using defaults.");
      }
      return [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
      ];
    } 
    
    if (provider === AiProvider.GEMINI) {
      if (!key) return ["gemini-2.5-flash", "gemini-3-pro-preview"];
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (response.ok) {
            const data = await response.json();
            return data.models
                .filter((m: any) => m.name.includes('gemini') || m.name.includes('flash') || m.name.includes('pro'))
                .map((m: any) => m.name.replace('models/', ''));
        }
      } catch (e) {
         console.warn("Could not fetch Gemini models dynamically, using defaults.");
      }
      return ["gemini-2.5-flash", "gemini-3-pro-preview"];
    }

    if (provider === AiProvider.OPENAI) {
      // OpenAI doesn't easily support listing models from client side due to CORS often, 
      // but we can try or return standard list.
      return ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];
    }

    if (provider === AiProvider.OPENROUTER) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (response.ok) {
          const data = await response.json();
          // Sort by context length or just take top ones, OpenRouter has MANY models.
          // Let's filter for some popular ones to keep list clean
          return data.data
            .map((m: any) => m.id)
            .sort();
        }
      } catch (e) {
        console.warn("Could not fetch OpenRouter models");
      }
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
  await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
  
  let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
  const plans = [];

  if (campaign.metrics.roas > 3) {
    sentiment = 'POSITIVE';
    plans.push("Increase daily budget by 20% every 48 hours to scale winning ad sets.");
    plans.push("Duplicate winning ad sets to new Broad audiences.");
    plans.push("Launch a new creative iteration batch based on current winners.");
  } else if (campaign.metrics.roas < 1.5) {
    sentiment = 'NEGATIVE';
    plans.push("Pause ads with Spend > $50 and 0 Purchases.");
    plans.push("Review landing page load speed (current metrics suggest drop-off).");
    plans.push("Refresh creative: CTR is below benchmark.");
  } else {
    plans.push("Monitor CPC trends over the next 24 hours.");
    plans.push("Test new primary text variations to improve Relevance Score.");
    plans.push("Breakdown placement performance and exclude Audience Network if inefficient.");
  }

  return {
    summary: `[SIMULATED ANALYSIS] Based on the ROAS of ${campaign.metrics.roas.toFixed(2)} and CTR of ${campaign.metrics.ctr}%, this campaign is ${sentiment === 'POSITIVE' ? 'highly profitable' : sentiment === 'NEGATIVE' ? 'underperforming' : 'stable'}.`,
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
      CRITICAL INSTRUCTION: Return the result strictly as a valid JSON object matching this structure.
      {
        "summary": "string",
        "actionPlan": ["string", "string"],
        "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE"
      }`;

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
          max_tokens: 4096,
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
      const openAiPrompt = `${prompt}
      Return the result strictly as a valid JSON object.
      Schema: { summary: string, actionPlan: string[], sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" }`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: openAiPrompt }],
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
       const orPrompt = `${prompt}
       Return the result strictly as a valid JSON object.
       Schema: { summary: string, actionPlan: string[], sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" }`;
 
       const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${apiKey}`,
           'Content-Type': 'application/json',
           'HTTP-Referer': window.location.href, // Required by OpenRouter
           'X-Title': 'Ads Roket', // Required by OpenRouter
         },
         body: JSON.stringify({
           model: modelName,
           messages: [{ role: "user", content: orPrompt }],
           // Not all OpenRouter models support json_object mode, so we rely on the prompt instructions
         })
       });
 
       if (!response.ok) throw new Error(`OpenRouter request failed: ${response.statusText}`);
       const data = await response.json();
       const content = data.choices[0]?.message?.content;
       // Attempt to strip markdown code blocks if present
       const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
       return JSON.parse(jsonStr) as AiAnalysisResult;
    }

    // Fallback/Free Tier Simulation
    return await simulateAiResponse(campaign);

  } catch (error) {
    console.error("AI Analysis Failed:", error);
    return await simulateAiResponse(campaign);
  }
};