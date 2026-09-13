import 'dotenv/config';
import express from 'express';
import path from 'path';
import downloadRoutes from './routes/download';
import indexRoutes from './routes';
import processRoutes from './routes/process';
import replaceRoutes from './routes/replace';
import reviewRoutes from './routes/review';

const app = express();
const port = Number(process.env.PORT) || 3000;

// These parsers make Express populate req.body for both JSON fetch requests
// and normal HTML form posts. The frontend currently uses JSON fetch calls,
// but urlencoded support keeps the server tolerant if the form is submitted
// directly by the browser during development.
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For form data

// Static files are served before EJS routes so /scripts/index.js and
// /styles/index.css resolve without every route needing to know about them.
app.use(express.static(path.join(process.cwd(), 'public')));

// EJS only renders the shell page. The interactive workflow after load is
// driven by public/scripts/index.js and the JSON endpoints below.
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Routes are split by workflow step:
// - / renders the page and prompt
// - /review validates JSON without fetching remote media
// - /process fetches and ranks media for every scene
// - /replace fetches a new match for one scene
// - /download streams a ZIP built from the chosen results
app.use('/', indexRoutes);
app.use('/review', reviewRoutes);
app.use('/process', processRoutes);
app.use('/replace', replaceRoutes);
app.use('/download', downloadRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
