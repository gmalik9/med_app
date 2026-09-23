import { Router, Request, Response } from 'express';
import { query, transaction } from '../db';
import { generateAccessToken, generateRefreshToken, hashPassword, comparePassword, hashToken, verifyRefreshToken, verifyAccessToken, verifyAccessTokenForRevocation } from '../utils/auth';
import { authenticate } from '../middleware/auth';
import { safeDiagnostic } from '../middleware/safeAudit';
import { config } from '../config';
import { createSession } from '../services/sessions';

const router = Router();

router.get('/capabilities', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ allowRegistration: config.allowRegistration, aiEnabled: config.aiEnabled,
    sessionTimeoutMinutes: config.sessionTimeoutMinutes });
});

// Register a new doctor
router.post('/register', async (req: Request, res: Response) => {
  try {
    if (!config.allowRegistration) return res.status(403).json({ error: 'Self-registration is disabled; contact your administrator' });
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await hashPassword(password);

    const response = await transaction(async client => {
    const result = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role) 
       VALUES ($1, $2, $3, $4, 'doctor') RETURNING id, email, role`,
      [email, passwordHash, firstName || '', lastName || '']
    );

    const user = result.rows[0];

    return createSession(client, user, req);
    });
    res.status(201).json(response);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return res.status(409).json({ error: 'User already exists' });
    safeDiagnostic(req, 'registration_failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await query('SELECT id, email, password_hash, role FROM users WHERE email = $1 AND is_active = true', [email]);

    if (result.rows.length === 0) {
      // Comparable password work for unknown accounts reduces timing enumeration.
      await comparePassword(password, '$2b$12$KIXxG7RiUfnuCxJPHbCFiuWbfwwRXjC9yWTmYeUvwRbVXTYsk8fsi');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(await transaction(client => createSession(client, user, req)));
  } catch (err) {
    safeDiagnostic(req, 'login_failed');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const rotatedToken = generateRefreshToken(payload);
    const result = await query(`UPDATE sessions s SET refresh_token_hash = $1, last_activity = NOW()
      FROM users u WHERE s.session_key = $2 AND s.user_id = $3 AND u.id = s.user_id
      AND s.refresh_token_hash = $4 AND s.expires_at > NOW() AND u.is_active = true
      AND s.last_activity > NOW() - ($5 * INTERVAL '1 minute')
      RETURNING u.id, u.email, u.role`,
      [hashToken(rotatedToken), payload.sessionId, payload.userId, hashToken(refreshToken), config.sessionTimeoutMinutes]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = result.rows[0];

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: payload.sessionId,
    });

    req.user = { ...payload, email: user.email, role: user.role };
    res.json({ accessToken, refreshToken: rotatedToken });
  } catch (err) {
    safeDiagnostic(req, 'refresh_failed');
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

router.post('/logout', async (req, res, next) => {
  const deny = () => res.status(401).json({ error: 'Invalid or expired session credential' });
  const refresh = req.body?.refreshToken ? verifyRefreshToken(req.body.refreshToken) : null;
  if (req.body?.refreshToken && !refresh) return deny();
  const header = req.headers.authorization;
  const token = typeof header === 'string' && /^Bearer \S+$/i.test(header) ? header.slice(7) : '';
  const access = token ? (refresh ? verifyAccessTokenForRevocation(token) : verifyAccessToken(token)) : null;
  if (header !== undefined && !access) return deny();
  if (access && refresh && (access.userId !== refresh.userId || access.sessionId !== refresh.sessionId)) return deny();
  const payload = refresh || access;
  if (!payload) return deny();
  // A signed, unexpired refresh credential may ONLY revoke its own session,
  // including after rotation. Requiring the current hash here loses logout if
  // a concurrent refresh won first. Refresh issuance still requires that hash.
  // UPDATE already locks the row; neither ordering can revive a revoked row.
  try {
  const result = await query(`UPDATE sessions s SET expires_at = NOW() FROM users u
    WHERE s.session_key = $1 AND s.user_id = $2 AND u.id = s.user_id
    AND u.is_active = true AND s.expires_at > NOW() RETURNING u.email, u.role`, [payload.sessionId, payload.userId]);
  if (!result.rows.length) return deny();
  req.user = { ...payload, email: result.rows[0].email, role: result.rows[0].role };
  res.status(204).end();
  } catch (err) {
    safeDiagnostic(req, 'logout_failed');
    next(err); // Preserve the existing application error response.
  }
});

// Get doctor profile
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const result = await query(
      `SELECT id, email, role, first_name, last_name, specialty, license_number, phone, bio, is_active
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    safeDiagnostic(req, 'profile_fetch_failed');
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update doctor profile
router.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { first_name, last_name, specialty, license_number, phone, bio } = req.body;

    const result = await query(
      `UPDATE users SET first_name = $1, last_name = $2, specialty = $3, license_number = $4, phone = $5, bio = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, first_name, last_name, specialty, license_number, phone, bio, is_active`,
      [first_name, last_name, specialty, license_number, phone, bio, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    safeDiagnostic(req, 'profile_update_failed');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
