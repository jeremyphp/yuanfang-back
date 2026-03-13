import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getProfile,
  updateProfile,
  changePassword,
  getBalance,
  getUserServices,
  getUserOrders,
  getUserInvites,
} from '../controllers/userController';

const router = Router();

// Apply auth middleware to all user routes
router.use(protect);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *       401:
 *         description: Not authenticated
 */
router.get('/profile', getProfile);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               phone:
 *                 type: string
 *               avatar:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.put('/profile', updateProfile);

/**
 * @swagger
 * /api/users/password:
 *   put:
 *     summary: Change user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated or current password incorrect
 */
router.put('/password', changePassword);

/**
 * @swagger
 * /api/users/balance:
 *   get:
 *     summary: Get user balance and transactions
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance and transactions data
 *       401:
 *         description: Not authenticated
 */
router.get('/balance', getBalance);

/**
 * @swagger
 * /api/users/services:
 *   get:
 *     summary: Get user's published services
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter by service status
 *     responses:
 *       200:
 *         description: List of user's services
 *       401:
 *         description: Not authenticated
 */
router.get('/services', getUserServices);

/**
 * @swagger
 * /api/users/orders:
 *   get:
 *     summary: Get user's orders
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, cancelled]
 *         description: Filter by order status
 *     responses:
 *       200:
 *         description: List of user's orders
 *       401:
 *         description: Not authenticated
 */
router.get('/orders', getUserOrders);

/**
 * @swagger
 * /api/users/invites:
 *   get:
 *     summary: Get user's invite records
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, expired]
 *         description: Filter by invite status
 *     responses:
 *       200:
 *         description: List of user's invites with statistics
 *       401:
 *         description: Not authenticated
 */
router.get('/invites', getUserInvites);

export { router as userRoutes };