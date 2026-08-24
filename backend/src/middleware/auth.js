import { auth } from 'express-oauth2-jwt-bearer';

import { config } from '../config.js';
import { getOrCreateUser } from '../services/userService.js';

const verifyToken = auth({
    issuerBaseURL: config.auth0IssuerBaseUrl,
    audience: config.auth0Audience,
    tokenSigningAlg: 'RS256'
});

export async function requireAuth(req, res, next) {
    try {
        await new Promise((resolve, reject) => {
            verifyToken(req, res, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

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
        throw new Error(`Auth0 userinfo request failed: ${response.status}`);
    }

    return response.json();
}