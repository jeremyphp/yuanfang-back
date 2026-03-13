import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createChatSession,
  getChatSessions,
  getChatSession,
  sendMessage,
  updateChatTitle,
  deleteChatSession,
} from '../controllers/chatController';

const router = Router();

// Apply auth middleware to all chat routes
router.use(protect);

/**
 * @swagger
 * /api/chat/sessions:
 *   post:
 *     summary: Create new chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Optional title for the chat session
 *               aiModel:
 *                 type: string
 *                 enum: [gemini-pro, gemini-pro-vision]
 *                 default: gemini-pro
 *                 description: AI model to use for this chat
 *     responses:
 *       201:
 *         description: Chat session created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: Daily message limit reached
 */
router.post('/sessions', createChatSession);

/**
 * @swagger
 * /api/chat/sessions:
 *   get:
 *     summary: Get user's chat sessions
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of sessions per page
 *     responses:
 *       200:
 *         description: List of chat sessions with pagination
 *       401:
 *         description: Not authenticated
 */
router.get('/sessions', getChatSessions);

/**
 * @swagger
 * /api/chat/sessions/{id}:
 *   get:
 *     summary: Get chat session by ID with messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     responses:
 *       200:
 *         description: Chat session details with messages
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Chat session not found or unauthorized
 */
router.get('/sessions/:id', getChatSession);

/**
 * @swagger
 * /api/chat/sessions/{sessionId}/message:
 *   post:
 *     summary: Send message to AI in a chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message content to send to AI
 *               role:
 *                 type: string
 *                 enum: [user, assistant]
 *                 default: user
 *                 description: Role of the message sender
 *     responses:
 *       200:
 *         description: Message sent and AI response received
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Chat session not found or unauthorized
 *       429:
 *         description: Daily token limit reached
 */
router.post('/sessions/:sessionId/message', sendMessage);

/**
 * @swagger
 * /api/chat/sessions/{id}/title:
 *   put:
 *     summary: Update chat session title
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: New title for the chat session
 *     responses:
 *       200:
 *         description: Chat title updated successfully
 *       400:
 *         description: Validation error or title missing
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Chat session not found or unauthorized
 */
router.put('/sessions/:id/title', updateChatTitle);

/**
 * @swagger
 * /api/chat/sessions/{id}:
 *   delete:
 *     summary: Delete chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     responses:
 *       200:
 *         description: Chat session deleted successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Chat session not found or unauthorized
 */
router.delete('/sessions/:id', deleteChatSession);

/**
 * @swagger
 * /api/chat/models:
 *   get:
 *     summary: Get available AI models
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available AI models
 *       401:
 *         description: Not authenticated
 */
router.get('/models', (req, res) => {
  const { getAvailableModels } = require('../utils/aiService');
  const models = getAvailableModels();

  res.json({
    success: true,
    data: models,
    configured: models.some((model: any) => model.enabled),
  });
});

/**
 * @swagger
 * /api/chat/stats:
 *   get:
 *     summary: Get user's chat statistics
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's chat usage statistics
 *       401:
 *         description: Not authenticated
 */
router.get('/stats', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const db = require('../utils/database').default;

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Get total sessions count
    const totalSessions = db.prepare('SELECT COUNT(*) as count FROM chat_sessions WHERE user_id = ?').get(userId) as any;

    // Get today's usage
    const todayUsage = db.prepare(`
      SELECT
        COUNT(*) as messages_today,
        SUM(token_count) as tokens_today
      FROM chat_sessions
      WHERE user_id = ? AND DATE(created_at) = ?
    `).get(userId, today) as any;

    // Get total token usage
    const totalTokens = db.prepare('SELECT SUM(token_count) as total FROM chat_sessions WHERE user_id = ?').get(userId) as any;

    const maxMessages = parseInt(process.env.AI_MAX_MESSAGES_PER_DAY || '100');
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS_PER_DAY || '100000');

    res.json({
      success: true,
      data: {
        totalSessions: totalSessions.count || 0,
        todayUsage: {
          messages: todayUsage.messages_today || 0,
          tokens: todayUsage.tokens_today || 0,
          messageLimit: maxMessages,
          tokenLimit: maxTokens,
          messageRemaining: Math.max(0, maxMessages - (todayUsage.messages_today || 0)),
          tokenRemaining: Math.max(0, maxTokens - (todayUsage.tokens_today || 0)),
        },
        totalTokens: totalTokens.total || 0,
      },
    });
  } catch (error: any) {
    console.error('Get chat stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching chat statistics',
    });
  }
});

export { router as chatRoutes };