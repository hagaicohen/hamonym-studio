const jwt =
  require('jsonwebtoken');

module.exports =
  (req, res, next) => {

    try {

      const authHeader =
        req.headers.authorization;

      if (!authHeader) {

        return res.status(401).json({
          error: 'Unauthorized'
        });

      }

      const token =
        authHeader.split(' ')[1];

      if (!token) {

        return res.status(401).json({
          error: 'Unauthorized'
        });

      }

      const decoded =
        jwt.verify(

          token,

          process.env.JWT_SECRET

        );

      req.user = {

        id:
          decoded.userId,

        roleId:
          decoded.roleId

      };

      next();

    } catch (err) {

      console.error(err);

      return res.status(401).json({
        error: 'Unauthorized'
      });

    }

  };