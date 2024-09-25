import express from 'express';
import routes from './src/route.js';
import morgan from 'morgan';
import cors from 'cors'


const app = express();
const port = process.env.PORT || 3000;  // Use the port from .env or default to 3000

// Middleware
app.use(cors())
app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev')); // For logging requests

// Use routes from the routes file
app.use('/api', routes);

app.get('/api',(req,res)=>{
  res.status(200).json({message:"jai shree ram"})
})


// Basic error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
