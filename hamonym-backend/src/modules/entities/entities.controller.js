// src/modules/entities/entities.controller.js

const service =
  require('./entities.service');

// =========================================================
// CREATE ENTITY
// =========================================================

exports.createEntity =
  async (req, res) => {

    try {

      const entity =
        await service.createEntity({

          userId:
            req.user.id,

          data:
            req.body

        });

      res.json({
        entity
      });

    } catch (err) {

        console.error(err);

        // ========================================
        // DUPLICATE REGISTRATION NUMBER
        // ========================================

        if (
          err.code === '23505'
        ) {

          return res
            .status(409)
            .json({

              success: false,

              message:
                'מספר רישום כבר קיים במערכת'

            });

        }

        res.status(500).json({

          success: false,

          error:
            'Failed to create entity'

        });

      }

  };

// =========================================================
// GET MY ENTITIES
// =========================================================

exports.getMyEntities =
  async (req, res) => {

    try {

      const entities =
        await service.getMyEntities(

          req.user.id

        );

      res.json({
        entities
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to fetch entities'
      });

    }

  };

// =========================================================
// UPLOAD ASSOCIATION DOCUMENT
// =========================================================

exports.uploadAssociationDocument =
  async (req, res) => {

    try {

      const result =
        await service
          .uploadAssociationDocument({

            entityId:
              req.params.id,

            file:
              req.file

          });

      res.json({
        result
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to upload association document'
      });

    }

  };

// =========================================================
// UPLOAD TAX DOCUMENT
// =========================================================

exports.uploadTaxDocument =
  async (req, res) => {

    try {

      const result =
        await service
          .uploadTaxDocument({

            entityId:
              req.params.id,

            file:
              req.file

          });

      res.json({
        result
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to upload tax document'
      });

    }

  };

// =========================================================
// GET ASSOCIATION DOCUMENT
// =========================================================

exports.getAssociationDocument =
  async (req, res) => {

    try {

      const file =
        await service
          .getAssociationDocument(

            req.params.id

          );

      if (!file) {

        return res
          .status(404)
          .send('File not found');

      }

      res.setHeader(

        'Content-Type',

        file.association_certificate_mime

      );

      res.setHeader(

        'Content-Disposition',

        `inline; filename="${file.association_certificate_name}"`

      );

      res.send(

        file.association_certificate_data

      );

    } catch (err) {

      console.error(err);

      res.status(500).send(
        'Failed to fetch file'
      );

    }

  };

// =========================================================
// GET TAX DOCUMENT
// =========================================================

exports.getTaxDocument =
  async (req, res) => {

    try {

      const file =
        await service
          .getTaxDocument(

            req.params.id

          );

      if (!file) {

        return res
          .status(404)
          .send('File not found');

      }

      res.setHeader(

        'Content-Type',

        file.tax_document_mime

      );

      res.setHeader(

        'Content-Disposition',

        `inline; filename="${file.tax_document_name}"`

      );

      res.send(

        file.tax_document_data

      );

    } catch (err) {

      console.error(err);

      res.status(500).send(
        'Failed to fetch file'
      );

    }

  };

// =========================================================
// UPLOAD LOGO
// =========================================================

exports.uploadLogo =
  async (req, res) => {

    try {

      const result =
        await service.uploadLogo({

          entityId:
            req.params.id,

          file:
            req.file

        });

      res.json({
        result
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to upload logo'
      });

    }

  };

// =========================================================
// GET LOGO
// =========================================================

/*exports.getLogo =
  async (req, res) => {

    try {

      const logo =
        await service.getLogo(

          req.params.id

        );

      if (
        !logo ||
        !logo.logo_data
      ) {

        return res
          .status(404)
          .send('Logo not found');

      }

      res.setHeader(

        'Content-Type',

        logo.logo_mime

      );

      res.send(
        logo.logo_data
      );

    } catch (err) {

      console.error(err);

      res.status(500).send(
        'Failed to fetch logo'
      );

    }

  };*/

// =========================================================
// UPDATE ENTITY
// =========================================================
exports.getEntityById =
  async (req, res) => {

    try {

      const entity =

        await service
          .getEntityById(
            req.params.id
          );

      if (!entity) {

        return res
          .status(404)
          .json({
            error:
              'Entity not found'
          });

      }

      res.json(entity);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to get entity'
      });

    }

  };

exports.updateEntity =

  async (req, res) => {

    
    try {

      const entity =
        await service.updateEntity({

          entityId:
            req.params.id,

          userId:
            req.user.id,

          data:
            req.body

        });

      res.json(entity);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to update entity'
      });

    }

  };

// =========================================================
// REMOVE TAX DOCUMENT
// =========================================================

exports.removeTaxDocument =
  async (req, res) => {

    try {

      await service
        .removeTaxDocument(

          req.params.id

        );

      res.json({
        success: true
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to remove tax document'
      });

    }

  };