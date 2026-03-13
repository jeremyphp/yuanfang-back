import { Request, Response } from 'express';
import db from '../utils/database';
import { createServiceSchema, updateServiceSchema } from '../utils/validation';
import { AppError } from '../middleware/errorMiddleware';
import { v4 as uuidv4 } from 'uuid';

interface AuthRequest extends Request {
  user?: any;
}

/**
 * Create a new AI service
 */
export const createService = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const validatedData = createServiceSchema.parse(req.body);

    // Check if user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Generate service ID
    const serviceId = uuidv4();

    // Insert new service
    const stmt = db.prepare(`
      INSERT INTO services (
        id, title, description, category, price, cover_image,
        delivery_method, coverage, status, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      serviceId,
      validatedData.title,
      validatedData.description,
      validatedData.category,
      validatedData.price,
      validatedData.coverImage || null,
      validatedData.deliveryMethod,
      validatedData.coverage,
      'draft', // Default status
      userId
    );

    // Get created service
    const newService = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: newService,
    });
  } catch (error: any) {
    console.error('Create service error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error creating service',
    });
  }
};

/**
 * Get all services with filtering and pagination
 */
export const getServices = async (req: Request, res: Response) => {
  try {
    const {
      category,
      deliveryMethod,
      minPrice,
      maxPrice,
      status = 'published',
      search,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    // Build query
    let whereClauses: string[] = ['status = ?'];
    const params: any[] = [status];

    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }

    if (deliveryMethod) {
      whereClauses.push('delivery_method = ?');
      params.push(deliveryMethod);
    }

    if (minPrice) {
      whereClauses.push('price >= ?');
      params.push(parseFloat(minPrice as string));
    }

    if (maxPrice) {
      whereClauses.push('price <= ?');
      params.push(parseFloat(maxPrice as string));
    }

    if (search) {
      whereClauses.push('(title LIKE ? OR description LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Validate sort column
    const validSortColumns = ['created_at', 'updated_at', 'price', 'title'];
    const sortColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'created_at';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // Calculate pagination
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM services ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as any;
    const total = countResult.total || 0;

    // Get services with user info
    const servicesQuery = `
      SELECT
        s.*,
        u.username as author_username,
        u.avatar as author_avatar
      FROM services s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;

    const services = db.prepare(servicesQuery).all(...params, parseInt(limit as string), offset);

    res.json({
      success: true,
      data: services,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    console.error('Get services error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching services',
    });
  }
};

/**
 * Get service by ID
 */
