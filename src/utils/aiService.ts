/**
 * AI Service - Integrates with various AI models (Gemini, OpenAI, Anthropic, etc.)
 * Supports Google Gemini API, OpenAI API, and Anthropic API
 */

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
}

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface AIResponse {
  success: boolean;
  content: string;
  tokenCount: number;
  promptTokens: number;
  completionTokens: number;
  error?: string;
}

interface AIModelConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
}

/**
 * Call AI model based on model identifier
 */
export async function callAIModel(
  modelId: string,
  messages: AIMessage[]
): Promise<AIResponse> {
  try {
    // Extract conversation history (last 10 messages for context)
    const conversationHistory = messages.slice(-10).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('Last message must be from user');
    }

    // Route to appropriate AI provider based on modelId
    if (modelId.startsWith('gemini-')) {
      return await callGeminiAPI(modelId, lastMessage.content, conversationHistory.slice(0, -1));
    } else if (modelId.startsWith('gpt-')) {
      return await callOpenAIAPI(modelId, messages);
    } else if (modelId.startsWith('claude-')) {
      return await callAnthropicAPI(modelId, messages);
    } else {
      throw new Error(`Unsupported AI model: ${modelId}`);
    }
  } catch (error: any) {
    console.error('AI service error:', error);
    return {
      success: false,
      content: '',
      tokenCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      error: error.message || 'Unknown AI service error',
    };
  }
}

/**
 * Call Google Gemini API
 */
async function callGeminiAPI(
  modelId: string,
  prompt: string,
  history: any[] = []
): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not configured. Using mock response for development.');
    return getMockAIResponse(prompt);
  }

  try {
    // Dynamically import @google/generative-ai if available
    // For now, use fetch API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        ...history,
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as GeminiResponse;

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response generated from Gemini API');
    }

    const candidate = data.candidates[0];
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Response blocked by safety filters');
    }

    const content = candidate.content?.parts?.[0]?.text || 'No response generated';

    // Estimate token count (rough approximation: 1 token ≈ 4 characters for English)
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(content.length / 4);
    const totalTokens = promptTokens + completionTokens;

    return {
      success: true,
      content,
      tokenCount: totalTokens,
      promptTokens,
      completionTokens,
    };
  } catch (error: any) {
    console.error('Gemini API call failed:', error);
    // Fallback to mock response in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Falling back to mock response for development');
      return getMockAIResponse(prompt);
    }
    throw error;
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAIAPI(modelId: string, messages: AIMessage[]): Promise<AIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not configured. Using mock response.');
    return getMockAIResponse(messages[messages.length - 1]?.content || '');
  }

  try {
    // Convert messages to OpenAI format
    const openAIMessages = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    const url = 'https://api.openai.com/v1/chat/completions';

    const requestBody = {
      model: modelId,
      messages: openAIMessages,
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response generated from OpenAI API');
    }

    const choice = data.choices[0];
    const content = choice.message?.content || 'No response generated';

    // Use actual token counts from API if available
    const promptTokens = data.usage?.prompt_tokens || Math.ceil(messages.map(m => m.content).join('').length / 4);
    const completionTokens = data.usage?.completion_tokens || Math.ceil(content.length / 4);
    const totalTokens = promptTokens + completionTokens;

    return {
      success: true,
      content,
      tokenCount: totalTokens,
      promptTokens,
      completionTokens,
    };
  } catch (error: any) {
    console.error('OpenAI API call failed:', error);
    // Fallback to mock response in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Falling back to mock response for development');
      return getMockAIResponse(messages[messages.length - 1]?.content || '');
    }
    throw error;
  }
}

/**
 * Call Anthropic API
 */
