import { GoogleGenAI, Type } from "@google/genai";
import { AdCampaign, AiProvider, AiAnalysisResult } from "../types";

// Helper to format prompt
const createPrompt = (campaign: AdCampaign) => {
  return `
    Analyze this Facebook Ad Campaign performance.
    Campaign Name: ${campaign.name}
    Status: ${campaign.status}
    Spend: $${campaign.metrics.spend}
    Revenue: $${campaign.metrics.revenue}
    ROAS: ${campaign.metrics.roas}
    CTR: ${campaign.metrics.ctr}%
    Cost Per Purchase: $${campaign.metrics.costPerPurchase}
    Cost Per Landing Page View: $${campaign.metrics.costPerLandingPageView}
  `;
};

// Simulation for Free/Other providers where we don't have backend proxy in this demo
const simulateAiResponse = async (campaign: AdCampaign): Promise<AiAnalysisResult> => {
  await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
  
  let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
  const plans = [];

  if (campaign.metrics.roas > 3) {
    sentiment = 'POSITIVE';
    plans.push("Increase daily budget by 20% every 2 days.");
    plans.push("Duplicate winning ad sets to new audiences.");
    plans.push("Test new creative variations similar to the winner.");
  } else if (campaign.metrics.roas < 1.5) {
    sentiment = 'NEGATIVE';
    plans.push("Pause underperforming creatives immediately.");
    plans.push("Review landing page load speed and congruency.");
    plans.push("Tighten audience targeting to exclude low-intent users.");
  } else {
    plans.push("Monitor CPC trends over the next 48 hours.");
    plans.push("Rotate in 1 new headline to improve CTR.");
    plans.push("Analyze placement breakdown for waste.");
  }

  return {
    summary: `Based on the ROAS of ${campaign.metrics.roas} and CTR of ${campaign.metrics.ctr}%, this campaign is performing ${sentiment === 'POSITIVE' ? 'exceptionally well' : sentiment === 'NEGATIVE' ? 'poorly' : 'averagely'}. Spend efficiency is ${sentiment === 'NEGATIVE' ? 'low' : 'stable'}.`,
    actionPlan: plans,
    sentiment
  };
};

export const analyzeCampaign = async (
  campaign: AdCampaign,
  provider: AiProvider
): Promise<AiAnalysisResult> => {
  
  try {
    if (provider === AiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: createPrompt(campaign),
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
    
    // Fallback for others or if no key provided (simulating the "Free System AI")
    return await simulateAiResponse(campaign);

  } catch (error) {
    console.error("AI Analysis Failed:", error);
    // Fallback to simulation on error to keep app usable
    return await simulateAiResponse(campaign);
  }
};