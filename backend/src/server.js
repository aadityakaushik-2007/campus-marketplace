import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { query } from './db.js';
import userRoutes from './routes/userRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import borrowingRoutes from './routes/borrowingRoutes.js';
import purchaseRequestRoutes from './routes/purchaseRequestRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';

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
app.use('/api/borrowings', borrowingRoutes);
app.use('/api/purchase-requests', purchaseRequestRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reviews', reviewRoutes);

app.use((error, req, res, next) => {
    console.error(error);

    const statusByCode = {
        '22P02': 400,
        '23503': 400,
        '23505': 409,
        '23514': 400,
        '23P01': 409
    };

    res.status(error.status || statusByCode[error.code] || 500).json({
        error: error.message || 'Internal server error'
    });
});

app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
});