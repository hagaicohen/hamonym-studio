const paymentService =
  require('./payment.service');

exports.testCardcomConnection =
  async (req, res) => {

    try {

      const result =
        await paymentService
          .testCardcomConnection(req.body);

      res.json(result);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        success: false,
        message: 'CardCom connection failed'
      });
    }
  }; 