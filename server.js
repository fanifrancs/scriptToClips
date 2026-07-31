const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For form data
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', require('./routes/index'));
app.use('/process', require('./routes/process'));
app.use('/download', require('./routes/download'));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
