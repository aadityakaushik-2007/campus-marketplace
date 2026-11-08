
import { auth } from 'express-oauth2-jwt-bearer';

import { config } from '../config.js';
import {
    getUserByAuthId,
    getOrCreateUser
} from '../services/userService.js';

const verifyToken = auth({
    issuerBaseURL: config.auth0IssuerBaseUrl,
    audience: config.auth0Audience,
    tokenSigningAlg: 'RS256'
});

export async function requireAuth(req, res, next) {
    try {
        // Verify the access token
        await new Promise((resolve, reject) => {
            verifyToken(req, res, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

        // Get the Auth0 user ID from the verified JWT
        const authUserId = req.auth.payload.sub;

        if (!authUserId) {
            throw new Error('Authenticated user has no subject identifier');
        }

        // Check PostgreSQL first
        const existingUser = await getUserByAuthId(authUserId);

        if (existingUser) {
            req.user = existingUser;
            return next();
        }

        // Only fetch Auth0 profile if this is a new user
        const authUser = await getAuth0User(req.auth.token);

        req.user = await getOrCreateUser(authUser);

        next();

    } catch (error) {
        next(error);
    }
}

async function getAuth0User(accessToken) {
    const response = await fetch(
        `${config.auth0IssuerBaseUrl}userinfo`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `Auth0 userinfo request failed: ${response.status}`
        );
    }

    return response.json();
}
