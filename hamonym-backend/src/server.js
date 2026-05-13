require('dotenv').config();

const express =
  require('express');

const cors =
  require('cors');

const authRoutes =
  require('./routes/auth.routes');

const entitiesRoutes =
  require('./modules/entities/entities.routes');

const app = express();

app.use(cors());

app.use(express.json());

app.get('/', (req, res) => {

  res.json({
    message: 'Hamonym API Running'
  });

});

app.use(
  '/auth',
  authRoutes
);

app.use(
  '/api/entities',
  entitiesRoutes
);

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});