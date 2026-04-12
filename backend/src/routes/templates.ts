import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Create template
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { templateName, templateCategory, templateText, isPublic } = req.body;

    if (!templateName || !templateText) {
      return res.status(400).json({ error: 'Template name and text required' });
    }

    const result = await query(
      `INSERT INTO note_templates (creator_id, template_name, template_category, template_text, is_public)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user?.userId, templateName, templateCategory, templateText, isPublic || false]
    );

    res.status(201).json({ template: result.rows[0] });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Get all available templates (public + user's own)
router.get('/list', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM note_templates 
       WHERE is_public = true OR creator_id = $1 OR is_active = true
       ORDER BY template_category, template_name
       LIMIT 50`,
      [req.user?.userId]
    );

    res.json({ templates: result.rows });
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get templates by category
router.get('/category/:category', authenticate, async (req: Request, res: Response) => {
  try {
    const { category } = req.params;

    const result = await query(
      `SELECT * FROM note_templates 
       WHERE template_category = $1 AND (is_public = true OR creator_id = $2) AND is_active = true
       ORDER BY template_name`,
      [category, req.user?.userId]
    );

    res.json({ templates: result.rows });
  } catch (err) {
    console.error('Get templates by category error:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

export default router;
