import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import poolsRouter from './routes/pools.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || '*',
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/pools', poolsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
