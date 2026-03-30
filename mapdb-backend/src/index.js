import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectionsRouter } from './routes/connections.js';
import { databasesRouter } from './routes/databases.js';
import { objectsRouter } from './routes/objects.js';
import { dependenciesRouter } from './routes/dependencies.js';
import { scriptRouter } from './routes/script.js';
import { errorHandler } from './middleware/errorHandler.js';
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
app.use('/api/connections', connectionsRouter);
app.use('/api/connections', databasesRouter);
app.use('/api/connections', objectsRouter);
app.use('/api/connections', dependenciesRouter);
app.use('/api/connections', scriptRouter);
app.use(errorHandler);
app.listen(PORT, () => {
    console.log(`MapDB backend running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map