export const getServiceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get service with author info
    const service = db.prepare(`
      SELECT
        s.*,
        u.username as author_username,
        u.avatar as author_avatar,
        u.membership as author_membership,
        u.created_at as author_joined_date
      FROM services s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(id);

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    // Get author's other services
    const authorServices = db.prepare(`
      SELECT id, title, price, cover_image, created_at
      FROM services
      WHERE user_id = ? AND id != ? AND status = 'published'
      ORDER BY created_at DESC
      LIMIT 5
    `).all((service as any).user_id, id);

    res.json({
      success: true,
      data: {
        ...service,
        author_services: authorServices,
      },
    });
  } catch (error: any) {
    console.error('Get service by ID error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching service',
    });
  }
};

/**
 * Update service
 */
export const updateService = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const validatedData = updateServiceSchema.parse(req.body);

    // Check if service exists and belongs to user
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(id, userId);
    if (!service) {
      throw new AppError('Service not found or unauthorized', 404);
    }

    // Build update fields
    const updates: string[] = [];
    const values: any[] = [];

    if (validatedData.title !== undefined) {
      updates.push('title = ?');
      values.push(validatedData.title);
    }

    if (validatedData.description !== undefined) {
      updates.push('description = ?');
      values.push(validatedData.description);
    }

    if (validatedData.category !== undefined) {
      updates.push('category = ?');
      values.push(validatedData.category);
    }

    if (validatedData.price !== undefined) {
      updates.push('price = ?');
      values.push(validatedData.price);
    }

    if (validatedData.coverImage !== undefined) {
      updates.push('cover_image = ?');
      values.push(validatedData.coverImage);
    }

    if (validatedData.deliveryMethod !== undefined) {
      updates.push('delivery_method = ?');
      values.push(validatedData.deliveryMethod);
    }

    if (validatedData.coverage !== undefined) {
      updates.push('coverage = ?');
      values.push(validatedData.coverage);
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');

    // Add service ID for WHERE clause
    values.push(id, userId);

    if (updates.length > 1) { // At least one field to update (plus timestamp)
      const updateStmt = db.prepare(`
        UPDATE services
        SET ${updates.join(', ')}
        WHERE id = ? AND user_id = ?
      `);
      updateStmt.run(...values);
    }

    // Get updated service
    const updatedService = db.prepare('SELECT * FROM services WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Service updated successfully',
      data: updatedService,
    });
  } catch (error: any) {
    console.error('Update service error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error updating service',
    });
  }
};

/**
 * Delete service
 */
export const deleteService = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if service exists and belongs to user
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(id, userId);
    if (!service) {
      throw new AppError('Service not found or unauthorized', 404);
    }

    // Check if service has orders
    const orders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE service_id = ?').get(id) as any;
    if (orders.count > 0) {
      throw new AppError('Cannot delete service with existing orders', 400);
    }

    // Delete service
    db.prepare('DELETE FROM services WHERE id = ? AND user_id = ?').run(id, userId);

    res.json({
      success: true,
      message: 'Service deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete service error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error deleting service',
    });
  }
};

/**
 * Publish service (change status to published)
 */
export const publishService = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if service exists and belongs to user
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(id, userId);
    if (!service) {
      throw new AppError('Service not found or unauthorized', 404);
    }

    // Update status to published
    db.prepare('UPDATE services SET status = "published", updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Service published successfully',
    });
  } catch (error: any) {
    console.error('Publish service error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error publishing service',
    });
  }
};

/**
 * Archive service (change status to archived)
 */
export const archiveService = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if service exists and belongs to user
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(id, userId);
    if (!service) {
      throw new AppError('Service not found or unauthorized', 404);
    }

    // Update status to archived
    db.prepare('UPDATE services SET status = "archived", updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Service archived successfully',
    });
  } catch (error: any) {
    console.error('Archive service error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error archiving service',
    });
  }
};

/**
 * Unarchive service (change status from archived to draft)
 */
export const unarchiveService = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if service exists and belongs to user
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(id, userId);
    if (!service) {
      throw new AppError('Service not found or unauthorized', 404);
    }

    // Check if service is currently archived
    if (service.status !== 'archived') {
      throw new AppError('Service is not archived', 400);
    }

    // Update status to draft
    db.prepare('UPDATE services SET status = "draft", updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Service unarchived successfully',
    });
  } catch (error: any) {
    console.error('Unarchive service error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error unarchiving service',
    });
  }
};

/**
 * Get service categories
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = db.prepare(`
      SELECT
        category,
        COUNT(*) as service_count,
        AVG(price) as avg_price
      FROM services
      WHERE status = 'published'
      GROUP BY category
      ORDER BY service_count DESC
    `).all();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    console.error('Get categories error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching categories',
    });
  }
};

/**
 * Get popular services
 */
export const getPopularServices = async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;

    // TODO: Add order count when orders table has data
    const popularServices = db.prepare(`
      SELECT
        s.*,
        u.username as author_username,
        u.avatar as author_avatar,
        (SELECT COUNT(*) FROM orders o WHERE o.service_id = s.id) as order_count
      FROM services s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.status = 'published'
      ORDER BY order_count DESC, s.created_at DESC
      LIMIT ?
    `).all(parseInt(limit as string));

    res.json({
      success: true,
      data: popularServices,
    });
  } catch (error: any) {
    console.error('Get popular services error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching popular services',
    });
  }
};

/**
 * Search services
 */
export const searchServices = async (req: Request, res: Response) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const searchTerm = `%${q}%`;
    const services = db.prepare(`
      SELECT
        s.*,
        u.username as author_username,
        u.avatar as author_avatar
      FROM services s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.status = 'published'
        AND (s.title LIKE ? OR s.description LIKE ?)
      ORDER BY s.created_at DESC
      LIMIT ?
    `).all(searchTerm, searchTerm, parseInt(limit as string));

    res.json({
      success: true,
      data: services,
    });
  } catch (error: any) {
    console.error('Search services error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error searching services',
    });
  }
};