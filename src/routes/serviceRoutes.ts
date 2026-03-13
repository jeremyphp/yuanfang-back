import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
  publishService,
  archiveService,
  unarchiveService,
  getCategories,
  getPopularServices,
  searchServices,
} from '../controllers/serviceController';

const router = Router();

/**
 * @swagger
 * /api/services:
 *   post:
 *     summary: Create a new AI service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - category
 *               - price
 *               - deliveryMethod
 *               - coverage
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *               category:
 *                 type: string
 *                 enum: [tutorial, online, onsite]
 *               price:
 *                 type: number
 *                 minimum: 0
 *               coverImage:
 *                 type: string
 *                 format: uri
 *               deliveryMethod:
 *                 type: string
 *                 enum: [tutorial, online, onsite]
 *               coverage:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       201:
 *         description: Service created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.post('/', protect, createService);

/**
 * @swagger
 * /api/services:
 *   get:
 *     summary: Get all services with filtering
 *     tags: [Services]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [tutorial, online, onsite]
 *         description: Filter by category
 *       - in: query
 *         name: deliveryMethod
 *         schema:
 *           type: string
 *           enum: [tutorial, online, onsite]
 *         description: Filter by delivery method
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           default: published
 *           enum: [draft, published, archived]
 *         description: Filter by service status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and description
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: created_at
 *           enum: [created_at, updated_at, price, title]
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           default: DESC
 *           enum: [ASC, DESC]
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of services with pagination
 */
router.get('/', getServices);

/**
 * @swagger
 * /api/services/categories:
 *   get:
 *     summary: Get service categories with statistics
 *     tags: [Services]
 *     responses:
 *       200:
 *         description: List of categories with service counts and average prices
 */
router.get('/categories', getCategories);

/**
 * @swagger
 * /api/services/popular:
 *   get:
 *     summary: Get popular services
 *     tags: [Services]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Number of popular services to return
 *     responses:
 *       200:
 *         description: List of popular services
 */
router.get('/popular', getPopularServices);

/**
 * @swagger
 * /api/services/search:
 *   get:
 *     summary: Search services
 *     tags: [Services]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Search query is required
 */
router.get('/search', searchServices);

/**
 * @swagger
 * /api/services/{id}:
 *   get:
 *     summary: Get service by ID
 *     tags: [Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service details with author info
 *       404:
 *         description: Service not found
 */
router.get('/:id', getServiceById);

/**
 * @swagger
 * /api/services/{id}:
 *   put:
 *     summary: Update service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *               category:
 *                 type: string
 *                 enum: [tutorial, online, onsite]
 *               price:
 *                 type: number
 *                 minimum: 0
 *               coverImage:
 *                 type: string
 *                 format: uri
 *               deliveryMethod:
 *                 type: string
 *                 enum: [tutorial, online, onsite]
 *               coverage:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Service updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found or unauthorized
 */
router.put('/:id', protect, updateService);

/**
 * @swagger
 * /api/services/{id}:
 *   delete:
 *     summary: Delete service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service deleted successfully
 *       400:
 *         description: Cannot delete service with existing orders
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found or unauthorized
 */
router.delete('/:id', protect, deleteService);

/**
 * @swagger
 * /api/services/{id}/publish:
 *   post:
 *     summary: Publish service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service published successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found or unauthorized
 */
router.post('/:id/publish', protect, publishService);

/**
 * @swagger
 * /api/services/{id}/archive:
 *   post:
 *     summary: Archive service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service archived successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found or unauthorized
 */
router.post('/:id/archive', protect, archiveService);

/**
 * @swagger
 * /api/services/{id}/unarchive:
 *   post:
 *     summary: Unarchive service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service unarchived successfully
 *       400:
 *         description: Service is not archived
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found or unauthorized
 */
router.post('/:id/unarchive', protect, unarchiveService);

export { router as serviceRoutes };