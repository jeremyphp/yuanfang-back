import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { createChatSchema, addMessageSchema } from '../utils/validation';
import { AppError } from '../middleware/errorMiddleware';
import { v4 as uuidv4 } from 'uuid';
import { callAIModel } from '../utils/aiService';

interface AuthRequest extends Request {
  user?: any;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Create new chat session
 */
export const createChatSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user.id);
    const validatedData = createChatSchema.parse(req.body);

    // Check user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check daily message limit
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const todayMessagesCount = await prisma.chatSession.count({
      where: {
        userId: userId,
        createdAt: {
          gte: todayStart,
          lt: tomorrowStart
        }
      }
    });

    const maxMessages = parseInt(process.env.AI_MAX_MESSAGES_PER_DAY || '100');
    if (todayMessagesCount >= maxMessages) {
      throw new AppError('Daily message limit reached', 429);
    }

    // Create chat session
    const sessionId = uuidv4();
    const newSession = await prisma.chatSession.create({
      data: {
        id: sessionId,
        userId: userId,
        title: validatedData.title || '新对话',
        aiModel: validatedData.aiModel,
        messages: [] as any, // Empty messages array
      },
    });

    res.status(201).json({
      success: true,
      message: 'Chat session created successfully',
      data: newSession,
    });
  } catch (error: any) {
    console.error('Create chat session error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error creating chat session',
    });
  }
};

/**
 * Get user's chat sessions
 */
export const getChatSessions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user.id);
    const { page = 1, limit = 20 } = req.query;

    // Calculate pagination
    const pageNum = typeof page === 'string' ? parseInt(page) : 1;
    const limitNum = typeof limit === 'string' ? parseInt(limit) : 20;
    const offset = (pageNum - 1) * limitNum;

    // Get total count
    const total = await prisma.chatSession.count({
      where: { userId: userId }
    });

    // Get sessions with pagination
    const sessions = await prisma.chatSession.findMany({
      where: { userId: userId },
      select: {
        id: true,
        title: true,
        aiModel: true,
        tokenCount: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' },
      take: limitNum,
      skip: offset
    });

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    console.error('Get chat sessions error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching chat sessions',
    });
  }
};

/**
 * Get chat session by ID with messages
 */
export const getChatSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user.id);
    const id = String(req.params.id);

    // Get session with messages
    const session = await prisma.chatSession.findUnique({
      where: { id: id, userId: userId }
    });
    if (!session) {
      throw new AppError('Chat session not found or unauthorized', 404);
    }

    // Parse messages from JSON (Prisma returns as JsonValue)
    const sessionData = session as any;
    const messages = Array.isArray(sessionData.messages) ? sessionData.messages : JSON.parse(sessionData.messages || '[]');

    res.json({
      success: true,
      data: {
        ...sessionData,
        messages,
      },
    });
  } catch (error: any) {
    console.error('Get chat session error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching chat session',
    });
  }
};

/**
 * Send message to AI and get response
 */
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user.id);
    const sessionId = String(req.params.sessionId);
    const validatedData = addMessageSchema.parse(req.body);

    // Check session exists and belongs to user
    const sessionData = await prisma.chatSession.findUnique({
      where: { id: sessionId, userId: userId }
    });
    if (!sessionData) {
      throw new AppError('Chat session not found or unauthorized', 404);
    }

    // Check daily token limit
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const todayTokensResult = await prisma.chatSession.aggregate({
      where: {
        userId: userId,
        createdAt: {
          gte: todayStart,
          lt: tomorrowStart
        }
      },
      _sum: {
        tokenCount: true
      }
    });

    const todayTokensTotal = todayTokensResult._sum.tokenCount || 0;
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS_PER_DAY || '100000');
    if (todayTokensTotal >= maxTokens) {
      throw new AppError('Daily token limit reached', 429);
    }

    // Parse existing messages
    const messages: ChatMessage[] = Array.isArray(sessionData.messages)
      ? sessionData.messages as unknown as ChatMessage[]
      : typeof sessionData.messages === 'string'
        ? JSON.parse(sessionData.messages || '[]')
        : [];

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: validatedData.content,
      timestamp: new Date().toISOString(),
    };
    messages.push(userMessage);

    // Update session with user message
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        messages: messages as any,
        updatedAt: new Date()
      }
    });

    // Call AI model
    const aiModel = sessionData.aiModel;
    const aiResponse = await callAIModel(aiModel, messages);

    if (!aiResponse.success) {
      throw new AppError(`AI service error: ${aiResponse.error}`, 500);
    }

    // Add assistant message
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: aiResponse.content,
      timestamp: new Date().toISOString(),
    };
    messages.push(assistantMessage);

    // Update session with assistant message and token count
    const newTokenCount = sessionData.tokenCount + aiResponse.tokenCount;
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        messages: messages as any,
        tokenCount: newTokenCount,
        updatedAt: new Date()
      }
    });

    // Update user's total token usage (optional, could be used for billing)
    // db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(aiResponse.tokenCount, userId);

    res.json({
      success: true,
      message: 'Message sent and response received',
      data: {
        sessionId,
        userMessage,
        assistantMessage,
        tokenCount: newTokenCount,
        usage: {
          promptTokens: aiResponse.promptTokens,
          completionTokens: aiResponse.completionTokens,
          totalTokens: aiResponse.tokenCount,
        },
      },
    });
  } catch (error: any) {
    console.error('Send message error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error sending message',
    });
  }
};

/**
 * Update chat session title
 */
export const updateChatTitle = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user.id);
    const id = String(req.params.id);
    const { title } = req.body;

    if (!title || title.trim().length === 0) {
      throw new AppError('Title is required', 400);
    }

    // Check session exists and belongs to user
    const session = await prisma.chatSession.findUnique({
      where: { id: id, userId: userId }
    });
    if (!session) {
      throw new AppError('Chat session not found or unauthorized', 404);
    }

    // Update title
    await prisma.chatSession.update({
      where: { id: id },
      data: {
        title: title.trim(),
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Chat title updated successfully',
    });
  } catch (error: any) {
    console.error('Update chat title error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error updating chat title',
    });
  }
};

/**
 * Delete chat session
 */
export const deleteChatSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user.id);
    const id = String(req.params.id);

    // Check session exists and belongs to user
    const session = await prisma.chatSession.findUnique({
      where: { id: id, userId: userId }
    });
    if (!session) {
      throw new AppError('Chat session not found or unauthorized', 404);
    }

    // Delete session
    await prisma.chatSession.delete({
      where: { id: id }
    });

    res.json({
      success: true,
      message: 'Chat session deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete chat session error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error deleting chat session',
    });
  }
};