async function callAnthropicAPI(modelId: string, messages: AIMessage[]): Promise<AIResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not configured. Using mock response.');
    return getMockAIResponse(messages[messages.length - 1]?.content || '');
  }

  try {
    // Convert messages to Anthropic format
    // Anthropic expects alternating user/assistant messages, starting with user
    const anthropicMessages: Array<{role: 'user' | 'assistant', content: string}> = [];

    for (const msg of messages) {
      // Skip if consecutive messages have same role (shouldn't happen but just in case)
      if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === msg.role) {
        // Merge with previous message
        anthropicMessages[anthropicMessages.length - 1].content += '\n\n' + msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }
    }

    // Ensure first message is from user (Anthropic requirement)
    if (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
      // Insert a dummy user message
      anthropicMessages.unshift({
        role: 'user',
        content: 'Continue the conversation.',
      });
    }

    const url = 'https://api.anthropic.com/v1/messages';

    const requestBody = {
      model: modelId,
      messages: anthropicMessages,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.95,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.content || data.content.length === 0) {
      throw new Error('No response generated from Anthropic API');
    }

    // Anthropic returns an array of content blocks (usually just one text block)
    const content = data.content.map((block: any) => block.text).join('');

    // Estimate token counts (Anthropic returns usage in input_tokens and output_tokens)
    const promptTokens = data.usage?.input_tokens || Math.ceil(messages.map(m => m.content).join('').length / 4);
    const completionTokens = data.usage?.output_tokens || Math.ceil(content.length / 4);
    const totalTokens = promptTokens + completionTokens;

    return {
      success: true,
      content,
      tokenCount: totalTokens,
      promptTokens,
      completionTokens,
    };
  } catch (error: any) {
    console.error('Anthropic API call failed:', error);
    // Fallback to mock response in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Falling back to mock response for development');
      return getMockAIResponse(messages[messages.length - 1]?.content || '');
    }
    throw error;
  }
}

/**
 * Get mock AI response for development/testing
 */
function getMockAIResponse(prompt: string): AIResponse {
  console.log('📝 [AI Mock] Generating mock response for prompt:', prompt.substring(0, 100) + '...');

  // Simple mock responses based on prompt
  const responses = [
    `I understand you're asking about "${prompt.substring(0, 50)}...". This is a mock response from the AI service. In production, this would connect to a real AI model like Google Gemini.`,
    `Thanks for your message! You said: "${prompt.substring(0, 80)}...". I'm currently running in development mode. To enable real AI responses, please set up the appropriate API keys in your .env file.`,
    `This is a simulated AI response. Your query was: "${prompt.substring(0, 60)}...". To get real AI responses, configure GEMINI_API_KEY in your environment variables.`,
    `I received your message about "${prompt.substring(0, 40)}...". This platform supports multiple AI models including Gemini, GPT, and Claude. Set up your API keys to start using them.`,
  ];

  const randomResponse = responses[Math.floor(Math.random() * responses.length)];

  // Estimate token counts
  const promptTokens = Math.ceil(prompt.length / 4);
  const completionTokens = Math.ceil(randomResponse.length / 4);
  const totalTokens = promptTokens + completionTokens;

  return {
    success: true,
    content: randomResponse,
    tokenCount: totalTokens,
    promptTokens,
    completionTokens,
  };
}

/**
 * Check if AI service is configured
 */
export function isAIConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Get available AI models
 */
export function getAvailableModels() {
  const models = [
    {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      provider: 'Google',
      description: 'Google\'s most capable text model for a wide range of tasks',
      maxTokens: 32768,
      supportsVision: false,
      enabled: !!process.env.GEMINI_API_KEY,
    },
    {
      id: 'gemini-pro-vision',
      name: 'Gemini Pro Vision',
      provider: 'Google',
      description: 'Multimodal model that understands text, images, and video',
      maxTokens: 16384,
      supportsVision: true,
      enabled: !!process.env.GEMINI_API_KEY,
    },
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'OpenAI',
      description: 'OpenAI\'s most capable model with broad general knowledge',
      maxTokens: 8192,
      supportsVision: false,
      enabled: !!process.env.OPENAI_API_KEY,
    },
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'Anthropic',
      description: 'Anthropic\'s most intelligent model for highly complex tasks',
      maxTokens: 200000,
      supportsVision: true,
      enabled: !!process.env.ANTHROPIC_API_KEY,
    },
  ];

  return models.filter(model => process.env.NODE_ENV === 'development' || model.enabled);
}