import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getInviteCenter,
  createInvite,
  getInviteRecords,
  getRewardRecords,
  getReferrerInfo,
  claimRewards,
  generateReferralCode,
} from '../controllers/inviteController';

const router = Router();

// Apply auth middleware to all invite routes
router.use(protect);

/**
 * @swagger
 * /api/invite/center:
 *   get:
 *     summary: Get invite center information
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invite center data including referral code, statistics, and recent invites
 *       401:
 *         description: Not authenticated
 */
router.get('/center', getInviteCenter);

/**
 * @swagger
 * /api/invite:
 *   post:
 *     summary: Create new invite
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inviteeEmail
 *             properties:
 *               inviteeEmail:
 *                 type: string
 *                 format: email
 *                 description: Email address of the person to invite
 *     responses:
 *       201:
 *         description: Invite created successfully
 *       400:
 *         description: Validation error or invite already exists
 *       401:
 *         description: Not authenticated
 */
router.post('/', createInvite);

/**
 * @swagger
 * /api/invite/records:
 *   get:
 *     summary: Get invite records with pagination
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, expired]
 *         description: Filter by invite status
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
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of invite records with pagination and statistics
 *       401:
 *         description: Not authenticated
 */
router.get('/records', getInviteRecords);

/**
 * @swagger
 * /api/invite/rewards:
 *   get:
 *     summary: Get reward records
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rewardStatus
 *         schema:
 *           type: string
 *           enum: [pending, paid]
 *         description: Filter by reward status
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
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of reward records with statistics
 *       401:
 *         description: Not authenticated
 */
router.get('/rewards', getRewardRecords);

/**
 * @swagger
 * /api/invite/referrer:
 *   get:
 *     summary: Get referrer information
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Information about user's referrer
 *       401:
 *         description: Not authenticated
 */
router.get('/referrer', getReferrerInfo);

/**
 * @swagger
 * /api/invite/claim:
 *   post:
 *     summary: Claim rewards for accepted invite
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inviteId
 *             properties:
 *               inviteId:
 *                 type: string
 *                 description: ID of the invite to claim rewards for
 *     responses:
 *       200:
 *         description: Rewards claimed successfully
 *       400:
 *         description: Rewards not available or already claimed
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Invite not found or unauthorized
 */
router.post('/claim', claimRewards);

/**
 * @swagger
 * /api/invite/generate-code:
 *   post:
 *     summary: Generate new referral code
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: New referral code generated
 *       401:
 *         description: Not authenticated
 */
router.post('/generate-code', generateReferralCode);

export { router as inviteRoutes };