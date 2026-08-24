import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { query } from './db.js';
import userRoutes from './routes/userRoutes.js';
import listingRoutes from './routes/listingRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
    try {
        await query('SELECT 1');

        res.json({
            status: 'ok',
            database: 'connected'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: 'error',
            database: 'disconnected'
        });
    }
});

app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);

app.use((error, req, res, next) => {
    console.error(error);

    res.status(error.status || 500).json({
        error: error.message || 'Internal server error'
    });
});

app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
});