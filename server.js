const express = require('express');
const app = express();
const PORT = 3000;


app.use(express.static('public')); // 'public' is your website folder


app.get('/private', (req, res) => {

  res.redirect('/403');
});

// Optional: another redirect example
app.get('/admin', (req, res) => {
  res.redirect('/not-allowed.html');
});

// Serve homepage
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
