import { query } from '../db.js';
import { getUserProfile } from '../services/userService.js';

export async function getCurrentUser(req, res) {
    res.json({ user: req.user });
}

export async function getUserProfileController(req, res, next) {
    try {
        const userId = Number(req.params.id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const user = await getUserProfile(userId);

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({ user });
    } catch (error) {
        next(error);
    }
}

export async function updateCurrentUser(req, res, next) {
    try {
        const { name, contact_info } = req.body;

        if (name === undefined && contact_info === undefined) {
            return res.status(400).json({ error: 'At least one field must be provided' });
        }

        if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
            return res.status(400).json({ error: 'name must be a non-empty string' });
        }

        if (
            contact_info !== undefined &&
            contact_info !== null &&
            (typeof contact_info !== 'string' || contact_info.trim() === '')
        ) {
            return res.status(400).json({
                error: 'contact_info must be a non-empty string or null'
            });
        }

        const result = await query(
            `
            UPDATE users
            SET
                name = COALESCE($1, name),
                contact_info = CASE WHEN $2::boolean THEN $3 ELSE contact_info END
            WHERE user_id = $4
            RETURNING user_id, auth_user_id, name, email, contact_info, created_at
            `,
            [
                name !== undefined ? name.trim() : null,
                contact_info !== undefined,
                contact_info !== undefined && contact_info !== null
                    ? contact_info.trim()
                    : null,
                req.user.user_id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        next(error);
    }
}
