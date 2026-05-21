// billing.controller.js

const service =
  require('./billing.service');

const cardcomService =
  require('./cardcom.service');

exports.getEntityBilling =
  async (req, res) => {

    try {

      const result =

        await service.getEntityBilling(
          req.params.entityId
        );

      res.json(result);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Failed to fetch billing'
      });

    }

  };

exports.createBilling =
  async (req, res) => {

    try {

      const result =

        await service.createBilling(
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

exports.deleteBilling =
  async (req, res) => {

    try {

      await service.deleteBilling(
        req.params.id
      );

      res.json({

        success: true
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Failed to delete billing'
      });

    }

  };

exports.createLowProfile =
  async (req, res) => {

    try {

      const result =

        await cardcomService
          .createOpenFieldsLowProfile();

      res.json(result);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Failed to create low profile'
      });

    }

  };

exports.cardcomCallback =
  async (req, res) => {

    try {

      const result =

        await service
          .handleCardcomCallback(
            req.body
          );

      res.json({

        success: true,

        result
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'CardCom callback failed'
      });

    }

  };

exports.testCardcomConnection =
  async (req, res) => {

    try {

      const result =

        await cardcomService
          .testConnection();

      res.json(result);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'CardCom connection failed'
      });

    }

  };


  exports.getLowProfileResult =
  async (req, res) => {

    try {

      const result =

        await service
          .getLowProfileResult(

            req.params.lowProfileId

          );

      res.json(result);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Failed to get LP result'
      });

    }

  };