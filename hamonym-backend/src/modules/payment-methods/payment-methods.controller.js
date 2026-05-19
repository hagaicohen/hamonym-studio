const service =
  require('./payment-methods.service');

exports.getEntityPaymentMethod =
  async (req, res) => {

    try {

      const result =

        await service.getEntityPaymentMethod(
          req.params.entityId
        );

      res.json(result);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch payment method'
      });

    }

  };

exports.createPaymentMethod =
  async (req, res) => {

    try {

      const result =

        await service.createPaymentMethod(
          req.body
        );

      res.status(201).json(result);

    } catch (error) {

      console.error(error);

      res.status(400).json({
        error:
          error.message
      });

    }

  };

exports.deletePaymentMethod =
  async (req, res) => {

    try {

      await service.deletePaymentMethod(
        req.params.id
      );

      res.json({
        success: true
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          'Failed to delete payment method'
      });

    }

  };